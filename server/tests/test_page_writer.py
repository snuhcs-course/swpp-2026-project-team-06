import json
from types import SimpleNamespace

import pytest

from app.ai import page_writer
from app.ai.page_plan import build_page_plan
from app.ai.source_refine import provider_schema


def inputs():
    return [
        {
            "id": "c",
            "targetId": "p",
            "fieldKey": "qualityEvidence",
            "historical": False,
            "value": "표본 12Brix입니다. 보장값은 아닙니다.",
            "evidence": [{"quote": "표본 12Brix입니다. 보장값은 아닙니다."}],
        }
    ]


def page():
    units = build_page_plan(inputs())["sourceUnits"]
    return {
        "decisions": [
            {
                "unitId": u["id"],
                "outputs": [
                    {"module": "qualityEvidence", "value": u["text"], "sourceUnitIds": [u["id"]]}
                ],
                "excludedReasons": [],
            }
            for u in units
        ]
    }


def test_AC_SRC_2_unit_writer_preserves_conditions_and_provenance():
    result = page_writer.convert(page_writer.UnitPage.model_validate(page()), inputs())
    assert [t.value for t in result.modules[0].texts] == [
        "표본 12Brix입니다.",
        "보장값은 아닙니다.",
    ]
    assert all(t.candidate_ids == ["c"] for t in result.modules[0].texts)


@pytest.mark.parametrize("change", ["missing", "duplicate", "foreign", "empty", "uncited"])
def test_AC_SRC_3_unit_writer_rejects_incomplete_or_foreign_accounting(change):
    data = page()
    if change == "missing":
        data["decisions"].pop()
    elif change == "duplicate":
        data["decisions"].append(data["decisions"][0])
    elif change == "foreign":
        data["decisions"][0]["outputs"][0]["sourceUnitIds"] = ["foreign"]
    elif change == "empty":
        data["decisions"][0]["outputs"] = []
    else:
        data["decisions"][0]["outputs"][0]["sourceUnitIds"] = [data["decisions"][1]["unitId"]]
    with pytest.raises(ValueError):
        page_writer.convert(page_writer.UnitPage.model_validate(data), inputs())


def test_AC_SRC_3_unit_writer_requires_reason_for_exclusion():
    data = page()
    data["decisions"][1]["outputs"] = []
    data["decisions"][1]["excludedReasons"] = ["unsupported"]
    result = page_writer.convert(page_writer.UnitPage.model_validate(data), inputs())
    assert result.excluded[0].reason == "unsupported"
    schema = provider_schema(page_writer.UnitPage)
    assert schema["required"] == ["decisions"]
    assert "qualityEvidence" in schema["$defs"]["UnitText"]["properties"]["module"]["enum"]


@pytest.mark.parametrize("complete", [True, False])
def test_AC_SRC_10_unit_provider_keeps_usage_when_accounting_fails(monkeypatch, complete):
    from app.ai import source_refine

    data, requests, closed = page(), [], []
    if not complete:
        data["decisions"].pop()

    def send(**kwargs):
        requests.append(kwargs)
        return SimpleNamespace(
            id="paid-request",
            usage=SimpleNamespace(model_dump=lambda: {"cost": 0.001}),
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(content=json.dumps(data, ensure_ascii=False)),
                )
            ],
        )

    fake = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=send)),
        close=lambda: closed.append(True),
    )
    monkeypatch.setattr(source_refine.provider, "OpenAI", lambda **kwargs: fake)
    if complete:
        response = page_writer.refine(
            "openrouter", "google/gemini-3-flash-preview", {"id": "p"}, inputs()
        )
        assert response.usage == {"cost": 0.001}
        assert response.request_id == "paid-request"
        assert response.refinement.modules[0].texts[1].value == "보장값은 아닙니다."
    else:
        with pytest.raises(source_refine.RefineError) as error:
            page_writer.refine("openrouter", "google/gemini-3-flash-preview", {"id": "p"}, inputs())
        assert error.value.usage == {"cost": 0.001}
        assert error.value.request_id == "paid-request"
    assert requests[0]["response_format"]["json_schema"]["schema"]["required"] == ["decisions"]
    assert closed == [True]
