"""Source-copy benchmark v3 scorer (DEV-452). Pure functions; no provider or database access.

Definition: docs/evaluation/source-preserving-integration/BENCHMARK-v3.md. Gold and material
stay private (outside git); this module only reads what the runner hands it.
"""

import re
from collections import Counter

from app.source_analysis.final_score import NUMBER_RE, number_token
from app.source_analysis.source_preserving import _CURATIVE, _EXCESSIVE_PROMOTION, _SALE_ENDED
from app.source_analysis.text_safety import has_health_claim, has_money

VERSION = "source-copy-benchmark-v3"
LABELS = ("page", "settings", "removed")
_WEIGHT = re.compile(r"^\d+(?:\.\d+)?\s*(?:kg|㎏|g)$", re.I)
_DATE = re.compile(r"^(?:\d{1,2}\s*월(?:\s*\d{1,2}\s*일)?|\d{1,2}\s*일)$")
_KG = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|㎏|g)\b", re.I)
_MONTH = re.compile(r"(\d{1,2})\s*월")
_PRICE_NOTE = re.compile(r"가격|판매\s*기록|행사|할인")
_SENTENCE = re.compile(r"(?<=[.!?。])\s+|\n+")


def norm(text):
    return re.sub(r"\s+", "", text or "")


def fact_label(fact, sentence=None):
    """Rule proposal for a gold fact; every non-`page` label is reviewed by the PM."""
    words = [w.strip() for w in fact["mustContain"] if w.strip()]
    if _SALE_ENDED.search(fact.get("statement", "")) or any(_SALE_ENDED.search(w) for w in words):
        return "removed"
    # PM 11/28: a past sale's price note goes once the producer has set current prices.
    if (
        sentence
        and sentence.get("module") == "historicalSales"
        and (has_money(sentence["text"]) or _PRICE_NOTE.search(sentence["text"]))
    ):
        return "removed"
    # PM 11/28: only what the owner sets on the setup page — box weights of option lines, delivery
    # dates. A harvest season in the growing story or a fruit-size spec stays page text.
    module = (sentence or {}).get("module")
    if words and module in {"composition", "pieceCount"}:
        if all(_WEIGHT.match(w) or has_money(w) for w in words):
            return "settings"
    if words and module == "delivery" and all(_DATE.match(w) for w in words):
        return "settings"
    return "page"


def setup_inputs(gold_source):
    """The setup an owner would enter for this material (see the definition, 'Gold v3')."""
    weights, months = set(), set()
    for sentence in gold_source["sentences"]:
        for fact in sentence["facts"]:
            text = " ".join(fact["mustContain"])
            if sentence["module"] in {"composition", "pieceCount", "specification"}:
                for value, unit in _KG.findall(text):
                    kg = float(value) / (1000 if unit.lower() == "g" else 1)
                    if kg >= 0.5:  # a box option, not a fruit weight
                        weights.add(kg)
            if sentence["module"] == "delivery":
                months.update(int(m) for m in _MONTH.findall(text) if 1 <= int(m) <= 12)
    weights = tuple(sorted(weights))
    return {
        "input_prices": True,
        "input_weights": weights,
        "input_labels": tuple(f"{w:g}kg" for w in weights),
        "input_months": tuple(sorted(months)),
    }


def forbidden_counted(item):
    """PM 11/28: ordinary advertising is fine; only outlandish or serious claims count.

    Health text counts when it claims to treat or prevent; boasting ('unsupported', 'other') when
    the product's own excessive-promotion check matches. Already-masked text never counts.
    """
    text = item.get("text", "")
    if item.get("counted") is False or "가림]" in text:
        return False
    kind = item.get("kind", "other")
    if kind == "health":
        return bool(has_health_claim(text) or _CURATIVE.search(text))
    if kind in {"unsupported", "other"}:
        return bool(_EXCESSIVE_PROMOTION.search(norm(text)))
    return True


