"""DEV-450 per-edit human decisions and baseline composition; no provider calls."""

import importlib.util
from copy import deepcopy
from pathlib import Path

import pytest

from app.source_analysis import voice_polish

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "edit_review", ROOT / "docs/evaluation/i5-text-scoring/edit_review.py"
)
edit_review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(edit_review)

REVISIONS = {"source-a": 1}
TARGET = {"id": "target-a", "name": "가상 감귤"}


def candidate(candidate_id, value, *, span=None, field="summary", quote=None):
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


def make_request(values=None, *, module="summary", rows=None):
    values = values if values is not None else ["제주산 감귤 3kg 상자예요."]
    if isinstance(values, str):
        values = [values]
    rows = (
        rows
        if rows is not None
        else [candidate(f"c{i}", value, field=module) for i, value in enumerate(values, 1)]
    )
    baseline = [
        {
            "module": module,
            "texts": [
                {"id": f"baseline-{i}", "value": value, "candidateIds": [row["id"]]}
                for i, (value, row) in enumerate(zip(values, rows, strict=True), 1)
            ],
        }
    ]
    return voice_polish.prepare(TARGET, rows, baseline, [], REVISIONS)


def polish_result(request, proposals=None):
    proposals = proposals or {}
    output = {
        "requestSha256": request["requestSha256"],
        "texts": [
            {"id": row["id"], "value": proposals.get(row["id"], row["value"])}
            for row in request["texts"]
        ],
    }
    return voice_polish.validate(request, output, source_revisions=REVISIONS)


def human_review(
    request, result, text_id, *, decision="APPROVE", semantic=None, reviewer_kind="HUMAN"
):
    row = {
        **edit_review.binding(request, text_id, result),
        "reviewerKind": reviewer_kind,
        "reviewerId": "reviewer-1",
        "decision": decision,
    }
    if semantic is not None:
        row["semanticAssessment"] = semantic
    return row


def test_AC_SRC_10_partial_review_composes_only_explicitly_approved_text():
    request = make_request(["농장은 감귤을 재배해요.", "향은 상큼해요."])
    result = polish_result(
        request,
        {
            request["texts"][0]["id"]: "농장에서는 감귤을 재배해요.",
            request["texts"][1]["id"]: "향이 상큼합니다.",
        },
    )
    rows = [human_review(request, result, request["texts"][0]["id"], semantic="PASS")]
    evaluated = edit_review.evaluate(request, result, human_reviews=rows)
    composition = edit_review.compose(request, result, human_reviews=rows)

    assert [row["humanDecision"] for row in evaluated["edits"]] == ["APPROVE", "PENDING"]
    assert [text["value"] for text in composition["modules"][0]["texts"]] == [
        "농장에서는 감귤을 재배해요.",
        "향은 상큼해요.",
    ]
    assert [origin["origin"] for origin in composition["origins"]] == [
        "HUMAN_APPROVED_EDIT",
        "BASELINE_UNCHANGED",
    ]
    assert [origin["applied"] for origin in composition["origins"]] == [True, False]
    assert composition["metrics"]["appliedEdits"] == 1
    assert composition["requiresContentReview"] is True


def test_AC_SRC_10_noops_are_excluded_and_zero_approval_preserves_exact_baseline():
    request = make_request(["제주산 감귤 3kg 상자예요.", "과육이 부드러워요."])
    result = polish_result(request)
    report = edit_review.evaluate(request, result)
    composition = edit_review.compose(request, result)
    assert report["metrics"]["noOps"] == 2
    assert report["metrics"]["changedEdits"] == 0
    assert report["metrics"]["usefulEditDenominator"] == 0
    assert composition["status"] == "BASELINE_UNCHANGED"
    assert composition["modules"] == request["baselineModules"]
    assert all(origin["origin"] == "BASELINE_UNCHANGED" for origin in composition["origins"])
    assert composition["metrics"]["appliedEdits"] == 0


