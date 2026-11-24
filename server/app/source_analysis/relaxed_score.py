"""DEV-447/448 opt-in source-level coverage diagnostics, never semantic approval."""

import re
from collections import Counter
from decimal import Decimal

from app.source_analysis import final_score as legacy
from app.source_analysis.corpus_score import canonical_bytes, sha256

VERSION = "dev448-relaxed-v1"
REQUIREMENTS = ("essential", "optional", "review")


def normalize(text):
    """Bounded spelling/unit equivalence; retain signs, limits and polarity."""
    value = legacy.normalize_final(text).casefold()
    value = re.sub(r"브릭\s+스", "brix", value)
    value = re.sub(r"(?<=\d)\s*[–—−-]\s*(?=\d)", "~", value)
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])",
        r"\1\3~\2\3",
        value,
    )
    value = re.sub(
        r"(?<![\d.])(\d+(?:\.\d+)?)\s*(kg|g)(?![a-z])",
        lambda m: f"{Decimal(m[1]) * (1000 if m[2] == 'kg' else 1):f}g",
        value,
    )
    value = re.sub(r"(?<=\d)\.0+(?=g)", "", value)
    return re.sub(r"\s+", "", value).strip(".。!?;:")


def _clauses(text):
    # Never combine disconnected clauses or adjacent modules to create a relation.
    return [
        s.strip()
        for s in re.split(
            r"\n+|[!?。;]+|(?<!\d)\.(?!\d)|(?<=\d)\.(?=\s|$)|이고\s+|이며\s+",
            text,
        )
        if s.strip()
    ]


def _contains(tokens, text):
    value = normalize(text)
    for token in tokens:
        token = normalize(token)
        before = r"(?<![\d.])" if token[:1].isdigit() else ""
        after = (
            r"(?![a-z])"
            if token[-1:].isascii() and token[-1:].isalpha()
            else r"(?![\d.])"
            if token[-1:].isdigit()
            else ""
        )
        if not token or not re.search(before + re.escape(token) + after, value):
            return False
    return True


def _linked(tokens, clause):
    # Explicit option labels partition a list even when its writer omits commas.
    # A selector for option A cannot borrow the quantity attached to option B.
    chunks = re.split(r"(?=(?:[a-zA-Z]|\d+)\s*(?:옵션|상품)|옵션\s*[a-zA-Z0-9])", clause)
    return any(_contains(tokens, chunk) for chunk in chunks if chunk.strip())


def _conflict(output, reference):
    """Only narrow same-proposition mutations; unknown relations stay unknown."""
    out, ref = normalize(output), normalize(reference)
    if out == ref:
        return False
    pattern = r"(?<![\d.])[+-]?\d+(?:\.\d+)?"
    if re.sub(pattern, "#", out) == re.sub(pattern, "#", ref):
        return True
    # Explicit same-property existence reversal, without dropping the subject.
    polarity = r"(씨|점|흠)(?:이|가|은|는)?(없|있)"
    om, rm = re.search(polarity, out), re.search(polarity, ref)
    if om and rm and om[1] == rm[1] and om[2] != rm[2]:
        return out[: om.start()] == ref[: rm.start()]
    # Bounded positive copula versus explicit negation of the same proposition.
    positive = r"(?:입니다|이에요|예요|이다)$"
    negative = r"(?:이|가)?(?:아닙니다|아니에요|아니다)$"
    for left, right in ((out, ref), (ref, out)):
        if re.search(negative, left) and re.search(positive, right):
            if re.sub(negative, "", left) == re.sub(positive, "", right):
                return True
    return False


def _dict(value):
    return value.model_dump(mode="json") if hasattr(value, "model_dump") else value


def _validate(gold, records, safe_texts, policy):
    if gold.get("schemaVersion") != 1 or gold.get("split") != "development":
        raise ValueError("Development legacy-shaped gold required")
    if (
        policy.get("schemaVersion") != 1
        or not policy.get("policyVersion")
        or policy.get("approval") != "USER_AUTHORIZED_POLICY"
    ):
        raise ValueError("Explicit versioned policy required")
    sources = gold["sources"]
    ids = [s["id"] for s in sources]
    if len(ids) != len(set(ids)) or set(policy["sources"]) != set(ids):
        raise ValueError("Source policy mapping must be exact")
    if set(safe_texts) != set(ids) or any(not isinstance(v, str) for v in safe_texts.values()):
        raise ValueError("Source text mapping must be exact")
    run_ids = [r["id"] for r in records]
    if len(run_ids) != len(set(run_ids)) or set(run_ids) - set(ids):
        raise ValueError("Duplicate or unknown run")
    formats = {s["id"]: s["format"] for s in sources}
    if any(r["format"] != formats[r["id"]] for r in records):
        raise ValueError("Run format does not match source")
    for source in sources:
        config = policy["sources"][source["id"]]
        if config.get("sourceSha256") != sha256(canonical_bytes(source)):
            raise ValueError("Stale source policy")
        facts = [f for s in source["sentences"] for f in s["facts"]]
        fact_ids = [f["id"] for f in facts]
        if len(fact_ids) != len(set(fact_ids)) or set(config["facts"]) != set(fact_ids):
            raise ValueError("Every original fact requires exactly one policy entry")
        for fact in facts:
            meta = config["facts"][fact["id"]]
            if (
                meta.get("requirement") not in REQUIREMENTS
                or not meta.get("reason")
                or not meta.get("sourceRef")
                or not fact.get("mustContain")
                or any(not normalize(t) for t in fact["mustContain"])
            ):
                raise ValueError("Invalid fact policy")
            aliases = meta.get("aliases", [])
            if not isinstance(aliases, list) or any(
                not isinstance(a, str) or not normalize(a) for a in aliases
            ):
                raise ValueError("Aliases must be explicit complete propositions")
        expected = {str(i) for i in range(len(source["forbidden"]))}
        if set(config["forbidden"]) != expected:
            raise ValueError("Every forbidden item requires explicit disposition")
        for item in config["forbidden"].values():
            if (
                item.get("disposition") not in ("enforce", "source_equivalent", "review")
                or not item.get("reason")
                or not item.get("sourceRef")
            ):
                raise ValueError("Invalid forbidden disposition")
    return {r["id"]: legacy.Run.model_validate(r) for r in records}


