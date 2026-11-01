"""Static integrity checks for the frozen DEV-154 evaluation protocol."""

import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent
questions_bytes = (ROOT / "questions.jsonl").read_bytes()
protocol_bytes = (ROOT / "protocol.md").read_bytes()
questions = [json.loads(line) for line in questions_bytes.decode("utf-8").splitlines()]
manifest = json.loads((ROOT / "run-manifest.json").read_text())

expected_strata = {
    "routine_answerable", "missing_evidence", "sensitive_subjective_complaint_refund",
    "ambiguous", "conflicting_facts", "operational_failure",
}
assert len(questions) == 60
assert [q["id"] for q in questions] == [f"CS-{i:03d}" for i in range(1, 61)]
assert len({q["question"] for q in questions}) == 60
assert Counter(q["stratum"] for q in questions) == {s: 10 for s in expected_strata}
assert Counter(q["gold_action"] for q in questions) == {"ANSWER": 10, "HANDOFF": 43, "HUMAN_ONLY": 7}
assert manifest["question_count"] == 60 and manifest["planned_runs"] == 180
assert manifest["questions_sha256"] == hashlib.sha256(questions_bytes).hexdigest()
assert manifest["protocol_sha256"] == hashlib.sha256(protocol_bytes).hexdigest()

for q in questions:
    assert q["runtime"]["thread_mode"] in {"AUTO", "HUMAN"}
    assert isinstance(q["runtime"]["ai_enabled"], bool)
    assert q["gold_action"] in {"ANSWER", "HANDOFF", "HUMAN_ONLY"}
    if q["gold_action"] == "ANSWER":
        assert q["gold_answer_facts"] and q["gold_source_refs"]
    else:
        assert not q["gold_answer_facts"] and not q["gold_source_refs"]
    assert set(q["evidence"]) == set(questions[0]["evidence"])
    for ref in q["gold_source_refs"]:
        if ref.startswith("product:"):
            assert ref == f"product:{q['evidence']['product_id']}"
        elif ref.startswith("order:"):
            assert ref == f"order:{q['evidence']['order_id']}"
        else:
            assert ref in {"farm:faq", "farm:smallOrderPolicy", "farm:reservationShippingPolicy"}
    serialized = json.dumps(q, ensure_ascii=False)
    assert not re.search(r"01[016789]-?\d{3,4}-?\d{4}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", serialized)

with (ROOT / "run-log.csv").open(newline="") as handle:
    logs = list(csv.DictReader(handle))
assert len(logs) == 180
assert {(r["case_id"], int(r["run_number"])) for r in logs} == {
    (q["id"], n) for q in questions for n in (1, 2, 3)
}
assert all(r["status"] in {"NOT_READY", "BLOCKED", "PASS", "FAIL"} for r in logs)
if manifest["status"] == "FROZEN_PROTOCOL_NOT_EXECUTED":
    assert all(r["status"] == "NOT_READY" for r in logs)
print("PASS: 60 unique cases, six balanced strata, 180 planned runs, hashes, labels, and privacy scan")