def test_AC_SRC_10_critic_pass_and_missing_critic_do_not_approve_edits():
    request = make_request()
    result = polish_result(request, {request["texts"][0]["id"]: "제주산 감귤 3kg 상자입니다."})
    critic_request = voice_polish.prepare_critic(request, result)
    critic = voice_polish.validate_critic(
        critic_request,
        {
            "requestSha256": critic_request["requestSha256"],
            "texts": [
                {
                    "id": critic_request["after"][0]["id"],
                    "factualPreservation": "PASS",
                    "styleNotes": "자연스러운 문장",
                }
            ],
        },
    )
    with_critic = edit_review.evaluate(request, result, critic=critic)
    missing_critic = edit_review.evaluate(request, result)
    assert with_critic["edits"][0]["criticAssessment"] == "PASS"
    assert with_critic["edits"][0]["humanDecision"] == "PENDING"
    assert with_critic["semanticAcceptance"] is False
    assert with_critic["criticPlan"]["status"] == "ALREADY_EVALUATED"
    assert missing_critic["edits"][0]["criticAssessment"] == "MISSING"
    assert edit_review.compose(request, result, critic=critic)["status"] == "BASELINE_UNCHANGED"


def test_AC_SRC_10_explicit_human_semantic_pass_is_required_and_still_not_global_acceptance():
    request = make_request()
    result = polish_result(request, {request["texts"][0]["id"]: "제주산 감귤 3kg 상자입니다."})
    approval_without_semantics = human_review(request, result, request["texts"][0]["id"])
    pending = edit_review.compose(request, result, human_reviews=[approval_without_semantics])
    assert pending["status"] == "BASELINE_UNCHANGED"
    assert pending["origins"][0]["reason"] == "SEMANTIC_REVIEW_PENDING"

    explicit = human_review(request, result, request["texts"][0]["id"], semantic="PASS")
    composed = edit_review.compose(request, result, human_reviews=[explicit])
    evaluated = edit_review.evaluate(request, result, human_reviews=[explicit])
    assert composed["status"] == "COMPOSED"
    assert composed["semanticAcceptance"] is False
    assert evaluated["semanticAcceptance"] is False


def test_AC_SRC_10_hardguard_blocked_edit_cannot_be_applied_even_if_human_approves():
    request = make_request("감귤 3kg 상자예요.")
    result = polish_result(request, {request["texts"][0]["id"]: "감귤 4kg 상자예요."})
    review = human_review(request, result, request["texts"][0]["id"], semantic="PASS")
    evaluation = edit_review.evaluate(request, result, human_reviews=[review])
    composition = edit_review.compose(request, result, human_reviews=[review])
    assert evaluation["edits"][0]["mechanicalEligibility"] == "HARD_BLOCKED"
    assert composition["status"] == "BASELINE_UNCHANGED"
    assert composition["modules"] == request["baselineModules"]
    assert composition["origins"][0]["applied"] is False
    assert composition["origins"][0]["reason"] == "HARD_BLOCKED"


@pytest.mark.parametrize(
    ("before", "after", "flag"),
    [
        ("감귤에는 씨가 없어요.", "감귤에는 씨가 있어요.", "EXPLICIT_POLARITY_REVERSAL"),
        ("감귤에는 씨가 있어요.", "감귤이에요.", "EXPLICIT_POLARITY_REMOVED"),
        (
            "감귤에는 씨가 없고 씨가 있어요.",
            "감귤에는 씨가 있고 씨가 없어요.",
            "EXPLICIT_POLARITY_CHANGED",
        ),
    ],
)
def test_AC_SRC_10_explicit_property_polarity_and_deletion_are_nonoverridable(before, after, flag):
    request = make_request(before)
    result = polish_result(request, {request["texts"][0]["id"]: after})
    review = human_review(request, result, request["texts"][0]["id"], semantic="PASS")
    evaluated = edit_review.evaluate(request, result, human_reviews=[review])
    composition = edit_review.compose(request, result, human_reviews=[review])
    assert flag in evaluated["edits"][0]["hardBlocks"]
    assert evaluated["edits"][0]["humanDecision"] == "APPROVE"
    assert composition["origins"][0]["applied"] is False
    assert composition["modules"] == request["baselineModules"]


