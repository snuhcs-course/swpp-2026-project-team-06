"""AC-SRC-2/3/5: isolated block experiment controls, no provider/DB calls."""

import json
from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.ai import source_analysis as adapter
from app.ai.source_blocks import BLOCK_PROMPT, BlockExtraction, materialize_blocks
from app.source_analysis import block_experiment as experiment
from app.source_analysis.schemas import Extraction


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Real provider/DB access is forbidden")

    monkeypatch.setattr(adapter, "OpenAI", forbidden)
    monkeypatch.setattr(experiment, "get_sessionmaker", forbidden)
    yield


def input_data():
    return {
        "version": 1,
        "split": "development",
        "sources": [
            {
                "id": "synthetic",
                "format": "text",
                "target": {"id": "target", "name": "합성 감귤"},
                "chunk": {
                    "sourceId": "synthetic",
                    "sourceRevision": 2,
                    "pages": [
                        {
                            "number": 1,
                            "spans": [
                                {"id": "s0", "text": "지난해 실속형 감귤 3kg"},
                                {"id": "s1", "text": "수량 : 9~17과 (크기는 다를 수 있음)"},
                            ],
                        }
                    ],
                },
            }
        ],
    }


def response(*, target="target", field="composition"):
    return {
        "blocks": [
            {
                "id": "option",
                "kind": "OPTION",
                "targetId": target,
                "fieldKey": field,
                "historical": True,
                "refs": [{"page": 1, "spanIds": ["s0", "s1"]}],
                "reviewReasons": [],
            }
        ],
        "exclusions": [],
    }


@pytest.mark.parametrize("split", [None, "holdout", "test", "validation"])
def test_AC_SRC_5_prepare_requires_explicit_development_split(split):
    data = input_data()
    data["split"] = split
    with pytest.raises(ValueError, match="DEVELOPMENT_INPUT_REQUIRED"):
        experiment.prepare(data)


def test_AC_SRC_5_prepare_preserves_frozen_source_and_rejects_duplicate_spans():
    data = input_data()
    original = deepcopy(data)
    assert experiment.prepare(data) == data["sources"]
    assert data == original
    data["sources"][0]["chunk"]["pages"][0]["spans"].append({"id": "s0", "text": "중복"})
    with pytest.raises(ValueError, match="DUPLICATE_SOURCE_SPAN"):
        experiment.prepare(data)


@pytest.mark.parametrize("location", ["source", "target"])
def test_AC_SRC_3_prepare_rejects_unscrubbed_contacts(location):
    data = input_data()
    row = data["sources"][0]
    if location == "source":
        row["chunk"]["pages"][0]["spans"][0]["text"] = "문의 fixture@example.com"
    else:
        row["target"]["name"] = "fixture@example.com"
    with pytest.raises(ValueError, match="UNSCRUBBED_INPUT"):
        experiment.prepare(data)


def test_AC_SRC_2_conversion_retains_exact_passages_and_historical_flag():
    row = input_data()["sources"][0]
    materialized = materialize_blocks(response(), row["chunk"], [row["target"]])
    output = experiment.convert_result(materialized, row["chunk"], row["target"])
    assert output["acceptedSourceSpans"] == 2
    assert output["validation"]["rejectedCount"] == 0
    candidate = output["acceptedCandidates"][0]
    assert candidate["historical"] is True
    assert candidate["fieldKey"] == "composition"
    exact = "지난해 실속형 감귤 3kg\n수량 : 9~17과 (크기는 다를 수 있음)"
    assert candidate["value"] == exact
    passage = output["plan"]["passages"][0]
    assert passage["value"] == passage["originalValue"] == exact
    assert passage["evidence"] == candidate["evidence"]
    assert passage["includedInDraft"] is True
    assert passage["reasonCodes"]["OWNER_CONFIRMATION"]


def test_AC_SRC_3_rejected_block_lowers_accepted_coverage_without_erasing_ledger():
    row = input_data()["sources"][0]
    materialized = materialize_blocks(response(), row["chunk"], [row["target"]])
    materialized["candidates"][0]["value"] += " 999kg"
    output = experiment.convert_result(materialized, row["chunk"], row["target"])
    assert materialized["coverage"]["missing"] == []
    assert len(output["materialized"]["blocks"]) == 1
    assert output["acceptedCandidates"] == []
    assert output["acceptedSourceSpans"] == 0
    assert output["validation"]["rejected"][0]["code"] == "UNSUPPORTED_NUMBER"


@pytest.mark.parametrize(
    "target,field", [(None, "farmStory"), ("foreign", "farmStory"), ("target", None)]
)
def test_AC_SRC_3_unknown_routing_stays_in_ledger(target, field):
    row = input_data()["sources"][0]
    materialized = materialize_blocks(
        response(target=target, field=field), row["chunk"], [row["target"]]
    )
    output = experiment.convert_result(materialized, row["chunk"], row["target"])
    assert output["acceptedCandidates"] == []
    assert output["acceptedSourceSpans"] == 0
    assert output["materialized"]["coverage"]["unrouted"]
    assert output["materialized"]["blocks"][0]["value"]


