"""Invented accepted-source boundaries: accounting never certifies semantics."""

import copy

import pytest

from app.source_analysis.source_inventory import build_inventory, validate_dispositions


def candidate(cid="c1", *, value="청정 지역 제주에서 생산한 감귤입니다.", quote=None,
              field="summary", target="target", revision=1, span="s1"):
    return {
        "id": cid, "targetId": target, "fieldKey": field, "value": value,
        "historical": False,
        "evidence": [{"sourceId": "source", "sourceRevision": revision, "page": 1,
                      "spanIds": [span], "quote": quote if quote is not None else value}],
    }


def inventory(rows=None, accepted=None):
    rows = [candidate()] if rows is None else rows
    return build_inventory(rows, accepted_candidate_ids=(
        [c["id"] for c in rows] if accepted is None else accepted
    ), target_id="target", source_revisions={"source": 1})


def disposition(unit, status="KEEP", reason=""):
    return {"unitId": unit["id"], "status": status,
            "module": unit["permittedModules"][0] if status == "KEEP" else None,
            "reason": reason}


def test_AC_SRC_2_3_10_descriptor_survives_exactly_before_any_writer():
    # Actual-style sentence, invented here; absence from old selector sets cannot delete it.
    c = candidate(value="청정 지역 제주에서 산지 직송되는 감귤 실속형 상품구성",
                  quote="청정 지역 제주에서 산지 직송되는\n감귤 실속형 상품구성")
    before = copy.deepcopy(c)
    inv = inventory([c])
    unit = inv["units"][0]
    assert unit["value"] == c["value"]
    assert unit["sourceRefs"][0]["quote"] == c["evidence"][0]["quote"]
    assert inv["candidates"] == [c] and c == before
    result = validate_dispositions(inv, [disposition(unit)], source_revisions={"source": 1})
    assert result["coverageComplete"]
    assert result["semanticPreservationEstablished"] is False
    assert "not atomic gold facts" in inv["limitations"]


def test_AC_SRC_2_exact_duplicate_units_preserve_every_candidate_and_reference():
    rows = [candidate("c1"), candidate("c2", span="repeat-ocr")]
    inv = inventory(rows)
    unit = inv["units"][0]
    assert len(inv["units"]) == 1
    assert unit["candidateIds"] == ["c1", "c2"]
    assert {r["spanIds"][0] for r in unit["sourceRefs"]} == {"s1", "repeat-ocr"}
    assert len(inv["candidates"]) == 2
    assert inv["accounting"]["exactDuplicateCandidates"] == 1
    assert unit["id"] == inventory([rows[0]])["units"][0]["id"]
    assert inventory(list(reversed(rows))) == inv


@pytest.mark.parametrize("changed", ["value", "quote", "target", "historical", "page"])
def test_AC_SRC_2_different_qualifier_product_time_context_never_merges(changed):
    a = candidate()
    b = candidate("c2", span="s2")
    if changed == "value":
        b["value"] += " 수확 상황에 따라 달라질 수 있습니다."
    elif changed == "quote":
        b["evidence"][0]["quote"] += " 지난해 수확분입니다."
    elif changed == "target":
        b["targetId"] = "another-product"
    elif changed == "historical":
        b["historical"] = True
    else:
        b["evidence"][0]["page"] = 2
    assert len(inventory([a, b])["units"]) == 2


def test_AC_SRC_2_whitespace_and_substrings_are_not_duplicate_normalization():
    a, b = candidate(), candidate("c2", value="제주에서 생산한 감귤입니다.", span="s2")
    c = candidate("c3", value=a["value"].replace(" ", ""), span="s3")
    assert len(inventory([a, b, c])["units"]) == 3


def test_AC_SRC_2_5_unaccepted_raw_candidates_are_never_rescued_or_serialized():
    good = candidate()
    rejected = {"id": "raw-rejected", "value": "미검증 원문 가격 9000원"}
    inv = inventory([good, rejected], accepted=["c1"])
    assert inv == inventory([good])
    assert "raw-rejected" not in str(inv)
    with pytest.raises(ValueError):
        inventory([good], accepted=["unknown-id"])


