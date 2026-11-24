"""Fail-closed compiler for the private source-grounded writing experiment.

Deterministic guards are deliberately conservative, not a semantic accuracy metric.
No provider, database, filesystem, image or design changes occur in this module.
"""

import copy
import hashlib
import json
import re
import unicodedata
from decimal import Decimal

from app.source_analysis.preprocess import scrub
from app.source_analysis.text_safety import (
    has_exaggeration,
    has_health_claim,
    has_money,
    has_policy_text,
)

AUDIT_STATUS = "ASSISTANT_SOURCE_AUDIT_HUMAN_REVIEW_PENDING"
_LEDGER = {
    "version",
    "sourceId",
    "sourceSha256",
    "sourceRevision",
    "inputFixtureSha256",
    "auditStatus",
    "claims",
    "options",
    "legacyIssues",
}
_CLAIM = {
    "id",
    "canonicalId",
    "kind",
    "module",
    "value",
    "requiredTerms",
    "negativeTerms",
    "uncertain",
    "sourceRefs",
    "status",
    "reason",
}
_OPTION = {
    "id",
    "label",
    "weight",
    "count",
    "size",
    "packaging",
    "countKind",
    "claimIds",
    "sourceBlock",
    "sourceRefs",
}
_REF = {"candidateId", "sourceId", "sourceRevision", "page", "spanIds", "quote"}
_HASH = re.compile(r"[0-9a-f]{64}\Z")
_WEIGHT = re.compile(r"(?<![\d.])(\d+(?:\.\d+)?)\s*(?:kg|㎏|킬로그램)(?![a-z])", re.I)
_COUNT = re.compile(
    r"(?<!\d)(\d+(?:\s*[~～–—-]\s*\d+)?)\s*(?:과|개|알)"
    r"(?:\s*(?:이내|내외|전후|內|내))?"
)
_NUM = re.compile(
    r"(?<![\d.])\d+(?:[.,]\d+)*(?:\s*(?:kg|㎏|g|cm|mm|과|개|알|개월|월|일|년|시간|분|도|%|브릭스|brix))?"
    r"(?:\s*(?:[~～–—-]|에서|부터)\s*\d+(?:[.,]\d+)*\s*(?:kg|㎏|g|cm|mm|과|개|알|개월|월|일|년|시간|분|도|%|브릭스|brix)?)?"
    r"(?:\s*(?:이내|내외|전후|內|내|이상|이하|미만|초과|정도|약))?",
    re.I,
)
_STRONG = ("교배", "인증", "실측", "보장", "무농약")
_NEG = re.compile(r"NO\b|하지\s*않|하지\s*마|않|없|금지|금물|피하", re.I)
_POSSIBLE = re.compile(r"수\s*있|수도|보일\s*수|달라질\s*수")


def _fail(reason):
    raise ValueError("NEEDS_REVIEW: " + reason)


def _object(value, keys, name):
    if type(value) is not dict or set(value) != set(keys):
        _fail("invalid " + name)


def _text(value):
    return type(value) is str and bool(value.strip())


