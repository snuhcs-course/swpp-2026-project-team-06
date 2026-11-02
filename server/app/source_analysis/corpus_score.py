"""DEV-172 frozen, hash-only gold scoring. Offline; no provider or database imports."""

import argparse
import hashlib
import json
import re
import unicodedata
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import get_args

from app.source_analysis.schemas import FieldKey

FORMATS = ("text", "image", "long_image", "pdf")
FORMAT_GROUPS = {"text": "text", "image": "image", "long_image": "image", "pdf": "pdf"}
PDF_ORIGINS = ("original", "crop", "image_to_pdf", "web_print")
STATUSES = {"EVALUATED", "PARTIAL", "FAILED", "EMPTY", "REJECTED", "NOT_RUN"}
CRITICAL_CATEGORIES = {"numeric", "date", "cultivar", "certification", "qualityEvidence"}
NORMALIZATION = "source-normalization-v1"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_bytes(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()


def normalize(value: str) -> str:
    """Conservative spelling/units only: never equate date ranges or drop qualifiers."""
    value = unicodedata.normalize("NFC", value)
    value = value.translate(str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'}))
    value = re.sub(r"\s+", " ", value).strip()
    # Numeric comma spacing may separate facts; never repair it into a grouped number.
    value = re.sub(r"\s*([.:;!?()|&])\s*", r"\1", value)

    def comma(match):
        before, after = value[: match.start()], value[match.end() :]
        return match[0] if before[-1:].isdigit() and after[:1].isdigit() else ","

    value = re.sub(r"\s*,\s*", comma, value)
    # Native Korean counts are converted only before these explicit counting units.
    for word, number in (("한", "1"), ("두", "2"), ("세", "3"), ("네", "4")):
        value = re.sub(rf"(?<![가-힣\w]){word}\s*(개|상자|박스)(?![가-힣])", rf"{number}\1", value)
    units = r"킬로그램|키로그램|킬로|키로|kg|그램|g|브릭스|°\s*bx|brix|cm|mm|개|상자|박스"

    def quantity(match):
        if re.search(r"\d\s*,\s+$", value[: match.start()]):
            return match[0]
        sign = match[1][0] if match[1][0] in "+-" else ""
        number = sign + format(Decimal(match[1].lstrip("+-")).normalize(), "f")
        unit = re.sub(r"\s", "", match[2].lower())
        if unit in {"킬로그램", "키로그램", "킬로", "키로", "kg"}:
            unit = "kg"
        elif unit in {"그램", "g"}:
            unit = "g"
        elif unit in {"브릭스", "°bx", "brix"}:
            unit = "brix"
        return number + unit

    return re.sub(rf"(?<![\d.,+])([+-]?\d+(?:\.\d+)?)\s*({units})", quantity, value, flags=re.I)


def value_hash(value: str, mode: str) -> str:
    return sha256((normalize(value) if mode == "normalized" else value).encode())


def _digest(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise ValueError("Expected a SHA-256 digest")


def validate_manifest(manifest):
    if manifest["version"] != "source-corpus-i3-v1" or manifest["normalization"] != NORMALIZATION:
        raise ValueError("Unsupported frozen protocol")
    cases = manifest["cases"]
    ids = [c["id"] for c in cases]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate manifest IDs")
    held = sorted(c["id"] for c in cases if c["split"] == "holdout")
    if held != sorted(manifest["holdout"]["ids"]):
        raise ValueError("Holdout IDs disagree")
    if manifest["holdout"]["status"] not in {"LOCKED", "BLOCKED"}:
        raise ValueError("Unknown holdout status")
    if manifest["holdout"]["status"] == "LOCKED" and not held:
        raise ValueError("Cannot lock an empty holdout")
    for case in cases:
        if case["format"] not in FORMATS or case["split"] not in {"development", "holdout"}:
            raise ValueError("Unknown format/split")
        if case["format"] == "pdf" and case.get("pdfOrigin") not in PDF_ORIGINS:
            raise ValueError("Missing or unknown PDF origin")
        if case["split"] == "holdout" and case["usedForPromptIteration"]:
            raise ValueError("Development contamination in holdout")
        _digest(case["safeInputSha256"])
        for gold in case["expected"]:
            if gold["fieldKey"] not in get_args(FieldKey):
                raise ValueError("Unknown gold field")
            for mode in ("exact", "normalized"):
                _digest(gold[mode + "Sha256"])
            if not gold["sourceSpanIds"] or not set(gold["sourceSpanIds"]) <= {
                s["id"] for s in case["sourceSpans"]
            }:
                raise ValueError("Missing labelled source span")


def _counts(tp=0, fp=0, fn=0):
    return {"tp": tp, "fp": fp, "fn": fn}


def _metrics(counts):
    tp, fp, fn = (counts[k] for k in ("tp", "fp", "fn"))
    return {
        **counts,
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
    }


def _add(bucket, counts):
    for key in ("tp", "fp", "fn"):
        bucket[key] += counts[key]


def _candidate(candidate, mode):
    if (
        candidate["fieldKey"] not in get_args(FieldKey)
        or not isinstance(candidate["value"], str)
        or not candidate["value"].strip()
        or (candidate["targetId"] is not None and not isinstance(candidate["targetId"], str))
    ):
        raise ValueError("Invalid prediction field/value/target")
    return candidate["targetId"], candidate["fieldKey"], value_hash(candidate["value"], mode)


def _evidence_metrics(supported, total):
    return {"supported": supported, "total": total, "rate": supported / total if total else None}


def audit(case, record, predictions):
    """Human reviews every candidate, including rejected output; omissions stay BLOCKED."""
    review = record.get("criticalAudit", {})
    if not isinstance(review, dict):
        raise ValueError("Invalid critical audit")
    blocked = review.get("complete") is not True or not review.get("reviewer")
    entries = review.get("candidates", [])
    if not isinstance(entries, list) or any(not isinstance(entry, dict) for entry in entries):
        raise ValueError("Invalid audit candidates")
    if len(entries) != len(predictions):
        blocked = True
    unsupported = 0
    accepted = len(record.get("actual", []))
    supported = 0
    unsupported_accepted = 0
    span_ids = {s["id"] for s in case["sourceSpans"]}
    for index, (candidate, entry) in enumerate(zip(predictions, entries, strict=False)):
        if entry.get("candidateSha256") != sha256(canonical_bytes(candidate)):
            blocked = True
            continue
        if "categories" not in entry:
            blocked = True
            continue
        categories = entry["categories"]
        if not isinstance(categories, list) or not set(categories) <= CRITICAL_CATEGORIES:
            raise ValueError("Invalid critical categories")
        # Audit attestation covers numbers/dates/cultivars/certifications in ALL fields.
        if candidate["fieldKey"] == "qualityEvidence" and "qualityEvidence" not in categories:
            blocked = True
        if categories or index < accepted:
            if entry.get("supported") is False:
                unsupported += bool(categories)
                unsupported_accepted += index < accepted
            elif (
                entry.get("supported") is not True
                or not entry.get("sourceSpanIds")
                or not set(entry["sourceSpanIds"]) <= span_ids
            ):
                blocked = True
            elif index < accepted:
                supported += 1
    return {
        "status": "FAIL" if unsupported else "BLOCKED" if blocked else "PASS",
        "unsupported": unsupported,
        "evidenceStatus": "FAIL" if unsupported_accepted else "BLOCKED" if blocked else "PASS",
        "evidenceSupport": _evidence_metrics(supported, accepted),
    }


def score(manifest, records, split="holdout"):
    validate_manifest(manifest)
    if split not in {"development", "holdout"}:
        raise ValueError("Choose one split; never pool development and holdout")
    cases = [c for c in manifest["cases"] if c["split"] == split and c["purpose"] == "extraction"]
    by_id = {c["id"]: c for c in cases}
    runs = {}
    for record in records:
        if record["id"] not in by_id or record["id"] in runs:
            raise ValueError("Unknown, out-of-split, contract-only or duplicate run ID")
        case = by_id[record["id"]]
        if record["safeInputSha256"] != case["safeInputSha256"]:
            raise ValueError("Safe input changed")
        if record["status"] not in STATUSES:
            raise ValueError("Unknown run status")
        runs[record["id"]] = record
    output = {
        "split": split,
        "cases": len(cases),
        "caseCounts": {
            "byFormat": {fmt: sum(c["format"] == fmt for c in cases) for fmt in FORMATS},
            "byFormatGroup": {
                group: sum(FORMAT_GROUPS[c["format"]] == group for c in cases)
                for group in sorted(set(FORMAT_GROUPS.values()))
            },
            "byPdfOrigin": {
                origin: sum(c.get("pdfOrigin") == origin for c in cases) for origin in PDF_ORIGINS
            },
        },
        "byStatus": dict.fromkeys(sorted(STATUSES), 0),
    }
    modes = {}
    audits = []
    group_audits = {group: [] for group in sorted(set(FORMAT_GROUPS.values()))}
    for mode in ("exact", "normalized"):
        total = _counts()
        fields = {field: _counts() for field in get_args(FieldKey)}
        formats = {fmt: _counts() for fmt in FORMATS}
        groups = {group: _counts() for group in sorted(set(FORMAT_GROUPS.values()))}
        pdf_origins = {origin: _counts() for origin in PDF_ORIGINS}
        cross = {fmt: {field: _counts() for field in fields} for fmt in FORMATS}
        for case in cases:
            run = runs.get(case["id"], {"status": "NOT_RUN", "actual": [], "rejected": []})
            actual, rejected = run["actual"], run.get("rejected", [])
            for candidate in actual + rejected:
                _candidate(candidate, mode)
            # Outputs from failed/not-run/empty runs cannot earn true positives.
            eligible = run["status"] in {"EVALUATED", "PARTIAL"}
            truth = Counter(
                (g["targetId"], g["fieldKey"], g[mode + "Sha256"]) for g in case["expected"]
            )
            predicted = Counter(_candidate(c, mode) for c in actual) if eligible else Counter()
            rejected_counts = Counter(
                _candidate(c, mode) for c in rejected + (actual if not eligible else [])
            )
            matches = truth & predicted
            for field in fields:
                tp = sum(n for k, n in matches.items() if k[1] == field)
                fp = sum(n for k, n in (predicted + rejected_counts).items() if k[1] == field) - tp
                fn = sum(n for k, n in truth.items() if k[1] == field) - tp
                counts = _counts(tp, fp, fn)
                for bucket in (
                    total,
                    fields[field],
                    formats[case["format"]],
                    groups[FORMAT_GROUPS[case["format"]]],
                    cross[case["format"]][field],
                ):
                    _add(bucket, counts)
                if case["format"] == "pdf":
                    _add(pdf_origins[case["pdfOrigin"]], counts)
            if mode == "exact":
                output["byStatus"][run["status"]] += 1
                reviewed = audit(case, run, actual + rejected)
                audits.append(reviewed)
                group_audits[FORMAT_GROUPS[case["format"]]].append(reviewed)
        modes[mode] = {
            "overall": _metrics(total),
            "byField": {k: _metrics(v) for k, v in fields.items()},
            "byFormat": {k: _metrics(v) for k, v in formats.items()},
            "byFormatGroup": {k: _metrics(v) for k, v in groups.items()},
            "byPdfOrigin": {k: _metrics(v) for k, v in pdf_origins.items()},
            "byFormatField": {
                fmt: {k: _metrics(v) for k, v in group.items()} for fmt, group in cross.items()
            },
        }
    critical = (
        "FAIL"
        if any(a["status"] == "FAIL" for a in audits)
        else "BLOCKED"
        if not audits or any(a["status"] == "BLOCKED" for a in audits)
        else "PASS"
    )
    unmapped = sum(
        s["safeInputMapping"] != "VERIFIED_WHITESPACE_ONLY" for c in cases for s in c["sourceSpans"]
    )
    blocked = (
        not cases
        or unmapped > 0
        or output["byStatus"]["NOT_RUN"] > 0
        or critical == "BLOCKED"
        or (split == "holdout" and manifest["holdout"]["status"] != "LOCKED")
    )
    failed = critical == "FAIL" or any(output["byStatus"][s] for s in ("FAILED", "REJECTED"))
    evidence_failed = any(a["evidenceStatus"] == "FAIL" for a in audits)
    undefined = {}
    if cases:
        for group in {FORMAT_GROUPS[c["format"]] for c in cases}:
            metrics = modes["exact"]["byFormatGroup"][group]
            for metric in ("precision", "recall"):
                if metrics[metric] is None:
                    undefined.setdefault(group, {})[metric] = "N/A: denominator is zero"
                else:
                    failed |= metrics[metric] < 0.95
    # Undefined metrics alone cannot establish a pass, nor invent a threshold failure.
    blocked |= bool(undefined) and not failed
    evidence = {
        key: _evidence_metrics(
            sum(a["evidenceSupport"]["supported"] for a in items),
            sum(a["evidenceSupport"]["total"] for a in items),
        )
        for key, items in {"overall": audits, **group_audits}.items()
    }
    return {
        **output,
        **modes,
        "criticalAudit": {"status": critical, "unsupported": sum(a["unsupported"] for a in audits)},
        "evidenceSupport": {
            "overall": evidence["overall"],
            "byFormatGroup": {group: evidence[group] for group in group_audits},
        },
        "undefinedMetrics": undefined,
        "appliedPageAudit": {
            "status": "BLOCKED",
            "reason": "Offline extraction runs contain no application, persisted-page or render "
            "evidence to establish whether unsupported critical facts reached an applied page.",
            "owner": "DEV-170 executor + human reviewer",
            "nextAction": "Trace accepted facts through explicit apply, saved page and rendered "
            "detail in an isolated build; record source support and any unsupported critical fact.",
        },
        "unmappedGoldSpans": unmapped,
        "status": "FAIL"
        if critical == "FAIL" or evidence_failed
        else "BLOCKED"
        if blocked
        else "FAIL"
        if failed
        else "PASS",
        "independentEvaluation": split == "holdout" and not blocked,
        "note": "Development PASS is a regression result only. Normalized is diagnostic. "
        "Status covers offline extraction only; applied-page safety remains BLOCKED. "
        "Missing runs and audits are BLOCKED; no model calls were made.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("runs", type=Path, help="Private JSON array; no source text is printed")
    parser.add_argument("--manifest-sha256", required=True, help="Digest frozen in protocol docs")
    parser.add_argument("--split", choices=("development", "holdout"), default="holdout")
    args = parser.parse_args()
    data = args.manifest.read_bytes()
    if sha256(data) != args.manifest_sha256:
        raise SystemExit("Manifest digest mismatch")
    try:
        report = score(json.loads(data), json.loads(args.runs.read_text()), args.split)
    except (ValueError, KeyError, TypeError) as exc:
        raise SystemExit("Invalid scoring input; no score produced") from exc
    print(json.dumps(report, ensure_ascii=False, indent=2))
    raise SystemExit({"PASS": 0, "FAIL": 1, "BLOCKED": 2}[report["status"]])


if __name__ == "__main__":
    main()
