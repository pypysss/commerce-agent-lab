"""SQLite learning ledger. Run from the project root: python -m learning.ledger --help."""

from __future__ import annotations

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "state" / "learning.sqlite3"
DEFAULT_CURRICULUM = Path(__file__).with_name("curriculum.json")
STATUSES = ("PENDING", "IN_PROGRESS", "VERIFYING", "COMPLETED")
OUTCOMES = ("PASSED", "FAILED", "NOT_RUN")
ARTIFACT_EXTENSIONS = {
    "handoff": ".md", "code-guide": ".md", "mindmap-data": ".json", "mindmap": ".html"
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS learning_run (
    id TEXT PRIMARY KEY,
    plan_version TEXT NOT NULL,
    plan_markdown TEXT NOT NULL,
    curriculum_json TEXT NOT NULL,
    current_step TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS learning_step (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES learning_run(id),
    parent_id TEXT REFERENCES learning_step(id),
    ordinal INTEGER NOT NULL,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    prerequisites_json TEXT NOT NULL,
    acceptance_json TEXT NOT NULL,
    required_checks_json TEXT NOT NULL,
    required_artifacts_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK(status IN ('PENDING','IN_PROGRESS','VERIFYING','COMPLETED')),
    attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt >= 0),
    error_reason TEXT,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS acceptance_check (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id TEXT NOT NULL REFERENCES learning_step(id),
    attempt INTEGER NOT NULL,
    name TEXT NOT NULL,
    expected TEXT NOT NULL,
    actual TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN ('PASSED','FAILED','NOT_RUN')),
    evidence TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artifact (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id TEXT NOT NULL REFERENCES learning_step(id),
    attempt INTEGER NOT NULL,
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    content_text TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS check_step_attempt ON acceptance_check(step_id, attempt, name, id);
CREATE INDEX IF NOT EXISTS artifact_step_attempt ON artifact(step_id, attempt, kind, id);
"""


class LedgerError(ValueError):
    """A requested state transition or completion requirement is invalid."""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db: str | Path = DEFAULT_DB) -> sqlite3.Connection:
    """One coordinator owns writes; short transactions and a busy timeout suffice."""
    db = Path(db)
    db.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db, timeout=5)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    return con


def init(db: str | Path = DEFAULT_DB, curriculum: str | Path = DEFAULT_CURRICULUM) -> dict:
    """Fill missing rows only. An existing run's plan and progress remain authoritative."""
    data = json.loads(Path(curriculum).read_text(encoding="utf-8"))
    with closing(connect(db)) as con:
        con.executescript(SCHEMA)
        with con:
            timestamp = now()
            con.execute(
                "INSERT OR IGNORE INTO learning_run VALUES (?, ?, ?, ?, NULL, ?, ?)",
                (data["id"], data["version"], data["plan_markdown"],
                 json.dumps(data, ensure_ascii=False), timestamp, timestamp),
            )
            # The original saved curriculum wins even if the file has subsequently changed.
            saved = json.loads(con.execute(
                "SELECT curriculum_json FROM learning_run WHERE id = ?", (data["id"],)
            ).fetchone()[0])
            for ordinal, step in enumerate(saved["steps"], 1):
                _insert_step(con, saved["id"], step, None, ordinal * 100, timestamp)
                for lesson_number, lesson in enumerate(step.get("lessons", []), 1):
                    _insert_step(con, saved["id"], lesson, step["id"],
                                 ordinal * 100 + lesson_number, timestamp)
    return status(db)


def _insert_step(con, run_id, step, parent_id, ordinal, timestamp):
    con.execute(
        """INSERT OR IGNORE INTO learning_step
           (id, run_id, parent_id, ordinal, title, goal, prerequisites_json, acceptance_json,
            required_checks_json, required_artifacts_json, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (step["id"], run_id, parent_id, ordinal, step["title"], step["goal"],
         json.dumps(step.get("prerequisites", []), ensure_ascii=False),
         json.dumps(step.get("acceptance", []), ensure_ascii=False),
         json.dumps(step.get("required_checks", [])),
         json.dumps(step.get("required_artifacts", [])), timestamp),
    )


def _step(con, step_id, *, active=False):
    row = con.execute("SELECT * FROM learning_step WHERE id = ?", (step_id,)).fetchone()
    if row is None:
        raise LedgerError(f"Unknown step: {step_id}; run init first")
    if row["parent_id"]:
        raise LedgerError(f"Operate on the parent stage {row['parent_id']}; lessons follow its evidence")
    if active and row["status"] not in ("IN_PROGRESS", "VERIFYING"):
        raise LedgerError(f"{step_id} is {row['status']}; start or reopen it first")
    return row


def status(db: str | Path = DEFAULT_DB, include_lessons: bool = False) -> dict:
    with closing(connect(db)) as con:
        runs = [dict(r) for r in con.execute(
            "SELECT id, plan_version, current_step, created_at, updated_at FROM learning_run"
        )]
        where = "" if include_lessons else "WHERE parent_id IS NULL"
        steps = [dict(r) for r in con.execute(
            f"SELECT id, parent_id, title, status, attempt, error_reason FROM learning_step {where} ORDER BY ordinal"
        )]
        return {"runs": runs, "steps": steps}


def start(db: str | Path, step_id: str) -> dict:
    with closing(connect(db)) as con, con:
        con.execute("BEGIN IMMEDIATE")
        row = _step(con, step_id)
        if row["status"] in ("IN_PROGRESS", "VERIFYING"):
            return dict(row)
        if row["status"] == "COMPLETED":
            raise LedgerError("Completed steps require an explicit reopen")
        for prerequisite in json.loads(row["prerequisites_json"]):
            previous = con.execute("SELECT status FROM learning_step WHERE id = ?", (prerequisite,)).fetchone()
            if not previous or previous[0] != "COMPLETED":
                raise LedgerError(f"Prerequisite {prerequisite} must be COMPLETED")
        _begin_attempt(con, row)
        return dict(_step(con, step_id))


def _begin_attempt(con, row):
    timestamp = now()
    con.execute(
        """UPDATE learning_step SET status='IN_PROGRESS', attempt=attempt+1,
           error_reason=NULL, started_at=?, completed_at=NULL, updated_at=?
           WHERE id=? OR parent_id=?""", (timestamp, timestamp, row["id"], row["id"])
    )
    con.execute("UPDATE learning_run SET current_step=?, updated_at=? WHERE id=?",
                (row["id"], timestamp, row["run_id"]))


def reopen(db: str | Path, step_id: str, reason: str) -> dict:
    if not reason.strip():
        raise LedgerError("A reopen reason is required")
    with closing(connect(db)) as con, con:
        con.execute("BEGIN IMMEDIATE")
        row = _step(con, step_id)
        if row["status"] == "PENDING":
            raise LedgerError("Use start for a pending stage")
        # A dependent stage must be reset explicitly before its prerequisite can change.
        for later in con.execute("SELECT id, prerequisites_json, status FROM learning_step WHERE parent_id IS NULL"):
            if step_id in json.loads(later["prerequisites_json"]) and later["status"] != "PENDING":
                raise LedgerError(f"Dependent {later['id']} has already started; reopening would invalidate it")
        _begin_attempt(con, row)
        con.execute("UPDATE learning_step SET error_reason=? WHERE id=?", (f"Reopened: {reason}", step_id))
        return dict(_step(con, step_id))


def record_check(db: str | Path, step_id: str, name: str, outcome: str,
                 expected: str, actual: str, evidence: str = "") -> int:
    if outcome not in OUTCOMES or not name.strip() or not expected.strip() or not actual.strip():
        raise LedgerError("Check needs a name, expected/actual descriptions and PASSED/FAILED/NOT_RUN outcome")
    with closing(connect(db)) as con, con:
        row = _step(con, step_id, active=True)
        timestamp = now()
        cursor = con.execute(
            """INSERT INTO acceptance_check
               (step_id,attempt,name,expected,actual,outcome,evidence,created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (step_id, row["attempt"], name, expected, actual, outcome, evidence, timestamp),
        )
        con.execute(
            "UPDATE learning_step SET status='VERIFYING', updated_at=? WHERE id=? OR parent_id=?",
            (timestamp, step_id, step_id),
        )
        if outcome != "PASSED":
            con.execute("UPDATE learning_step SET error_reason=? WHERE id=?", (f"{name}: {outcome}: {actual}", step_id))
        return cursor.lastrowid


def _register_artifact(con, row, kind, path, root):
    root = Path(root).resolve()
    path = Path(path)
    path = (root / path).resolve() if not path.is_absolute() else path.resolve()
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise LedgerError("Artifact must be inside the project root") from exc
    if not path.is_file():
        raise LedgerError(f"Artifact does not exist: {path}")
    if kind in ARTIFACT_EXTENSIONS and path.suffix.lower() != ARTIFACT_EXTENSIONS[kind]:
        raise LedgerError(f"{kind} requires {ARTIFACT_EXTENSIONS[kind]}")
    raw = path.read_bytes()
    body = raw.decode("utf-8-sig") if path.suffix.lower() in (".md", ".json") else None
    if path.suffix.lower() == ".json":
        json.loads(body)
    cursor = con.execute(
        """INSERT INTO artifact(step_id,attempt,kind,path,sha256,content_text,created_at)
           VALUES (?,?,?,?,?,?,?)""",
        (row["id"], row["attempt"], kind, relative.as_posix(), hashlib.sha256(raw).hexdigest(), body, now()),
    )
    return cursor.lastrowid


def register_artifact(db: str | Path, step_id: str, kind: str, path: str | Path,
                      root: str | Path = ROOT) -> int:
    with closing(connect(db)) as con, con:
        return _register_artifact(con, _step(con, step_id, active=True), kind, path, root)


def _latest(con, table, step_id, attempt, key):
    # table/key originate only from the two internal call sites, never user input.
    return {r[key]: r for r in con.execute(
        f"""SELECT t.* FROM {table} t JOIN
            (SELECT MAX(id) id FROM {table} WHERE step_id=? AND attempt=? GROUP BY {key}) latest
            ON t.id=latest.id""", (step_id, attempt)
    )}


def complete(db: str | Path, step_id: str, artifacts: dict[str, str | Path] | None = None,
             root: str | Path = ROOT) -> dict:
    """Validate this attempt and register final artifacts in the completion transaction."""
    with closing(connect(db)) as con, con:
        con.execute("BEGIN IMMEDIATE")
        row = _step(con, step_id, active=True)
        if row["status"] != "VERIFYING":
            raise LedgerError("Record acceptance checks before completion")
        for kind, path in (artifacts or {}).items():
            _register_artifact(con, row, kind, path, root)
        checks = _latest(con, "acceptance_check", step_id, row["attempt"], "name")
        unmet = [name for name in json.loads(row["required_checks_json"])
                 if name not in checks or checks[name]["outcome"] != "PASSED"]
        if unmet:
            raise LedgerError(f"Required checks missing or not passed: {', '.join(unmet)}")
        saved = _latest(con, "artifact", step_id, row["attempt"], "kind")
        for kind in json.loads(row["required_artifacts_json"]):
            if kind not in saved:
                raise LedgerError(f"Required artifact not registered: {kind}")
        project_root = Path(root).resolve()
        for artifact in saved.values():
            path = (project_root / artifact["path"]).resolve()
            if not path.is_relative_to(project_root) or not path.is_file():
                raise LedgerError(f"Artifact missing or outside project: {artifact['path']}")
            if hashlib.sha256(path.read_bytes()).hexdigest() != artifact["sha256"]:
                raise LedgerError(f"Artifact changed after registration: {artifact['path']}")
        timestamp = now()
        con.execute(
            """UPDATE learning_step SET status='COMPLETED',error_reason=NULL,completed_at=?,updated_at=?
               WHERE id=? OR parent_id=?""", (timestamp, timestamp, step_id, step_id)
        )
        con.execute("UPDATE learning_run SET current_step=?,updated_at=? WHERE id=?",
                    (step_id, timestamp, row["run_id"]))
        return dict(_step(con, step_id))


def export_roadmap(db: str | Path = DEFAULT_DB, output: str | Path | None = None) -> str:
    current = status(db)
    lines = ["# Commerce Agent Lab 学习进度", "", "台账是验收记录；只有实际验证通过的步骤才能标为完成。", "",
             "| 步骤 | 目标 | 状态 | 尝试 |", "|---|---|---|---|"]
    for step in current["steps"]:
        lines.append(f"| {step['id']} | {step['title']} | {step['status']} | {step['attempt']} |")
    result = "\n".join(lines) + "\n"
    if output is not None:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(result, encoding="utf-8")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--root", type=Path, default=ROOT, help="Root against which artifact paths are resolved")
    commands = parser.add_subparsers(dest="command", required=True)
    init_parser = commands.add_parser("init")
    init_parser.add_argument("--curriculum", type=Path, default=DEFAULT_CURRICULUM)
    status_parser = commands.add_parser("status")
    status_parser.add_argument("--lessons", action="store_true")
    for command in ("start", "complete", "reopen", "check", "artifact"):
        sub = commands.add_parser(command)
        sub.add_argument("step")
        if command == "reopen":
            sub.add_argument("--reason", required=True)
        if command == "complete":
            sub.add_argument("--artifact", action="append", default=[], metavar="KIND=PATH")
        if command == "check":
            sub.add_argument("name")
            sub.add_argument("outcome", choices=OUTCOMES)
            sub.add_argument("--expected", required=True)
            sub.add_argument("--actual", required=True)
            sub.add_argument("--evidence", default="")
        if command == "artifact":
            sub.add_argument("kind")
            sub.add_argument("path", type=Path)
    export = commands.add_parser("export-roadmap")
    export.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            result = init(args.db, args.curriculum)
        elif args.command == "status":
            result = status(args.db, args.lessons)
        elif args.command == "start":
            result = start(args.db, args.step)
        elif args.command == "check":
            result = {"check_id": record_check(args.db, args.step, args.name, args.outcome,
                                              args.expected, args.actual, args.evidence)}
        elif args.command == "artifact":
            result = {"artifact_id": register_artifact(args.db, args.step, args.kind, args.path, args.root)}
        elif args.command == "complete":
            if any("=" not in item for item in args.artifact):
                raise LedgerError("Use --artifact KIND=PATH")
            manifest = dict(item.split("=", 1) for item in args.artifact)
            result = complete(args.db, args.step, manifest, args.root)
        elif args.command == "reopen":
            result = reopen(args.db, args.step, args.reason)
        else:
            print(export_roadmap(args.db, args.output), end="")
            return
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (LedgerError, sqlite3.Error, OSError, json.JSONDecodeError) as exc:
        parser.exit(1, f"ledger: {exc}\n")


if __name__ == "__main__":
    main()