def test_AC_SRC_10_exact_binding_rejects_stale_hash_output_source_and_moved_text_id():
    request = make_request(["첫 문장이에요.", "두 번째 문장이에요."])
    result = polish_result(request, {request["texts"][0]["id"]: "첫 문장입니다."})
    review = human_review(request, result, request["texts"][0]["id"], semantic="PASS")

    stale_result = deepcopy(result)
    stale_result["texts"][0]["value"] = "변경된 제안입니다."
    with pytest.raises(edit_review.EditReviewError) as stale:
        edit_review.evaluate(request, stale_result)
    assert stale.value.reason == "STALE_RESULT"

    stale_review = deepcopy(review)
    stale_review["proposedSha256"] = "0" * 64
    with pytest.raises(edit_review.EditReviewError) as stale:
        edit_review.evaluate(request, result, human_reviews=[stale_review])
    assert stale.value.reason == "STALE_REVIEW"

    moved_request = make_request(["두 번째 문장이에요.", "첫 문장이에요."])
    moved_result = polish_result(moved_request)
    with pytest.raises(edit_review.EditReviewError) as stale:
        edit_review.evaluate(moved_request, moved_result, human_reviews=[review])
    assert stale.value.reason in {"STALE_REVIEW", "INVALID_REVIEW"}

    source_changed = deepcopy(request)
    source_changed["sourceRevisions"]["source-a"] = 2
    with pytest.raises(edit_review.EditReviewError) as stale:
        edit_review.evaluate(source_changed, result)
    assert stale.value.reason == "STALE_RESULT"


def test_AC_SRC_10_duplicate_or_nonhuman_review_labels_are_not_trusted():
    request = make_request()
    result = polish_result(request, {request["texts"][0]["id"]: "제주산 감귤 3kg 상자입니다."})
    approval = human_review(request, result, request["texts"][0]["id"], semantic="PASS")
    with pytest.raises(edit_review.EditReviewError) as invalid:
        edit_review.evaluate(request, result, human_reviews=[approval, approval])
    assert invalid.value.reason == "DUPLICATE_REVIEW"

    model_label = human_review(
        request,
        result,
        request["texts"][0]["id"],
        semantic="PASS",
        reviewer_kind="MODEL",
    )
    with pytest.raises(edit_review.EditReviewError) as invalid:
        edit_review.evaluate(request, result, human_reviews=[model_label])
    assert invalid.value.reason == "INVALID_REVIEW"


def test_AC_SRC_10_pending_critic_plan_keeps_safe_proposals_from_incomplete_page():
    request = make_request(["감귤 3kg 상자예요.", "향은 상큼해요."])
    result = polish_result(
        request,
        {
            request["texts"][0]["id"]: "감귤 4kg 상자예요.",
            request["texts"][1]["id"]: "향이 상큼합니다.",
        },
    )
    assert result["status"] == "INCOMPLETE"
    plan = edit_review.critic_plan(request, result)
    assert plan["status"] == "PENDING"
    assert plan["providerReady"] is True
    assert plan["request"] is not None
    report = edit_review.evaluate(request, result)
    assert report["criticPlan"]["status"] == "PENDING"
    assert [row["criticAssessment"] for row in report["edits"]] == ["MISSING", "MISSING"]


