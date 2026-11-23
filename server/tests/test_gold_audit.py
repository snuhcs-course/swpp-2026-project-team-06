from copy import deepcopy

from app.source_analysis.gold_audit import audit_gold


def test_AC_SRC_2_gold_audit_flags_without_rewriting_labels():
    fact = {"id": "a", "mustContain": ["해풍"], "critical": False}
    rows = [
        {
            "id": "s",
            "product": "귤",
            "sentences": [
                {"section": "intro", "text": "해풍", "facts": [fact]},
                {"section": "production", "text": "해풍", "facts": [{**fact, "id": "b"}]},
                {"section": "taste", "text": "최고의 귤", "facts": [{**fact, "id": "c"}]},
            ],
        }
    ]
    old = deepcopy(rows)
    result = audit_gold(rows)
    assert rows == old
    assert result["counts"]["facts"] == 3
    assert result["flaggedReferenceSentences"][0]["flags"] == ["exaggeration"]
    assert result["verdict"] == "REQUIRES_HUMAN_ADJUDICATION"
    assert result["duplicateSelectorPairs"]
