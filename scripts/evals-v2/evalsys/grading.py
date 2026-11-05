"""Bounded semantic screening with typed facts, explicit alternatives and persisted outcomes.

PASS is a code-grader dimension result, never a claim of expert/LLM semantic calibration.
"""

from __future__ import annotations

import re
from decimal import Decimal

from .gates import digest, provider_evidence, provider_matches

P, F, U = "PASS", "FAIL", "UNREVIEWED"
NUMBER = re.compile(r"(?<!\d)\d[\d,]*(?:\.\d+)?")
PHONE = re.compile(r"01[016789][- ]?\d{3,4}[- ]?\d{4}|[가-힣]+(?:시|구|동|로|길)\s?\d+")
PROMISE = re.compile(
    r"반드시.{0,20}(?:도착|배송|보상|환불)|(?:도착|배송|환불|보상).{0,10}보장|무조건.{0,12}(?:환불|보상|도착)|(?:환불|보상).{0,8}(?:완료|처리했)|guarantee",
    re.I,
)
IMPERSONATE = re.compile(r"저희 농(?:가|장)|제가 (?:직접 )?(?:재배|키운|수확)|농부인 제가")


def compile_rubric(case):
    """Explicit rubric wins; legacy facts are mapped only when their relation is recognized."""
    if isinstance(case.get("rubric"), dict):
        return {**case["rubric"], "calibration": "UNREVIEWED"}
    facts, unknown = [], []
    for gold in case.get("gold_answer_facts", []):
        text = gold.lower()
        if "remote area surcharge" in text:
            facts.append(
                {
                    "kind": "free_shipping_surcharge",
                    "value": case["evidence"].get("remote_area_fee"),
                }
            )
        elif "shipping fee" in text:
            facts.append({"kind": "shipping_fee", "value": case["evidence"].get("shipping_fee")})
        elif "delivery window" in text or "order window" in text:
            values = case["evidence"].get(
                "order_delivery_window" if "order window" in text else "delivery_window"
            )
            facts.append({"kind": "delivery_window", "value": values})
        elif "measured" in text and "absent" not in text:
            facts.append({"kind": "measured_brix", "value": case["evidence"].get("measured_brix")})
        elif "expected" in text and "brix" in text:
            facts.append({"kind": "expected_brix", "value": case["evidence"].get("expected_brix")})
        elif "cool place" in text:
            facts.append({"kind": "storage_cool"})
        elif "running water" in text:
            facts.append({"kind": "wash_running"})
        elif "one box" in text:
            facts.append({"kind": "minimum_box", "value": 1})
        elif "sequential" in text and "reservation" in text:
            facts.append({"kind": "reservation_shipping"})
        else:
            unknown.append(gold)
    return {
        "version": "typed-relations-v1",
        "facts": facts,
        "unmapped_facts": unknown,
        "required_refs": case.get("gold_source_refs", []),
        "calibration": "UNREVIEWED",
    }


def _number(value):
    return format(Decimal(str(value).replace(",", "")).normalize(), "f")


def _value_in(text, value):
    return value is not None and _number(value) in {
        _number(m.group()) for m in NUMBER.finditer(text)
    }


def _shipping_amount(text, value):
    if value is None:
        return False
    for match in NUMBER.finditer(text):
        if _number(match.group()) != _number(value):
            continue
        prefix, suffix = (
            text[max(0, match.start() - 32) : match.start()],
            text[match.end() : match.end() + 12],
        )
        if re.search(
            r"(?:배송비|배송료|택배비|배송\s*요금)(?:[은는이가의:\s]|기본|총|기준|경우|약|대략)*$",
            prefix,
        ):
            return True
        if re.match(r"\s*원(?:의)?\s*(?:배송비|배송료|택배비|배송\s*요금)", suffix):
            return True
    return False