@pytest.mark.parametrize("target", [None, "other-product"])
def test_AC_SRC_2_3_unknown_or_other_target_requires_review(target):
    inv = inventory([candidate(target=target)])
    unit = inv["units"][0]
    assert unit["status"] == "NEEDS_REVIEW" and unit["targetId"] == target
    with pytest.raises(ValueError):
        validate_dispositions(inv, [disposition(unit)], source_revisions={"source": 1})
    assert validate_dispositions(
        inv, [disposition(unit, "REVIEW", "대상 근거 확인 필요")], source_revisions={"source": 1}
    )["accounting"] == {"REVIEW": 1}


def test_AC_SRC_2_conflicting_values_on_same_evidence_anchor_require_review():
    a = candidate(value="감귤 2kg")
    b = candidate("c2", value="감귤 3kg", quote="감귤 2kg")
    inv = inventory([a, b])
    assert len(inv["units"]) == 2
    assert all("CONFLICTING_SOURCE_SCOPE" in u["reviewReasons"] for u in inv["units"])


def test_AC_SRC_2_3_mixed_option_unit_stays_whole_without_guessing_associations():
    value = "2kg 10과 이내 / 5kg 20과 내외"
    inv = inventory([candidate(value=value, field="composition")])
    unit = inv["units"][0]
    assert unit["value"] == value
    assert "MULTIPLE_OPTION_SCOPES" in unit["reviewReasons"]
    with pytest.raises(ValueError):
        validate_dispositions(inv, [disposition(unit)], source_revisions={"source": 1})


@pytest.mark.parametrize("value", ["12과내", "12과 내외", "강제 후숙을 하지 않습니다."])
def test_AC_SRC_2_3_count_qualification_and_negation_preserved_without_paraphrase(value):
    inv = inventory([candidate(value=value)])
    assert inv["units"][0]["value"] == value
    assert inv["units"][0]["sourceRefs"][0]["quote"] == value


@pytest.mark.parametrize("value,quote", [
    ("가격 9000원", None),
    ("면역력에 좋아요", None),
    ("재배한 감귤입니다.", "면역력에 좋은 감귤을 재배합니다."),
    ("환불 불가", None),
])
def test_AC_SRC_3_5_unsafe_or_mixed_source_not_restored_by_clean_candidate(value, quote):
    inv = inventory([candidate(value=value, quote=quote)])
    unit = inv["units"][0]
    assert unit["status"] == "NEEDS_REVIEW"
    with pytest.raises(ValueError):
        validate_dispositions(inv, [disposition(unit)], source_revisions={"source": 1})
    result = validate_dispositions(
        inv, [disposition(unit, "EXCLUDE", "안전 정책에 따라 제외")],
        source_revisions={"source": 1},
    )
    assert result["accounting"] == {"EXCLUDE": 1}


def test_AC_SRC_2_5_stale_and_unknown_source_revisions_fail_closed():
    with pytest.raises(ValueError):
        inventory([candidate(revision=2)])
    inv = inventory()
    with pytest.raises(ValueError):
        validate_dispositions(inv, [disposition(inv["units"][0])],
                              source_revisions={"source": 2})
    with pytest.raises(ValueError):
        build_inventory([candidate()], accepted_candidate_ids=["c1"], target_id="target",
                        source_revisions={})


@pytest.mark.parametrize("change", ["omit", "duplicate", "unknown", "route", "no-reason"])
def test_AC_SRC_2_5_11_disposition_coverage_is_explicit_and_complete(change):
    inv = inventory()
    rows = [disposition(inv["units"][0])]
    if change == "omit":
        rows = []
    elif change == "duplicate":
        rows *= 2
    elif change == "unknown":
        rows[0]["unitId"] = "not-a-unit"
    elif change == "route":
        rows[0]["module"] = "storage"
    else:
        rows[0] = disposition(inv["units"][0], "REVIEW")
    with pytest.raises(ValueError):
        validate_dispositions(inv, rows, source_revisions={"source": 1})


def test_AC_SRC_2_5_tampered_unit_cannot_drop_descriptor_before_disposition():
    inv = inventory()
    inv["units"][0]["value"] = "제주에서 생산한 감귤입니다."
    with pytest.raises(ValueError):
        validate_dispositions(inv, [disposition(inv["units"][0])],
                              source_revisions={"source": 1})


def test_AC_SRC_2_empty_accepted_set_produces_empty_accounting_not_claim_recall():
    inv = inventory([candidate()], accepted=[])
    assert inv["units"] == [] and inv["candidates"] == []
    assert validate_dispositions(inv, [], source_revisions={"source": 1})[
        "semanticPreservationEstablished"
    ] is False
