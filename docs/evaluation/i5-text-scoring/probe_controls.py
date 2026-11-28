"""Run public capability controls; proposed labels are never evaluator inputs."""

import argparse
import importlib.util
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "legacy_controls", ROOT / "docs/evaluation/i5-scorer-controls/probe.py"
)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)
from app.source_analysis import text_score


def observe():
    rows, ids = [], set()
    for path in [probe.CONTROLS, Path(__file__).with_name("controls-extra.json")]:
        controls = probe.parse_controls(json.loads(path.read_text()))
        for case in controls.cases:
            if case.id in ids:
                raise ValueError("Duplicate control ID")
            ids.add(case.id)
            gold, records, safe = probe.scorer_inputs(case)
            # Correct-empty is an explicit contract, not a guessed semantic judgment.
            empty = (
                [case.id] if case.proposed.processingOutcome == "CORRECT_EMPTY" else []
            )
            report = text_score.score(gold, records, safe, correct_empty_ids=empty)
            rows.append(
                {
                    "id": case.id,
                    "category": case.category,
                    "proposed": case.proposed.model_dump(),
                    "report": report,
                }
            )
    return {
        "version": 1,
        "semanticReview": "PROPOSED_HUMAN_REVIEW_PENDING",
        "purpose": "CAPABILITY_CONTROLS_NOT_ACCURACY",
        "controls": len(rows),
        "acceptanceCounts": dict(Counter(r["report"]["acceptance"] for r in rows)),
        "rows": rows,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--out", type=Path, required=True)
    args = p.parse_args()
    report = observe()
    with args.out.open("x") as f:
        args.out.chmod(0o600)
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(
        json.dumps(
            {
                "controls": report["controls"],
                "outcomes": report["acceptanceCounts"],
                "providerCalls": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
