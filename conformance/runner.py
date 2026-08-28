"""Language-neutral Identifold conformance runner."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class RunnerError(Exception):
    """A stable, user-facing runner failure."""


@dataclass(frozen=True)
class Case:
    label: str
    request: dict[str, Any]
    expected: Any = None
    error_code: str | None = None


def _read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RunnerError(f"Could not read vector data: {path.name}") from error
    if not isinstance(value, dict):
        raise RunnerError(f"Vector data must be an object: {path.name}")
    return value


def _with_registry(request: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    registry = data.get("registry", [])
    return {**request, "registry": registry}


def _cases_for_file(data: dict[str, Any]) -> Iterator[Case]:
    kind = data.get("kind")
    vectors = data.get("vectors")
    if not isinstance(vectors, list):
        raise RunnerError(f"Vector file {kind!r} has no vector array")

    for index, vector in enumerate(vectors):
        if not isinstance(vector, dict):
            raise RunnerError(f"Vector {kind}[{index}] must be an object")
        label = f"{kind}[{index}]"

        if kind == "machine":
            canonical = vector["canonical"]
            for accepted in [canonical, *vector["accepted"]]:
                yield Case(
                    label,
                    {"operation": "parseMachineId", "input": accepted},
                    canonical,
                )
        elif kind in {"public", "round-trip"}:
            expected = {
                "value": vector["publicId"],
                "namespace": vector["namespace"],
                "machineId": vector["machineId"],
            }
            yield Case(
                f"{label}:encode",
                {
                    "operation": "publicIdFromMachineId",
                    "machineId": vector["machineId"],
                    "namespace": vector["namespace"],
                },
                vector["publicId"],
            )
            yield Case(
                f"{label}:decode",
                {"operation": "parsePublicId", "input": vector["publicId"]},
                expected,
            )
        elif kind == "references":
            yield Case(
                f"{label}:generate",
                _with_registry(
                    {
                        "operation": "createReferenceCandidate",
                        "namespace": vector["namespace"],
                        "randomBytes": vector["randomBytes"],
                    },
                    data,
                ),
                vector["reference"],
            )
            yield Case(
                f"{label}:parse",
                _with_registry(
                    {"operation": "normalize", "input": vector["reference"]},
                    data,
                ),
                vector["reference"],
            )
        elif kind == "sequential":
            request = {
                "operation": "formatSequentialReference",
                "namespace": vector["namespace"],
                "sequence": vector["sequence"],
            }
            if "scope" in vector:
                request["scope"] = vector["scope"]
            yield Case(
                f"{label}:format",
                _with_registry(request, data),
                vector["reference"],
            )
            yield Case(
                f"{label}:parse",
                _with_registry(
                    {"operation": "normalize", "input": vector["reference"]},
                    data,
                ),
                vector["reference"],
            )
        elif kind == "normalization":
            yield Case(
                label,
                _with_registry(
                    {"operation": "normalize", "input": vector["input"]}, data
                ),
                vector["normalized"],
            )
        elif kind == "invalid":
            yield Case(
                label,
                _with_registry(
                    {
                        "operation": vector["operation"],
                        "input": vector["input"],
                    },
                    data,
                ),
                error_code=vector["errorCode"],
            )
        elif kind == "ordering":
            machine_ids = vector["machineIds"]
            public_ids = vector["publicIds"]
            if machine_ids != sorted(machine_ids) or public_ids != sorted(public_ids):
                raise RunnerError(f"Ordering vector is not canonical: {label}")
            if len(machine_ids) != len(public_ids):
                raise RunnerError(f"Ordering vector lengths differ: {label}")
            for item_index, (machine_id, public_id) in enumerate(
                zip(machine_ids, public_ids, strict=True)
            ):
                yield Case(
                    f"{label}:{item_index}",
                    {
                        "operation": "publicIdFromMachineId",
                        "machineId": machine_id,
                        "namespace": vector["namespace"],
                    },
                    public_id,
                )
        else:
            raise RunnerError(f"Unsupported vector kind: {kind!r}")


def _adapter_command(adapter: Path) -> list[str]:
    if adapter.suffix == ".py":
        return [sys.executable, str(adapter)]
    if adapter.suffix in {".js", ".mjs"}:
        node = shutil.which("node")
        if node is None:
            raise RunnerError("Node.js is required for this adapter")
        return [node, str(adapter)]
    return [str(adapter)]


def _invoke_adapter(adapter: Path, request: dict[str, Any]) -> dict[str, Any]:
    try:
        result = subprocess.run(
            _adapter_command(adapter),
            input=json.dumps(request),
            check=False,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RunnerError("The conformance adapter could not be executed") from error
    if result.returncode != 0:
        raise RunnerError("The conformance adapter exited unexpectedly")
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RunnerError("The conformance adapter returned invalid JSON") from error
    if not isinstance(response, dict) or not isinstance(response.get("ok"), bool):
        raise RunnerError("The conformance adapter returned an invalid response")
    return response


def _load_cases(vectors: Path) -> tuple[str, Iterable[Case]]:
    manifest = _read_json(vectors / "manifest.json")
    if manifest.get("schemaVersion") != 1:
        raise RunnerError("Unsupported vector manifest schema")
    spec_version = manifest.get("specVersion")
    files = manifest.get("files")
    if not isinstance(spec_version, str) or not isinstance(files, list):
        raise RunnerError("Invalid vector manifest")

    cases: list[Case] = []
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get("file"), str):
            raise RunnerError("Invalid vector manifest entry")
        path = vectors / entry["file"]
        if not path.exists():
            if entry.get("required") is True:
                raise RunnerError(f"Required vector file is missing: {path.name}")
            continue
        data = _read_json(path)
        if data.get("specVersion") != spec_version:
            raise RunnerError(f"Vector version mismatch: {path.name}")
        cases.extend(_cases_for_file(data))
    return spec_version, cases


def run(adapter: Path, vectors: Path) -> dict[str, Any]:
    spec_version, cases = _load_cases(vectors)
    passed = 0
    failed = 0
    for case in cases:
        response = _invoke_adapter(adapter, case.request)
        if case.error_code is None:
            matches = response.get("ok") is True and response.get("value") == case.expected
        else:
            matches = (
                response.get("ok") is False
                and response.get("errorCode") == case.error_code
            )
        if matches:
            passed += 1
        else:
            failed += 1
    return {
        "adapter": str(adapter),
        "failed": failed,
        "passed": passed,
        "specVersion": spec_version,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Identifold conformance vectors")
    parser.add_argument("--adapter", required=True, type=Path)
    parser.add_argument("--vectors", required=True, type=Path)
    parser.add_argument("--json", action="store_true")
    arguments = parser.parse_args()

    try:
        report = run(arguments.adapter, arguments.vectors)
    except RunnerError as error:
        print(str(error), file=sys.stderr)
        return 2

    if arguments.json:
        print(json.dumps(report, separators=(",", ":"), sort_keys=True))
    else:
        print(
            f"{report['passed']} passed, {report['failed']} failed "
            f"({report['specVersion']})"
        )
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
