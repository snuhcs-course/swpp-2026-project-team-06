"""Conservative option blocks from already validated, target-scoped source passages.

This helper returns only assembled groups. Callers retain every unconsumed passage,
union review flags from ``parts``, and preserve original evidence/decision bindings.
"""

import re
from collections import defaultdict

_ALLOWED_MODULES = {"composition", "pieceCount", "specification", "delivery"}
_SPAN = re.compile(r"^(.*?)(\d+)$")
_WEIGHT = re.compile(r"\d+(?:\.\d+)?\s*(?:kg|g|킬로그램|그램)(?![A-Za-z])", re.I)
_NUMBERED = re.compile(r"^(?:\d{1,3}[.)]?|[①-⑳])\s+(?=\S)")
_OPTION = re.compile(r"^(?:옵션|선택|구성)\s*(?:\d{1,3}|[A-Za-z])(?:\s|[.):：-]|$)")


def _explicit_heading(value):
    numbered = _NUMBERED.search(value)
    return bool(_OPTION.search(value) or (numbered and _WEIGHT.search(value, numbered.end())))


def _option_heading(value):
    if _explicit_heading(value):
        return True
    # A short named package ending in a weight may be an unnumbered option.
    # Evidence grouping still needs the same exact heading span and body proof.
    weight = next((match for match in _WEIGHT.finditer(value) if match.end() == len(value)), None)
    if not weight or len(value) > 60:
        return False
    label = value[: weight.start()].strip()
    return bool(
        re.search(r"[A-Za-z가-힣]", label)
        and not re.search(r"[.!?;。！？]", label)
        and not re.search(r"총|전체|합계|중량|무게", label)
    )


def _entry(passage):
    decision = passage.get("decision")
    if (
        passage.get("module") not in _ALLOWED_MODULES
        or passage.get("status") == "EXCLUDED"
        or passage.get("includedInDraft") is False
        or (decision and decision.get("action") != "KEEP")
        or (decision and decision.get("module") not in (None, "composition"))
        or passage.get("sourceExact") is False
    ):
        return None
    value = passage.get("value", "")
    if not value or value != passage.get("originalValue", value):
        return None
    refs = passage.get("evidence", [])
    if len(refs) != 1:
        return None
    ref = refs[0]
    spans = ref.get("spanIds", [])
    if not spans or len(set(spans)) != len(spans) or ref.get("quote") != value:
        return None
    heading, separator, body = value.partition("\n")
    if heading != heading.strip() or not _option_heading(heading):
        return None
    if separator and (
        not body.strip() or any(_explicit_heading(line) for line in body.splitlines())
    ):
        return None
    # The first span supplies the shared header. A body needs separate evidence.
    if len(spans) == 1 and separator or len(spans) > 1 and not separator:
        return None
    parsed = [_SPAN.fullmatch(sid) for sid in spans]
    if not all(parsed) or len({match[1] for match in parsed}) != 1:
        return None
    positions = [int(match[2]) for match in parsed]
    if any(right <= left for left, right in zip(positions, positions[1:], strict=False)):
        return None
    source = ref.get("sourceId")
    revision = ref.get("sourceRevision")
    if (
        source is None
        or revision is None
        or ref.get("page") is None
        or passage.get("sourceId", source) != source
        or passage.get("sourceRevision", revision) != revision
    ):
        return None
    key = (
        source,
        revision,
        passage.get("sanitizationVersion"),
        ref["page"],
        passage.get("targetId"),
        spans[0],
        heading,
    )
    return key, body if separator else None, positions[1:] if separator else [], spans[1:]


def assemble_options(passages):
    """Return proven shared-heading blocks without modifying input passages.

    An independent heading passage plus a body proves a block. Without a standalone
    heading, at least two rows must independently cite the identical first span and
    literal heading followed by disjoint, ordered body spans. Weight alone is never
    an option identity. Unknown source ordering and conflicting span use stay apart.
    """
    groups = defaultdict(list)
    for passage in passages:
        entry = _entry(passage)
        if entry:
            key, body, positions, body_spans = entry
            groups[key].append((passage, body, positions, body_spans))
    # One source span cannot establish two different literal option headings.
    # Conflicting OCR/evidence is kept as independent review material.
    heading_claims = defaultdict(set)
    for key in groups:
        heading_claims[key[:-1]].add(key[-1])
    result = []
    for key, entries in groups.items():
        if len(heading_claims[key[:-1]]) != 1:
            continue
        headings = [entry for entry in entries if entry[1] is None]
        bodies = [entry for entry in entries if entry[1] is not None]
        if not bodies or (not headings and len(bodies) < 2):
            continue
        all_spans = [sid for entry in bodies for sid in entry[3]]
        if len(all_spans) != len(set(all_spans)):
            continue
        bodies.sort(key=lambda entry: entry[2])
        # Interleaved multi-span rows cannot be put into a trustworthy linear order.
        if any(a[2][-1] >= b[2][0] for a, b in zip(bodies, bodies[1:], strict=False)):
            continue
        parts = [entry[0] for entry in headings + bodies]
        ids = [p["id"] for p in parts]
        assembly = {
            "type": "SOURCE_OPTION_BLOCK",
            "module": "composition",
            "passageIds": ids,
            "heading": key[-1],
            "headingSpanId": key[-2],
            "separator": "\n",
            "contextReviewRequired": False,
        }
        result.append(
            {
                "module": "composition",
                "text": {
                    "value": "\n".join([key[-1], *(entry[1] for entry in bodies)]),
                    "candidateIds": list(
                        dict.fromkeys(cid for p in parts for cid in p["candidateIds"])
                    ),
                    "passageIds": ids,
                    "assembly": assembly,
                },
                "parts": parts,
            }
        )
    return result