def settings_text(setup):
    return " ".join(setup["input_labels"]) + " " + " ".join(f"{m}월" for m in setup["input_months"])


def page_texts(plan):
    return [t["value"] for m in plan.get("modules", []) for t in m["texts"]]


def owner_texts(plan):
    """Off-page text the owner sees and can put back: rule removals and lines shown next to the
    sale settings. Exact repeats are not listed (their first copy is on the page)."""
    return [
        p["originalValue"]
        for p in plan.get("passages", [])
        if p["status"] == "EXCLUDED"
        and not (p.get("decision") or {}).get("action") == "OMIT"
        and not p.get("duplicateOf")
    ]


def _present(fact, text):
    return all(norm(w) in text for w in fact["mustContain"])


def score_case(gold_source, plan, setup, *, source_text=None):
    """Scores of one source for one arm/trial. `source_text`: the read text (for traceability)."""
    page = norm(" ".join(page_texts(plan)))
    settings = norm(settings_text(setup))
    available = page + settings + norm(" ".join(owner_texts(plan)))
    pending = [p for p in plan.get("passages", []) if p.get("reviewPending")]
    pending_text = norm(" ".join(p["value"] for p in pending))
    keys = (
        "facts",
        "on_page",
        "available",
        "critical_facts",
        "critical_on_page",
        "critical_available",
        "removed_facts",
        "missed_removals",
        "wrong_removals",
        "forbidden_unasked",
    )
    out = Counter(dict.fromkeys(keys, 0))
    for sentence in gold_source["sentences"]:
        for fact in sentence["facts"]:
            label = fact.get("label") or fact_label(fact, sentence)
            crit = "critical_" if fact["critical"] else ""
            on_page = _present(fact, page) or (label == "settings" and _present(fact, settings))
            if label == "removed":
                out["removed_facts"] += 1
                if _present(fact, page) and not _present(fact, pending_text):
                    out["missed_removals"] += 1
                continue
            for prefix in ("", crit) if crit else ("",):
                out[f"{prefix}facts"] += 1
                out[f"{prefix}on_page"] += on_page
                out[f"{prefix}available"] += on_page or _present(fact, available)
            if label == "page" and not _present(fact, page) and _present(fact, available):
                out["wrong_removals"] += 1
    for item in gold_source.get("forbidden", []):
        if not forbidden_counted(item):
            continue
        text = norm(item.get("text", ""))
        if text and text in page and text not in pending_text:
            out[f"forbidden_{item.get('kind', 'other')}"] += 1
            out["forbidden_unasked"] += 1
    out["questions"] = len(pending)
    if source_text is not None:
        source = norm(source_text)
        sentences = [s for value in page_texts(plan) for s in _SENTENCE.split(value) if norm(s)]
        out["sentences"] = len(sentences)
        out["untraceable"] = sum(norm(s) not in source for s in sentences)
        found = {number_token(m.group()) for m in NUMBER_RE.finditer(" ".join(page_texts(plan)))}
        known = {number_token(m.group()) for m in NUMBER_RE.finditer(source_text)}
        out["unsupported_numbers"] = len({t for t in found - known if re.search(r"\d", t)})
    return dict(out)


def aggregate(cases):
    """Sum per-source scores into totals with rates (cases: list of (format, scores))."""
    total, by_format = Counter(), {}
    for fmt, scores in cases:
        total.update(scores)
        by_format.setdefault(fmt, Counter()).update(scores)

    def rates(c):
        r = dict(c)
        for view in ("on_page", "available"):
            if c["facts"]:
                r[f"{view}_rate"] = round(c[view] / c["facts"], 4)
            if c["critical_facts"]:
                r[f"critical_{view}_rate"] = round(c[f"critical_{view}"] / c["critical_facts"], 4)
        return r

    return {
        "version": VERSION,
        "total": rates(total),
        "byFormat": {k: rates(v) for k, v in by_format.items()},
    }
