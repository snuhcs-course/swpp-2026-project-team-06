"""Validate the frozen DEV-152 matrix without running product tests."""

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
FIELDS = {
    "case_id", "version", "priority", "journey", "case_type", "requirement_ids",
    "acceptance_ids", "execution_issue", "owner", "reviewer", "environment",
    "build_baseline", "setup", "steps", "expected_result", "denominator",
    "status_rule", "evidence_path", "execution_status",
}
KINDS = {"normal", "boundary", "error", "retry", "state-change"}
AI_STRATA = {
    "routine_answerable", "ambiguous", "conflicting_facts", "missing_evidence",
    "sensitive_subjective_complaint_refund", "operational_failure",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    for filename in ("matrix.csv", "protocol.md"):
        assert digest(ROOT / filename) == manifest["sha256"][filename], f"changed frozen {filename}"

    with (ROOT / "matrix.csv").open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        assert set(reader.fieldnames or []) == FIELDS, "matrix columns differ from frozen schema"
        rows = list(reader)
    assert len(rows) == manifest["case_count"] == 41
    assert len({r["case_id"] for r in rows}) == len(rows), "duplicate case ID"

    groups = defaultdict(set)
    priorities = Counter()
    for row in rows:
        assert all((value or "").strip() for value in row.values()), f"empty field in {row['case_id']}"
        assert re.fullmatch(r"I3-[A-Z]+-\d{2}", row["case_id"]), row["case_id"]
        assert row["version"] == manifest["version"]
        assert row["priority"] in {"P0", "P1"}
        assert row["case_type"] in KINDS
        assert row["execution_status"] == "NOT_READY", "frozen matrix contains a measured verdict"
        assert row["owner"] != row["reviewer"], f"self-review in {row['case_id']}"
        assert row["execution_issue"].startswith("DEV-")
        assert row["case_id"] in row["evidence_path"] and "<baseline>" in row["evidence_path"]
        assert "BLOCKED" in row["status_rule"] and "FAIL" in row["status_rule"]
        assert "DEV-165" in row["build_baseline"], "baseline missing"
        groups[row["journey"]].add(row["case_type"])
        priorities[row["priority"]] += 1
        for ac in row["acceptance_ids"].split(";"):
            assert re.fullmatch(r"AC-(?:\d{2}-\d+|SRC-\d+)|N-\d{2}", ac), (row["case_id"], ac)
            if ac.startswith("AC-") and not ac.startswith("AC-SRC"):
                feat = ac.split("-")[1]
                paths = list((REPO / "docs/spec/functional").glob(f"FEAT-{feat}-*.md"))
                if paths:
                    assert any(ac in path.read_text(encoding="utf-8") for path in paths), (row["case_id"], ac)

    assert priorities == manifest["priority_counts"]
    assert set(groups) == {"DISC", "PRE", "CHAT", "SOURCE", "PRODORD", "MANAGER", "AI_SUPPORT", "AIGUARD"}
    for journey, kinds in groups.items():
        if journey != "AI_SUPPORT":
            assert kinds == KINDS, f"missing case type in {journey}"
    assert sum(1 for r in rows if r["journey"] == "AI_SUPPORT") == 6
    for row in (r for r in rows if r["journey"] == "AI_SUPPORT"):
        assert "30 planned trials" in row["denominator"]

    ai_manifest = json.loads((REPO / "docs/evaluation/i3-ai-support/run-manifest.json").read_text(encoding="utf-8"))
    assert set(ai_manifest["strata"]) == AI_STRATA
    assert all(n == 10 for n in ai_manifest["strata"].values())
    assert ai_manifest["planned_runs"] == 180 and ai_manifest["runs_per_question"] == 3
    assert ai_manifest["questions_sha256"] == manifest["ai_support_questions_sha256"]
    print(f"PASS: {len(rows)} frozen cases ({priorities['P0']} P0, {priorities['P1']} P1); AI link: 60 questions / 180 planned trials; no measured results")


if __name__ == "__main__":
    main()
