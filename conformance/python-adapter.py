"""Identifold conformance adapter for the Python package."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "packages" / "python" / "src"))

from identifold import (
    Identifold,
    IdentifoldError,
    NamespaceRegistry,
    create_reference_candidate,
    format_sequential_reference,
    parse_machine_id,
    parse_public_id,
    parsed_public_id_dict,
    public_id_from_machine_id,
)


def main() -> None:
    request = json.load(sys.stdin)
    registry = NamespaceRegistry(request.get("registry", []))
    ids = Identifold(registry)
    operation = request.get("operation")
    if operation == "parseMachineId":
        value = parse_machine_id(request["input"])
    elif operation == "publicIdFromMachineId":
        value = public_id_from_machine_id(request["machineId"], request["namespace"])
    elif operation == "parsePublicId":
        value = parsed_public_id_dict(parse_public_id(request["input"]))
    elif operation == "createReferenceCandidate":
        raw = bytes(request["randomBytes"])
        value = create_reference_candidate(
            registry, request["namespace"], lambda _size: raw
        )
    elif operation == "formatSequentialReference":
        value = format_sequential_reference(
            registry,
            request["namespace"],
            int(request["sequence"]),
            request.get("scope"),
        )
    elif operation == "normalize":
        value = ids.normalize(request["input"])
    elif operation == "parseReference":
        value = ids.parse(request["input"])
    elif operation == "inspect":
        inspected = ids.inspect(request["input"])
        if not inspected["valid"]:
            print(json.dumps({"ok": False, "errorCode": inspected["errorCode"]}))
            return
        value = inspected
    else:
        raise RuntimeError("Unsupported operation")
    print(json.dumps({"ok": True, "value": value}))


if __name__ == "__main__":
    try:
        main()
    except IdentifoldError as error:
        print(json.dumps({"ok": False, "errorCode": error.code}))