def test_AC_SRC_10_final_wholepage_failure_is_reported_without_baseline_rescue_success(monkeypatch):
    rows = [
        candidate("c1", "제주산 감귤 3kg 상자예요.", span="safe-baseline"),
        candidate("c2", "향은 상큼해요.", span="safe-taste"),
    ]
    request = make_request(
        [rows[0]["value"], rows[1]["value"]],
        rows=rows,
    )
    result = polish_result(
        request,
        {request["texts"][0]["id"]: "제주산 감귤 3kg 상자입니다."},
    )
    review = human_review(request, result, request["texts"][0]["id"], semantic="PASS")

    final = edit_review._final

    def reject_full_page(modules, current_request):
        if sum(len(module["texts"]) for module in modules) > 1:
            return [], {"rejectedCount": 1, "rejected": [{"code": "WHOLE_PAGE_FIXTURE"}]}
        return final(modules, current_request)

    monkeypatch.setattr(edit_review, "_final", reject_full_page)
    composed = edit_review.compose(request, result, human_reviews=[review])
    assert composed["status"] == "HARD_COMPOSITION_FAILURE"
    assert composed["finalSafetyPassed"] is False
    assert composed["metrics"]["appliedEdits"] == 0
    assert composed["origins"][0]["applied"] is False
    assert composed["origins"][0]["reason"] == "FULL_PAGE_SAFETY_FAILED"


def test_AC_SRC_10_critic_plans_are_isolated_per_edit_and_keep_parent_binding(monkeypatch):
    rows = [
        candidate("c1", "감귤 3kg 상자예요.", span="unsafe-edit"),
        candidate("c2", "향은 상큼해요.", span="safe-edit"),
        candidate("c3", "제주산 감귤이에요.", span="no-op"),
    ]
    request = make_request([row["value"] for row in rows], rows=rows)
    result = polish_result(
        request,
        {
            request["texts"][0]["id"]: "감귤 3kg 상자는 32,000원이에요.",
            request["texts"][1]["id"]: "향이 상큼합니다.",
        },
    )
    assert result["status"] == "INCOMPLETE"
    jobs = edit_review.critic_plans(request, result)
    blocked = jobs[request["texts"][0]["id"]]
    pending = jobs[request["texts"][1]["id"]]
    no_op = jobs[request["texts"][2]["id"]]

    assert blocked["status"] == "BLOCKED_INPUT"
    assert blocked["providerReady"] is False and blocked["request"] is None
    assert pending["status"] == "PENDING" and pending["providerReady"] is True
    assert pending["parentBinding"] == edit_review.binding(
        request, request["texts"][1]["id"], result
    )
    assert pending["parentTextId"] == request["texts"][1]["id"]
    assert pending["localTextId"] == "t001"
    assert len(pending["request"]["after"]) == 1
    assert len(pending["request"]["polishRequest"]["texts"]) == 1
    assert pending["request"]["polishRequest"]["texts"][0]["candidateIds"] == ["c2"]
    assert no_op["status"] == "NOT_NEEDED"
    assert no_op["providerReady"] is False
    assert no_op["request"] is None

    # Critic readiness never transfers a human approval into the parent edit.
    composition = edit_review.compose(request, result)
    assert composition["status"] == "BASELINE_UNCHANGED"

    page_critic_request = voice_polish.prepare_critic(request, result)
    page_critic = voice_polish.validate_critic(
        page_critic_request,
        {
            "requestSha256": page_critic_request["requestSha256"],
            "texts": [
                {
                    "id": row["id"],
                    "factualPreservation": "UNKNOWN",
                    "styleNotes": "Uncalibrated saved diagnostic",
                }
                for row in page_critic_request["after"]
            ],
        },
    )
    already = edit_review.critic_plans(request, result, critic=page_critic)
    assert already[request["texts"][0]["id"]]["status"] == "ALREADY_EVALUATED"
    assert already[request["texts"][1]["id"]]["status"] == "ALREADY_EVALUATED"
    assert already[request["texts"][2]["id"]]["status"] == "NOT_NEEDED"


def test_AC_SRC_10_tampered_private_result_fails_redacted_replay():
    request = make_request()
    result = polish_result(request)
    private = "010-1234-5678"
    tampered = deepcopy(result)
    tampered["texts"][0]["value"] = f"연락처 {private}"
    with pytest.raises(edit_review.EditReviewError) as stale:
        edit_review.evaluate(request, tampered)
    assert stale.value.reason == "STALE_RESULT"
    assert private not in str(stale.value)
