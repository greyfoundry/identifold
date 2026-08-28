"""Identifold conformance adapter for the Java package."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
CLASSES = ROOT / ".private" / "runtime" / "java" / "classes"


def encode_registry(registry: list[dict[str, object]]) -> str:
    values: list[str] = []
    for definition in registry:
        reference = definition.get("reference")
        if not isinstance(reference, dict):
            values.append(f'{definition["publicPrefix"]},,,,,0')
            continue
        values.append(
            ",".join(
                [
                    str(definition["publicPrefix"]),
                    str(reference.get("prefix", "")),
                    str(reference.get("strategy", "")),
                    str(reference.get("profile", "")),
                    str(reference.get("scope", "")),
                    str(reference.get("width", 0)),
                ]
            )
        )
    return ";".join(values)


def main() -> None:
    request = json.load(sys.stdin)
    operation = request["operation"]
    arguments = [
        operation,
        str(request.get("input", request.get("machineId", ""))),
        str(request.get("namespace", "")),
        ",".join(str(value) for value in request.get("randomBytes", []))
        or str(request.get("sequence", "")),
        encode_registry(request.get("registry", [])),
        str(request.get("scope", "")),
    ]
    result = subprocess.run(
        ["java", "-cp", str(CLASSES), "io.greyfoundry.identifold.Adapter", *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    status, value = result.stdout.split("\t", 1)
    if status == "ERR":
        print(json.dumps({"ok": False, "errorCode": value}))
    elif operation == "parsePublicId":
        public_id, namespace, machine_id = value.split("\t")
        print(
            json.dumps(
                {
                    "ok": True,
                    "value": {
                        "value": public_id,
                        "namespace": namespace,
                        "machineId": machine_id,
                    },
                }
            )
        )
    else:
        print(json.dumps({"ok": True, "value": value}))


if __name__ == "__main__":
    main()
