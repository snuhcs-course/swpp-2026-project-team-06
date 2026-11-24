"""Synthetic contract regressions for source-bound experimental page copy."""

import copy
import hashlib

import pytest

from app.ai import source_copy as ai_copy
from app.source_analysis import source_copy

SOURCE_ID = "synthetic-citrus-card"
SOURCE_SHA = "a" * 64
FIXTURE_BYTES = b"synthetic original fixture bytes"


def _ref(candidate_id, quote, *, source_id=SOURCE_ID, revision=1):
    return {
        "candidateId": candidate_id,
        "sourceId": source_id,
        "sourceRevision": revision,
        "page": 1,
        "spanIds": [f"span-{candidate_id}"],
        "quote": quote,
    }


def sample_fixture():
    return {
        "content": {
            "modules": [
                {
                    "id": "hero",
                    "texts": [{"fieldKey": "title", "value": "산지 감귤"}],
                    "photos": [],
                },
                {
                    "id": "composition",
                    "texts": [{"fieldKey": "body", "value": "기존 옵션 2kg 10과"}],
                    "photos": [],
                },
                {
                    "id": "pieceCount",
                    "texts": [{"fieldKey": "body", "value": "기존 과수 설명"}],
                    "photos": [],
                },
                {
                    "id": "taste",
                    "texts": [{"fieldKey": "body", "value": "기존 맛 설명"}],
                    "photos": [],
                },
                {
                    "id": "delivery",
                    "texts": [{"fieldKey": "body", "value": "기존 배송 설명"}],
                    "photos": [],
                },
            ],
            "hiddenSectionIds": [],
        },
        "design": {
            "sections": [
                {"id": "hero-section", "moduleIds": ["hero"]},
                {"id": "options-section", "moduleIds": ["composition", "pieceCount"]},
                {"id": "taste-section", "moduleIds": ["taste"]},
                {"id": "delivery-section", "moduleIds": ["delivery"]},
            ],
            "media": {"hero-photo": {"uri": "/synthetic/photo.png", "width": 24, "height": 16}},
        },
        "localAssets": [{"path": "/synthetic/photo.png", "sha256": "b" * 64}],
        "provenance": {"sourceId": SOURCE_ID, "sourceSha256": SOURCE_SHA},
    }


def sample_ledger(fixture=None):
    fixture = fixture or sample_fixture()
    claims = [
        {
            "id": "taste-acid",
            "canonicalId": "taste-acid",
            "kind": "narrative",
            "module": "taste",
            "value": "산미가 느껴집니다.",
            "requiredTerms": ["산미"],
            "negativeTerms": [],
            "uncertain": False,
            "sourceRefs": [_ref("claim-taste", "산미가 느껴집니다")],
            "status": "ELIGIBLE",
            "reason": "source-backed",
        },
        {
            "id": "wax-care",
            "canonicalId": "wax-care",
            "kind": "caveat",
            "module": "delivery",
            "value": "표면에 왁스를 바르지 않습니다.",
            "requiredTerms": ["왁스"],
            "negativeTerms": ["바르지 않습니다"],
            "uncertain": False,
            "sourceRefs": [_ref("claim-wax", "표면에 왁스를 바르지 않습니다")],
            "status": "ELIGIBLE",
            "reason": "source-backed",
        },
        {
            "id": "appearance",
            "canonicalId": "appearance",
            "kind": "narrative",
            "module": "taste",
            "value": "색은 수확 시기에 따라 달라질 수 있습니다.",
            "requiredTerms": ["색"],
            "negativeTerms": [],
            "uncertain": True,
            "sourceRefs": [_ref("claim-appearance", "색은 수확 시기에 따라 달라질 수 있습니다")],
            "status": "ELIGIBLE",
            "reason": "source-backed",
        },
    ]
    options = [
        {
            "id": "opt-small",
            "label": "소과",
            "weight": "2kg",
            "count": "10과 이내",
            "size": "소과",
            "packaging": "완충 포장",
            "countKind": "upperBound",
            "claimIds": ["opt-small-weight", "opt-small-count", "opt-small-size", "opt-small-pack"],
            "sourceBlock": "소과 2kg 10과 이내 소과 완충 포장",
            "sourceRefs": [
                _ref("opt-small-weight", "소과 2kg"),
                _ref("opt-small-count", "10과 이내"),
                _ref("opt-small-size", "소과"),
                _ref("opt-small-pack", "완충 포장"),
            ],
        },
        {
            "id": "opt-large",
            "label": "대과",
            "weight": "3kg",
            "count": "8과 내외",
            "size": "대과",
            "packaging": "종이 완충재",
            "countKind": "approximate",
            "claimIds": ["opt-large-weight", "opt-large-count", "opt-large-size", "opt-large-pack"],
            "sourceBlock": "대과 3kg 8과 내외 대과 종이 완충재",
            "sourceRefs": [
                _ref("opt-large-weight", "대과 3kg"),
                _ref("opt-large-count", "8과 내외"),
                _ref("opt-large-size", "대과"),
                _ref("opt-large-pack", "종이 완충재"),
            ],
        },
    ]
    return {
        "version": 1,
        "sourceId": SOURCE_ID,
        "sourceSha256": SOURCE_SHA,
        "sourceRevision": 1,
        "inputFixtureSha256": hashlib.sha256(FIXTURE_BYTES).hexdigest(),
        "auditStatus": "ASSISTANT_SOURCE_AUDIT_HUMAN_REVIEW_PENDING",
        "claims": claims,
        "options": options,
        "legacyIssues": [
            {
                "id": "old-count-wording",
                "kind": "wrong-qualifier",
                "detail": "approximation omitted",
            }
        ],
    }


