"""Offline source-bound human-label agreement. No provider, gold edits or accuracy claim."""

import argparse
import hashlib
import json
import os
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DIMENSIONS = ("preservation", "correctness", "placement")
LABELS = {
    "preservation": {"PASS", "FAIL", "UNKNOWN"},
    "correctness": {"PASS", "FAIL", "UNKNOWN"},
    "placement": {"PRIMARY", "PERMITTED", "MISPLACED", "NOT_PRESENT", "UNKNOWN"},
}
DIGESTS = {"sourceSha256", "outputSha256", "goldSha256"}
PAIR_KEYS = {
    "id",
    "sourceId",
    "sourceText",
    "output",
    "gold",
    "humanReviewState",
    *DIGESTS,
}
REVIEW_KEYS = {
    "pairId",
    "reviewerId",
    "reviewerKind",
    "reviewState",
    "adjudicationState",
    "labels",
    *DIGESTS,
}
PREDICTION_KEYS = {"pairId", "predictorId", "status", "labels", *DIGESTS}


def canonical_bytes(value):
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def digest(value):
    return hashlib.sha256(value).hexdigest()


def _fail():
    raise ValueError(
        "Invalid calibration input or destination (details redacted)"
    ) from None


def _shape(value, keys):
    if type(value) is not dict or set(value) != keys:
        _fail()


def _id(value, *, empty=False):
    if type(value) is not str or len(value) > 256 or not empty and not value.strip():
        _fail()


def _labels(value, *, partial=False):
    if type(value) is not dict or not value or set(value) - set(DIMENSIONS):
        _fail()
    if not partial and set(value) != set(DIMENSIONS):
        _fail()
    if any(
        type(label) is not str or label not in LABELS[d] for d, label in value.items()
    ):
        _fail()


def _bound(row, pairs, *, partial=False):
    if row["pairId"] not in pairs:
        _fail()
    pair = pairs[row["pairId"]]
    if any(row[key] != pair[key] for key in DIGESTS):
        _fail()
    _labels(row["labels"], partial=partial)


def _fraction(hit, total):
    return {"hit": hit, "total": total, "rate": hit / total if total else None}


def _positive(label):
    return label in {"PASS", "PRIMARY", "PERMITTED"}


def report(packet, reviews, predictions):
    """Compare declared HUMAN labels to optional saved predictions, never proposals.

    Pending/missing human labels are not truth. Agreement uses reviewed, known labels
    and evaluated non-abstaining predictions only; all other outcomes remain counted.
    Reviewer identity and adjudication are caller declarations, not authentication.
    """
    try:
        return _report(packet, reviews, predictions)
    except (ValueError, TypeError, KeyError, AttributeError, OverflowError):
        _fail()


