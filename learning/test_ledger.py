"""Focused acceptance tests use disposable databases, never the real course state."""

import json
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from learning import ledger


class LedgerTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parent / ".test-tmp"
        scratch.mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.db = self.root / "learning.sqlite3"
        self.curriculum = self.root / "curriculum.json"
        data = {
            "id": "test-course", "version": "v1", "plan_markdown": "Original approved plan",
            "steps": [
                {"id": "step-01", "title": "Foundation", "goal": "Trust persisted evidence",
                 "required_checks": ["runtime", "ledger_tests"],
                 "required_artifacts": ["handoff", "code-guide", "mindmap-data", "mindmap"],
                 "lessons": [{"id": "step-01.01", "title": "DB", "goal": "Persist"}]},
                {"id": "step-02", "title": "Query", "goal": "Read real data",
                 "prerequisites": ["step-01"], "required_checks": [], "required_artifacts": []},
            ],
        }
        self.curriculum.write_text(json.dumps(data), encoding="utf-8")
        ledger.init(self.db, self.curriculum)

    def row(self, sql, params=()):
        with closing(sqlite3.connect(self.db)) as con:
            return con.execute(sql, params).fetchone()

    def pass_checks(self):
        ledger.start(self.db, "step-01")
        for name in ("runtime", "ledger_tests"):
            ledger.record_check(self.db, "step-01", name, "PASSED", "Works", "Observed result", "test fixture")

    def artifacts(self):
        files = {"handoff": "handoff.md", "code-guide": "guide.md",
                 "mindmap-data": "map.json", "mindmap": "map.html"}
        for kind, filename in files.items():
            body = '{"nodes":[]}' if kind == "mindmap-data" else f"Content for {kind}"
            (self.root / filename).write_text(body, encoding="utf-8")
        return files

    def test_idempotent_init_preserves_plan_progress_and_evidence(self):
        self.pass_checks()
        before = ledger.status(self.db, True)
        data = json.loads(self.curriculum.read_text())
        data["plan_markdown"] = "Accidental overwrite"
        data["version"] = "v2"
        self.curriculum.write_text(json.dumps(data), encoding="utf-8")
        ledger.init(self.db, self.curriculum)
        self.assertEqual(before, ledger.status(self.db, True))
        self.assertEqual(self.row("SELECT plan_markdown FROM learning_run")[0], "Original approved plan")
        self.assertEqual(self.row("SELECT COUNT(*) FROM acceptance_check")[0], 2)

    def test_missing_seeded_row_can_be_restored_without_resetting_progress(self):
        ledger.start(self.db, "step-01")
        with closing(sqlite3.connect(self.db)) as con, con:
            con.execute("DELETE FROM learning_step WHERE id='step-02'")
        ledger.init(self.db, self.curriculum)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "IN_PROGRESS")
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-02'")[0], "PENDING")

    def test_failed_and_not_run_checks_block_completion(self):
        ledger.start(self.db, "step-01")
        manifest = self.artifacts()
        for outcome in ("FAILED", "NOT_RUN"):
            ledger.record_check(self.db, "step-01", "runtime", outcome, "Works", "Not working")
            ledger.record_check(self.db, "step-01", "ledger_tests", "PASSED", "Works", "Works")
            with self.assertRaisesRegex(ledger.LedgerError, "runtime"):
                ledger.complete(self.db, "step-01", manifest, self.root)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "VERIFYING")

    def test_completion_rolls_back_new_artifact_rows_on_missing_file(self):
        self.pass_checks()
        manifest = self.artifacts()
        manifest["mindmap"] = "missing.html"
        with self.assertRaisesRegex(ledger.LedgerError, "does not exist"):
            ledger.complete(self.db, "step-01", manifest, self.root)
        self.assertEqual(self.row("SELECT COUNT(*) FROM artifact")[0], 0)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "VERIFYING")

    def test_completion_rolls_back_on_sql_write_failure(self):
        self.pass_checks()
        manifest = self.artifacts()
        with closing(sqlite3.connect(self.db)) as con, con:
            con.execute("""CREATE TRIGGER fail_completion BEFORE UPDATE ON learning_run
                           BEGIN SELECT RAISE(ABORT, 'simulated disk/write failure'); END""")
        with self.assertRaises(sqlite3.IntegrityError):
            ledger.complete(self.db, "step-01", manifest, self.root)
        self.assertEqual(self.row("SELECT COUNT(*) FROM artifact")[0], 0)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "VERIFYING")
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01.01'")[0], "VERIFYING")

    def test_missing_or_changed_artifact_blocks_completion(self):
        self.pass_checks()
        manifest = self.artifacts()
        for kind, path in manifest.items():
            ledger.register_artifact(self.db, "step-01", kind, path, self.root)
        (self.root / manifest["handoff"]).write_text("Unregistered modification", encoding="utf-8")
        with self.assertRaisesRegex(ledger.LedgerError, "changed after registration"):
            ledger.complete(self.db, "step-01", root=self.root)
        ledger.register_artifact(self.db, "step-01", "handoff", manifest["handoff"], self.root)
        (self.root / manifest["mindmap"]).unlink()
        with self.assertRaisesRegex(ledger.LedgerError, "missing"):
            ledger.complete(self.db, "step-01", root=self.root)

    def test_unregistered_required_artifact_blocks_completion(self):
        self.pass_checks()
        with self.assertRaisesRegex(ledger.LedgerError, "not registered"):
            ledger.complete(self.db, "step-01", root=self.root)

    def test_changed_additional_artifact_blocks_completion_and_rolls_back(self):
        self.pass_checks()
        manifest = self.artifacts()
        guide = self.root / "additional-guide.md"
        guide.write_text("Registered guide", encoding="utf-8")
        ledger.register_artifact(self.db, "step-01", "additional-guide", guide, self.root)
        guide.write_text("Unregistered modification", encoding="utf-8")

        with self.assertRaisesRegex(ledger.LedgerError, "changed after registration"):
            ledger.complete(self.db, "step-01", manifest, self.root)

        self.assertEqual(self.row("SELECT COUNT(*) FROM artifact")[0], 1)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "VERIFYING")
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01.01'")[0], "VERIFYING")

    def test_missing_additional_artifact_blocks_completion_and_rolls_back(self):
        self.pass_checks()
        manifest = self.artifacts()
        guide = self.root / "additional-guide.md"
        guide.write_text("Registered guide", encoding="utf-8")
        ledger.register_artifact(self.db, "step-01", "additional-guide", guide, self.root)
        guide.unlink()

        with self.assertRaisesRegex(ledger.LedgerError, "Artifact missing"):
            ledger.complete(self.db, "step-01", manifest, self.root)

        self.assertEqual(self.row("SELECT COUNT(*) FROM artifact")[0], 1)
        self.assertEqual(self.row("SELECT status FROM learning_step WHERE id='step-01'")[0], "VERIFYING")

    def test_parent_gate_and_reopen_persistence(self):
        with self.assertRaisesRegex(ledger.LedgerError, "Prerequisite"):
            ledger.start(self.db, "step-02")
        self.pass_checks()
        ledger.complete(self.db, "step-01", self.artifacts(), self.root)
        # Every function closes the connection; reading here exercises a new one.
        restored = ledger.status(self.db, True)
        self.assertEqual(restored["steps"][0]["status"], "COMPLETED")
        self.assertEqual(restored["steps"][1]["status"], "COMPLETED")
        self.assertEqual(self.row("SELECT content_text FROM artifact WHERE kind='handoff'")[0], "Content for handoff")
        ledger.start(self.db, "step-02")
        with self.assertRaisesRegex(ledger.LedgerError, "Dependent"):
            ledger.reopen(self.db, "step-01", "Correction")

    def test_reopen_requires_new_attempt_evidence(self):
        self.pass_checks()
        ledger.complete(self.db, "step-01", self.artifacts(), self.root)
        reopened = ledger.reopen(self.db, "step-01", "Repeat verification")
        self.assertEqual(reopened["attempt"], 2)
        ledger.record_check(self.db, "step-01", "runtime", "PASSED", "Works", "Works again")
        with self.assertRaisesRegex(ledger.LedgerError, "ledger_tests"):
            ledger.complete(self.db, "step-01", self.artifacts(), self.root)
        self.assertEqual(self.row("SELECT COUNT(*) FROM acceptance_check WHERE attempt=1")[0], 2)

    def test_artifact_cannot_escape_project(self):
        ledger.start(self.db, "step-01")
        with self.assertRaisesRegex(ledger.LedgerError, "inside the project"):
            ledger.register_artifact(self.db, "step-01", "handoff", "../outside.md", self.root)


if __name__ == "__main__":
    unittest.main()
