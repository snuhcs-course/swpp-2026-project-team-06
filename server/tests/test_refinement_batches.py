"""Behavioral contracts for bounded refinement; providers are always local stubs."""

import json

import pytest

from app.ai.source_refine import RefineError, Refinement, RefineResponse
from app.source_analysis.refinement import refine_candidates


# This suite needs neither the shared database schema nor seed fixtures.
@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def candidate(index, value="향이 진하고 부드러워요"):
    return {
        "id": f"c{index}",
        "targetId": "target",
        "fieldKey": "summary",
        "value": value,
        "historical": False,
        "evidence": [{"page": 1, "spanIds": [f"span{index}"], "quote": value}],
    }


def response(texts, *, cost=0.25, request_id="stub-request"):
    return RefineResponse(
        refinement=Refinement(
            modules=[{"module": "summary", "texts": texts}] if texts else [],
            excluded=[],
        ),
        usage={} if cost is None else {"cost": cost},
        request_id=request_id,
    )


def invoke(source, call, mode="live"):
    return refine_candidates(mode, "fixture", {"id": "target"}, source, call, target_count=1)


def all_texts(modules):
    return [text for module in modules for text in module["texts"]]


def echoed(safe):
    return [{"value": row["value"], "candidateIds": [row["id"]]} for row in safe]


@pytest.mark.parametrize("count", [41, 81])
def test_all_candidates_reach_bounded_requests_in_source_order(count):
    source = [candidate(i) for i in range(count)]
    seen = []

    def call(index, safe, fn):
        assert len(safe) <= 40
        assert len(json.dumps(safe, ensure_ascii=False)) <= 16000
        seen.extend(row["id"] for row in safe)
        return response(echoed(safe))

    modules, diagnostics, usage, request_id = invoke(source, call)
    assert seen == [row["id"] for row in source]
    assert {cid for text in all_texts(modules) for cid in text["candidateIds"]} == set(seen)


def test_serialized_size_limit_preserves_remaining_candidates():
    source = [candidate(i, "향" * 600) for i in range(35)]
    batches = []

    def call(index, safe, fn):
        assert len(safe) <= 40
        assert len(json.dumps(safe, ensure_ascii=False)) <= 16000
        batches.append([row["id"] for row in safe])
        return response([])

    invoke(source, call)
    assert len(batches) > 1
    assert [cid for batch in batches for cid in batch] == [row["id"] for row in source]


def test_oversized_candidate_does_not_starve_later_valid_candidates():
    source = [candidate(0, "향" * 17000), candidate(1)]
    sent = []

    def call(index, safe, fn):
        sent.extend(row["id"] for row in safe)
        return response(echoed(safe))

    modules, diagnostics, _, _ = invoke(source, call)
    assert sent == ["c1"]
    assert all_texts(modules)[0]["candidateIds"] == ["c1"]
    assert "c0" in {cid for row in diagnostics["excluded"] for cid in row["candidateIds"]}
    assert any(
        row["reason"] in {"skipped", "unused"} and "c0" in row["candidateIds"]
        for row in diagnostics["excluded"]
    )


def test_response_cannot_cite_another_requests_candidate():
    source = [candidate(i) for i in range(41)]
    calls = []

    def call(index, safe, fn):
        calls.append(safe)
        foreign_id = "c40" if safe[0]["id"] == "c0" else "c0"
        return response([{"value": "향이 진하고 부드러워요", "candidateIds": [foreign_id]}])

    modules, diagnostics, _, _ = invoke(source, call)
    assert len(calls) >= 2
    assert all_texts(modules) == []
    assert diagnostics["rejectedCount"] >= 2


def test_duplicate_texts_merge_candidate_ids_in_source_order():
    source = [candidate(i) for i in range(81)]
    modules, _, _, _ = invoke(source, lambda index, safe, fn: response(echoed(safe)))
    assert all_texts(modules) == [
        {
            "value": source[0]["value"],
            "candidateIds": [row["id"] for row in source],
        }
    ]


