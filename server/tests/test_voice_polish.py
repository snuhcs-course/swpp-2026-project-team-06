"""DEV-450 bounded wording-only polish and critic contracts; provider calls are stubbed."""

import json
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.ai import source_polish, source_refine
from app.ai.source_refine import RefineError, RefineResponse
from app.source_analysis import voice_polish

REVISIONS = {"source-a": 1}
TARGET = {"id": "target-a", "name": "가상 감귤"}


def candidate(candidate_id, value, *, field="summary", quote=None, span=None):
    return {
        "id": candidate_id,
        "targetId": TARGET["id"],
        "fieldKey": field,
        "value": value,
        "historical": False,
        "evidence": [
            {
                "sourceId": "source-a",
                "sourceRevision": 1,
                "page": 1,
                "spanIds": [span or f"span-{candidate_id}"],
                "quote": quote if quote is not None else value,
            }
        ],
    }


def excerpt(text="저희 농장에서는 감귤을 정성껏 골라 보내요."):
    return {
        "id": "voice-1",
        "text": text,
        "sourceRefs": [
            {
                "sourceId": "source-a",
                "sourceRevision": 1,
                "page": 2,
                "spanIds": ["voice-span"],
                "quote": text,
            }
        ],
        "styleRole": "producer_voice_only",
    }


def make_request(
    value="제주산 감귤 3kg 상자예요.", *, field="summary", rows=None, modules=None, excerpts=None
):
    candidates = rows if rows is not None else [candidate("c1", value, field=field)]
    baseline = (
        modules
        if modules is not None
        else [
            {
                "module": field,
                "texts": [
                    {
                        "id": "baseline-1",
                        "value": value,
                        "candidateIds": [c["id"] for c in candidates],
                    }
                ],
            }
        ]
    )
    return voice_polish.prepare(
        TARGET,
        candidates,
        baseline,
        excerpts if excerpts is not None else [excerpt()],
        REVISIONS,
    )


def output_for(request, values=None):
    values = values or {}
    return {
        "requestSha256": request["requestSha256"],
        "texts": [
            {"id": row["id"], "value": values.get(row["id"], row["value"])}
            for row in request["texts"]
        ],
    }


def rejects_reason(request, output, reason):
    with pytest.raises(voice_polish.PolishError) as caught:
        voice_polish.validate(request, output, source_revisions=REVISIONS)
    assert reason in voice_polish.REASONS
    assert caught.value.reason == reason
    assert "details redacted" in str(caught.value)
    return caught.value


def test_AC_SRC_10_prepare_and_validate_preserve_exact_baseline_structure_and_citations():
    value = "제주산 감귤 3kg 상자예요."
    rows = [candidate("c1", value)]
    baseline = [
        {
            "module": "summary",
            "texts": [{"id": "reviewed-identity", "value": value, "candidateIds": ["c1"]}],
        }
    ]
    rows_before, baseline_before = deepcopy(rows), deepcopy(baseline)
    request = voice_polish.prepare(TARGET, rows, baseline, [excerpt()], REVISIONS)
    result = voice_polish.validate(
        request,
        output_for(request, {request["texts"][0]["id"]: "제주산 감귤 3kg 상자입니다."}),
        source_revisions=REVISIONS,
    )
    assert rows == rows_before and baseline == baseline_before
    assert request["baselineModules"] == baseline
    assert request["texts"][0]["module"] == "summary"
    assert request["texts"][0]["candidateIds"] == ["c1"]
    assert result["modules"] == [
        {
            "module": "summary",
            "texts": [{"value": "제주산 감귤 3kg 상자입니다.", "candidateIds": ["c1"]}],
        }
    ]
    assert result["texts"][0]["id"] == request["texts"][0]["id"]
    assert result["texts"][0]["status"] == "ACCEPTED"
    assert result["status"] == "COMPLETE"
    assert result["requiresContentReview"] is True
    assert result["semanticPreservationEstablished"] is False


@pytest.mark.parametrize(
    ("before", "after"),
    [
        ("감귤 3kg 상자예요.", "감귤 4kg 상자예요."),
        ("감귤 3kg 상자예요.", "감귤 3000g 상자예요."),
        ("A상품은 3kg이고 B상품은 5kg이에요.", "A상품은 5kg이고 B상품은 3kg이에요."),
        ("감귤은 3~5kg이에요.", "감귤은 3~6kg이에요."),
        ("당도 12.4브릭스예요.", "당도 12.5브릭스예요."),
        ("감귤은 3~5kg이에요.", "감귤은 5~3kg이에요."),
    ],
)
def test_AC_SRC_10_numbers_units_ranges_and_endpoints_are_unchanged(before, after):
    request = make_request(before)
    result = voice_polish.validate(
        request, output_for(request, {request["texts"][0]["id"]: after}), source_revisions=REVISIONS
    )
    assert result["status"] == "INCOMPLETE"
    assert result["texts"][0]["status"] == "REJECTED"
    assert result["texts"][0]["reason"] == "NUMERIC_CHANGED"
    assert result["modules"] == []


