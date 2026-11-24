"""DEV-450 bounded passage routing contract; provider transport stays mocked."""

import json
from copy import deepcopy

import pytest

from app.ai import source_refine
from app.ai.source_refine import RefineError, Refinement, RefineResponse
from app.source_analysis import inventory_refinement, passage_refinement
from app.source_analysis.source_inventory import build_inventory

REVISIONS = {"source-a": 1}
TARGET = {"id": "target-a", "name": "가상 감귤"}


def candidate(
    candidate_id="c1",
    value="가정용 3kg 상자는 18개예요.",
    *,
    target_id="target-a",
    field="composition",
    source_id="source-a",
    revision=1,
    span="span-1",
    quote=None,
    historical=False,
):
    return {
        "id": candidate_id,
        "targetId": target_id,
        "fieldKey": field,
        "value": value,
        "historical": historical,
        "evidence": [
            {
                "sourceId": source_id,
                "sourceRevision": revision,
                "page": 1,
                "spanIds": [span],
                "quote": quote if quote is not None else value,
            }
        ],
    }


def make_inventory(candidates=None, *, target_id="target-a", revisions=None):
    rows = candidates if candidates is not None else [candidate()]
    return build_inventory(
        rows,
        accepted_candidate_ids=[row["id"] for row in rows],
        target_id=target_id,
        source_revisions=revisions or REVISIONS,
    )


def make_request(candidates=None, *, target=TARGET, revisions=None):
    revisions = revisions or REVISIONS
    inventory = make_inventory(candidates, target_id=target["id"], revisions=revisions)
    return passage_refinement.prepare_request(target, inventory, source_revisions=revisions)


def output_for(request, *, decisions=None, modules=None):
    decisions = decisions or {}
    modules = modules or {}
    assignments = []
    for passage in request["passages"]:
        status = decisions.get(passage["id"], "KEEP" if not passage["requiresReview"] else "REVIEW")
        module = (
            modules.get(passage["id"], passage["permittedModules"][0]) if status == "KEEP" else None
        )
        assignments.append(
            {
                "passageId": passage["id"],
                "status": status,
                "module": module,
                "reason": "" if status == "KEEP" else "Requires human review",
            }
        )
    return {"requestSha256": request["requestSha256"], "assignments": assignments}


def rejects(request, output, *, revisions=REVISIONS):
    with pytest.raises(ValueError, match="Invalid passage writer input or output"):
        passage_refinement.validate_response(request, output, source_revisions=revisions)


def passage_output_from_wire(wire):
    assignments = []
    units = {unit["id"]: unit for unit in wire["units"]}
    for passage in wire["passages"]:
        unit = units[passage["unitId"]]
        keep = not unit["requiresReview"]
        permitted = (
            wire["moduleTaxonomy"]
            if unit["permittedModules"] == "moduleTaxonomy"
            else unit["permittedModules"]
        )
        assignments.append(
            {
                "passageId": passage["id"],
                "status": "KEEP" if keep else "REVIEW",
                "module": permitted[0] if keep else None,
                "reason": "" if keep else "Requires human review",
            }
        )
    return {"requestSha256": wire["requestSha256"], "assignments": assignments}


def test_AC_SRC_10_safe_complete_sentences_can_route_independently_of_field_hint():
    row = candidate(
        value="산들농장은 감귤을 재배해요. 과육이 부드러워요.",
        field="summary",
        span="mixed-span",
    )
    request = make_request([row])
    assert [p["text"].strip() for p in request["passages"]] == [
        "산들농장은 감귤을 재배해요.",
        "과육이 부드러워요.",
    ]
    routes = {
        request["passages"][0]["id"]: "farmStory",
        request["passages"][1]["id"]: "taste",
    }
    result = passage_refinement.validate_response(
        request, output_for(request, modules=routes), source_revisions=REVISIONS
    )
    by_module = {m["module"]: m["texts"][0]["value"].strip() for m in result["modules"]}
    assert by_module == {
        "farmStory": "산들농장은 감귤을 재배해요.",
        "taste": "과육이 부드러워요.",
    }
    assert result["status"] == "COMPLETE"
    assert result["requiresContentReview"] is True
    assert result["statusScope"] == "ASSEMBLY_ACCOUNTING_ONLY"
    assert result["semanticPreservationEstablished"] is False