def _norm(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", value)).lower()


def _strings(value, nonempty=False):
    return (
        type(value) is list
        and (bool(value) or not nonempty)
        and all(_text(v) for v in value)
        and len(set(value)) == len(value)
    )


def _hash(value):
    return hashlib.sha256(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _safe(value):
    if (
        scrub(value) != value
        or has_money(value)
        or has_health_claim(value)
        or has_exaggeration(value)
        or has_policy_text(value)
    ):
        _fail("unsafe customer text")


def _refs(refs, ledger):
    if type(refs) is not list or not refs:
        _fail("missing source refs")
    for ref in refs:
        _object(ref, _REF, "source ref")
        if (
            not _text(ref["candidateId"])
            or ref["sourceId"] != ledger["sourceId"]
            or type(ref["sourceRevision"]) is not int
            or ref["sourceRevision"] != ledger["sourceRevision"]
            or type(ref["page"]) is not int
            or ref["page"] < 1
            or not _strings(ref["spanIds"], True)
            or not _text(ref["quote"])
        ):
            _fail("source scope or reference mismatch")


def _weight_values(value):
    return {Decimal(m[1]) for m in _WEIGHT.finditer(value)}


def _count_kind(value):
    compact = _norm(value)
    if re.search(r"이내|內|\d+(?:과|개|알)내(?!외)", compact):
        return "upperBound"
    if "내외" in compact or "전후" in compact:
        return "approximate"
    if re.search(r"\d\s*[~～–—-]\s*\d", value):
        return "range"
    return "unspecified"


def _option(option, ledger):
    _object(option, _OPTION, "option")
    if not all(_text(option[k]) for k in ("id", "label", "weight", "sourceBlock")):
        _fail("invalid option strings")
    if not _strings(option["claimIds"], True):
        _fail("invalid option claims")
    _refs(option["sourceRefs"], ledger)
    if set(option["claimIds"]) != {r["candidateId"] for r in option["sourceRefs"]}:
        _fail("option evidence IDs mismatch")
    block = option["sourceBlock"]
    # A row must be attributable to the supplied quote, never merely to another row's facts.
    quotes = "\n".join(r["quote"] for r in option["sourceRefs"])
    if not all(_norm(line) in _norm(quotes) for line in block.splitlines() if line.strip()):
        _fail("option block absent from its source quotes")
    weights = _weight_values(block)
    if len(weights) != 1 or _weight_values(option["weight"]) != weights:
        _fail("ambiguous option weight")
    if any(
        _weight_values(r["quote"]) and _weight_values(r["quote"]) != weights
        for r in option["sourceRefs"]
    ):
        _fail("option evidence belongs to another weight")
    if len(list(_WEIGHT.finditer(option["weight"]))) != 1:
        _fail("invalid option weight label")
    if _norm(option["label"]) not in _norm(block):
        _fail("option label not source bound")
    counts = {_norm(m[0]) for m in _COUNT.finditer(block)}
    if len(counts) > 1:
        _fail("ambiguous option count relation")
    for key in ("count", "size", "packaging"):
        attribute = option[key]
        if attribute is not None and (not _text(attribute) or _norm(attribute) not in _norm(block)):
            _fail("option attribute outside its own source block")
    # Preserve a complete labeled value, including both size-range endpoints and
    # packing qualifiers. A literal substring alone can silently narrow its meaning.
    for key, marker in (("size", r"(?:사이즈|크기)"), ("packaging", r"포\s*장")):
        labeled = re.findall(
            marker + r"\s*[:：]\s*([^\n]+?)(?=\s*(?:사이즈|크기|포\s*장|수\s*량)\s*[:：]|$)",
            block,
            flags=re.M,
        )
        if labeled and (
            option[key] is None or any(_norm(option[key]) != _norm(value) for value in labeled)
        ):
            _fail("incomplete labeled option attribute")
    for key, marker in (
        ("size", r"(?:사이즈|크기)\s*[:：]|(?:중소|중대|소|중|대)과"),
        ("packaging", r"포\s*장|완충재|벌크"),
    ):
        if option[key] is None and re.search(marker, block):
            _fail("missing source option attribute")
    if option["count"] is None:
        if counts or option["countKind"] != "unspecified":
            _fail("missing option count")
    elif (
        len(counts) != 1
        or _norm(option["count"]) not in counts
        or option["countKind"] != _count_kind(option["count"])
    ):
        _fail("option count qualifier mismatch")
    if option["countKind"] not in {"range", "upperBound", "approximate", "unspecified"}:
        _fail("invalid count kind")
    for key in ("label", "weight", "count", "size", "packaging"):
        if option[key] is not None:
            _safe(option[key])


def _inventory(ledger):
    """Validate the source ledger independently of a preview fixture."""
    _object(ledger, _LEDGER, "ledger")
    if (
        type(ledger["version"]) is not int
        or ledger["version"] != 1
        or type(ledger["sourceRevision"]) is not int
        or ledger["sourceRevision"] != 1
        or not _text(ledger["sourceId"])
        or ledger["auditStatus"] != AUDIT_STATUS
        or not all(
            type(ledger[k]) is str and _HASH.fullmatch(ledger[k])
            for k in ("sourceSha256", "inputFixtureSha256")
        )
        or type(ledger["claims"]) is not list
        or len(ledger["claims"]) > 60
        or type(ledger["options"]) is not list
        or type(ledger["legacyIssues"]) is not list
        or not all(type(v) is dict for v in ledger["legacyIssues"])
    ):
        _fail("invalid ledger metadata")
    identities, canonical, exclusions, evidence = set(), {}, [], {}
    for claim in ledger["claims"]:
        _object(claim, _CLAIM, "claim")
        if (
            not all(_text(claim[k]) for k in ("id", "canonicalId", "module", "value"))
            or claim["id"] in identities
            or claim["kind"] not in {"narrative", "caveat", "excluded"}
            or claim["status"] not in {"ELIGIBLE", "EXCLUDED", "NEEDS_REVIEW"}
            or not _strings(claim["requiredTerms"])
            or not _strings(claim["negativeTerms"])
            or type(claim["uncertain"]) is not bool
            or type(claim["reason"]) is not str
        ):
            _fail("invalid claim")
        identities.add(claim["id"])
        _refs(claim["sourceRefs"], ledger)
        if claim["status"] != "ELIGIBLE":
            exclusions.append(copy.deepcopy(claim))
            continue
        if claim["kind"] == "excluded" or claim["module"] in {"hero", "composition"}:
            _fail("ineligible narrative scope")
        _safe(claim["value"])
        for ref in claim["sourceRefs"]:
            if scrub(ref["quote"]) != ref["quote"]:
                _fail("private source quote")
        compact = _norm(claim["value"])
        if any(_norm(t) not in compact for t in claim["requiredTerms"] + claim["negativeTerms"]):
            _fail("claim guard absent from audited value")
        key = claim["canonicalId"]
        signature = {
            k: claim[k]
            for k in ("kind", "module", "value", "requiredTerms", "negativeTerms", "uncertain")
        }
        # Scope equality includes exact source/revision/page; duplicate OCR spans may differ.
        scopes = sorted(
            {(r["sourceId"], r["sourceRevision"], r["page"]) for r in claim["sourceRefs"]}
        )
        if key in canonical:
            if canonical[key][0] != signature or canonical[key][1] != scopes:
                _fail("conflicting canonical facts")
        else:
            canonical[key] = (signature, scopes, copy.deepcopy(claim))
            canonical[key][2]["id"] = key
        evidence.setdefault(key, [])
        for ref in claim["sourceRefs"]:
            if ref not in evidence[key]:
                evidence[key].append(copy.deepcopy(ref))
    option_ids = set()
    for option in ledger["options"]:
        _option(option, ledger)
        if option["id"] in option_ids:
            _fail("duplicate option")
        option_ids.add(option["id"])
    claims = []
    for key, (_, _, claim) in canonical.items():
        claim["sourceRefs"] = evidence[key]
        claims.append(claim)
    return {
        "claims": claims,
        "canonicalIds": list(canonical),
        "evidenceRefs": evidence,
        "options": copy.deepcopy(ledger["options"]),
        "exclusions": exclusions,
        "legacyIssues": copy.deepcopy(ledger["legacyIssues"]),
    }


def validate_ledger(ledger, fixture):
    inventory = _inventory(ledger)
    if type(fixture) is not dict or type(fixture.get("provenance")) is not dict:
        _fail("invalid fixture")
    provenance = fixture["provenance"]
    if (
        provenance.get("sourceId") != ledger["sourceId"]
        or provenance.get("sourceSha256") != ledger["sourceSha256"]
        or provenance.get("sourceRevision", 1) != ledger["sourceRevision"]
    ):
        _fail("fixture source mismatch")
    try:
        modules = fixture["content"]["modules"]
        design = fixture["design"]
        module_ids = [m["id"] for m in modules]
        planned = [mid for s in design["sections"] for mid in s["moduleIds"]]
        if (
            len(set(module_ids)) != len(module_ids)
            or len(set(planned)) != len(planned)
            or not set(planned).issubset(module_ids)
        ):
            _fail("invalid fixture module coverage")
        used = {c["module"] for c in inventory["claims"]}
        if inventory["options"]:
            used.add("composition")
        if not used.issubset(set(planned)):
            _fail("copy modules absent from existing design")
        for module in modules:
            if type(module["texts"]) is not list:
                _fail("invalid module texts")
    except (KeyError, TypeError) as exc:
        raise ValueError("NEEDS_REVIEW: invalid fixture content/design") from exc
    return inventory


def _numeric_facts(value):
    return {_norm(m[0]).replace("㎏", "kg") for m in _NUM.finditer(value)}


def _negative(value, term):
    # Each occurrence must be a negative clause; a negation elsewhere cannot rescue it.
    for sentence in re.split(r"[.!?。！？\n;]", value):
        if _norm(term) not in _norm(sentence):
            continue
        clauses = re.split(r"[,，]|(?:지만|그러나|하지만|반면)", sentence)
        for clause in clauses:
            compact = _norm(clause)
            start = compact.find(_norm(term))
            if start < 0:
                continue
            if not _NEG.search(clause):
                _fail("negative term reversed or disconnected")
            # A later denial can reverse an earlier negative ("하지 않는 것은
            # 아닙니다"). Treat compound negation as ambiguous rather than trying
            # to infer its polarity from the mere presence of an initial negator.
            if re.search(r"(?:않|없|금지|NO).*(?:않|없|아니|아닙)", compact, re.I):
                _fail("ambiguous or double negation")
            after = compact[start + len(_norm(term)) :]
            # Reject an affirmative action preceding a later negation, even in one sentence.
            if re.search(
                r"(?:하세요|하십시오|합니다|해요|한다|해도|하고|하며|해서|한후|한다음)", after
            ):
                _fail("positive action before negative clause")
            # All occurrences, not just the first, must be guarded.
            if compact.count(_norm(term)) > 1:
                _fail("ambiguous repeated negative action")


def validate_draft(ledger, draft):
    inventory = _inventory(ledger)
    _object(draft, {"paragraphs"}, "draft")
    paragraphs = draft["paragraphs"]
    if type(paragraphs) is not list or len(paragraphs) > 30:
        _fail("invalid paragraph count")
    claims = {c["id"]: c for c in inventory["claims"]}
    used, ids, values = set(), set(), set()
    for paragraph in paragraphs:
        _object(paragraph, {"id", "module", "value", "claimIds"}, "paragraph")
        if (
            not all(_text(paragraph[k]) for k in ("id", "module", "value"))
            or paragraph["id"] in ids
            or len(paragraph["value"]) > 1500
            or not _strings(paragraph["claimIds"], True)
        ):
            _fail("invalid paragraph")
        ids.add(paragraph["id"])
        value, cited_ids = paragraph["value"], paragraph["claimIds"]
        if not set(cited_ids).issubset(claims) or used.intersection(cited_ids):
            _fail("unknown or repeated canonical claim")
        cited = [claims[cid] for cid in cited_ids]
        if any(c["module"] != paragraph["module"] for c in cited):
            _fail("cross-module fact merge")
        used.update(cited_ids)
        _safe(value)
        if _norm(value) in values:
            _fail("repeated prose")
        values.add(_norm(value))
        for claim in cited:
            if any(_norm(term) not in _norm(value) for term in claim["requiredTerms"]):
                _fail("required source qualifier omitted")
            for term in claim["negativeTerms"]:
                if _norm(term) not in _norm(value):
                    _fail("negative action omitted")
                _negative(value, term)
            if claim["negativeTerms"]:
                for term in claim["requiredTerms"]:
                    _negative(value, term)
            if claim["uncertain"]:
                sentences = [s for s in re.split(r"[.!?。！？\n;]", value) if s.strip()]
                related = [
                    s
                    for s in sentences
                    if all(_norm(t) in _norm(s) for t in claim["requiredTerms"])
                ]
                if not related or not all(_POSSIBLE.search(s) for s in related):
                    _fail("uncertainty upgraded or disconnected")
        # Test each numeric expression as a relation, not a union of endpoints or units.
        supported = set().union(*(_numeric_facts(c["value"]) for c in cited))
        if not _numeric_facts(value).issubset(supported):
            _fail("unsupported numeric relation or qualification")
        source_values = "\n".join(c["value"] for c in cited)
        for predicate in _STRONG:
            if predicate in value and predicate not in source_values:
                _fail("unsupported strong predicate")
        if (
            _WEIGHT.search(value)
            or _COUNT.search(value)
            and any(
                _norm(o["count"] or "") and _norm(o["count"]) in _norm(value)
                for o in inventory["options"]
            )
        ):
            _fail("option facts repeated in prose")
    if used != set(claims):
        _fail("missing canonical claim")
    return copy.deepcopy(draft)


def _critic(critic, draft, inventory):
    _object(critic, {"paragraphs", "claims"}, "critic")
    paragraphs = {p["id"]: p for p in draft["paragraphs"]}
    if type(critic["paragraphs"]) is not list or type(critic["claims"]) is not list:
        _fail("invalid critic arrays")
    seen = set()
    for review in critic["paragraphs"]:
        _object(review, {"id", "verdict", "reason"}, "paragraph verdict")
        if (
            not _text(review["id"])
            or review["id"] not in paragraphs
            or review["id"] in seen
            or review["verdict"] != "SUPPORTED"
            or not _text(review["reason"])
        ):
            _fail("nonpositive or incomplete paragraph review")
        seen.add(review["id"])
    if seen != set(paragraphs):
        _fail("missing paragraph review")
    seen = set()
    claims = set(inventory["canonicalIds"])
    for review in critic["claims"]:
        _object(review, {"id", "verdict", "paragraphIds"}, "claim verdict")
        if (
            not _text(review["id"])
            or review["id"] not in claims
            or review["id"] in seen
            or review["verdict"] != "PRESERVED"
            or not _strings(review["paragraphIds"], True)
        ):
            _fail("nonpositive or incomplete claim review")
        expected = {p["id"] for p in paragraphs.values() if review["id"] in p["claimIds"]}
        if set(review["paragraphIds"]) != expected:
            _fail("critic claim mapping mismatch")
        seen.add(review["id"])
    if seen != claims:
        _fail("missing claim review")


def compile_copy(fixture, ledger, draft, critic):
    inventory = validate_ledger(ledger, fixture)
    draft = validate_draft(ledger, draft)
    _critic(critic, draft, inventory)
    result = copy.deepcopy(fixture)
    replacements = {c["module"] for c in inventory["claims"]}
    replacements.update(c["module"] for c in inventory["exclusions"])
    replacements.update(
        issue["module"] for issue in inventory["legacyIssues"] if type(issue.get("module")) is str
    )
    if inventory["options"]:
        replacements.update({"composition", "taste", "delivery"})
    replacements.discard("hero")
    modules = {m["id"]: m for m in result["content"]["modules"]}
    for mid in replacements:
        if mid in modules:
            modules[mid]["texts"] = []
    for paragraph in draft["paragraphs"]:
        modules[paragraph["module"]]["texts"].append(
            {
                "fieldKey": paragraph["module"],
                "value": paragraph["value"],
            }
        )
    for option in inventory["options"]:
        headline = option["label"]
        if _norm(option["weight"]) not in _norm(headline):
            headline += " · " + option["weight"]
        lines = [headline] + [option[k] for k in ("count", "size", "packaging") if option[k]]
        modules["composition"]["texts"].append(
            {"fieldKey": "composition", "value": "\n".join(lines)}
        )
    result["provenance"]["sourceCopy"] = {
        "version": 1,
        "promptVersion": "source-copy-v2",
        "criticPromptVersion": "source-copy-check-v1",
        "inputFixtureSha256": ledger["inputFixtureSha256"],
        "originalFixtureCanonicalSha256": _hash(fixture),
        "designSha256": _hash(fixture["design"]),
        "ledgerSha256": _hash(ledger),
        "draftSha256": _hash(draft),
        "canonicalFactCount": len(inventory["canonicalIds"]),
        "canonicalIds": inventory["canonicalIds"],
        "factAccounting": [
            {
                "id": cid,
                "paragraphIds": [p["id"] for p in draft["paragraphs"] if cid in p["claimIds"]],
                "sourceRefs": inventory["evidenceRefs"][cid],
            }
            for cid in inventory["canonicalIds"]
        ],
        "optionTupleProofs": inventory["options"],
        "sourceExclusions": inventory["exclusions"],
        "legacyMismatches": inventory["legacyIssues"],
        "criticSha256": _hash(critic),
        "criticStatus": "HUMAN_REVIEW_PENDING",
        "semanticValidity": "NOT_ESTABLISHED",
    }
    return result