def _report(packet, reviews, predictions):
    _shape(packet, {"schemaVersion", "split", "purpose", "humanReview", "pairs"})
    if (
        type(packet["schemaVersion"]) is not int
        or packet["schemaVersion"] != 1
        or packet["split"] != "development"
        or packet["purpose"] != "SOURCE_BOUND_CALIBRATION"
        or packet["humanReview"] != "PENDING"
        or type(packet["pairs"]) is not list
        or not 1 <= len(packet["pairs"]) <= 1000
        or type(reviews) is not list
        or type(predictions) is not list
    ):
        _fail()
    pairs = {}
    for pair in packet["pairs"]:
        _shape(pair, PAIR_KEYS)
        _id(pair["id"])
        _id(pair["sourceId"])
        if (
            pair["id"] in pairs
            or type(pair["sourceText"]) is not str
            or not pair["sourceText"].strip()
            or type(pair["output"]) is not dict
            or type(pair["gold"]) is not dict
            or pair["humanReviewState"] != "PENDING"
            or pair["output"].get("id") != pair["sourceId"]
            or pair["gold"].get("id") != pair["sourceId"]
        ):
            _fail()
        expected = {
            "sourceSha256": digest(pair["sourceText"].encode("utf-8")),
            "outputSha256": digest(canonical_bytes(pair["output"])),
            "goldSha256": digest(canonical_bytes(pair["gold"])),
        }
        if any(
            type(pair[key]) is not str
            or not re.fullmatch(r"[a-f0-9]{64}", pair[key])
            or pair[key] != expected[key]
            for key in DIGESTS
        ):
            _fail()
        pairs[pair["id"]] = pair
    human = {}
    for row in reviews:
        _shape(row, REVIEW_KEYS)
        _id(row["pairId"])
        _bound(row, pairs, partial=row["reviewState"] == "REVIEWED")
        if (
            row["pairId"] in human
            or row["reviewerKind"] != "HUMAN"
            or row["reviewState"] not in {"PENDING", "REVIEWED"}
            or row["adjudicationState"]
            not in {"PENDING", "NOT_REQUIRED", "ADJUDICATED"}
        ):
            _fail()
        _id(row["reviewerId"], empty=row["reviewState"] == "PENDING")
        if row["reviewState"] == "PENDING" and (
            any(v != "UNKNOWN" for v in row["labels"].values())
            or row["adjudicationState"] != "PENDING"
        ):
            _fail()
        human[row["pairId"]] = row
    predicted, systems = {}, set()
    for row in predictions:
        _shape(row, PREDICTION_KEYS)
        _id(row["pairId"])
        _id(row["predictorId"])
        _bound(row, pairs)
        key = (row["pairId"], row["predictorId"])
        if (
            key in predicted
            or row["status"] not in {"EVALUATED", "ABSTAINED", "FAILED", "NOT_RUN"}
            or row["status"] != "EVALUATED"
            and any(v != "UNKNOWN" for v in row["labels"].values())
        ):
            _fail()
        systems.add(row["predictorId"])
        predicted[key] = row
    reviewed = [r for r in human.values() if r["reviewState"] == "REVIEWED"]
    fully_reviewed = [r for r in reviewed if set(r["labels"]) == set(DIMENSIONS)]
    pending = len(pairs) - len(fully_reviewed)
    by_system = {}
    for system in sorted(systems):
        dimensions = {}
        for dimension in DIMENSIONS:
            counts = Counter()
            for pid in pairs:
                reference, prediction = human.get(pid), predicted.get((pid, system))
                ready = (
                    reference is not None
                    and reference["reviewState"] == "REVIEWED"
                    and dimension in reference["labels"]
                )
                known = ready and reference["labels"][dimension] != "UNKNOWN"
                counts["pendingHuman"] += int(not ready)
                counts["humanUnknown"] += int(ready and not known)
                if prediction is None:
                    counts["missingPredictions"] += 1
                    continue
                status = prediction["status"]
                if status == "FAILED":
                    counts["predictionFailures"] += 1
                    continue
                if status == "NOT_RUN":
                    counts["notRunPredictions"] += 1
                    continue
                if (
                    status == "ABSTAINED"
                    or prediction["labels"][dimension] == "UNKNOWN"
                ):
                    counts["predictionAbstentions"] += 1
                    continue
                if not known:
                    continue
                expected, actual = (
                    reference["labels"][dimension],
                    prediction["labels"][dimension],
                )
                counts["evaluated"] += 1
                counts["exactMatches"] += int(actual == expected)
                counts["decisionMatches"] += int(
                    _positive(actual) == _positive(expected)
                )
                counts["falseAccepts"] += int(
                    _positive(actual) and not _positive(expected)
                )
                counts["falseRejects"] += int(
                    not _positive(actual) and _positive(expected)
                )
            dimensions[dimension] = {
                **{
                    key: counts[key]
                    for key in (
                        "pendingHuman",
                        "humanUnknown",
                        "evaluated",
                        "missingPredictions",
                        "predictionFailures",
                        "notRunPredictions",
                        "predictionAbstentions",
                        "falseAccepts",
                        "falseRejects",
                    )
                },
                "exactAgreement": _fraction(
                    counts["exactMatches"], counts["evaluated"]
                ),
                "decisionAgreement": _fraction(
                    counts["decisionMatches"], counts["evaluated"]
                ),
            }
        by_system[system] = {"dimensions": dimensions}
    return {
        "schemaVersion": 1,
        "split": "development",
        "purpose": "AGREEMENT_DIAGNOSTIC_ONLY",
        "packetSha256": digest(canonical_bytes(packet)),
        "pairs": len(pairs),
        "humanReview": {
            "reviewedPairs": len(fully_reviewed),
            "partiallyReviewedPairs": len(reviewed) - len(fully_reviewed),
            "pendingPairs": pending,
            "missingReviewRows": len(pairs) - len(human),
            "reviewerCount": len({r["reviewerId"] for r in reviewed}),
            "adjudicatedPairs": sum(
                r["adjudicationState"] == "ADJUDICATED" for r in reviewed
            ),
            "pendingAdjudicationPairs": sum(
                r["adjudicationState"] == "PENDING" for r in reviewed
            ),
        },
        "predictionRows": len(predictions),
        "predictors": by_system,
        "status": "PENDING_HUMAN_REVIEW"
        if pending
        else "NO_PREDICTIONS"
        if not systems
        else "AGREEMENT_REPORTED_NOT_VALIDATED",
        "semanticCalibrationEstablished": False,
        "limitations": [
            "Human identity and adjudication states are caller declarations.",
            "Pending/unknown human labels never become reference truth.",
            "Agreement is not semantic accuracy, gold approval or release acceptance.",
        ],
    }


def _object(items):
    result = {}
    for key, value in items:
        if key in result:
            _fail()
        result[key] = value
    return result


def _read(path):
    if path.resolve().is_relative_to(ROOT) or path.stat().st_mode & 0o077:
        _fail()
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_object)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--reviews", type=Path)
    parser.add_argument("--predictions", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.out.resolve().is_relative_to(ROOT):
            _fail()
        result = report(
            _read(args.packet),
            _read(args.reviews) if args.reviews else [],
            _read(args.predictions) if args.predictions else [],
        )
        args.out.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(args.out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
    except (ValueError, OSError, TypeError, AttributeError):
        print("CALIBRATION_INVALID")
        return 2
    print(
        json.dumps(
            {"pairs": result["pairs"], "status": result["status"], "providerCalls": 0}
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
