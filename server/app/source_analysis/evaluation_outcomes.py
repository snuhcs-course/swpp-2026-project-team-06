"""Separate operational failure from unmatched content without changing saved scoring."""

import argparse
import html
import json
from collections import Counter
from pathlib import Path


def split_outcomes(jobs, facts, shared):
    by_id = {job["id"]: job for job in jobs}
    shared_by_id = {row["id"]: row for row in shared}
    if len(by_id) != len(jobs) or len({f["id"] for f in facts}) != len(facts):
        raise ValueError("DUPLICATE_EVALUATION_RECORD")
    counts = Counter(job["status"] for job in jobs)
    buckets = {
        "processingFailureAffectedFacts": [],
        "notRunAffectedFacts": [],
        "partialProcessingUnattributedMisses": [],
        "contentOrScoringMisses": [],
    }
    hits, total = 0, 0
    for fact in facts:
        if fact["requirement"] != "essential":
            continue
        total += 1
        job = by_id[fact["sourceId"]]
        if fact["status"] not in {
            "MISSING",
            "NOT_PROCESSED",
            "SELECTOR_MATCH",
            "PRESERVED",
            "AMBIGUOUS",
        }:
            raise ValueError("UNKNOWN_FACT_STATUS")
        missed = fact["status"] in {"MISSING", "NOT_PROCESSED"}
        if job["status"] in {"FAILED", "CANCELLED", "NOT_RUN"}:
            if not missed:
                raise ValueError("FAILED_ATTEMPT_HAS_MATCHED_FACT")
            key = (
                "notRunAffectedFacts"
                if job["status"] == "NOT_RUN"
                else "processingFailureAffectedFacts"
            )
            buckets[key].append(fact["id"])
            continue
        if not missed:
            hits += 1
            continue
        source = shared_by_id.get(job["id"], {})
        diagnostics = [source.get("diagnostics", {}), *job.get("extractionDiagnostics", [])]
        unread = source.get("status") == "PARTIAL" or any(
            d.get("pagesFailed") or d.get("chunksFailed") or d.get("pagesSkipped")
            for d in diagnostics
        )
        unread = unread or any(d.get("pagesSkipped") for d in source.get("parserMetadata", []))
        key = "partialProcessingUnattributedMisses" if unread else "contentOrScoringMisses"
        buckets[key].append(fact["id"])
    unavailable = len(buckets["processingFailureAffectedFacts"]) + len(
        buckets["notRunAffectedFacts"]
    )
    assert hits + sum(map(len, buckets.values())) == total
    return {
        "attemptStatuses": dict(counts),
        "sourceTrialAttempts": len(jobs),
        "failedAttempts": sum(counts[s] for s in ["FAILED", "CANCELLED"]),
        "notRunAttempts": counts["NOT_RUN"],
        "deliveredEssentialFacts": {
            "hit": hits,
            "total": total,
            "rate": hits / total if total else None,
        },
        "nonfailedAttemptEssentialCoverage": {
            "hit": hits,
            "total": total - unavailable,
            "rate": hits / (total - unavailable) if total > unavailable else None,
        },
        "bucketCounts": {k: len(v) for k, v in buckets.items()},
        "buckets": buckets,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    result = json.loads((args.run / "results.json").read_text())
    groups = {}
    for arm in ["legacy", "current"]:
        for trial in [1, 2]:
            facts = json.loads((args.run / f"score-{arm}_{trial}.json").read_text())["policy"][
                "byFact"
            ]
            jobs = [j for j in result["jobs"] if j["arm"] == arm and j["trial"] == trial]
            shared = [s for s in result["sharedOCR"] if s["trial"] == trial]
            groups[f"{arm}_{trial}"] = split_outcomes(jobs, facts, shared)
    args.out.mkdir(parents=True, exist_ok=False)
    document = {
        "version": "operational-content-split-v1",
        "sourceRun": str(args.run.resolve()),
        "scoresChanged": False,
        "semanticAccuracyAssessed": False,
        "groups": groups,
    }
    (args.out / "breakdown.json").write_text(json.dumps(document, ensure_ascii=False, indent=2))
    page = [
        '<!doctype html><meta charset="utf-8"><title>Processing reliability and content'
        " coverage</title><style>body{font:17px/1.6 system-ui;max-width:1400px;margin:3"
        "5px auto;padding:20px}td,th{padding:12px;border:1px solid #ccc}table{border-co"
        "llapse:collapse}small{display:block}</style><h1>Processing reliability and con"
        "tent coverage</h1><p>These are separate dimensions. A failed request is not an"
        " individual content-selection mistake. Original scores are unchanged. This is "
        "known-development-set evidence, not semantic accuracy.</p><table><tr><th>Pipel"
        "ine/trial</th><th>Technical failed attempts</th><th>Failure-affected essential"
        " facts</th><th>Unrun facts</th><th>Partial-reading misses: cause unresolved</t"
        "h><th>Content/scoring misses</th><th>End-to-end delivered facts</th><th>Covera"
        "ge on nonfailed attempts</th></tr>"
    ]
    for name, group in groups.items():
        b = group["bucketCounts"]

        def coverage(key, group=group):
            v = group[key]
            return f"{v['hit']}/{v['total']} ({v['rate']:.1%})" if v["rate"] is not None else "N/A"

        cells = [
            name,
            f"{group['failedAttempts']}/{group['sourceTrialAttempts']}",
            b["processingFailureAffectedFacts"],
            b["notRunAffectedFacts"],
            b["partialProcessingUnattributedMisses"],
            b["contentOrScoringMisses"],
            coverage("deliveredEssentialFacts"),
            coverage("nonfailedAttemptEssentialCoverage"),
        ]
        page.append(
            "<tr>" + "".join("<td>" + html.escape(str(c)) + "</td>" for c in cells) + "</tr>"
        )
    page.append(
        "</table><p>Conditional coverage excludes failed/unrun attempts only. "
        "Partial outputs stay included. Content/scoring misses require review; "
        "they are not automatically factual errors. EMPTY outputs are not "
        "infrastructure failures. Original results remain unchanged.</p>"
    )
    page.append('<p><a href="breakdown.json">Structured breakdown</a></p>')
    (args.out / "START-HERE.html").write_text("\n".join(page))
    print(
        json.dumps(
            {
                "report": str(args.out / "START-HERE.html"),
                "providerCalls": 0,
                "scoresChanged": False,
            }
        )
    )


if __name__ == "__main__":
    main()