def good_draft():
    return {
        "paragraphs": [
            {
                "id": "p-taste",
                "module": "taste",
                "value": "산미가 느껴집니다. 색은 수확 시기에 따라 달라질 수 있습니다.",
                "claimIds": ["taste-acid", "appearance"],
            },
            {
                "id": "p-care",
                "module": "delivery",
                "value": "표면에 왁스를 바르지 않습니다.",
                "claimIds": ["wax-care"],
            },
        ]
    }


def good_critic(draft=None):
    draft = draft or good_draft()
    return {
        "paragraphs": [
            {"id": p["id"], "verdict": "SUPPORTED", "reason": "Matches synthetic source"}
            for p in draft["paragraphs"]
        ],
        "claims": [
            {"id": cid, "verdict": "PRESERVED", "paragraphIds": [p["id"]]}
            for p in draft["paragraphs"]
            for cid in p["claimIds"]
        ],
    }


def test_AC_SRC_1_2_5_validate_ledger_binds_each_option_attribute_to_its_own_source_block():
    fixture, ledger = sample_fixture(), sample_ledger()
    inventory = source_copy.validate_ledger(ledger, fixture)
    assert {option["id"] for option in inventory["options"]} == {"opt-small", "opt-large"}

    swapped = copy.deepcopy(ledger)
    swapped["options"][0]["count"] = "8과 내외"
    with pytest.raises(ValueError):
        source_copy.validate_ledger(swapped, fixture)

    mismatched = copy.deepcopy(ledger)
    mismatched["options"][1]["sourceRefs"][0]["sourceId"] = "another-source"
    with pytest.raises(ValueError):
        source_copy.validate_ledger(mismatched, fixture)


def test_AC_SRC_5_option_size_cannot_drop_one_end_of_a_source_size_range():
    ledger = sample_ledger()
    option = ledger["options"][1]
    option["sourceBlock"] = "대과 3kg 8과 내외 사이즈: 중대과~중소과 종이 완충재"
    option["size"] = "중소과"
    size_ref = next(ref for ref in option["sourceRefs"] if ref["candidateId"] == "opt-large-size")
    size_ref["quote"] = "사이즈: 중대과~중소과"
    with pytest.raises(ValueError):
        source_copy.validate_ledger(ledger, sample_fixture())


@pytest.mark.parametrize(
    "field,value",
    [
        ("sourceRevision", 2),
        ("sourceId", "other-source"),
    ],
)
def test_AC_SRC_2_wrong_source_or_revision_references_fail_closed(field, value):
    ledger = sample_ledger()
    ledger["claims"][0]["sourceRefs"][0][field] = value
    with pytest.raises(ValueError):
        source_copy.validate_ledger(ledger, sample_fixture())


def test_AC_SRC_2_source_hash_mismatch_fails_closed():
    ledger = sample_ledger()
    ledger["sourceSha256"] = "c" * 64
    with pytest.raises(ValueError):
        source_copy.validate_ledger(ledger, sample_fixture())


def test_AC_SRC_7_rejects_duplicate_missing_and_wrong_module_claim_coverage():
    ledger = sample_ledger()
    draft = good_draft()
    duplicate = copy.deepcopy(draft)
    duplicate["paragraphs"][0]["claimIds"].append("taste-acid")
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, duplicate)
    missing = copy.deepcopy(draft)
    missing["paragraphs"][0]["claimIds"].remove("appearance")
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, missing)
    wrong_module = copy.deepcopy(draft)
    wrong_module["paragraphs"][0]["module"] = "delivery"
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, wrong_module)


def test_AC_SRC_7_negative_claim_requires_local_negation_not_later_unrelated_negation():
    ledger = sample_ledger()
    draft = good_draft()
    draft["paragraphs"][1]["value"] = "표면에 왁스를 바릅니다. 배송은 지연되지 않습니다."
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, draft)