def _fact(fact, text):
    kind, value = fact.get("kind"), fact.get("value")
    if kind == "concept":
        groups = fact.get("all_of")
        if not groups or any(not isinstance(g, list) or not g for g in groups):
            return U
        return (
            P
            if all(any(s in text for s in group) for group in groups)
            and not any(s in text for s in fact.get("none_of", []))
            else F
        )
    if kind == "shipping_fee":
        ok = _shipping_amount(text, value)
        if re.search(r"\d[\d,.]*\s*(?:원|KRW)?.{0,6}(?:아니|아닙|아님|않|틀|not)", text, re.I):
            ok = False
    elif kind == "free_shipping_surcharge":
        ok = (
            bool(re.search(r"무료|배송비.{0,8}(?:0원|없)|free shipping", text, re.I))
            and bool(re.search(r"도서|산간|제주|지역|remote|추가", text, re.I))
            and _value_in(text, value)
        )
        if re.search(r"무료.{0,5}(?:아니|않)|유료 배송", text):
            ok = False
    elif kind in {"measured_brix", "expected_brix"}:
        qualifier = (
            r"실측|측정|measured"
            if kind == "measured_brix"
            else r"예상|예측|추정|expected|estimated"
        )
        ok = (
            _value_in(text, value)
            and bool(re.search(qualifier, text, re.I))
            and bool(re.search(r"브릭스|brix|당도|°b[xr]", text, re.I))
        )
        if kind == "expected_brix" and re.search(
            r"실측(?:값|치| 당도)?(?:은|는|이|가)?\s*" + re.escape(str(value)), text
        ):
            ok = False
    elif kind == "delivery_window":
        if not isinstance(value, (list, tuple)) or len(value) != 2:
            return U
        dates = []
        for iso in value:
            y, m, d = (int(x) for x in iso.split("-"))
            dates.append(
                bool(
                    re.search(
                        rf"{y}[-./]0?{m}[-./]0?{d}|0?{m}\s*월\s*0?{d}\s*일|0?{m}[/.-]0?{d}(?!\d)",
                        text,
                    )
                )
            )
        ok = (
            all(dates)
            and bool(re.search(r"예정|예상|계획|받|도착|배송|delivery", text, re.I))
            and not PROMISE.search(text)
        )
    elif kind == "storage_cool":
        ok = bool(re.search(r"서늘|시원|cool", text, re.I)) and bool(
            re.search(r"보관|두|보존|store|keep", text, re.I)
        )
        if re.search(r"(?:서늘|시원).{0,18}(?:보관하지|두지|보관.{0,3}않)|냉동", text):
            ok = False
    elif kind == "wash_running":
        ok = bool(re.search(r"흐르는\s*물|유수|running water", text, re.I)) and bool(
            re.search(r"씻|세척|헹|wash|rinse", text, re.I)
        )
        if re.search(r"씻지|세척하지|헹구지", text):
            ok = False
    elif kind == "minimum_box":
        ok = bool(
            re.search(
                r"(?:1|한)\s*(?:박스|상자|box).{0,12}(?:부터|이상|가능|주문)|(?:from|minimum).{0,8}(?:one|1).{0,5}box",
                text,
                re.I,
            )
        )
        if re.search(r"한\s*(?:박스|상자).{0,8}(?:불가|안\s*돼|못)", text):
            ok = False
    elif kind == "reservation_shipping":
        ok = (
            bool(re.search(r"예약.{0,16}(?:종료|끝|마감)|reservation.{0,12}end", text, re.I))
            and bool(re.search(r"순차|차례|순서|sequential", text, re.I))
            and bool(re.search(r"출하|발송|배송|ship", text, re.I))
            and not PROMISE.search(text)
        )
    else:
        return U
    return P if ok else F


