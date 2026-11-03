"""Advisory omission diagnostics for private evaluations, not a correctness gate."""

import re
from difflib import SequenceMatcher


def _body(text):
    text = re.sub(r"^\s*[•·▪●]\s*", "", text)
    text = re.sub(
        r"^\s*(?:농장\s*소개|주\s*생산\s*품목|구성|보관(?:법|방법)?|배송|문의)\s*[:：]\s*",
        "",
        text,
    )
    return re.sub(r"\s+", "", text)


def audit_coverage(extraction, chunk):
    """Flag uncopied source fragments only against values citing their own spans.

    A long evidence quote is not proof that its whole content survived extraction.
    Matching is literal except for whitespace and leading labels/bullets. Decorative
    headings, paraphrases and repeated facts may be flagged: a person must review.
    This deliberately does not repair values, certify completeness, or make calls.
    """
    spans = {}
    for page in chunk["pages"]:
        for span in page["spans"]:
            text = span["text"]
            if "[가림]" not in text and text.strip():
                body = _body(text)
                spans[(page["number"], span["id"])] = {
                    "text": text,
                    "body": body,
                    "covered": [False] * len(body),
                }
    for candidate in extraction.candidates:
        cited = {
            (e.page, sid)
            for e in candidate.evidence
            if e.source_id == chunk["sourceId"] and e.source_revision == chunk["sourceRevision"]
            for sid in e.span_ids
        }
        # Keep pages separate: a continuation cannot borrow text from another page.
        for number in {key[0] for key in cited}:
            selected = [key for key in spans if key in cited and key[0] == number]
            offsets = []
            source = ""
            for key in selected:
                offsets.extend((key, i) for i in range(len(spans[key]["body"])))
                source += spans[key]["body"]
            value = re.sub(r"\s+", "", candidate.value)
            for block in SequenceMatcher(None, source, value, autojunk=False).get_matching_blocks():
                # Do not credit incidental isolated letters; short full values still count.
                if block.size < min(4, len(value)):
                    continue
                for position in range(block.a, block.a + block.size):
                    key, index = offsets[position]
                    spans[key]["covered"][index] = True
    findings = []
    for (page, sid), span in spans.items():
        missing = "".join(
            char if not covered else " "
            for char, covered in zip(span["body"], span["covered"], strict=True)
        )
        fragments = [part for part in missing.split() if any(c.isalnum() for c in part)]
        if fragments:
            findings.append(
                {"page": page, "spanId": sid, "text": span["text"], "uncoveredFragments": fragments}
            )
    return {
        "potentialOmissions": findings,
        "note": "Advisory literal span/value comparison, not fact recall or semantic accuracy. "
        "Headings, duplicates and paraphrases can be flagged; source review is required.",
    }