def test_AC_SRC_10_nearest_option_value_association_cannot_swap():
    rows = [
        candidate("c1", "선물용 3kg 상자예요.", span="gift-option"),
        candidate("c2", "가정용 5kg 상자예요.", span="home-option"),
    ]
    baseline = [
        {
            "module": "composition",
            "texts": [
                {
                    "id": "options",
                    "value": "선물용 3kg이고 가정용 5kg입니다.",
                    "candidateIds": ["c1", "c2"],
                }
            ],
        }
    ]
    request = voice_polish.prepare(TARGET, rows, baseline, [excerpt()], REVISIONS)
    result = voice_polish.validate(
        request,
        output_for(request, {request["texts"][0]["id"]: "가정용 3kg이고 선물용 5kg입니다."}),
        source_revisions=REVISIONS,
    )
    assert result["texts"][0]["status"] == "REJECTED"
    assert result["texts"][0]["reason"] == "NUMERIC_CHANGED"


@pytest.mark.parametrize(
    ("before", "after", "reason"),
    [
        ("감귤에는 씨가 없어요.", "감귤에는 씨가 있어요.", "QUALIFIER_CHANGED"),
        ("간혹 껍질에 점이 생길 수 있어요.", "껍질에 점이 생겨요.", "QUALIFIER_CHANGED"),
        ("예상 평균 당도는 10브릭스예요.", "측정한 평균 당도는 10브릭스예요.", "QUALIFIER_CHANGED"),
        ("표본별 평균 당도는 10브릭스예요.", "평균 당도는 10브릭스예요.", "QUALIFIER_CHANGED"),
        ("작년 수확 감귤이에요.", "수확 감귤이에요.", "QUALIFIER_CHANGED"),
        (
            "감귤에는 씨가 없고 껍질에는 점이 있어요.",
            "감귤에는 씨가 있고 껍질에는 점이 없어요.",
            "POLARITY_CHANGED",
        ),
    ],
)
def test_AC_SRC_10_negation_hedge_measurement_sample_and_history_stay_attached(
    before, after, reason
):
    request = make_request(before)
    result = voice_polish.validate(
        request, output_for(request, {request["texts"][0]["id"]: after}), source_revisions=REVISIONS
    )
    assert result["texts"][0]["status"] == "REJECTED"
    assert result["texts"][0]["reason"] == reason


def test_AC_SRC_10_new_causal_relation_rejected_but_syntax_only_connective_allowed():
    before = "해풍이 부는 밭에서 감귤을 재배해요."
    request = make_request(before)
    result = voice_polish.validate(
        request,
        output_for(request, {request["texts"][0]["id"]: "해풍 덕분에 감귤을 재배해요."}),
        source_revisions=REVISIONS,
    )
    assert result["texts"][0]["status"] == "REJECTED"
    assert result["texts"][0]["reason"] == "NEW_CAUSAL_RELATION"

    rows = [
        candidate("c1", "제주산 감귤이에요.", span="origin"),
        candidate("c2", "3kg 상자예요.", span="weight"),
    ]
    baseline = [
        {
            "module": "summary",
            "texts": [{"value": "제주산 감귤이에요. 3kg 상자예요.", "candidateIds": ["c1", "c2"]}],
        }
    ]
    request = voice_polish.prepare(TARGET, rows, baseline, [excerpt()], REVISIONS)
    syntax_result = voice_polish.validate(
        request,
        output_for(request, {request["texts"][0]["id"]: "제주산 감귤이고 3kg 상자예요."}),
        source_revisions=REVISIONS,
    )
    assert syntax_result["texts"][0]["status"] == "ACCEPTED"
    assert syntax_result["modules"][0]["texts"][0]["candidateIds"] == ["c1", "c2"]