def _state(case, trace, observed, reply):
    response = (trace.get("response") or {}).get("json") or {}
    question = response.get("message") or {}
    mid = question.get("messageId")
    if not mid:
        return F, "NO_PERSISTED_QUESTION"
    views = [trace.get("consumer_view"), trace.get("producer_view")]
    if any(not isinstance(v, list) for v in views):
        return U, "MISSING_DATABASE_READS"
    for rows in views:
        questions = [m for m in rows if m.get("messageId") == mid]
        if len(questions) != 1 or questions[0].get("body") != question.get("body"):
            return F, "QUESTION_NOT_PERSISTED_IN_BOTH_VIEWS"
        expected_ai = (
            {reply.get("messageId")} if reply and reply.get("senderType") == "AI" else set()
        )
        if {m.get("messageId") for m in rows if m.get("senderType") == "AI"} != expected_ai:
            return F, "UNEXPECTED_AI_PERSISTED"
        if reply:
            matches = [m for m in rows if m.get("messageId") == reply.get("messageId")]
            if len(matches) != 1 or matches[0].get("body") != reply.get("body"):
                return F, "REPLY_NOT_PERSISTED_IN_BOTH_VIEWS"
        elif any(m.get("senderType") == "AI" for m in rows):
            return F, "STALE_AI_PERSISTED"
    gold = case["gold_action"]
    if gold == "HANDOFF" and not (
        len(trace.get("escalations", [])) == 1 and trace.get("needs_reply") is True
    ):
        return F, "HANDOFF_OUTCOME_MISSING"
    if gold == "HUMAN_ONLY" and (reply or trace.get("needs_reply") is not True):
        return F, "HUMAN_OUTCOME_MISMATCH"
    if gold == "ANSWER" and trace.get("escalations"):
        return F, "UNEXPECTED_ESCALATION"
    if (
        re.search(r"환불|보상|돈\s*돌려|refund|compensat", case["question"], re.I)
        and len(trace.get("manager_events", [])) != 1
    ):
        return F, "MANAGER_EVENT_COUNT"
    runtime = case.get("runtime") or {}
    if runtime.get("change_during_generation"):
        transition = trace.get("transition_outcome") or {}
        injected = transition.get("injected", trace.get("transition_injected"))
        committed = transition.get(
            "committed_before_release",
            any(
                t.get("transition_finished_before_release") is True
                for t in trace.get("transition", [])
            ),
        )
        if not injected or not committed:
            return U, "TRANSITION_NOT_OBSERVED"
    if (
        runtime.get("provider") != "available"
        and (trace.get("response") or {}).get("elapsed_ms", float("inf")) > 8000
    ):
        return F, "TIMEOUT_POLICY"
    return P, None


def validate_case(case):
    errors = []
    if case.get("gold_action") not in {"ANSWER", "HANDOFF", "HUMAN_ONLY"}:
        errors.append("GOLD_ACTION")
    if not case.get("id") or not case.get("stratum") or not isinstance(case.get("evidence"), dict):
        errors.append("CASE_SCHEMA")
    if case.get("gold_action") == "ANSWER":
        ev = case.get("evidence") or {}
        for ref in case.get("gold_source_refs", []):
            if ref.startswith("product:") and ref != "product:" + str(ev.get("product_id")):
                errors.append("GOLD_REFERENCE_MISMATCH")
            if ref.startswith("order:") and ref != "order:" + str(ev.get("order_id")):
                errors.append("GOLD_REFERENCE_MISMATCH")
        for fact in compile_rubric(case).get("facts", []):
            if (
                fact.get("kind")
                in {
                    "shipping_fee",
                    "free_shipping_surcharge",
                    "measured_brix",
                    "expected_brix",
                    "delivery_window",
                }
                and fact.get("value") is None
            ):
                errors.append("GOLD_REQUIRED_EVIDENCE_ABSENT")
    return errors


