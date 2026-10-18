"""AC-SRC-4: private omission diagnostics must inspect values, not broad citations."""

from app.source_analysis.coverage import audit_coverage
from app.source_analysis.schemas import Extraction


def case(texts, values):
    chunk = {
        "sourceId": "test-source",
        "sourceRevision": 1,
        "pages": [{"number": 1, "spans": [{"id": str(i), "text": t} for i, t in enumerate(texts)]}],
    }
    result = Extraction.model_validate(
        {
            "candidates": [
                {
                    "targetId": "product",
                    "fieldKey": "storage",
                    "value": value,
                    "historical": False,
                    "evidence": [
                        {
                            "sourceId": "test-source",
                            "sourceRevision": 1,
                            "page": 1,
                            "spanIds": [str(i) for i in indices],
                            "quote": "\n".join(texts[i] for i in indices),
                        }
                    ],
                }
                for value, indices in values
            ],
            "photoRequests": [],
        }
    )
    return result, chunk


def test_AC_SRC_4_broad_citation_does_not_hide_omitted_sentence():
    result, chunk = case(
        ["보관: 서늘하게 보관하세요. 개봉 후에는 냉장하세요."],
        [("서늘하게 보관하세요.", [0])],
    )
    omissions = audit_coverage(result, chunk)["potentialOmissions"]
    assert len(omissions) == 1
    assert omissions[0]["uncoveredFragments"] == ["개봉후에는냉장하세요."]


def test_AC_SRC_4_wrapped_list_and_separate_sentences_cover_original_spans():
    result, chunk = case(
        [
            "주 생산품목 : 토마토 6월,",
            "단호박 8월",
            "• 서늘하게 보관하세요. 개봉 후에는 냉장하세요.",
        ],
        [
            ("토마토 6월, 단호박 8월", [0, 1]),
            ("서늘하게 보관하세요.", [2]),
            ("개봉 후에는 냉장하세요.", [2]),
        ],
    )
    assert audit_coverage(result, chunk)["potentialOmissions"] == []


def test_AC_SRC_4_coverage_cannot_borrow_other_span_or_redacted_text():
    result, chunk = case(
        ["서늘하게 보관하세요.", "서늘하게 보관하세요.", "연락처 [가림]"],
        [("서늘하게 보관하세요.", [0])],
    )
    findings = audit_coverage(result, chunk)["potentialOmissions"]
    assert [f["spanId"] for f in findings] == ["1"]


def test_AC_SRC_4_missing_certification_is_flagged_without_fabricating_candidate():
    result, chunk = case(["GAP 인증", "서늘하게 보관하세요."], [("서늘하게 보관하세요.", [1])])
    before = result.model_dump()
    assert audit_coverage(result, chunk)["potentialOmissions"][0]["uncoveredFragments"] == [
        "GAP인증"
    ]
    assert result.model_dump() == before