def _rate(hit, total):
    return {"hit": hit, "total": total, "rate": hit / total if total else None}


def _metrics(rows):
    total = len(rows)
    return {
        "facts": total,
        "selectorCoverage": _rate(sum(r["linkedSelectorHit"] for r in rows), total),
        "pageWideSelectorCoverage": _rate(sum(r["pageWideSelectorHit"] for r in rows), total),
        "boundedPreservation": _rate(sum(r["status"] == "PRESERVED" for r in rows), total),
        "statuses": dict(Counter(r["status"] for r in rows)),
    }


def score(gold, records, safe_texts, *, policy):
    """Evaluate saved outputs; all reports contain only IDs, hashes and counts.

    Selector coverage is lexical diagnostic evidence, not semantic correctness.
    Aliases are declared source-equivalent by policy authors, not verified here.
    """
    gold = _dict(gold)
    records = [_dict(r) for r in records]
    runs = _validate(gold, records, safe_texts, policy)
    rows, forbidden, safety, support = [], [], [], []
    for source in gold["sources"]:
        sid = source["id"]
        config = policy["sources"][sid]
        run = runs.get(sid)
        texts = [t for m in run.modules for t in m.texts] if run else []
        clauses = [c for t in texts for c in _clauses(t)]
        processed = run is not None and run.status in ("EVALUATED", "PARTIAL")
        references = []
        for sentence in source["sentences"]:
            for fact in sentence["facts"]:
                meta = config["facts"][fact["id"]]
                allowed = [sentence["text"], *meta.get("aliases", [])]
                references.extend(allowed)
                conflict = any(_conflict(c, a) for c in clauses for a in allowed)
                exact = any(
                    normalize(t) == normalize(a) for t in [*texts, *clauses] for a in allowed
                )
                linked = any(_linked(fact["mustContain"], c) for c in clauses)
                # Complete alias equivalence can cover selectors intentionally reworded.
                linked = processed and not conflict and (linked or exact)
                page = processed and _contains(fact["mustContain"], "\n".join(texts))
                status = (
                    "NOT_PROCESSED"
                    if not processed
                    else "CONFLICT"
                    if conflict
                    else "PRESERVED"
                    if exact
                    else "SELECTOR_MATCH"
                    if linked
                    else "AMBIGUOUS"
                    if page
                    else "MISSING"
                )
                rows.append(
                    {
                        "id": f"{sid}/{fact['id']}",
                        "sourceId": sid,
                        "factId": fact["id"],
                        "format": source["format"],
                        "requirement": meta["requirement"],
                        "critical": fact["critical"],
                        "status": status,
                        "linkedSelectorHit": bool(linked),
                        "pageWideSelectorHit": bool(page),
                    }
                )
        for index, item in enumerate(source["forbidden"]):
            disposition = config["forbidden"][str(index)]["disposition"]
            if disposition != "source_equivalent" and any(
                _contains([legacy.distinctive(item["text"])], t) for t in texts
            ):
                forbidden.append(
                    {
                        "sourceId": sid,
                        "index": index,
                        "kind": item["kind"],
                        "disposition": disposition,
                    }
                )
        for index, clause in enumerate(clauses):
            kinds = []
            for name, pattern in (
                ("price", legacy.MONEY_RE),
                ("phone", legacy.PHONE_RE),
                ("email", legacy.EMAIL_RE),
            ):
                if pattern.search(clause):
                    kinds.append(name)
            kinds.extend(k for k, v in legacy.forbidden_words(clause).items() if v)
            if kinds:
                safety.append({"sourceId": sid, "clauseIndex": index, "kinds": kinds})
            if not any(normalize(clause) == normalize(a) for a in references):
                support.append(
                    {
                        "sourceId": sid,
                        "clauseIndex": index,
                        "status": "CONFLICT"
                        if any(_conflict(clause, a) for a in references)
                        else "UNKNOWN",
                    }
                )
    by_requirement = {r: _metrics([f for f in rows if f["requirement"] == r]) for r in REQUIREMENTS}
    return {
        "version": VERSION,
        "scope": "BOUNDED_DIAGNOSTIC",
        "acceptance": "NOT_ASSESSED",
        "policyVersion": policy["policyVersion"],
        "policySha256": sha256(canonical_bytes(policy)),
        "goldSha256": sha256(canonical_bytes(gold)),
        "recordsSha256": sha256(canonical_bytes(records)),
        "safeTextsSha256": sha256(canonical_bytes(safe_texts)),
        "byFact": rows,
        "byRequirement": by_requirement,
        "byFormat": {
            fmt: {
                r: _metrics([f for f in rows if f["format"] == fmt and f["requirement"] == r])
                for r in REQUIREMENTS
            }
            for fmt in ("text", "image", "long_image", "pdf")
        },
        "forbiddenIssues": forbidden,
        "safetyIssues": safety,
        "supportIssues": support,
        "limitations": [
            "Selector matches do not prove semantic correctness",
            "Aliases are policy declarations, not human factual approval",
            "Unknown support and unrecognized contradictions require review",
        ],
    }
