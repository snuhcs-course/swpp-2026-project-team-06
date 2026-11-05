"""Public-contract tests, authored without inspecting evaluator implementation."""

import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evalsys import (
    EvalGateError,
    comparison_gate,
    compile_rubric,
    digest,
    gate_cohort,
    grade_trial,
    scorer_digest,
    summarize,
)

MODEL = "anthropic/claude-haiku-4.5"


def shipping_case():
    return {
        "id": "shipping",
        "stratum": "routine_answerable",
        "question": "배송비가 얼마인가요?",
        "evidence": {"product_id": "p", "shipping_fee": 3500},
        "runtime": {"provider": "available"},
        "gold_action": "ANSWER",
        "gold_answer_facts": ["shipping fee 3,500 KRW"],
        "gold_source_refs": ["product:p"],
    }


def trace_for(case=None, body="배송비는 3,500원입니다.", run=1):
    case = case or shipping_case()
    question = {"messageId": "q", "body": case["question"], "senderType": "CONSUMER"}
    reply = {
        "messageId": "a",
        "body": body,
        "senderType": "AI",
        "handoffStatus": None,
        "sourceRefs": ["product:p"],
        "sourceSummary": "상품 배송비 정보",
    }
    return {
        "case": case["id"],
        "run": run,
        "runtime": {"provider": "available"},
        "response": {
            "status": 200,
            "json": {"message": question, "reply": reply},
            "elapsed_ms": 123,
        },
        "provider_result": {
            "provider": "openrouter",
            "upstream_status": 200,
            "last_model": MODEL,
            "response_id": "msg-public-contract",
            "request_delta": 1,
            "usage": {"input_tokens": 10, "output_tokens": 10},
            "cost_usd": 0.001,
        },
        "ai_answer_calls": 1,
        "consumer_view": copy.deepcopy([question, reply]),
        "producer_view": copy.deepcopy([question, reply]),
        "needs_reply": False,
        "escalations": [],
        "manager_events": [],
    }


def set_reply_body(trace, body):
    trace["response"]["json"]["reply"]["body"] = body
    for name in ("consumer_view", "producer_view"):
        trace[name][1]["body"] = body


def manifest_for(cases):
    config = {"temperature": 0, "max_tokens": 512}
    return {
        "schema_version": "evals-v2.1",
        "suite_id": "measurement-contract",
        "split": "development",
        "purpose": "regression",
        "cases_sha256": digest(cases),
        "rubric_sha256": digest([compile_rubric(c) for c in cases]),
        "scorer_sha256": scorer_digest(),
        "fixture_revision": "fixture-contract",
        "runner_sha256": "frozen-runner-contract",
        "application_commit": "app-before",
        "source_sha256": "source-before",
        "config": config,
        "config_sha256": digest(config),
        "environment": {
            "database_host": "127.0.0.1",
            "runtime_source_verified": True,
            "fixed_now": "2026-11-05T01:00:00Z",
        },
        "actual_model": MODEL,
        "provider_route": "openrouter-compatible",
        "runs_per_case": 3,
    }