def test_AC_SRC_10_final_legacy_safety_filter_rejects_without_baseline_rescue():
    request = make_request("감귤 3kg 상자예요.")
    result = voice_polish.validate(
        request,
        output_for(request, {request["texts"][0]["id"]: "감귤 3kg 상자는 면역력에 좋아요."}),
        source_revisions=REVISIONS,
    )
    assert result["status"] == "INCOMPLETE"
    assert result["texts"][0]["status"] == "REJECTED"
    assert result["texts"][0]["reason"] == "FINAL_SAFETY_REJECTED"
    assert result["modules"] == []


def test_AC_SRC_10_output_identity_hash_source_revision_and_complete_coverage():
    request = make_request()
    with pytest.raises(voice_polish.PolishError) as stale:
        voice_polish.validate(request, output_for(request), source_revisions={"source-a": 2})
    assert stale.value.reason == "STALE_REQUEST"

    altered = deepcopy(request)
    altered["baselineModules"][0]["texts"][0]["value"] = "수정된 기준 문장"
    with pytest.raises(voice_polish.PolishError) as stale:
        voice_polish.validate(altered, output_for(request), source_revisions=REVISIONS)
    assert stale.value.reason == "STALE_REQUEST"

    wrong_hash = output_for(request)
    wrong_hash["requestSha256"] = "0" * 64
    rejects_reason(request, wrong_hash, "REQUEST_HASH_MISMATCH")
    foreign = output_for(request)
    foreign["texts"][0]["id"] = "foreign-id"
    rejects_reason(request, foreign, "UNKNOWN_TEXT_ID")
    missing = output_for(request)
    missing["texts"] = []
    rejects_reason(request, missing, "MISSING_TEXT_IDS")

    rows = [candidate("c1", "감귤 3kg 상자예요."), candidate("c2", "향은 상큼해요.", span="taste")]
    baseline = [
        {
            "module": "summary",
            "texts": [
                {"value": rows[0]["value"], "candidateIds": ["c1"]},
                {"value": rows[1]["value"], "candidateIds": ["c2"]},
            ],
        }
    ]
    request = voice_polish.prepare(TARGET, rows, baseline, [excerpt()], REVISIONS)
    duplicate = output_for(request)
    duplicate["texts"][1]["id"] = duplicate["texts"][0]["id"]
    rejects_reason(request, duplicate, "DUPLICATE_TEXT_ID")


def test_AC_SRC_10_critic_is_hash_bound_and_partial_unknown_fail_remain_explicit():
    rows = [candidate("c1", "감귤 3kg 상자예요."), candidate("c2", "향은 상큼해요.", span="taste")]
    baseline = [
        {
            "module": "summary",
            "texts": [
                {"id": "one", "value": rows[0]["value"], "candidateIds": ["c1"]},
                {"id": "two", "value": rows[1]["value"], "candidateIds": ["c2"]},
            ],
        }
    ]
    request = voice_polish.prepare(TARGET, rows, baseline, [excerpt()], REVISIONS)
    result = voice_polish.validate(request, output_for(request), source_revisions=REVISIONS)
    critic_request = voice_polish.prepare_critic(request, result)
    critic_output = {
        "requestSha256": critic_request["requestSha256"],
        "texts": [
            {
                "id": critic_request["after"][0]["id"],
                "factualPreservation": "UNKNOWN",
                "styleNotes": "증거 부족",
            },
            {
                "id": critic_request["after"][1]["id"],
                "factualPreservation": "FAIL",
                "styleNotes": "사람 검토 필요",
            },
        ],
    }
    review = voice_polish.validate_critic(critic_request, critic_output)
    assert review["status"] == "FAIL"
    assert [row["factualPreservation"] for row in review["rows"]] == ["UNKNOWN", "FAIL"]
    assert review["requiresContentReview"] is True
    assert review["calibrated"] is False
    assert review["semanticAcceptance"] is False

    tampered = deepcopy(critic_request)
    tampered["after"][0]["value"] += "!"
    body = {key: value for key, value in tampered.items() if key != "requestSha256"}
    tampered["requestSha256"] = voice_polish._hash(body)
    with pytest.raises(voice_polish.PolishError) as stale:
        voice_polish.critic_payload(tampered)
    assert stale.value.reason == "STALE_REQUEST"

    critic_output["requestSha256"] = "0" * 64
    with pytest.raises(voice_polish.PolishError) as invalid:
        voice_polish.validate_critic(critic_request, critic_output)
    assert invalid.value.reason == "REQUEST_HASH_MISMATCH"


