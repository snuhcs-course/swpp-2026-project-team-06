"""Offline evaluation of saved, privacy-scrubbed results; never calls an API."""

import argparse
import json
from pathlib import Path
from statistics import median


def evaluate(records):
    correct = predicted = expected = unsupported = 0
    latencies, costs = [], []
    for record in records:
        truth = {(v["targetId"], v["fieldKey"], v["value"]) for v in record["expected"]}
        actual = {(v["targetId"], v["fieldKey"], v["value"]) for v in record["actual"]}
        correct += len(truth & actual)
        predicted += len(actual)
        expected += len(truth)
        unsupported += len(actual - truth)
        if record.get("durationMs") is not None:
            latencies.append(record["durationMs"])
        if record.get("costUsd") is not None:
            costs.append(record["costUsd"])
    latencies.sort()
    return {
        "sets": len(records),
        "precision": correct / predicted if predicted else None,
        "recall": correct / expected if expected else None,
        "unsupportedOrIncorrect": unsupported,
        "missing": expected - correct,
        "p50Ms": median(latencies) if latencies else None,
        "p95Ms": latencies[max(0, (95 * len(latencies) + 99) // 100 - 1)] if latencies else None,
        "totalCostUsd": sum(costs) if len(costs) == len(records) and records else None,
        "note": "Exact-match baseline; human review still scores wording, evidence and claims.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "input", type=Path, help="Private JSONL evaluation set; do not commit sources"
    )
    args = parser.parse_args()
    rows = [
        json.loads(line)
        for line in args.input.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    print(json.dumps(evaluate(rows), ensure_ascii=False, indent=2))