def test_AC_SRC_5_provider_schema_defaults_unchanged_and_alternative_strict():
    assert adapter.provider_schema() == adapter.provider_schema(Extraction)
    assert set(adapter.provider_schema()["properties"]) == {"candidates", "photoRequests"}
    schema = adapter.provider_schema(BlockExtraction)
    assert set(schema["properties"]) == {"blocks", "exclusions"}
    assert schema["additionalProperties"] is False
    assert schema["$defs"]["SourceBlock"]["additionalProperties"] is False
    assert "value" not in schema["$defs"]["SourceBlock"]["properties"]


def test_AC_SRC_5_alternative_mock_schema_and_invalid_reasoning_reject_before_transport():
    with pytest.raises(adapter.ExtractionError, match="UNSUPPORTED_MOCK_SCHEMA"):
        adapter.extract("mock", "unused", {}, [], [], output_model=BlockExtraction)
    with pytest.raises(adapter.ExtractionError, match="UNSUPPORTED_REASONING_EFFORT"):
        adapter.extract("openrouter", "unused", {}, [], [], reasoning_effort="high")


@pytest.mark.parametrize("effort", [None, "low", "medium"])
@pytest.mark.parametrize("output_model", [Extraction, BlockExtraction])
def test_AC_SRC_5_mocked_openrouter_uses_requested_schema_and_reasoning(
    monkeypatch, effort, output_model
):
    row = input_data()["sources"][0]
    payload = (
        response() if output_model is BlockExtraction else {"candidates": [], "photoRequests": []}
    )
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            id="fixture-request",
            usage=None,
            choices=[
                SimpleNamespace(
                    finish_reason="stop", message=SimpleNamespace(content=json.dumps(payload))
                )
            ],
        )

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create)), close=lambda: None
    )
    monkeypatch.setattr(adapter, "OpenAI", lambda **kwargs: client)
    output = adapter.extract(
        "openrouter",
        "openai/gpt-6.1-sol",
        row["chunk"],
        [row["target"]],
        [],
        output_model=output_model,
        reasoning_effort=effort,
        prompt=BLOCK_PROMPT if output_model is BlockExtraction else adapter.PROMPT,
    )
    assert isinstance(output.extraction, output_model)
    assert captured["response_format"]["json_schema"]["schema"] == adapter.provider_schema(
        output_model
    )
    assert captured["extra_body"]["reasoning"] == {"effort": effort or "low", "exclude": True}
    assert captured["extra_body"]["provider"]["allow_fallbacks"] is False
    sent = json.loads(captured["messages"][1]["content"][0]["text"])
    assert sent == {"targets": [row["target"]], "source": row["chunk"]}


def test_AC_SRC_5_mocked_runner_sends_only_frozen_source_and_target_without_gold(
    monkeypatch, tmp_path
):
    data = input_data()
    data["gold"] = {"privateExpectedFacts": ["DO_NOT_SEND_GOLD"]}
    data["sources"][0]["gold"] = {"expected": "DO_NOT_SEND_GOLD"}
    path = tmp_path / "input.json"
    path.write_text(json.dumps(data))
    captured = []

    def extract(mode, model, chunk, targets, images, **kwargs):
        captured.append({"source": chunk, "targets": targets, "kwargs": kwargs})
        assert "DO_NOT_SEND_GOLD" not in json.dumps(
            {"source": chunk, "targets": targets, "prompt": kwargs["prompt"]}
        )
        return adapter.ExtractionResponse(
            BlockExtraction.model_validate(response()), {"cost": 0}, "fixture"
        )

    class Calls:
        def __init__(self, *args):
            self.entries = []

        def __call__(self, stage, model, chunk, targets, images, send, **kwargs):
            assert "DO_NOT_SEND_GOLD" not in json.dumps({"source": chunk, "targets": targets})
            return send()

    monkeypatch.setattr(experiment, "extract", extract)
    monkeypatch.setattr(experiment, "Calls", Calls)
    monkeypatch.setattr(experiment, "MODELS", ("openai/gpt-6.1-sol",))
    monkeypatch.setattr(experiment, "TRIALS", 1)
    monkeypatch.setattr(experiment, "get_settings", lambda: SimpleNamespace())
    monkeypatch.setattr(
        experiment,
        "ledger_snapshot",
        lambda: {
            "rows": 500,
            "settledMicros": 3_000_000,
            "uncertainReservedMicros": 0,
            "remainingMicros": 27_000_000,
        },
    )
    monkeypatch.setattr("dotenv.dotenv_values", lambda *args: {"OPENROUTER_API_KEY": "fixture-key"})
    experiment.run(
        SimpleNamespace(
            input=path, out=tmp_path / "private-result", execute=True, env_file=tmp_path / "unused"
        )
    )
    assert len(captured) == 1
    assert captured[0]["source"] == data["sources"][0]["chunk"]
    assert captured[0]["kwargs"]["output_model"] is BlockExtraction
    assert captured[0]["kwargs"]["reasoning_effort"] == "medium"


def test_AC_SRC_5_experiment_model_is_not_a_product_default():
    from pydantic import ValidationError

    from app.core.config import Settings

    with pytest.raises(ValidationError, match="budget-qualified model"):
        Settings(
            _env_file=None,
            source_analysis_enabled=True,
            source_analysis_provider="openrouter",
            source_analysis_model="openai/gpt-6.2-astra",
            openrouter_api_key="invented-not-a-real-key",
        )