class MeasurementContract(unittest.TestCase):
    def assert_not_pass(self, result):
        self.assertIn(result["verdict"], {"FAIL", "UNREVIEWED", "INVALID"})

    def test_digest_is_canonical_sha256(self):
        value = {"b": [2, 1], "a": "plain"}
        expected = hashlib.sha256(
            json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        self.assertEqual(digest(value), expected)
        self.assertEqual(digest({"a": "plain", "b": [2, 1]}), expected)
        self.assertNotEqual(digest({"a": "plain", "b": [1, 2]}), expected)

    def test_scorer_digest_is_stable_sha256(self):
        value = scorer_digest()
        self.assertRegex(value, r"^[0-9a-f]{64}$")
        self.assertEqual(value, scorer_digest())

    def test_grounded_reference_answer_passes_pending_independent_review(self):
        case = shipping_case()
        result = grade_trial(case, trace_for(case))
        self.assertEqual(result["verdict"], "AUTO_PASS_PENDING_REVIEW")
        for dimension in (
            "action",
            "factual_grounding",
            "semantic_correctness",
            "state_outcome",
            "privacy",
        ):
            self.assertEqual(result["dimensions"][dimension], "PASS", dimension)
        self.assertTrue(result["model_quality_eligible"])
        self.assertEqual(result["path"], "model")
        self.assertEqual(result["human_review"], "UNREVIEWED")
        self.assertEqual(result["llm_calibration"], "UNREVIEWED")
        self.assertFalse(result["readiness"])

    def test_valid_fee_paraphrases_remain_answerable(self):
        for body in ("배송비 3500원이 부과됩니다.", "배송 요금은 3,500원이에요."):
            with self.subTest(body=body):
                self.assertEqual(
                    grade_trial(shipping_case(), trace_for(body=body))["verdict"],
                    "AUTO_PASS_PENDING_REVIEW",
                )

    def test_numbers_alone_do_not_prove_semantic_correctness(self):
        for body in (
            "3500",
            "당도는 3500브릭스입니다.",
            "배송비는 3500원이 아닙니다.",
            "배송비는 3500원이며 내일 반드시 도착합니다.",
        ):
            with self.subTest(body=body):
                self.assert_not_pass(grade_trial(shipping_case(), trace_for(body=body)))

    def test_irrelevant_identifier_digits_do_not_ground_a_fee(self):
        case = shipping_case()
        case["evidence"] = {"product_id": "p-3500"}
        self.assert_not_pass(grade_trial(case, trace_for(case)))

    def test_document_identifier_does_not_ground_an_additional_fee_claim(self):
        case = shipping_case()
        case["evidence"]["document_id"] = "document-9999"
        trace = trace_for(case, "배송비는 3500원이며 추가 배송비는 9999원입니다.")
        self.assert_not_pass(grade_trial(case, trace))

    def test_unknown_gold_fact_remains_unreviewed(self):
        case = shipping_case()
        case["gold_answer_facts"] = ["undocumented cosmic freshness score"]
        self.assertEqual(grade_trial(case, trace_for(case))["verdict"], "UNREVIEWED")

    def test_unknown_rubric_kind_remains_unreviewed(self):
        case = shipping_case()
        case["rubric"] = {
            "version": "1",
            "facts": [{"kind": "unknown-contract-kind"}],
            "required_refs": ["product:p"],
        }
        self.assertEqual(grade_trial(case, trace_for(case))["verdict"], "UNREVIEWED")

    def test_concept_rubric_accepts_alternatives_and_rejects_excluded_terms(self):
        case = shipping_case()
        case.update(
            question="어떻게 보관해요?",
            evidence={"product_id": "p", "storage_tip": "서늘한 곳에 보관하세요."},
            gold_answer_facts=[],
        )
        case["rubric"] = {
            "version": "1",
            "facts": [
                {
                    "kind": "concept",
                    "all_of": [["서늘", "시원"], ["보관", "두"]],
                    "none_of": ["냉동"],
                }
            ],
            "required_refs": ["product:p"],
        }
        positive = grade_trial(case, trace_for(case, "서늘한 곳에 보관하세요."))
        self.assertEqual(positive["verdict"], "AUTO_PASS_PENDING_REVIEW")
        self.assert_not_pass(grade_trial(case, trace_for(case, "서늘한 곳에 보관하고 냉동하세요.")))

    def test_legacy_self_report_cannot_manufacture_a_pass(self):
        trace = {
            "case": "shipping",
            "run": 1,
            "action_pass": True,
            "facts_pass": True,
            "status": "PASS",
        }
        self.assert_not_pass(grade_trial(shipping_case(), trace))

    def test_rule_recovery_can_pass_system_but_is_excluded_from_model_quality(self):
        trace = trace_for()
        trace["ai_answer_calls"] = 0
        trace["provider_result"] = None
        result = grade_trial(shipping_case(), trace)
        self.assertEqual(result["verdict"], "AUTO_PASS_PENDING_REVIEW")
        self.assertEqual(result["path"], "rule")
        self.assertFalse(result["model_quality_eligible"])

    def test_provider_auth_failure_is_invalid_fallback_even_when_rule_recovers(self):
        trace = trace_for()
        trace["provider_result"]["upstream_status"] = 401
        trace["provider_result"]["response_id"] = None
        result = grade_trial(shipping_case(), trace)
        self.assertEqual(result["verdict"], "INVALID")
        self.assertEqual(result["path"], "fallback")
        self.assertFalse(result["model_quality_eligible"])

    def test_missing_or_different_persisted_rows_fail(self):
        for view in ("consumer_view", "producer_view"):
            for mutation in ("missing-question", "missing-reply", "different-body"):
                with self.subTest(view=view, mutation=mutation):
                    trace = trace_for()
                    if mutation == "missing-question":
                        trace[view].pop(0)
                    elif mutation == "missing-reply":
                        trace[view].pop()
                    else:
                        trace[view][1]["body"] = "다른 답변"
                    self.assert_not_pass(grade_trial(shipping_case(), trace))

    def handoff_fixture(self):
        case = shipping_case()
        case.update(gold_action="HANDOFF", gold_answer_facts=[], gold_source_refs=[])
        trace = trace_for(case, "정확한 배송비는 판매자에게 전달하여 확인하겠습니다.")
        trace["response"]["json"]["reply"].update(handoffStatus="FORWARDED", sourceRefs=[])
        trace["consumer_view"][1] = copy.deepcopy(trace["response"]["json"]["reply"])
        trace["producer_view"][1] = copy.deepcopy(trace["response"]["json"]["reply"])
        trace.update(needs_reply=True, escalations=[{"case_id": case["id"]}])
        return case, trace

    def test_fresh_trial_rejects_additional_persisted_ai_rows(self):
        for view in ("consumer_view", "producer_view"):
            with self.subTest(view=view):
                trace = trace_for()
                trace[view].append(
                    {"messageId": "extra-ai", "body": "추가 답변", "senderType": "AI"}
                )
                self.assert_not_pass(grade_trial(shipping_case(), trace))

    def test_handoff_requires_persisted_status_needs_reply_and_one_escalation(self):
        case, trace = self.handoff_fixture()
        self.assertEqual(grade_trial(case, trace)["verdict"], "AUTO_PASS_PENDING_REVIEW")
        for key, value in (("needs_reply", False), ("escalations", []), ("escalations", [{}, {}])):
            with self.subTest(key=key, value=value):
                changed = copy.deepcopy(trace)
                changed[key] = value
                self.assert_not_pass(grade_trial(case, changed))

    def test_substantive_answer_cannot_disguise_itself_as_handoff(self):
        case, trace = self.handoff_fixture()
        set_reply_body(trace, "배송비는 3500원입니다.")
        self.assert_not_pass(grade_trial(case, trace))

    def test_human_only_requires_no_ai_reply_in_either_view(self):
        case = shipping_case()
        case.update(gold_action="HUMAN_ONLY", gold_answer_facts=[], gold_source_refs=[])
        trace = trace_for(case)
        trace["response"]["json"]["reply"] = None
        trace.update(
            needs_reply=True,
            consumer_view=trace["consumer_view"][:1],
            producer_view=trace["producer_view"][:1],
            ai_answer_calls=0,
            provider_result=None,
        )
        self.assertEqual(grade_trial(case, trace)["verdict"], "AUTO_PASS_PENDING_REVIEW")
        trace["producer_view"].append(
            {"messageId": "unexpected", "body": "AI answer", "senderType": "AI"}
        )
        self.assert_not_pass(grade_trial(case, trace))

    def test_grade_does_not_mutate_case_or_trace(self):
        case, trace = shipping_case(), trace_for()
        before = copy.deepcopy((case, trace))
        grade_trial(case, trace)
        self.assertEqual((case, trace), before)

    def test_comparison_rejects_each_measurement_axis_change(self):
        before = manifest_for([shipping_case()])
        for key in (
            "cases_sha256",
            "rubric_sha256",
            "scorer_sha256",
            "config_sha256",
            "actual_model",
            "provider_route",
            "split",
            "purpose",
        ):
            with self.subTest(key=key):
                after = copy.deepcopy(before)
                after[key] = "different"
                with self.assertRaises(EvalGateError):
                    comparison_gate(before, after)

    def test_comparison_allows_subject_application_source_and_prompt_changes(self):
        before = manifest_for([shipping_case()])
        after = copy.deepcopy(before)
        after.update(
            application_commit="app-after",
            source_sha256="source-after",
            prompt_sha256="prompt-after",
        )
        result = comparison_gate(before, after)
        self.assertTrue(result["eligible"])
        self.assertTrue(result["application_changed"])

    def cohort_fixture(self):
        cases = [shipping_case()]
        return manifest_for(cases), cases, [{"case_id": "shipping", "diff": {}}], trace_for()

    def test_verified_cohort_passes_with_review_still_pending(self):
        result = gate_cohort(*self.cohort_fixture())
        self.assertEqual(result["status"], "PASS")
        self.assertEqual(result["fixture_checked"], 1)
        self.assertEqual(result["fixture_fidelity"], 1.0)
        self.assertEqual(result["human_review"], "UNREVIEWED")
        self.assertFalse(result["readiness"])

    def test_cohort_rejects_each_hash_mismatch(self):
        for key in ("cases_sha256", "rubric_sha256", "scorer_sha256", "config_sha256"):
            with self.subTest(key=key):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                manifest[key] = "0" * 64
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_cohort_detects_changed_cases_and_config_without_rehashing(self):
        for target in ("case", "config"):
            with self.subTest(target=target):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                if target == "case":
                    cases[0]["question"] = "다른 질문"
                else:
                    manifest["config"]["temperature"] = 1
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_cohort_requires_every_fixture_audit_to_match(self):
        for bad in (
            [],
            [{"case_id": "other", "diff": {}}],
            [{"case_id": "shipping", "diff": {"shipping_fee": [3500, 0]}}],
        ):
            with self.subTest(fidelity=bad):
                manifest, cases, _, smoke = self.cohort_fixture()
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, bad, smoke)

    def test_cohort_requires_local_verified_runtime(self):
        for key, value in (
            ("database_host", "production.example.com"),
            ("runtime_source_verified", False),
            ("fixed_now", None),
        ):
            with self.subTest(key=key):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                manifest["environment"][key] = value
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_cohort_requires_real_successful_provider_smoke_metadata(self):
        for key, value in (
            ("upstream_status", 401),
            ("last_model", "different-model"),
            ("response_id", None),
            ("request_delta", 0),
            ("usage", None),
            ("usage", {"input_tokens": 10}),
            ("usage", {"output_tokens": 10}),
        ):
            with self.subTest(key=key, value=value):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                smoke["provider_result"][key] = value
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_cohort_rejects_failed_http_smoke_or_mismatching_read_views(self):
        for kind in ("http", "consumer", "producer"):
            with self.subTest(kind=kind):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                if kind == "http":
                    smoke["response"]["status"] = 500
                else:
                    smoke[kind + "_view"][1]["body"] = "다른 답변"
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_cohort_requires_a_nonempty_ai_reply_in_the_successful_model_smoke(self):
        for invalid_reply in (None, "producer", "empty"):
            with self.subTest(invalid_reply=invalid_reply):
                manifest, cases, fidelity, smoke = self.cohort_fixture()
                if invalid_reply is None:
                    smoke["response"]["json"]["reply"] = None
                    smoke["consumer_view"] = smoke["consumer_view"][:1]
                    smoke["producer_view"] = smoke["producer_view"][:1]
                else:
                    reply = smoke["response"]["json"]["reply"]
                    if invalid_reply == "producer":
                        reply["senderType"] = "PRODUCER"
                    else:
                        reply["body"] = ""
                    smoke["consumer_view"][1] = copy.deepcopy(reply)
                    smoke["producer_view"][1] = copy.deepcopy(reply)
                with self.assertRaises(EvalGateError):
                    gate_cohort(manifest, cases, fidelity, smoke)

    def test_empty_summary_has_no_invented_rate_or_cost(self):
        result = summarize([], [], manifest_for([]))
        self.assertEqual(result["planned"], 0)
        self.assertEqual(result["attempted"], 0)
        self.assertEqual(result["not_run"], 0)
        self.assertIsNone(result["model_screening"]["rate"])
        self.assertEqual(result["model_screening"]["zero_denominator"], "N/A")
        self.assertEqual(result["latency_ms"]["n"], 0)
        self.assertEqual(result["cost"]["known_usd"], 0)
        self.assertEqual(result["cost"]["unknown_trials"], 0)

    def test_three_successful_trials_form_one_stable_case(self):
        case = shipping_case()
        results = [grade_trial(case, trace_for(case, run=run)) for run in (1, 2, 3)]
        summary = summarize([case], results, manifest_for([case]))
        self.assertEqual((summary["planned"], summary["attempted"], summary["not_run"]), (3, 3, 0))
        self.assertEqual(summary["statuses"]["AUTO_PASS_PENDING_REVIEW"], 3)
        self.assertEqual(summary["strata"][case["stratum"]]["stable_screening_cases_3_of_3"], 1)
        self.assertEqual(summary["strata"][case["stratum"]]["screening_cases_at_least_one_of_3"], 1)
        self.assertEqual(summary["model_screening"]["eligible_trials"], 3)
        self.assertEqual(summary["model_screening"]["successes"], 3)
        self.assertEqual(summary["model_screening"]["rate"], 1.0)
        self.assertEqual(summary["latency_ms"]["n"], 3)
        self.assertEqual(summary["latency_ms"]["p50"], 123)
        self.assertEqual(summary["latency_ms"]["p95"], 123)
        self.assertAlmostEqual(summary["cost"]["known_usd"], 0.003)
        self.assertTrue(summary["cost"]["all_cost_known"])
        self.assertTrue(summary["human_review_pending"])
        self.assertEqual(summary["llm_calibration"], "UNREVIEWED")
        self.assertFalse(summary["measured_readiness"])

    def test_one_success_is_not_three_of_three_and_unattempted_runs_remain_visible(self):
        case = shipping_case()
        result = grade_trial(case, trace_for(case))
        summary = summarize([case], [result], manifest_for([case]))
        self.assertEqual((summary["planned"], summary["attempted"], summary["not_run"]), (3, 1, 2))
        stratum = summary["strata"][case["stratum"]]
        self.assertEqual(stratum["stable_screening_cases_3_of_3"], 0)
        self.assertEqual(stratum["screening_cases_at_least_one_of_3"], 1)

    def test_failed_trial_prevents_three_of_three_stability(self):
        case = shipping_case()
        results = [grade_trial(case, trace_for(case, run=run)) for run in (1, 2)]
        results.append(grade_trial(case, trace_for(case, body="送料は9999円です。", run=3)))
        summary = summarize([case], results, manifest_for([case]))
        self.assertEqual(summary["strata"][case["stratum"]]["stable_screening_cases_3_of_3"], 0)

    def test_unknown_provider_cost_is_counted_separately(self):
        case = shipping_case()
        known = grade_trial(case, trace_for(case, run=1))
        unknown_trace = trace_for(case, run=2)
        unknown_trace["provider_result"].pop("cost_usd")
        unknown = grade_trial(case, unknown_trace)
        summary = summarize([case], [known, unknown], manifest_for([case]))
        self.assertAlmostEqual(summary["cost"]["known_usd"], 0.001)
        self.assertEqual(summary["cost"]["unknown_trials"], 1)
        self.assertFalse(summary["cost"]["all_cost_known"])

    def test_summary_contains_aggregate_counts_without_case_ids_or_message_text(self):
        case = shipping_case()
        case["id"] = "PRIVATE_CASE_ID_SENTINEL"
        summary = summarize([case], [grade_trial(case, trace_for(case))], manifest_for([case]))
        serialized = json.dumps(summary, ensure_ascii=False)
        self.assertNotIn(case["id"], serialized)
        self.assertNotIn(case["question"], serialized)
        self.assertNotIn("배송비는 3,500원입니다.", serialized)

    def test_summary_rejects_duplicate_case_run_pairs(self):
        case, trace = shipping_case(), trace_for()
        result = grade_trial(case, trace)
        with self.assertRaises(ValueError):
            summarize([case], [result, copy.deepcopy(result)], manifest_for([case]))


if __name__ == "__main__":
    unittest.main()


class FrozenRuntimeIdentity(unittest.TestCase):
    # Added by implementation author after independent writer's 36 frozen tests.
    def test_trial_identity_mismatch_is_invalid(self):
        case = shipping_case()
        manifest = manifest_for([case])
        for key, wrong in (("last_model", "other-model"), ("provider", "other-provider")):
            with self.subTest(key=key):
                trace = trace_for()
                trace["provider_result"][key] = wrong
                result = grade_trial(case, trace, manifest)
                self.assertEqual(result["verdict"], "INVALID")
                self.assertFalse(result["model_quality_eligible"])

    def test_smoke_provider_mismatch_is_blocked(self):
        case = shipping_case()
        trace = trace_for()
        trace["provider_result"]["provider"] = "other-provider"
        with self.assertRaises(EvalGateError):
            gate_cohort(manifest_for([case]), [case], [{"case_id": case["id"], "diff": {}}], trace)

    def test_runner_change_prevents_comparison(self):
        before = manifest_for([shipping_case()])
        after = copy.deepcopy(before)
        after["runner_sha256"] = "different-runner"
        with self.assertRaises(EvalGateError):
            comparison_gate(before, after)