def test_AC_SRC_7_double_negation_cannot_reverse_the_source_negative_claim():
    ledger = sample_ledger()
    draft = good_draft()
    draft["paragraphs"][1]["value"] = "표면에 왁스를 바르지 않는 것은 아닙니다."
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, draft)


def test_AC_SRC_7_uncertain_claim_cannot_be_strengthened_to_a_certain_statement():
    ledger = sample_ledger()
    draft = good_draft()
    draft["paragraphs"][0]["value"] = "산미가 느껴집니다. 색은 수확 시기에 따라 달라집니다."
    with pytest.raises(ValueError):
        source_copy.validate_draft(ledger, draft)


@pytest.mark.parametrize(
    "value",
    [
        "산미가 느껴집니다. 색은 수확 시기에 따라 달라질 수 있습니다. 당도 20브릭스입니다.",
        "산미가 느껴집니다. 색은 수확 시기에 따라 달라질 수 있습니다. 무농약 재배입니다.",
    ],
)
def test_AC_SRC_7_rejects_unsupported_numeric_and_strong_product_claims(value):
    draft = good_draft()
    draft["paragraphs"][0]["value"] = value
    with pytest.raises(ValueError):
        source_copy.validate_draft(sample_ledger(), draft)


@pytest.mark.parametrize(
    "critic",
    [
        {},
        {"paragraphs": [], "claims": []},
        {"paragraphs": [{"id": "p-taste", "verdict": "SUPPORTED", "reason": "ok"}], "claims": []},
    ],
)
def test_AC_SRC_9_malformed_unknown_or_incomplete_critic_is_not_accepted(critic):
    fixture, ledger, draft = sample_fixture(), sample_ledger(), good_draft()
    with pytest.raises(ValueError):
        source_copy.compile_copy(fixture, ledger, draft, critic)


def test_AC_SRC_9_critic_cannot_report_a_claim_as_preserved_in_an_unmapped_paragraph():
    fixture, ledger, draft = sample_fixture(), sample_ledger(), good_draft()
    critic = good_critic(draft)
    critic["claims"][0]["paragraphIds"] = ["not-a-draft-paragraph"]
    with pytest.raises(ValueError):
        source_copy.compile_copy(fixture, ledger, draft, critic)


@pytest.mark.parametrize(("target", "verdict"), [("paragraphs", "UNKNOWN"), ("claims", "CHANGED")])
def test_AC_SRC_9_unknown_or_changed_critic_verdict_abstains(target, verdict):
    fixture, ledger, draft = sample_fixture(), sample_ledger(), good_draft()
    critic = good_critic(draft)
    critic[target][0]["verdict"] = verdict
    with pytest.raises(ValueError):
        source_copy.compile_copy(fixture, ledger, draft, critic)


def test_AC_SRC_11_compile_preserves_design_media_photos_and_input_objects():
    fixture, ledger, draft = sample_fixture(), sample_ledger(), good_draft()
    before = copy.deepcopy(fixture)
    design_before = copy.deepcopy(fixture["design"])
    assets_before = copy.deepcopy(fixture["localAssets"])
    result = source_copy.compile_copy(fixture, ledger, draft, good_critic(draft))

    assert fixture == before
    assert result["design"] == design_before
    assert result["localAssets"] == assets_before
    assert result["content"]["modules"] != fixture["content"]["modules"]
    assert result["provenance"]["sourceCopy"]["criticStatus"] == "HUMAN_REVIEW_PENDING"


def test_AC_SRC_11_deterministic_option_cards_keep_qualifier_and_scoped_size_and_packaging():
    result = source_copy.compile_copy(
        sample_fixture(), sample_ledger(), good_draft(), good_critic()
    )
    modules = {module["id"]: module for module in result["content"]["modules"]}
    text = " ".join(item["value"] for module in modules.values() for item in module["texts"])
    assert "소과" in text and "2kg" in text and "10과 이내" in text and "완충 포장" in text
    assert "대과" in text and "3kg" in text and "8과 내외" in text and "종이 완충재" in text
    assert "10과 내외" not in text


def test_AC_SRC_11_mocked_provider_adapter_never_constructs_a_paid_client(monkeypatch):
    class ProviderWasCalled(Exception):
        pass

    def mocked_call(*args, **kwargs):
        raise ProviderWasCalled

    monkeypatch.setattr(ai_copy, "_call", mocked_call)
    assert ai_copy.writer_payload(sample_ledger())
    assert ai_copy.critic_payload(sample_ledger(), good_draft())
    with pytest.raises(ProviderWasCalled):
        ai_copy.edit(sample_ledger())
    with pytest.raises(ProviderWasCalled):
        ai_copy.check(sample_ledger(), good_draft())
