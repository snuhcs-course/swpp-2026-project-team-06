"""DEV-448: offline invented controls; observed strict scores are not semantic verdicts."""

import argparse
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))

from app.source_analysis import corpus_score, final_score, schemas, text_safety  # noqa: E402

CONTROLS = Path(__file__).with_name("controls.json")
VERSION = "dev448-synthetic-controls-v1"


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Proposed(Strict):
    claimPreserved: bool
    allOutputSupported: bool
    placement: Literal["PRIMARY", "MISPLACED", "NOT_PRESENT", "NA"]
    processingOutcome: Literal["SUCCESS", "CORRECT_EMPTY", "FAILED"]
    rationale: str = Field(min_length=1)


class Output(Strict):
    module: str = Field(min_length=1)
    texts: list[str]


class Control(Strict):
    id: final_score.ID
    category: str = Field(min_length=1)
    evidence: str = Field(min_length=1)
    reference: str | None
    selectors: list[str]
    referenceModule: str = Field(min_length=1)
    outputs: list[Output]
    recordStatus: Literal["EVALUATED", "PARTIAL", "FAILED", "MISSING"]
    proposed: Proposed


class Controls(Strict):
    schemaVersion: Literal[1]
    split: Literal["synthetic-controls"]
    semanticReviewStatus: Literal["PROPOSED_HUMAN_REVIEW_PENDING"]
    cases: list[Control] = Field(min_length=1)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def scorer_inputs(case):
    """Construct ordinary development inputs; no private files or holdout loader."""
    sentence = (
        [
            {
                "section": final_score.MODULE_SECTIONS[case.referenceModule],
                "module": case.referenceModule,
                "text": case.reference,
                "facts": [
                    {
                        "id": "f1",
                        "statement": case.reference,
                        "mustContain": case.selectors,
                        "critical": True,
                    }
                ],
            }
        ]
        if case.reference is not None
        else []
    )
    gold = {
        "schemaVersion": 1,
        "split": "development",
        "sources": [
            {
                "id": case.id,
                "format": "text",
                "product": "가상 감귤 상품",
                "sentences": sentence,
                "forbidden": [],
            }
        ],
    }
    runs = (
        []
        if case.recordStatus == "MISSING"
        else [
            {
                "id": case.id,
                "format": "text",
                "status": case.recordStatus,
                "modules": [o.model_dump() for o in case.outputs],
            }
        ]
    )
    return gold, runs, {case.id: case.evidence}


def parse_controls(data):
    try:
        parsed = Controls.model_validate(data)
        if len({c.id for c in parsed.cases}) != len(parsed.cases):
            raise ValueError
        for c in parsed.cases:
            if c.referenceModule not in final_score.TEXT_MODULES:
                raise ValueError
            if bool(c.selectors) != (c.reference is not None):
                raise ValueError
            if any(not t.strip() for t in c.selectors):
                raise ValueError
            if c.recordStatus == "MISSING" and c.outputs:
                raise ValueError
            if c.reference is None and (
                c.proposed.claimPreserved or c.proposed.placement != "NA"
            ):
                raise ValueError
            if c.proposed.processingOutcome == "CORRECT_EMPTY" and (
                c.reference is not None or c.outputs or c.recordStatus != "EVALUATED"
            ):
                raise ValueError
            gold, runs, _ = scorer_inputs(c)
            final_score.Gold.model_validate(gold)
            for run in runs:
                final_score.Run.model_validate(run)
        return parsed
    except (ValidationError, ValueError, TypeError, KeyError):
        raise ValueError("Invalid scorer controls (details redacted)") from None


