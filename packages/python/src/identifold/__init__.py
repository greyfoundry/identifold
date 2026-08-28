"""Python implementation of Identifold wire formats."""

from __future__ import annotations

import re
import secrets
import uuid
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

import typeid
import uuid_utils
from typeid.core.errors import TypeIDException
from uuid6 import uuid7

DATA_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
CHECK_ALPHABET = f"{DATA_ALPHABET}*~$=U"
PUBLIC_PREFIX = re.compile(r"^[a-z]([a-z_]{0,61}[a-z])?$")
REFERENCE_PREFIX = re.compile(r"^[A-Z]{2,8}$")


class IdentifoldError(ValueError):
    """A validation failure with a stable cross-language code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ParsedPublicId:
    value: str
    namespace: str
    machine_id: str


@dataclass(frozen=True)
class ParsedReference:
    value: str
    namespace: str
    payload: str
    check_symbol: str
    strategy: str
    scope: str | None = None
    sequence: str | None = None


class NamespaceRegistry:
    """Validated, immutable namespace definitions."""

    def __init__(self, definitions: Iterable[Mapping[str, Any]]) -> None:
        registered: list[Mapping[str, Any]] = []
        public: dict[str, Mapping[str, Any]] = {}
        references: dict[str, Mapping[str, Any]] = {}
        for source in definitions:
            prefix = source.get("publicPrefix")
            if not isinstance(prefix, str) or PUBLIC_PREFIX.fullmatch(prefix) is None:
                raise IdentifoldError("invalid_public_prefix", "Invalid public prefix")
            if prefix in public:
                raise IdentifoldError(
                    "duplicate_public_prefix", "Duplicate public prefix"
                )
            reference = _register_reference(source.get("reference"))
            if reference is not None:
                ref_prefix = reference["prefix"]
                if ref_prefix in references:
                    raise IdentifoldError(
                        "duplicate_ref_prefix", "Duplicate reference prefix"
                    )
                if any(
                    old.startswith(ref_prefix) or ref_prefix.startswith(old)
                    for old in references
                ):
                    raise IdentifoldError(
                        "ambiguous_ref_prefix", "Ambiguous reference prefix"
                    )
            value = MappingProxyType(
                {"publicPrefix": prefix}
                if reference is None
                else {"publicPrefix": prefix, "reference": reference}
            )
            registered.append(value)
            public[prefix] = value
            if reference is not None:
                references[reference["prefix"]] = value
        self._definitions = tuple(registered)
        self._public = MappingProxyType(public)
        self._references = MappingProxyType(references)

    @property
    def definitions(self) -> tuple[Mapping[str, Any], ...]:
        return self._definitions

    def get_by_public_prefix(self, prefix: str) -> Mapping[str, Any] | None:
        return self._public.get(prefix)

    def get_by_reference_prefix(self, prefix: str) -> Mapping[str, Any] | None:
        return self._references.get(prefix.upper())


def _register_reference(value: Any) -> Mapping[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, Mapping):
        raise IdentifoldError(
            "invalid_namespace_definition", "Invalid reference definition"
        )
    prefix = value.get("prefix")
    if not isinstance(prefix, str) or REFERENCE_PREFIX.fullmatch(prefix) is None:
        raise IdentifoldError("invalid_ref_prefix", "Invalid reference prefix")
    strategy = value.get("strategy")
    if strategy == "random":
        profile = value.get("profile", "standard")
        lengths = {"compact": 8, "standard": 10, "high": 12}
        if profile not in lengths:
            raise IdentifoldError(
                "invalid_namespace_definition", "Invalid random profile"
            )
        return MappingProxyType(
            {
                "prefix": prefix,
                "strategy": strategy,
                "profile": profile,
                "payloadLength": lengths[profile],
            }
        )
    if strategy == "sequence":
        width = value.get("width")
        scope = value.get("scope", "none")
        if (
            not isinstance(width, int)
            or isinstance(width, bool)
            or not 4 <= width <= 18
        ):
            raise IdentifoldError("invalid_ref_length", "Invalid sequence width")
        if scope not in {"none", "calendar-year"}:
            raise IdentifoldError(
                "invalid_namespace_definition", "Invalid sequence scope"
            )
        return MappingProxyType(
            {"prefix": prefix, "strategy": strategy, "scope": scope, "width": width}
        )
    raise IdentifoldError("invalid_namespace_definition", "Invalid reference strategy")


def create_machine_id() -> str:
    return str(uuid7())


def parse_machine_id(value: str) -> str:
    canonical = value.lower() if isinstance(value, str) else ""
    try:
        parsed = uuid.UUID(canonical)
    except (ValueError, AttributeError):
        raise IdentifoldError("invalid_mid", "Invalid machine identifier") from None
    if len(canonical) != 36 or str(parsed) != canonical:
        raise IdentifoldError("invalid_mid", "Invalid machine identifier")
    if parsed.version != 7:
        raise IdentifoldError(
            "invalid_uuid_version", "Machine identifier must use UUIDv7"
        )
    return canonical


def public_id_from_machine_id(machine_id: str, namespace: str) -> str:
    canonical = parse_machine_id(machine_id)
    if PUBLIC_PREFIX.fullmatch(namespace) is None:
        raise IdentifoldError("invalid_public_prefix", "Invalid public prefix")
    return str(typeid.from_uuid(uuid_utils.UUID(canonical), namespace))


def parse_public_id(
    value: str, expected_namespace: str | None = None
) -> ParsedPublicId:
    if not isinstance(value, str) or value != value.lower():
        raise IdentifoldError("invalid_pid", "Invalid public identifier")
    try:
        parsed = typeid.from_string(value)
    except (TypeIDException, TypeError, ValueError):
        raise IdentifoldError("invalid_pid", "Invalid public identifier") from None
    namespace = parsed.prefix
    if not namespace:
        raise IdentifoldError(
            "invalid_public_prefix", "Public identifier requires a namespace"
        )
    if expected_namespace is not None and namespace != expected_namespace:
        raise IdentifoldError("invalid_public_prefix", "Public prefix does not match")
    machine_id = parse_machine_id(str(parsed.uuid))
    return ParsedPublicId(value, namespace, machine_id)


def calculate_reference_check_symbol(payload: str) -> str:
    if not payload:
        raise IdentifoldError("invalid_ref_length", "Reference payload is empty")
    remainder = 0
    for symbol in payload:
        position = DATA_ALPHABET.find(symbol)
        if position < 0:
            raise IdentifoldError("invalid_ref_symbol", "Invalid reference symbol")
        remainder = (remainder * 32 + position) % 37
    return CHECK_ALPHABET[remainder]


def calculate_sequential_check_symbol(payload: str) -> str:
    if not payload:
        raise IdentifoldError("invalid_ref_length", "Reference payload is empty")
    remainder = 0
    for symbol in payload:
        if not symbol.isascii() or not symbol.isdigit():
            raise IdentifoldError("invalid_ref_symbol", "Invalid sequence symbol")
        remainder = (remainder * 10 + int(symbol)) % 37
    return CHECK_ALPHABET[remainder]


def create_reference_candidate(
    registry: NamespaceRegistry,
    namespace: str,
    random_bytes: Callable[[int], bytes] | None = None,
) -> str:
    definition = _require_reference(registry, namespace, "random")
    reference = definition["reference"]
    size = reference["payloadLength"]
    source = random_bytes or secrets.token_bytes
    raw = source(size)
    if not isinstance(raw, (bytes, bytearray)) or len(raw) != size:
        raise IdentifoldError("invalid_random_source", "Invalid random source")
    payload = "".join(DATA_ALPHABET[item & 31] for item in raw)
    return _format_random(
        reference["prefix"], payload, calculate_reference_check_symbol(payload)
    )


def format_sequential_reference(
    registry: NamespaceRegistry,
    namespace: str,
    sequence: int,
    scope: str | None = None,
) -> str:
    definition = _require_reference(registry, namespace, "sequence")
    reference = definition["reference"]
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
        raise IdentifoldError("invalid_ref", "Invalid sequence")
    digits = str(sequence)
    if len(digits) > reference["width"]:
        raise IdentifoldError("sequence_overflow", "Sequence exceeds width")
    padded = digits.zfill(reference["width"])
    if reference["scope"] == "calendar-year":
        if scope is None or re.fullmatch(r"\d{4}", scope) is None:
            raise IdentifoldError("invalid_ref", "Calendar sequence needs a year")
        payload = scope + padded
    else:
        if scope is not None:
            raise IdentifoldError("invalid_ref", "Unscoped sequence rejects scope")
        payload = padded
    check = calculate_sequential_check_symbol(payload)
    return (
        f"{reference['prefix']}-{scope}-{padded}-{check}"
        if scope is not None
        else f"{reference['prefix']}-{padded}-{check}"
    )


def parse_reference(value: str, registry: NamespaceRegistry) -> ParsedReference:
    if (
        not isinstance(value, str)
        or not value
        or len(value) > 100
        or re.fullmatch(r"[A-Za-z0-9*~$=_-]+", value) is None
    ):
        raise IdentifoldError("invalid_ref", "Invalid human reference")
    upper = value.upper()
    definition, body = _locate_reference(upper, registry)
    reference = definition["reference"]
    if reference["strategy"] == "sequence":
        return _parse_sequence(body, definition)
    compact = body.replace("-", "")
    if len(compact) != reference["payloadLength"] + 1:
        raise IdentifoldError("invalid_ref_length", "Wrong reference length")
    _validate_random_hyphenation(body, reference["payloadLength"])
    raw_payload, check = compact[:-1], compact[-1]
    payload = _normalize_payload(raw_payload)
    if check not in CHECK_ALPHABET:
        raise IdentifoldError("invalid_ref_symbol", "Invalid check symbol")
    if calculate_reference_check_symbol(payload) != check:
        raise IdentifoldError("invalid_checksum", "Invalid checksum")
    return ParsedReference(
        _format_random(reference["prefix"], payload, check),
        definition["publicPrefix"],
        payload,
        check,
        "random",
    )


def normalize_reference(value: str, registry: NamespaceRegistry) -> str:
    return parse_reference(value, registry).value


def _parse_sequence(body: str, definition: Mapping[str, Any]) -> ParsedReference:
    reference = definition["reference"]
    scoped = reference["scope"] == "calendar-year"
    payload_length = reference["width"] + (4 if scoped else 0)
    compact = body.replace("-", "")
    if len(compact) != payload_length + 1:
        raise IdentifoldError("invalid_ref_length", "Wrong reference length")
    expected = [4, reference["width"], 1] if scoped else [reference["width"], 1]
    if "-" in body and [len(part) for part in body.split("-")] != expected:
        raise IdentifoldError("invalid_ref", "Invalid hyphenation")
    payload, check = compact[:-1], compact[-1]
    if not payload.isascii() or not payload.isdigit() or check not in CHECK_ALPHABET:
        raise IdentifoldError("invalid_ref_symbol", "Invalid sequence symbol")
    if calculate_sequential_check_symbol(payload) != check:
        raise IdentifoldError("invalid_checksum", "Invalid checksum")
    scope = payload[:4] if scoped else None
    sequence = payload[4:] if scoped else payload
    formatted = (
        f"{reference['prefix']}-{scope}-{sequence}-{check}"
        if scope
        else f"{reference['prefix']}-{sequence}-{check}"
    )
    return ParsedReference(
        formatted,
        definition["publicPrefix"],
        payload,
        check,
        "sequence",
        scope,
        sequence,
    )


def _require_reference(
    registry: NamespaceRegistry, namespace: str, strategy: str
) -> Mapping[str, Any]:
    definition = registry.get_by_public_prefix(namespace)
    if definition is None:
        raise IdentifoldError("unknown_namespace", "Unknown namespace")
    reference = definition.get("reference")
    if not isinstance(reference, Mapping) or reference.get("strategy") != strategy:
        raise IdentifoldError(
            "invalid_namespace_definition", "Wrong reference strategy"
        )
    return definition


def _locate_reference(
    value: str, registry: NamespaceRegistry
) -> tuple[Mapping[str, Any], str]:
    if "-" in value:
        prefix, body = value.split("-", 1)
        definition = registry.get_by_reference_prefix(prefix)
        if definition is not None:
            return definition, body
    else:
        for definition in registry.definitions:
            reference = definition.get("reference")
            if isinstance(reference, Mapping) and value.startswith(reference["prefix"]):
                return definition, value[len(reference["prefix"]) :]
    raise IdentifoldError("unknown_namespace", "Unknown reference namespace")


def _normalize_payload(payload: str) -> str:
    result = ""
    for symbol in payload:
        normalized = "0" if symbol == "O" else "1" if symbol in {"I", "L"} else symbol
        if normalized not in DATA_ALPHABET:
            raise IdentifoldError("invalid_ref_symbol", "Invalid reference symbol")
        result += normalized
    return result


def _validate_random_hyphenation(body: str, length: int) -> None:
    if "-" not in body:
        return
    expected = [min(4, remaining) for remaining in range(length, 0, -4)] + [1]
    if [len(part) for part in body.split("-")] != expected:
        raise IdentifoldError("invalid_ref", "Invalid hyphenation")


def _format_random(prefix: str, payload: str, check: str) -> str:
    groups = [payload[index : index + 4] for index in range(0, len(payload), 4)]
    return f"{prefix}-{'-'.join(groups)}-{check}"


class Identifold:
    """Unified parser and normalizer for a namespace registry."""

    def __init__(self, registry: NamespaceRegistry) -> None:
        self.registry = registry

    def parse(self, value: str) -> str | ParsedPublicId | ParsedReference:
        kind = _classify(value)
        if kind == "mid":
            return parse_machine_id(value)
        if kind == "pid":
            parsed = parse_public_id(value)
            if self.registry.get_by_public_prefix(parsed.namespace) is None:
                raise IdentifoldError("unknown_namespace", "Unknown namespace")
            return parsed
        return parse_reference(value, self.registry)

    def normalize(self, value: str) -> str:
        parsed = self.parse(value)
        return parsed if isinstance(parsed, str) else parsed.value

    def inspect(self, value: str) -> Mapping[str, Any]:
        try:
            parsed = self.parse(value)
        except IdentifoldError as error:
            return {
                "kind": _detect(value) or "unknown",
                "valid": False,
                "registryRecognized": False,
                "errorCode": error.code,
            }
        if isinstance(parsed, str):
            return {
                "kind": "mid",
                "valid": True,
                "normalized": parsed,
                "machineId": parsed,
                "registryRecognized": False,
                "uuidVersion": 7,
            }
        if isinstance(parsed, ParsedPublicId):
            return {
                "kind": "pid",
                "valid": True,
                "normalized": parsed.value,
                "namespace": parsed.namespace,
                "machineId": parsed.machine_id,
                "registryRecognized": True,
                "uuidVersion": 7,
            }
        return {
            "kind": "ref",
            "valid": True,
            "normalized": parsed.value,
            "namespace": parsed.namespace,
            "registryRecognized": True,
            "checksumValid": True,
            "resolution": "not-requested",
        }


def _detect(value: str) -> str | None:
    if "_" in value:
        return "pid"
    if re.fullmatch(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
        value,
    ):
        return "mid"
    if re.match(r"^[A-Za-z]{2,8}(?:-|[0-9])", value):
        return "ref"
    return None


def _classify(value: str) -> str:
    kind = _detect(value)
    if kind is None:
        raise IdentifoldError("invalid_kind", "Unknown identifier kind")
    return kind


def parsed_public_id_dict(value: ParsedPublicId) -> dict[str, str]:
    return {
        "value": value.value,
        "namespace": value.namespace,
        "machineId": value.machine_id,
    }


__all__ = [
    "Identifold",
    "IdentifoldError",
    "NamespaceRegistry",
    "ParsedPublicId",
    "ParsedReference",
    "create_machine_id",
    "create_reference_candidate",
    "format_sequential_reference",
    "normalize_reference",
    "parse_machine_id",
    "parse_public_id",
    "parse_reference",
    "public_id_from_machine_id",
]