def test_AC_SRC_10_partitions_reconstruct_exact_source_with_stable_unicode_offsets():
    value = "귤 12.4브릭스예요. 향은 상큼해요."
    request = make_request([candidate(value=value, field="summary", span="unicode-span")])
    passages = request["passages"]
    assert (
        passages
        == passage_refinement.prepare_request(
            TARGET,
            request["inventory"],
            source_revisions=REVISIONS,
        )["passages"]
    )
    assert "12.4브릭스" in "".join(p["text"] for p in passages)
    assert len(passages) == 2
    assert "12.4브릭스" in passages[0]["text"]
    assert all(p["end"] - p["start"] == len(p["text"]) for p in passages)
    assert "".join(p["text"] for p in passages) == value


@pytest.mark.parametrize(
    "value",
    [
        "A상품은 3kg이고 B상품은 5kg입니다. 옵션별 구성 안내예요.",
        "표본 4개의 평균 당도는 9브릭스예요. 향은 상큼해요.",
        "이번 수확분은 약 24개이며 크기에 따라 달라요. 향은 상큼해요.",
        "간혹 나타나는 특징이에요. 껍질에 반점이 생겨요.",
        "씨가 없는 것은 아니에요. 과육은 부드러워요.",
        "상품 정보입니다. 감귤은 4kg이에요.",
    ],
)
def test_AC_SRC_10_context_protected_units_do_not_detach_labels_qualifiers_or_headings(value):
    request = make_request([candidate(value=value, field="summary", span="context-span")])
    assert len(request["passages"]) == 1
    assert request["passages"][0]["text"] == value
    assert request["passages"][0]["contextProtected"] is True


def test_AC_SRC_10_assignments_require_exactly_one_row_per_passage():
    request = make_request(
        [candidate(value="산들농장은 감귤을 재배해요. 과육이 부드러워요.", field="summary")]
    )
    output = output_for(request)
    output["assignments"].pop()
    rejects(request, output)

    output = output_for(request)
    output["assignments"].append(deepcopy(output["assignments"][0]))
    rejects(request, output)

    output = output_for(request)
    output["assignments"][0]["passageId"] = "passage-foreign"
    rejects(request, output)


def test_AC_SRC_10_stale_target_revision_request_and_response_hash_are_rejected():
    inventory = make_inventory()
    with pytest.raises(ValueError):
        passage_refinement.prepare_request(
            {"id": "another-target", "name": "가상 감귤"},
            inventory,
            source_revisions=REVISIONS,
        )
    with pytest.raises(ValueError):
        passage_refinement.prepare_request(TARGET, inventory, source_revisions={"source-a": 2})

    request = passage_refinement.prepare_request(TARGET, inventory, source_revisions=REVISIONS)
    with pytest.raises(ValueError):
        passage_refinement.validate_response(
            request, output_for(request), source_revisions={"source-a": 2}
        )
    altered = deepcopy(request)
    altered["target"]["name"] = "다른 상품"
    rejects(altered, output_for(request))
    bad_hash = output_for(request)
    bad_hash["requestSha256"] = "0" * 64
    rejects(request, bad_hash)


def test_AC_SRC_10_unknown_or_duplicate_passage_identity_is_rejected():
    request = make_request(
        [candidate(value="산들농장은 감귤을 재배해요. 과육이 부드러워요.", field="summary")]
    )
    output = output_for(request)
    output["assignments"][0]["passageId"] = output["assignments"][1]["passageId"]
    rejects(request, output)


def test_AC_SRC_10_invalid_payload_cannot_smuggle_text_or_offsets():
    request = make_request()
    output = output_for(request)
    output["assignments"][0]["text"] = "추가 문장"
    rejects(request, output)
    output = output_for(request)
    output["assignments"][0]["start"] = 0
    rejects(request, output)


