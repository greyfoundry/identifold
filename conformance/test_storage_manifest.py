import json
import unittest
from pathlib import Path


STORAGE_ROOT = Path(__file__).with_name("storage")
MANIFEST_PATH = STORAGE_ROOT / "manifest.json"


class StorageManifestTests(unittest.TestCase):
    def test_storage_manifest_is_published_with_the_conformance_suite(self) -> None:
        """Catches a release that omits the normative storage case manifest."""
        self.assertTrue(
            MANIFEST_PATH.is_file(),
            f"missing storage conformance manifest: {MANIFEST_PATH}",
        )

    def test_manifest_requires_every_published_language_runner(self) -> None:
        """Catches a storage release that silently omits a language package."""
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            set(manifest.get("runners", {})),
            {
                "typescript",
                "python",
                "rust",
                "go",
                "java",
                "kotlin",
                "csharp",
                "swift",
                "ruby",
                "php",
            },
        )

    def test_manifest_publishes_every_required_fixture_suite(self) -> None:
        """Catches a conformance manifest that drops a storage behavior family."""
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            manifest.get("fixtures"),
            [
                "fixtures/reservation.json",
                "fixtures/sequential.json",
                "fixtures/errors.json",
            ],
        )
        for relative_path in manifest.get("fixtures", []):
            self.assertTrue(
                (STORAGE_ROOT / relative_path).is_file(),
                f"missing fixture file: {relative_path}",
            )

    def test_fixtures_cover_every_normative_storage_behavior_once(self) -> None:
        """Catches missing or ambiguously duplicated storage contract cases."""
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        case_ids: list[str] = []
        for relative_path in manifest["fixtures"]:
            fixture = json.loads(
                (STORAGE_ROOT / relative_path).read_text(encoding="utf-8")
            )
            case_ids.extend(case["caseId"] for case in fixture["cases"])

        self.assertEqual(len(case_ids), len(set(case_ids)), "duplicate storage case ID")
        self.assertEqual(
            set(case_ids),
            {
                "reservation.new",
                "reservation.duplicate-same-mid",
                "reservation.duplicate-other-mid",
                "reservation.concurrent-one-winner",
                "reservation.rollback",
                "resolution.committed",
                "resolution.missing",
                "sequence.first",
                "sequence.next",
                "sequence.concurrent-unique",
                "sequence.namespace-isolation",
                "sequence.scope-isolation",
                "sequence.replay",
                "sequence.replay-prefix-conflict",
                "sequence.replay-width-conflict",
                "sequence.maximum",
                "sequence.overflow",
                "sequence.rollback",
                "retry.transient-success",
                "retry.exhausted",
                "retry.invalid-limit-low",
                "retry.invalid-limit-high",
                "errors.sanitized",
            },
        )

    def test_manifest_marks_every_storage_capability_as_mandatory(self) -> None:
        """Catches a runner contract that permits a backend to skip a core guarantee."""
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        self.assertEqual(
            manifest.get("requiredCapabilities"),
            [
                "reservation",
                "resolution",
                "sequential-allocation",
                "bounded-retry",
                "sanitized-errors",
            ],
        )


if __name__ == "__main__":
    unittest.main()
