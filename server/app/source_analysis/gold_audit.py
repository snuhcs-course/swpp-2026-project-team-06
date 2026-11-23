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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gold", type=Path, nargs="+")
    args = parser.parse_args()
    sources = []
    for path in args.gold:
        data = json.loads(path.read_text())
        sources.extend(data if isinstance(data, list) else data["sources"])
    report = audit_gold(sources)
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