def test_AC_SRC_10_module_must_be_permitted_and_review_needs_reason():
    request = make_request()
    output = output_for(request, modules={request["passages"][0]["id"]: "farmPhotos"})
    rejects(request, output)

    output = output_for(request, decisions={request["passages"][0]["id"]: "REVIEW"})
    output["assignments"][0]["reason"] = ""
    rejects(request, output)


def test_AC_SRC_10_wire_projection_retains_shared_parent_and_quote_context():
    value = "산들농장은 감귤을 재배해요. 과육이 부드러워요."
    request = make_request([candidate(value=value, field="summary", span="two-facts")])
    wire = passage_refinement.provider_payload(request)
    parent = wire["units"][0]
    assert parent["parentValue"] == value
    assert parent["quoteContexts"] == [
        {"sourceId": "source-a", "sourceRevision": 1, "page": 1, "quote": value}
    ]
    assert [row["text"] for row in wire["passages"]] == [row["text"] for row in request["passages"]]
    assert all(set(row) == {"id", "unitId", "text"} for row in wire["passages"])
    assert parent["requiresReview"] is False
    assert parent["permittedModules"] == "moduleTaxonomy"
    assert wire["moduleTaxonomy"] == request["moduleTaxonomy"]
    assert "candidates" not in wire and "sourceRefs" not in parent


def test_AC_SRC_10_unsafe_parent_is_never_keepable():
    unsafe = candidate(value="감귤 3kg은 32,000원이에요.", field="composition", span="price-span")
    request = make_request([unsafe])
    passage = request["passages"][0]
    assert passage["requiresReview"] is True
    output = output_for(request, decisions={passage["id"]: "KEEP"})
    rejects(request, output)

    result = source_refine.refine_passages(
        "mock", "fixture", TARGET, request["inventory"], source_revisions=REVISIONS
    )
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["modules"] == []


def test_AC_SRC_10_historical_and_common_units_have_restricted_routes():
    historic = candidate(
        value="농사는 2대째 이어오고 있어요.",
        field="farmStory",
        historical=True,
        span="history-span",
    )
    request = make_request([historic])
    assert request["passages"][0]["permittedModules"] == ["farmStory"]

    common = candidate(
        candidate_id="common",
        target_id=None,
        value="바람뜰 농장은 감귤을 재배해요.",
        field="farmStory",
        span="common-span",
    )
    request = make_request([common])
    passage = request["passages"][0]
    assert passage["requiresReview"] is True
    assert passage["permittedModules"] == ["farmStory", "farmUpdates"]


def test_AC_SRC_10_exclude_and_review_are_accounted_as_review_required():
    request = make_request()
    pid = request["passages"][0]["id"]
    output = output_for(request, decisions={pid: "EXCLUDE"})
    result = passage_refinement.validate_response(request, output, source_revisions=REVISIONS)
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["diagnostics"]["excludedPassageIds"] == [pid]
    assert result["modules"] == []

    output = output_for(request, decisions={pid: "REVIEW"})
    result = passage_refinement.validate_response(request, output, source_revisions=REVISIONS)
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["diagnostics"]["reviewPassageIds"] == [pid]


def test_AC_SRC_10_legacy_safety_rejected_keep_is_incomplete_not_raw_rescued():
    mismatched = candidate(
        value="감귤 4kg 상자예요.",
        field="composition",
        span="mismatch-span",
        quote="감귤 5kg 상자예요.",
    )
    request = make_request([mismatched])
    result = passage_refinement.validate_response(
        request, output_for(request), source_revisions=REVISIONS
    )
    pid = request["passages"][0]["id"]
    assert result["status"] == "INCOMPLETE"
    assert result["modules"] == []
    assert result["allKeptPassagesRetained"] is False
    assert result["diagnostics"]["missingKeptPassageIds"] == [pid]


