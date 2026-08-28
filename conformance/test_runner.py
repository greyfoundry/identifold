import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


class RunnerContractTest(unittest.TestCase):
    def test_external_adapter_is_judged_from_vectors(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            vectors = root / "vectors"
            vectors.mkdir()
            (vectors / "manifest.json").write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "specVersion": "0.1-draft",
                        "files": [
                            {
                                "file": "machine.json",
                                "kind": "machine",
                                "required": True,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            (vectors / "machine.json").write_text(
                json.dumps(
                    {
                        "kind": "machine",
                        "specVersion": "0.1-draft",
                        "vectors": [
                            {
                                "canonical": "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
                                "accepted": [
                                    "0188BAC7-4AFA-78AA-BB3B-BD1EEF28D881"
                                ],
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            adapter = root / "adapter.py"
            adapter.write_text(
                """import json, sys
request = json.load(sys.stdin)
json.dump({"ok": True, "value": request["input"].lower()}, sys.stdout)
""",
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("runner.py")),
                    "--adapter",
                    str(adapter),
                    "--vectors",
                    str(vectors),
                    "--json",
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                json.loads(result.stdout),
                {
                    "adapter": str(adapter),
                    "failed": 0,
                    "passed": 2,
                    "specVersion": "0.1-draft",
                },
            )


class TypeScriptAdapterTest(unittest.TestCase):
    def test_packaged_typescript_implementation_passes_complete_suite(self) -> None:
        root = Path(__file__).resolve().parent.parent
        adapter = root / "conformance" / "typescript-adapter.mjs"
        result = subprocess.run(
            [
                sys.executable,
                str(root / "conformance" / "runner.py"),
                "--adapter",
                str(adapter),
                "--vectors",
                str(root / "vectors"),
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["failed"], 0)
        self.assertEqual(report["passed"], 35)
        self.assertEqual(report["specVersion"], "0.1-draft")


if __name__ == "__main__":
    unittest.main()
