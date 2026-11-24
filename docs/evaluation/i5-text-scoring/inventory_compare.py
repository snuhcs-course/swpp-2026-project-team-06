"""DEV-450 frozen accepted-input literal assembly control; no provider calls."""

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "server"))
from app.ai.source_refine import RefineError, refine_inventory
from app.source_analysis import text_score
from app.source_analysis.source_inventory import build_inventory


def compare(data):
    """Compare saved baseline with literal control, never model quality evidence."""
    try:
        if type(data) is not dict or set(data) != {
            "version",
            "gold",
            "safeTexts",
            "sources",
        }:
            raise ValueError
        if data["version"] != 1 or data["gold"]["split"] != "development":
            raise ValueError
        ids = [s["id"] for s in data["gold"]["sources"]]
        if not ids or len(set(ids)) != len(ids) or type(data["sources"]) is not list:
            raise ValueError
        rows = data["sources"]
        if len(rows) != len(ids) or {s["id"] for s in rows} != set(ids):
            raise ValueError
        baseline, control, details = [], [], []
        for row in rows:
            if (
                set(row)
                != {
                    "id",
                    "target",
                    "candidates",
                    "acceptedCandidateIds",
                    "sourceRevisions",
                    "baselineRecord",
                }
                or row["baselineRecord"]["id"] != row["id"]
            ):
                raise ValueError
            baseline.append(row["baselineRecord"])
            fmt = next(
                s["format"] for s in data["gold"]["sources"] if s["id"] == row["id"]
            )
            try:
                inventory = build_inventory(
                    row["candidates"],
                    accepted_candidate_ids=row["acceptedCandidateIds"],
                    target_id=row["target"]["id"],
                    source_revisions=row["sourceRevisions"],
                )
                result = refine_inventory(
                    "mock",
                    "offline-literal-control",
                    row["target"],
                    inventory,
                    source_revisions=row["sourceRevisions"],
                )
                modules = [
                    {"module": m["module"], "texts": [t["value"] for t in m["texts"]]}
                    for m in result["modules"]
                ]
                status = "EVALUATED" if result["status"] == "COMPLETE" else "PARTIAL"
                if not modules:
                    status = "FAILED"
                control.append(
                    {
                        "id": row["id"],
                        "format": fmt,
                        "status": status,
                        "modules": modules,
                    }
                )
                details.append(
                    {
                        "id": row["id"],
                        "accounting": inventory["accounting"],
                        "result": result,
                    }
                )
            except (ValueError, RefineError):
                # A malformed/oversized source remains in the denominator.
                control.append(
                    {"id": row["id"], "format": fmt, "status": "FAILED", "modules": []}
                )
                details.append(
                    {
                        "id": row["id"],
                        "status": "FAILED",
                        "error": "INVENTORY_ASSEMBLY_REJECTED",
                    }
                )
        return {
            "version": 1,
            "purpose": "LITERAL_CONTROL_NOT_MODEL_IMPROVEMENT",
            "inputBinding": "DECLARED_ACCEPTED_SNAPSHOT_NOT_HISTORIC_REQUEST_ATTESTATION",
            "providerCalls": 0,
            "humanReview": "PENDING",
            "sources": details,
            "arms": [
                {
                    "name": name,
                    "records": records,
                    "report": text_score.score(
                        data["gold"], records, data["safeTexts"]
                    ),
                }
                for name, records in (
                    ("saved-baseline", baseline),
                    ("literal-inventory-control", control),
                )
            ],
        }
    except (ValueError, KeyError, TypeError, AttributeError):
        raise ValueError(
            "Invalid development inventory comparison (details redacted)"
        ) from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.resolve().is_relative_to(ROOT):
        raise ValueError("Private report must be outside checkout")
    raw = args.input.read_bytes()
    report = compare(json.loads(raw))
    report["inputSha256"] = hashlib.sha256(raw).hexdigest()
    args.out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as handle:
        args.out.chmod(0o600)
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"sources": len(report["sources"]), "providerCalls": 0}))


if __name__ == "__main__":
    main()