def observe(data):
    controls = parse_controls(data)
    rows = []
    for case in controls.cases:
        gold, runs, safe = scorer_inputs(case)
        measured = final_score.score(gold, runs, safe)["overall"]
        reference_case = case.model_copy(
            update={
                "recordStatus": "EVALUATED",
                "outputs": (
                    [Output(module=case.referenceModule, texts=[case.reference])]
                    if case.reference is not None
                    else []
                ),
            }
        )
        reference = final_score.score(*scorer_inputs(reference_case))["overall"]
        observed = {
            "factHit": measured["factRecall"]["hit"],
            "factTotal": measured["factRecall"]["total"],
            "misplaced": measured["misplacement"]["hit"],
            "criticalGate": measured["criticalGate"],
            "unsupported": measured["unsupported"],
            "forbidden": measured["forbidden"],
            "failedRuns": measured["failedRuns"],
            "precisionProxy": measured["precisionProxy"],
            "recordStatus": case.recordStatus,
        }
        p = case.proposed
        flags = []
        if not p.allOutputSupported and observed["criticalGate"] == "PASS":
            flags.append("proposedUnsupportedOutputPassesHistoricalGate")
        if not p.claimPreserved and observed["factHit"]:
            flags.append("proposedIncorrectClaimGetsLexicalCredit")
        primary_valid = (
            p.processingOutcome == "SUCCESS"
            and p.claimPreserved
            and p.allOutputSupported
            and p.placement == "PRIMARY"
        )
        if primary_valid and observed["criticalGate"] == "FAIL":
            flags.append("proposedValidPrimaryOutputFailsHistoricalGate")
        if primary_valid and not observed["factHit"]:
            flags.append("proposedValidPrimaryClaimMissedLexically")
        if p.claimPreserved and p.placement == "MISPLACED" and not observed["factHit"]:
            flags.append("pageWidePreservationDistinctFromStrictPlacement")
        if p.processingOutcome == "CORRECT_EMPTY" and observed["failedRuns"]:
            flags.append("proposedCorrectEmptyCountedAsHistoricalFailure")
        rows.append(
            {
                "id": case.id,
                "category": case.category,
                "proposed": p.model_dump(),
                "historical": observed,
                "referenceHistorical": {
                    "factHit": reference["factRecall"]["hit"],
                    "factTotal": reference["factRecall"]["total"],
                    "criticalGate": reference["criticalGate"],
                    "unsupported": reference["unsupported"],
                    "failedRuns": reference["failedRuns"],
                },
                "diagnosticFlags": flags,
            }
        )
    return {
        "probeVersion": VERSION,
        "measurementVersion": final_score.MEASUREMENT_VERSION,
        "semanticReviewStatus": controls.semanticReviewStatus,
        "scope": "INVENTED_CAPABILITY_CONTROLS_NOT_MODEL_OR_POPULATION_PERFORMANCE",
        "summary": {
            "controls": len(rows),
            "referenceNonemptyGateFailures": sum(
                r["referenceHistorical"]["factTotal"] > 0
                and r["referenceHistorical"]["criticalGate"] == "FAIL"
                for r in rows
            ),
            "byCategory": dict(sorted(Counter(r["category"] for r in rows).items())),
            "historicalGate": dict(
                sorted(Counter(r["historical"]["criticalGate"] for r in rows).items())
            ),
            "diagnosticFlags": dict(
                sorted(Counter(f for r in rows for f in r["diagnosticFlags"]).items())
            ),
        },
        "cases": rows,
    }


def report():
    data = json.loads(CONTROLS.read_text())
    result = observe(data)
    modules = [final_score, corpus_score, text_safety, schemas]
    paths = [CONTROLS, Path(__file__).resolve()]
    paths += [Path(m.__file__) for m in modules]
    paths += [Path(text_safety.__file__).with_name("text_safety_lists.json")]
    result["provenanceSha256"] = {p.name: digest(p) for p in paths}
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = report()
        # Exclusive creation prevents overwriting controls, scorer, or prior reports.
        with args.out.open("x", encoding="utf-8") as f:
            f.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    except (OSError, ValueError):
        print("Scorer probe failed; details redacted", file=sys.stderr)
        return 2
    print(json.dumps(result["summary"], ensure_ascii=False, sort_keys=True))
    # A successful diagnostic run never means the historical scorer passed semantics.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
