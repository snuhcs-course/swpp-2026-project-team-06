"""DEV-450 bounded source inventory writer contract; all calls remain local fixtures."""

import json
from copy import deepcopy

import pytest

from app.ai import source_refine
from app.ai.source_refine import RefineError, Refinement, RefineResponse
from app.source_analysis import inventory_refinement
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
):
    return {
        "id": candidate_id,
        "targetId": target_id,
        "fieldKey": field,
        "value": value,
        "historical": False,
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
    rows = [candidate()] if candidates is None else candidates
    return build_inventory(
        rows,
        accepted_candidate_ids=[row["id"] for row in rows],
        target_id=target_id,
        source_revisions=revisions or REVISIONS,
    )


def make_request(candidates=None, *, target=TARGET, revisions=None):
    revisions = revisions or REVISIONS
    inventory = make_inventory(
        candidates,
        target_id=target["id"],
        revisions=revisions,
    )
    return inventory_refinement.prepare_request(target, inventory, source_revisions=revisions)


def output_for(request, *, statuses=None, module_overrides=None):
    statuses = statuses or {}
    module_overrides = module_overrides or {}
    units = request["inventory"]["units"]
    dispositions, modules = [], {}
    for unit in units:
        status = statuses.get(unit["id"], "KEEP" if unit["status"] == "PRESERVED" else "REVIEW")
        module = (
            module_overrides.get(unit["id"], unit["permittedModules"][0])
            if status == "KEEP"
            else None
        )
        dispositions.append(
            {
                "unitId": unit["id"],
                "status": status,
                "module": module,
                "reason": "" if status == "KEEP" else "Needs human review",
            }
        )
        if status == "KEEP":
            modules.setdefault(module, []).append({"value": unit["value"], "unitIds": [unit["id"]]})
    return {
        "requestSha256": request["requestSha256"],
        "modules": [{"module": name, "texts": texts} for name, texts in modules.items()],
        "dispositions": dispositions,
    }


def rejects(request, output, *, revisions=REVISIONS):
    with pytest.raises(ValueError, match="Invalid inventory writer input or output"):
        inventory_refinement.validate_response(request, output, source_revisions=revisions)


def test_AC_SRC_10_mock_preserves_complete_qualifiers_and_does_not_mutate_inputs():
    row = candidate(
        value="약 24개이며 크기에 따라 달라요.",
        field="pieceCount",
        span="count-span",
    )
    rows_before = deepcopy([row])
    inventory = make_inventory([row])
    inventory_before = deepcopy(inventory)

    result = source_refine.refine_inventory(
        "mock", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )

    assert [row] == rows_before
    assert inventory == inventory_before
    assert result["status"] == "COMPLETE"
    assert result["coverageComplete"] is True
    assert result["allKeptUnitsRetained"] is True
    assert result["semanticPreservationEstablished"] is False
    assert result["requiresContentReview"] is True
    assert result["statusScope"] == "ASSEMBLY_ACCOUNTING_ONLY"
    assert result["modules"] == [
        {"module": "pieceCount", "texts": [{"value": row["value"], "candidateIds": [row["id"]]}]}
    ]


def test_AC_SRC_10_whitespace_runs_are_allowed_but_token_boundaries_are_not_removed():
    request = make_request()
    output = output_for(request)
    output["modules"][0]["texts"][0]["value"] = "가정용   3kg 상자는 18개예요."
    result = inventory_refinement.validate_response(request, output, source_revisions=REVISIONS)
    assert result["status"] == "COMPLETE"

    output["modules"][0]["texts"][0]["value"] = "가정용 3 kg 상자는 18개예요."
    # Whitespace may vary, but adding a token boundary inside a value is not
    # equivalent to the accepted source unit.
    rejects(request, output)


@pytest.mark.parametrize(
    "replacement",
    [
        "가정용 3kg 상자는 18개예요. 추가 설명이에요.",
        "가정용 상자는 18개예요.",
        "가정용 3kg 상자는 19개예요.",
    ],
)
def test_AC_SRC_10_writer_cannot_add_shorten_or_change_a_unit(replacement):
    request = make_request()
    output = output_for(request)
    output["modules"][0]["texts"][0]["value"] = replacement
    rejects(request, output)


def test_AC_SRC_10_two_option_units_cannot_be_reordered_or_joined_with_foreign_unit():
    rows = [
        candidate("c1", "가정용 3kg 상자는 18개예요.", span="span-1"),
        candidate("c2", "선물용 5kg 상자는 29개예요.", span="span-2"),
    ]
    request = make_request(rows)
    valid = output_for(request)
    joined = {
        "value": "\n".join(unit["value"] for unit in request["inventory"]["units"]),
        "unitIds": [unit["id"] for unit in request["inventory"]["units"]],
    }
    valid["modules"] = [{"module": "composition", "texts": [joined]}]
    assert (
        inventory_refinement.validate_response(request, valid, source_revisions=REVISIONS)["status"]
        == "COMPLETE"
    )

    reversed_output = deepcopy(valid)
    reversed_output["modules"][0]["texts"][0]["value"] = "\n".join(
        reversed([unit["value"] for unit in request["inventory"]["units"]])
    )
    rejects(request, reversed_output)

    foreign_output = deepcopy(valid)
    foreign_output["modules"][0]["texts"][0]["unitIds"][0] = "unit-foreign"
    rejects(request, foreign_output)


@pytest.mark.parametrize(
    "mutation", ["missing_disposition", "duplicate_disposition", "foreign_disposition"]
)
def test_AC_SRC_10_dispositions_must_cover_each_current_unit_once(mutation):
    request = make_request(
        [
            candidate("c1", "가정용 3kg 상자는 18개예요.", span="span-1"),
            candidate("c2", "선물용 5kg 상자는 29개예요.", span="span-2"),
        ]
    )
    output = output_for(request)
    if mutation == "missing_disposition":
        output["dispositions"].pop()
    elif mutation == "duplicate_disposition":
        output["dispositions"].append(deepcopy(output["dispositions"][0]))
    else:
        output["dispositions"][0]["unitId"] = "unit-foreign"
    rejects(request, output)


@pytest.mark.parametrize("mutation", ["missing_keep_text", "duplicate_unit_use", "wrong_module"])
def test_AC_SRC_10_keep_units_need_one_cited_text_in_the_permitted_module(mutation):
    request = make_request(
        [
            candidate("c1", "가정용 3kg 상자는 18개예요.", span="span-1"),
            candidate("c2", "선물용 5kg 상자는 29개예요.", span="span-2"),
        ]
    )
    output = output_for(request)
    if mutation == "missing_keep_text":
        output["modules"][0]["texts"].pop()
        output["modules"] = [m for m in output["modules"] if m["texts"]]
    elif mutation == "duplicate_unit_use":
        output["modules"][0]["texts"].append(deepcopy(output["modules"][0]["texts"][0]))
    else:
        output["modules"][0]["module"] = "summary"
    rejects(request, output)


def test_AC_SRC_10_stale_revision_target_request_and_response_hash_are_rejected():
    row = candidate()
    inventory = make_inventory([row])
    with pytest.raises(ValueError):
        inventory_refinement.prepare_request(
            {"id": "another-target", "name": "가상 감귤"},
            inventory,
            source_revisions=REVISIONS,
        )
    with pytest.raises(ValueError):
        inventory_refinement.prepare_request(TARGET, inventory, source_revisions={"source-a": 2})

    request = inventory_refinement.prepare_request(TARGET, inventory, source_revisions=REVISIONS)
    with pytest.raises(ValueError):
        inventory_refinement.validate_response(
            request, output_for(request), source_revisions={"source-a": 2}
        )
    tampered_request = deepcopy(request)
    tampered_request["target"]["name"] = "다른 상품"
    rejects(tampered_request, output_for(request))
    bad_hash = output_for(request)
    bad_hash["requestSha256"] = "0" * 64
    rejects(request, bad_hash)


def test_AC_SRC_10_review_and_exclude_are_explicit_nonpublishable_outcomes():
    common = candidate(
        target_id=None,
        field="farmStory",
        value="바람뜰 농장은 감귤을 재배해요.",
        span="common-span",
    )
    request = make_request([common])
    result = source_refine.refine_inventory(
        "mock", "fixture", TARGET, request["inventory"], source_revisions=REVISIONS
    )
    unit_id = request["inventory"]["units"][0]["id"]
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["diagnostics"]["reviewUnitIds"] == [unit_id]
    assert result["modules"] == []

    request = make_request()
    output = output_for(request, statuses={request["inventory"]["units"][0]["id"]: "EXCLUDE"})
    result = inventory_refinement.validate_response(request, output, source_revisions=REVISIONS)
    assert result["status"] == "REVIEW_REQUIRED"
    assert result["diagnostics"]["excludedUnitIds"] == [request["inventory"]["units"][0]["id"]]
    assert result["modules"] == []


def test_AC_SRC_10_private_source_is_blocked_before_nonmock_transport(monkeypatch):
    called = False

    def transport(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("transport must not receive private source strings")

    monkeypatch.setattr(source_refine, "_refine_transport", transport)
    private = candidate(candidate_id="private-source-id", span="private-span-id")
    private["evidence"][0]["quote"] = "연락처 010-1234-5678"
    inventory = make_inventory([private])
    with pytest.raises(RefineError) as error:
        source_refine.refine_inventory(
            "openai", "fixture", TARGET, inventory, source_revisions=REVISIONS
        )
    assert error.value.code == "PRIVATE_SOURCE"
    assert called is False


def test_AC_SRC_10_final_legacy_safety_rejection_is_incomplete_without_raw_rescue():
    unsafe = candidate(
        value="감귤 4kg 상자예요.",
        field="composition",
        span="kg-span",
        quote="감귤 5kg 상자예요.",
    )
    request = make_request([unsafe])
    result = inventory_refinement.validate_response(
        request, output_for(request), source_revisions=REVISIONS
    )
    unit_id = request["inventory"]["units"][0]["id"]
    assert result["status"] == "INCOMPLETE"
    assert result["modules"] == []
    assert result["allKeptUnitsRetained"] is False
    assert result["diagnostics"]["missingKeptUnitIds"] == [unit_id]


def test_AC_SRC_10_request_limits_fail_without_prefix_truncation():
    many = [
        candidate(f"c{i}", f"감귤 상자 {i}개예요.", span=f"span-{i}")
        for i in range(inventory_refinement.MAX_CANDIDATES + 1)
    ]
    with pytest.raises(ValueError, match="INVENTORY_INPUT_LIMIT"):
        make_request(many)

    long_value = "감귤 " + "선별" * 1400
    large = [candidate(f"large-{i}", long_value, span=f"long-span-{i}") for i in range(10)]
    with pytest.raises(ValueError, match="INVENTORY_INPUT_LIMIT"):
        make_request(large)


def test_AC_SRC_10_provider_transport_is_stubbed_and_default_v11_path_is_unchanged(monkeypatch):
    captured = []

    def transport(mode, model, *, payload, prompt, output_type, schema):
        captured.append((mode, model, payload, prompt, output_type, schema))
        if output_type is inventory_refinement.InventoryOutput:
            request = json.loads(payload)
            raw = inventory_refinement.mock_output(request)
            parsed = output_type.model_validate(raw)
        else:
            parsed = Refinement(modules=[])
        return RefineResponse(parsed, {"fixture": True}, "fixture-request")

    monkeypatch.setattr(source_refine, "_refine_transport", transport)
    inventory = make_inventory()
    explicit = source_refine.refine_inventory(
        "openai", "fixture-model", TARGET, inventory, source_revisions=REVISIONS
    )
    legacy = source_refine.refine("openai", "fixture-model", TARGET, [candidate()])

    assert explicit["status"] == "COMPLETE"
    assert explicit["usage"] == {"fixture": True}
    assert explicit["requestId"] == "fixture-request"
    assert legacy.refinement.modules == []
    assert source_refine.PROMPT_VERSION == "source-refine-v11-routing"
    assert len(captured) == 2
    assert captured[0][3] == source_refine.INVENTORY_PROMPT
    assert captured[0][4] is inventory_refinement.InventoryOutput
    assert json.loads(captured[0][2])["writerVersion"] == inventory_refinement.WRITER_VERSION
    assert captured[1][3] == source_refine.PROMPT
    assert captured[1][4] is Refinement


def test_AC_SRC_10_nonmock_transport_invalid_output_fails_without_success(monkeypatch):
    request = make_request()

    def transport(mode, model, *, payload, prompt, output_type, schema):
        raw = output_for(request)
        raw["requestSha256"] = "0" * 64
        return RefineResponse(output_type.model_validate(raw), {"fixture": True}, "bad-output")

    monkeypatch.setattr(source_refine, "_refine_transport", transport)
    with pytest.raises(RefineError) as error:
        source_refine.refine_inventory(
            "openai", "fixture-model", TARGET, request["inventory"], source_revisions=REVISIONS
        )
    assert error.value.code == "INVALID_MODEL_OUTPUT"
    assert error.value.request_id == "bad-output"


def test_AC_SRC_10_true_empty_inventory_still_requires_content_review():
    inventory = make_inventory([])
    result = source_refine.refine_inventory(
        "mock", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    assert result["status"] == "EMPTY"
    assert result["modules"] == []
    assert result["requiresContentReview"] is True


def test_AC_SRC_10_complete_accounting_is_not_product_relevance_approval():
    inventory = make_inventory([candidate(value="도예 교실을 운영해요.", field="farmStory")])
    result = source_refine.refine_inventory(
        "mock", "fixture", TARGET, inventory, source_revisions=REVISIONS
    )
    assert result["status"] == "COMPLETE"
    assert result["statusScope"] == "ASSEMBLY_ACCOUNTING_ONLY"
    assert result["requiresContentReview"] is True
    assert result["semanticPreservationEstablished"] is False
