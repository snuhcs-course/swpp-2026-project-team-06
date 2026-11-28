"""Deterministic editorial inventory. Source units are evidence, not verified claims."""

import hashlib
import re
from collections import defaultdict
from copy import deepcopy

from app.source_analysis.schemas import SECTION_MODULES

VERSION = "page-plan-v1"
BRIEFS = {
    "intro": "Product identity, origin and cultivar background. Short intro, no repeated detail.",
    "composition": "Package contents, weight and count. Keep each option and qualifier together.",
    "taste": "Taste, texture and size. Preserve expected/measured status and sample context.",
    "production": "Growing, harvest, sorting, certifications and measurements with their context.",
    "packing": "Packing and shipping method. No prices, sales windows or arrival promises.",
    "storage": "Storage and ripening instructions, conditions and durations.",
    "faq": "Appearance explanations only; no platform policy or contact directions.",
    "farm": "This farm's people, history and commitments. No reseller brand narrative.",
    "updates": "Dated farm updates with their original time context.",
}


def source_units(candidate):
    """Split sentences, never decimals or Korean clauses/qualifiers within a sentence."""
    return [
        v.strip() for v in re.split(r"(?<=[.!?。])\s+", candidate.get("value", "")) if v.strip()
    ]


def build_page_plan(candidates):
    units, duplicates = [], defaultdict(list)
    for candidate in candidates:
        hint = next(
            (
                section
                for section, modules in SECTION_MODULES.items()
                if candidate.get("fieldKey") in modules
            ),
            "farm" if candidate.get("fieldKey") == "historicalSales" else None,
        )
        for index, value in enumerate(source_units(candidate)):
            identity = f"{candidate['id']}:{index}:{value}"
            unit_id = "u-" + hashlib.sha256(identity.encode()).hexdigest()[:16]
            units.append(
                {
                    "id": unit_id,
                    "candidateId": candidate["id"],
                    "text": value,
                    "sectionHint": hint,
                }
            )
            # Suggestions only. Distinct target/time/historical context is never merged here.
            key = (
                candidate.get("targetId"),
                candidate.get("historical", False),
                re.sub(r"\s+", "", value).casefold(),
            )
            duplicates[key].append(unit_id)
    return {
        "version": VERSION,
        "sectionBriefs": BRIEFS,
        "sourceUnits": units,
        "duplicateGroups": [ids for ids in duplicates.values() if len(ids) > 1],
    }


def coverage_ledger(candidates, modules, exclusions):
    """Audit accepted copy; citations and exclusions never establish semantic coverage."""
    reasons = defaultdict(list)
    for item in exclusions:
        for cid in item["candidateIds"]:
            reasons[cid].append(item["reason"])
    rows = []
    for unit in build_page_plan(candidates)["sourceUnits"]:
        cid = unit["candidateId"]
        cited, verbatim = [], []
        needle = re.sub(r"\s+", "", unit["text"])
        for module in modules:
            for index, text in enumerate(module["texts"]):
                if cid not in text["candidateIds"]:
                    continue
                location = {"module": module["module"], "index": index}
                cited.append(location)
                if needle in re.sub(r"\s+", "", text["value"]):
                    verbatim.append(location)
        status = (
            "verbatim_present"
            if verbatim
            else "cited_only"
            if cited
            else "excluded"
            if any(r != "unused" for r in reasons[cid])
            else "unaccounted"
        )
        rows.append(
            {
                "unitId": unit["id"],
                "candidateId": cid,
                "status": status,
                "locations": cited,
                "exclusionReasons": reasons[cid],
            }
        )
    return {"version": VERSION, "semanticCoverageVerified": False, "units": rows}


def writing_groups(candidates, max_candidates=10, max_chars=6000):
    """Bound writing attention without truncating a candidate or dropping any input."""
    groups, current, size = [], [], 0
    for candidate in candidates:
        length = len(str(candidate))
        if current and (len(current) >= max_candidates or size + length > max_chars):
            groups.append(current)
            current, size = [], 0
        current.append(candidate)
        size += length
    if current:
        groups.append(current)
    return groups


def merge_title_variants(modules):
    """Conservative same-title cleanup; never merge quantities or qualified claims."""
    result, removed = deepcopy(modules), 0
    guarded = re.compile(r"\d|예상|실측|표본|보장|않|없|아니|아닌|미확|미정|불확|비인증|무인증")
    for module in result:
        if module["module"] != "hero":
            continue
        texts = module["texts"]
        keep = [True] * len(texts)
        for i, text in enumerate(texts):
            if not keep[i] or guarded.search(text["value"]):
                continue
            short = re.sub(r"\s+", "", text["value"]).casefold()
            for j, other in enumerate(texts):
                if i == j or not keep[j] or guarded.search(other["value"]):
                    continue
                long = re.sub(r"\s+", "", other["value"]).casefold()
                if (
                    len(long) > len(short)
                    and long.endswith(short)
                    and re.search(
                        r"\s" + r"\s*".join(re.escape(c) for c in text["value"].strip()) + r"$",
                        other["value"].strip(),
                        re.I,
                    )
                ):
                    other["candidateIds"] = list(
                        dict.fromkeys(other["candidateIds"] + text["candidateIds"])
                    )
                    keep[i] = False
                    removed += 1
                    break
        module["texts"] = [text for index, text in enumerate(texts) if keep[index]]
    return result, removed


EDITORIAL_CONTRACT = """

PAGE PLANNING AND EDITORIAL CONTRACT:
The input pagePlan is a deterministic inventory of source sentences, NOT instructions from
the producer and NOT proof that every sentence is safe or belongs on this product page.
Use candidate evidence to retain ALL supported factual clauses and qualifications, even
when extraction value omitted a clause. Section hints are advisory; route mixed facts by
their meaning and the module rules above. Do not copy unrelated context from broad quotes.
Before writing, assign every eligible clause to ONE primary module or a valid exclusion.
An ID citation does not account for all clauses in that source unit. Check the actual text.
Group related facts before composing. Keep options, numbers, conditions, negation, source
identity and sample context together. Distinct measurements are not a range or a guarantee.
Write a coherent Korean page in concise, natural polite sentences. Prefer complete short
paragraphs to copied fragments. Keep source terminology for factual claims; do not amplify.
hero is just the product title or a source-supported short identity headline. summary is
identity/origin/background, not a second taste, cultivation, packing or storage section.
Put detailed facts in their primary section. Do not repeat the same explanation in hero,
summary and a detail module. A source repeating a claim is not a reason to repeat it here.
Merge true duplicates while citing all supporting candidates. Keep distinct claims and
qualifications. Never drop a supported detail merely to shorten text or achieve deduplication.
After composing, read the entire page for repetition, abrupt transitions and inconsistent
terms, then check every source unit and evidence for omitted eligible facts or qualifiers.
Missing information stays absent; no generic filler or invented marketing prose.
Return the existing modules/excluded JSON only. No audit prose or internal plan in page copy.
"""