def test_AC_SRC_10_request_limits_reject_without_prefix_truncation():
    too_many_candidates = [
        candidate(f"c{i}", f"감귤 상자 {i}개예요.", span=f"span-{i}")
        for i in range(passage_refinement.MAX_CANDIDATES + 1)
    ]
    with pytest.raises(ValueError, match="INVENTORY_INPUT_LIMIT"):
        make_request(too_many_candidates)

    too_many_passages = "감귤이에요. " * (passage_refinement.MAX_PASSAGES + 1)
    with pytest.raises(ValueError, match="INVENTORY_INPUT_LIMIT"):
        make_request([candidate(value=too_many_passages, field="summary", span="many-passages")])

    oversized = "감귤 " + "선별" * 1400
    large_candidates = [
        candidate(f"large-{i}", oversized + f" 구분 {i}.", field="summary", span=f"large-span-{i}")
        for i in range(10)
    ]
    with pytest.raises(ValueError, match="INVENTORY_INPUT_LIMIT"):
        make_request(large_candidates)


def test_AC_SRC_10_mock_is_deterministic_immutable_and_reports_accounting_only():
    rows = [candidate(value="산들농장은 감귤을 재배해요. 과육이 부드러워요.", field="summary")]
    before_rows = deepcopy(rows)
    inventory = make_inventory(rows)
    before_inventory = deepcopy(inventory)
    result = source_refine.refine_passages(
        "mock", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    assert rows == before_rows
    assert inventory == before_inventory
    assert result["status"] == "COMPLETE"
    assert result["requiresContentReview"] is True
    assert result["statusScope"] == "ASSEMBLY_ACCOUNTING_ONLY"
    assert result["usage"] == {"mock": True}
    assert result == source_refine.refine_passages(
        "mock", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )


def test_AC_SRC_10_private_source_is_blocked_before_transport_and_usage_is_returned(monkeypatch):
    called = []

    def transport(mode, model, *, payload, prompt, output_type, schema):
        called.append((payload, prompt, output_type, schema))
        wire = json.loads(payload)
        parsed = output_type.model_validate(passage_output_from_wire(wire))
        return RefineResponse(parsed, {"fixtureUsage": 7}, "passage-request")

    monkeypatch.setattr(source_refine, "_refine_transport", transport)
    private = candidate(
        candidate_id="private-candidate-id",
        value="연락처 010-1234-5678",
        field="support",
        span="private-span-id",
    )
    private_inventory = make_inventory([private])
    with pytest.raises(RefineError) as error:
        source_refine.refine_passages(
            "openai", "fixture", TARGET, private_inventory, source_revisions=REVISIONS
        )
    assert error.value.code == "PRIVATE_SOURCE"
    assert called == []

    inventory = make_inventory()
    result = source_refine.refine_passages(
        "openai", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    assert len(called) == 1
    assert called[0][1] == source_refine.PASSAGE_PROMPT
    assert called[0][2] is passage_refinement.PassageOutput
    assert result["usage"] == {"fixtureUsage": 7}
    assert result["requestId"] == "passage-request"


def test_AC_SRC_10_transport_adapter_preserves_default_v11_and_literal_entries(monkeypatch):
    seen = []

    def transport(mode, model, *, payload, prompt, output_type, schema):
        seen.append((prompt, output_type))
        if output_type is passage_refinement.PassageOutput:
            parsed = output_type.model_validate(passage_output_from_wire(json.loads(payload)))
        elif output_type is inventory_refinement.InventoryOutput:
            parsed = output_type.model_validate(
                inventory_refinement.mock_output(json.loads(payload))
            )
        else:
            parsed = Refinement(modules=[])
        return RefineResponse(parsed, {"fixture": True}, "request")

    monkeypatch.setattr(source_refine, "_refine_transport", transport)
    inventory = make_inventory()
    source_refine.refine("openai", "fixture", TARGET, [candidate()])
    source_refine.refine_inventory(
        "openai", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    source_refine.refine_passages(
        "openai", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    assert source_refine.PROMPT_VERSION == "source-refine-v11-routing"
    assert source_refine.PROMPT in [prompt for prompt, _ in seen]
    assert source_refine.INVENTORY_PROMPT in [prompt for prompt, _ in seen]
    assert source_refine.PASSAGE_PROMPT in [prompt for prompt, _ in seen]
    assert [kind for _, kind in seen] == [
        Refinement,
        inventory_refinement.InventoryOutput,
        passage_refinement.PassageOutput,
    ]