def test_AC_SRC_10_limits_fail_explicitly_without_truncation():
    row = candidate("c1", "감귤이에요.")
    texts = [
        {"id": f"text-{i}", "value": f"감귤 안내 문장 {i}예요.", "candidateIds": ["c1"]}
        for i in range(voice_polish.MAX_TEXTS + 1)
    ]
    baseline = [{"module": "summary", "texts": texts}]
    with pytest.raises(voice_polish.PolishError) as limit:
        voice_polish.prepare(TARGET, [row], baseline, [excerpt()], REVISIONS)
    assert limit.value.reason == "INPUT_LIMIT"

    voice_phrase = "감귤을 골라 보내요. "
    repetitions = voice_polish.MAX_VOICE_CHARS // len(voice_phrase) + 1
    long_excerpt = excerpt("저희 농장에서는 " + voice_phrase * repetitions)
    with pytest.raises(voice_polish.PolishError) as limit:
        make_request(excerpts=[long_excerpt])
    assert limit.value.reason == "INPUT_LIMIT"


def test_AC_SRC_10_mock_path_is_immutable_and_v11_default_entry_stays_separate():
    request = make_request()
    before = deepcopy(request)
    result = source_polish.polish("mock", "fixture", request, source_revisions=REVISIONS)
    assert request == before
    assert result["status"] == "COMPLETE"
    assert result["usage"] == {"mock": True}
    assert source_refine.PROMPT_VERSION == "source-refine-v11-routing"
    critic_request = voice_polish.prepare_critic(request, result)
    critic = source_polish.critique("mock", "fixture", critic_request)
    assert critic["status"] == "UNKNOWN"
    assert critic["calibrated"] is False
    assert critic["semanticAcceptance"] is False


def test_AC_SRC_10_private_evidence_metadata_is_blocked_before_transport(monkeypatch):
    called = []
    monkeypatch.setattr(
        source_polish, "get_settings", lambda: SimpleNamespace(source_max_output_tokens=8000)
    )
    monkeypatch.setattr(source_polish, "_refine_transport", lambda *a, **k: called.append(True))
    row = candidate("c1", "제주산 감귤 3kg 상자예요.")
    row["evidence"][0]["privateSha256"] = "010-1234-5678"
    request = make_request(rows=[row])
    with pytest.raises(RefineError) as caught:
        source_polish.polish("openrouter", source_polish.MODEL, request, source_revisions=REVISIONS)
    assert caught.value.code == "PRIVATE_SOURCE"
    assert "010-1234-5678" not in str(caught.value)
    assert "010-1234-5678" not in repr(caught.value.details)
    assert called == []


def test_AC_SRC_10_writer_and_critic_failures_keep_safe_reason_usage_and_request_id(monkeypatch):
    monkeypatch.setattr(
        source_polish, "get_settings", lambda: SimpleNamespace(source_max_output_tokens=8000)
    )
    calls = []

    def transport(mode, model, *, payload, prompt, output_type, schema):
        calls.append(prompt)
        wire = json.loads(payload)
        invalid = {
            "requestSha256": "0" * 64,
            "texts": [
                {"id": t["id"], "value": t["value"]}
                if output_type is voice_polish.PolishOutput
                else {"id": t["id"], "factualPreservation": "PASS", "styleNotes": "fixture"}
                for t in wire["texts" if output_type is voice_polish.PolishOutput else "after"]
            ],
        }
        return RefineResponse(
            SimpleNamespace(model_dump=lambda: invalid),
            {"input_tokens": 19, "output_tokens": 3},
            f"response-{len(calls)}",
        )

    monkeypatch.setattr(source_polish, "_refine_transport", transport)
    request = make_request()
    with pytest.raises(RefineError) as writer_error:
        source_polish.polish("openrouter", source_polish.MODEL, request, source_revisions=REVISIONS)
    assert writer_error.value.code == "INVALID_MODEL_OUTPUT"
    assert writer_error.value.details == {"reason": "REQUEST_HASH_MISMATCH"}
    assert writer_error.value.usage == {"input_tokens": 19, "output_tokens": 3}
    assert writer_error.value.request_id == "response-1"

    original = voice_polish.validate(request, output_for(request), source_revisions=REVISIONS)
    critic_request = voice_polish.prepare_critic(request, original)
    with pytest.raises(RefineError) as critic_error:
        source_polish.critique("openrouter", source_polish.MODEL, critic_request)
    assert critic_error.value.code == "INVALID_MODEL_OUTPUT"
    assert critic_error.value.details == {"reason": "REQUEST_HASH_MISMATCH"}
    assert critic_error.value.usage == {"input_tokens": 19, "output_tokens": 3}
    assert critic_error.value.request_id == "response-2"
    assert calls == [source_polish.POLISH_PROMPT, source_polish.CRITIC_PROMPT]
