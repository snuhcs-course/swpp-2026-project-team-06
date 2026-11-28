"""Offline benchmark diagnostics. Flags are review leads, never automatic label edits."""

import argparse
import json
from collections import Counter
from pathlib import Path

from app.source_analysis import final_score as fs
from app.source_analysis import text_safety as safety


def audit_gold(sources):
    counts = Counter(sources=len(sources))
    duplicates, flagged = [], []
    for source in sources:
        seen = {}
        for sentence in source["sentences"]:
            counts["sentences"] += 1
            for fact in sentence["facts"]:
                counts["facts"] += 1
                counts["critical"] += bool(fact["critical"])
                key = tuple(sorted(fs.compact(t) for t in fact["mustContain"]))
                if key in seen and seen[key][0] != sentence["section"]:
                    duplicates.append(
                        {"source": source["id"], "factIds": [seen[key][1], fact["id"]]}
                    )
                seen[key] = (sentence["section"], fact["id"])
            flags = [
                name
                for name, check in (
                    ("exaggeration", safety.has_exaggeration),
                    ("health", safety.has_health_claim),
                    ("policy", safety.has_policy_text),
                    (
                        "lineup",
                        lambda t, s=source: safety.has_product_lineup(t, s.get("product", "")),
                    ),
                )
                if check(sentence["text"])
            ]
            if flags:
                flagged.append(
                    {
                        "source": source["id"],
                        "factIds": [f["id"] for f in sentence["facts"]],
                        "flags": flags,
                    }
                )
    return {
        "counts": dict(counts),
        "duplicateSelectorPairs": duplicates,
        "flaggedReferenceSentences": flagged,
        "verdict": "REQUIRES_HUMAN_ADJUDICATION",
    }


def review_worksheet(sources):
    """Private claim-by-claim review queue. No label is silently approved or rewritten."""
    return {
        "status": "UNREVIEWED",
        "claims": [
            {
                "sourceId": source["id"],
                "product": source.get("product"),
                "factId": fact["id"],
                "statement": fact.get("statement"),
                "referenceText": sentence["text"],
                "sourceLocation": sentence.get("where"),
                "section": sentence["section"],
                "module": sentence.get("module"),
                "mustContain": fact["mustContain"],
                "critical": fact["critical"],
                "decision": "UNREVIEWED",
                "originalSourceVerified": False,
                "reviewer": None,
                "rationale": None,
            }
            for source in sources
            for sentence in source["sentences"]
            for fact in sentence["facts"]
        ],
        "diagnostics": audit_gold(sources),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gold", type=Path, nargs="+")
    parser.add_argument("--private-review-out", type=Path)
    args = parser.parse_args()
    sources = []
    for path in args.gold:
        data = json.loads(path.read_text())
        sources.extend(data if isinstance(data, list) else data["sources"])
    report = audit_gold(sources)
    if args.private_review_out:
        from app.source_analysis.page_compare import private_output

        path = private_output(args.private_review_out)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.touch(mode=0o600, exist_ok=False)
        path.write_text(json.dumps(review_worksheet(sources), ensure_ascii=False, indent=2))
    # No source excerpts, names, forbidden PII or local paths on stdout.
    print(
        json.dumps(
            {
                "counts": report["counts"],
                "duplicateSelectorPairs": len(report["duplicateSelectorPairs"]),
                "flaggedReferenceSentences": len(report["flaggedReferenceSentences"]),
                "verdict": report["verdict"],
            }
        )
    )


if __name__ == "__main__":
    main()