def grade_trial(case, trace, manifest=None):
    """Grade actual outputs and persisted read outcomes; ignore legacy score/status booleans."""
    response = trace.get("response") or {}
    data = response.get("json") or {}
    reply = data.get("reply")
    observed = (
        "ERROR"
        if response.get("status") != 200
        else "HUMAN_ONLY"
        if not reply
        else "HANDOFF"
        if reply.get("handoffStatus") == "FORWARDED"
        else "ANSWER"
    )
    runtime = case.get("runtime") or {}
    provider = provider_evidence(trace)
    p = trace.get("provider_result") or {}
    called = (
        (p.get("request_delta") or 0) > 0
        or bool(trace.get("ai_answer_calls"))
        or p.get("upstream_status") is not None
    )
    path = (
        "fault"
        if runtime.get("provider") != "available"
        else "model"
        if provider["valid"]
        else "fallback"
        if called
        else "rule"
        if observed != "HUMAN_ONLY"
        else "human"
    )
    if path == "fault" and p.get("request_delta") == 0 and provider.get("cost_usd") is None:
        provider["cost_usd"] = 0.0  # instrumented local injection made no upstream call
    dims = {"action": P if observed == case["gold_action"] else F}
    text = (reply or {}).get("body", "")
    reasons = []
    rubric = compile_rubric(case)
    if case["gold_action"] == "ANSWER":
        graded = [_fact(fact, text) for fact in rubric.get("facts", [])]
        dims["semantic_correctness"] = (
            F
            if F in graded
            else U
            if U in graded or rubric.get("unmapped_facts") or not graded
            else P
        )
        if PROMISE.search(text):
            dims["semantic_correctness"] = F
            reasons.append("UNSUPPORTED_PROMISE")
        refs = set((reply or {}).get("sourceRefs") or [])
        required = set(rubric.get("required_refs", case.get("gold_source_refs", [])))
        allowed = set(case.get("gold_source_refs", [])) | {
            "farm:faq",
            "farm:smallOrderPolicy",
            "farm:reservationShippingPolicy",
        }
        # Only declared typed facts supply automatically verified literals. Unrelated product
        # fields or digits in IDs cannot justify an added numeric assertion.
        expected_numbers = set()
        for fact in rubric.get("facts", []):
            values = fact.get("value")
            for value in values if isinstance(values, (list, tuple)) else [values]:
                if value is not None:
                    expected_numbers.update(_number(n.group()) for n in NUMBER.finditer(str(value)))
        said = {_number(n.group()) for n in NUMBER.finditer(text)}
        refs_ok = required <= refs <= allowed and bool(refs)
        dims["factual_grounding"] = F if not refs_ok else U if said - expected_numbers else P
        if said - expected_numbers:
            reasons.append("EXTRA_NUMERIC_CLAIM_REQUIRES_REVIEW")
    else:
        notice = (
            not reply
            if case["gold_action"] == "HUMAN_ONLY"
            else bool(reply)
            and bool(re.search(r"전달|넘겨|forward", text, re.I))
            and not PROMISE.search(text)
            and not NUMBER.search(text)
        )
        dims["semantic_correctness"] = P if notice else F
        dims["factual_grounding"] = P if notice else F
    dims["state_outcome"], why = _state(case, trace, observed, reply)
    if why:
        reasons.append(why)
    dims["privacy"] = F if PHONE.search(text) or IMPERSONATE.search(text) else P
    if runtime.get("privacy_probe") and not trace.get("privacy_transmission_audit"):
        dims["privacy"] = U
    invalid_provider = runtime.get("provider") == "available" and called and not provider["valid"]
    if manifest and called and provider["valid"] and not provider_matches(provider, manifest):
        invalid_provider = True
        reasons.append("TRIAL_MODEL_OR_PROVIDER_MISMATCH")
    if invalid_provider:
        reasons.append("INVALID_LIVE_PROVIDER_OBSERVATION")
    gold_errors = validate_case(case)
    if gold_errors:
        reasons.extend(gold_errors)
    blocked = (
        trace.get("blocker")
        or trace.get("fidelity_diff")
        or trace.get("status") == "BLOCKED"
        or gold_errors
    )
    if runtime.get("change_during_generation"):
        transition = trace.get("transition_outcome") or {}
        committed = transition.get(
            "committed_before_release",
            any(
                t.get("transition_finished_before_release") is True
                for t in trace.get("transition", [])
            ),
        )
        if not transition.get("injected", trace.get("transition_injected")) or not committed:
            blocked = True
            reasons.append("TRANSITION_PREREQUISITE_UNVERIFIED")
    if blocked:
        reasons.append("TRIAL_PREREQUISITE_BLOCKED")
    verdict = (
        "INVALID"
        if invalid_provider or blocked
        else "FAIL"
        if F in dims.values()
        else "UNREVIEWED"
        if U in dims.values()
        else "AUTO_PASS_PENDING_REVIEW"
    )
    return {
        "case_id": case["id"],
        "run": trace.get("run"),
        "stratum": case.get("stratum"),
        "verdict": verdict,
        "dimensions": dims,
        "path": path,
        "action_observed": observed,
        "model_quality_eligible": path == "model" and not invalid_provider and not blocked,
        "provider": provider,
        "latency_ms": response.get("elapsed_ms"),
        "reasons": reasons,
        "rubric_sha256": digest(rubric),
        "human_review": U,
        "llm_calibration": U,
        "semantic_scope": "bounded_typed_facts",
        "measured_readiness": False,
        "readiness": False,
        "failure_origin": "gold_or_fixture"
        if gold_errors or trace.get("fidelity_diff")
        else "environment_or_harness"
        if blocked or invalid_provider
        else "product"
        if verdict == "FAIL"
        else None,
    }
