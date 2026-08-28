from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from identifold import NamespaceRegistry, create_machine_id, parse_machine_id

ROOT = Path(__file__).parents[3]


def test_public_api_creates_valid_uuid7_and_immutable_registry() -> None:
    machine_id = create_machine_id()
    assert parse_machine_id(machine_id) == machine_id
    registry = NamespaceRegistry([{"publicPrefix": "user"}])
    assert registry.definitions[0]["publicPrefix"] == "user"


def test_complete_vector_manifest() -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "conformance" / "runner.py"),
            "--adapter",
            str(ROOT / "conformance" / "python-adapter.py"),
            "--vectors",
            str(ROOT / "vectors"),
            "--json",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["failed"] == 0