def test_merged_module_retains_total_text_and_citation_limits():
    source = [
        candidate(i, letter * 1100)
        for i, letter in enumerate("가나다라마바사아자차카타파하" + "거너더러머버서")
    ]

    def call(index, safe, fn):
        return response(echoed(safe[:1]))

    modules, _, _, _ = invoke(source, call)
    assert modules
    assert "c0" in {cid for text in all_texts(modules) for cid in text["candidateIds"]}
    for module in modules:
        assert sum(len(text["value"]) for text in module["texts"]) <= 3000
        assert len(module["texts"]) <= 100
        assert all(len(text["candidateIds"]) <= 100 for text in module["texts"])


def test_duplicate_text_merge_does_not_exceed_citation_limit():
    source = [candidate(i) for i in range(121)]
    try:
        modules, _, _, _ = invoke(source, lambda index, safe, fn: response(echoed(safe)))
    except RefineError as error:
        assert error.code == "INVALID_MODEL_OUTPUT"
        return
    texts = all_texts(modules)
    assert len(texts) == 1
    assert all(len(text["candidateIds"]) <= 100 for text in texts)


def test_request_failure_propagates_without_processing_later_requests():
    source = [candidate(i) for i in range(121)]
    calls = []
    failure = RuntimeError("provider unavailable")

    def call(index, safe, fn):
        calls.append(index)
        if len(calls) == 2:
            raise failure
        return response(echoed(safe))

    with pytest.raises(RuntimeError, match="provider unavailable") as caught:
        invoke(source, call)
    assert caught.value is failure
    assert len(calls) == 2


def test_empty_input_never_calls_provider():
    def call(*args):
        pytest.fail("Empty candidates must not invoke a provider")

    modules, _, _, _ = invoke([], call)
    assert modules == []


def test_usage_sums_cost_across_all_requests():
    costs = []

    def call(index, safe, fn):
        costs.append(0.25)
        return response([], cost=0.25)

    _, _, usage, _ = invoke([candidate(i) for i in range(81)], call)
    assert len(costs) >= 3
    assert usage["cost"] == pytest.approx(sum(costs))


def test_unknown_request_cost_is_not_reported_as_complete_known_total():
    costs = []

    def call(index, safe, fn):
        cost = None if not costs else 0.25
        costs.append(cost)
        return response([], cost=cost)

    _, _, usage, _ = invoke([candidate(i) for i in range(41)], call)
    assert len(costs) >= 2
    assert usage.get("cost") is None


def test_every_request_redacts_candidate_and_quote_private_values():
    private = "010-1234-5678"
    source = [candidate(i, f"향이 진해요 연락처 {private}") for i in range(41)]
    sent = []

    def call(index, safe, fn):
        sent.extend(safe)
        for row in safe:
            assert private not in row["value"]
            assert all(private not in evidence["quote"] for evidence in row["evidence"])
        return response([])

    invoke(source, call)
    assert [row["id"] for row in sent] == [row["id"] for row in source]
    assert all(private in row["value"] for row in source)


def test_mock_processes_multiple_batches_without_live_callback():
    source = [candidate(i) for i in range(81)]

    def call(*args):
        pytest.fail("Mock refinement must not call the live provider callback")

    modules, diagnostics, _, _ = invoke(source, call, mode="mock")
    covered = {cid for text in all_texts(modules) for cid in text["candidateIds"]}
    covered.update(cid for row in diagnostics["excluded"] for cid in row["candidateIds"])
    assert covered == {row["id"] for row in source}


def test_provider_failure_retains_successful_and_failed_request_usage():
    source = [candidate(i) for i in range(81)]
    calls = []

    def call(index, safe, fn):
        calls.append(index)
        if len(calls) == 2:
            raise RefineError(
                "REQUEST_UNCERTAIN",
                usage={"cost": 0.2, "prompt_tokens": 2},
                request_id="failed-request",
            )
        result = response(echoed(safe), cost=0.3)
        result.usage["prompt_tokens"] = 3
        return result

    with pytest.raises(RefineError) as caught:
        invoke(source, call)
    assert caught.value.code == "REQUEST_UNCERTAIN"
    assert caught.value.usage["cost"] == pytest.approx(0.5)
    assert caught.value.usage["prompt_tokens"] == 5
    assert caught.value.request_id == "failed-request"
    assert len(calls) == 2
