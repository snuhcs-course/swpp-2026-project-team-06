"""AC-SRC-5/6 DEV-238: safe failure observations, with no paid calls or DB."""

import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APIConnectionError, APIStatusError, APITimeoutError

from app.ai import source_analysis as ai
from app.ai import source_ocr, source_refine
from app.source_analysis import final_eval as ev

MODEL = "google/gemini-3-flash-preview"
PRIVATE = "PRIVATE_INPUT_URL_BODY_SENTINEL"
FIELDS = ("finishReason", "responseStatus", "exceptionType", "httpStatus")


def invoke(stage, mode="openrouter"):
    if stage == "extract":
        return ai.extract(mode, MODEL, {"pages": [], "private": PRIVATE}, [], [])
    if stage == "refine":
        return source_refine.refine(mode, MODEL, {"id": "target"}, [{"id": "c0"}])
    return source_ocr.transcribe(PRIVATE)


def stub(monkeypatch, outcome):
    requests, closed = [], []

    def request(**kwargs):
        requests.append(kwargs)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=request)),
        responses=SimpleNamespace(parse=request),
        close=lambda: closed.append(True),
    )
    monkeypatch.setattr(ai, "OpenAI", lambda **kwargs: client)
    monkeypatch.setattr(source_ocr, "OpenAI", lambda **kwargs: client)
    return requests, closed


def generated(finish):
    return SimpleNamespace(
        id="synthetic-request-238",
        usage=SimpleNamespace(model_dump=lambda: {"cost": 0.001, "total_tokens": 42}),
        choices=[
            SimpleNamespace(
                finish_reason=finish,
                message=SimpleNamespace(content=PRIVATE),
            )
        ],
    )


def observations(error):
    return {field: error.details.get(field) for field in FIELDS}


def assert_private_absent(error):
    assert PRIVATE not in str(error)
    assert PRIVATE not in json.dumps(error.details)


@pytest.mark.parametrize("stage", ["extract", "refine", "ocr"])
@pytest.mark.parametrize(
    "finish", ["length", "tool_calls", "content_filter", "function_call", "refusal"]
)
def test_AC_SRC_5_6_DEV_238_nonstop_finish_is_safe_and_keeps_billing(monkeypatch, stage, finish):
    requests, closed = stub(monkeypatch, generated(finish))
    with pytest.raises(ai.ExtractionError) as caught:
        invoke(stage)
    error = caught.value
    assert error.code == ("INCOMPLETE_OCR" if stage == "ocr" else "INCOMPLETE_OR_REFUSED")
    assert observations(error) == dict(
        finishReason=finish,
        responseStatus=None,
        exceptionType=None,
        httpStatus=None,
    )
    assert error.usage == {"cost": 0.001, "total_tokens": 42}
    assert error.request_id == "synthetic-request-238"
    assert len(requests) == len(closed) == 1
    assert_private_absent(error)


@pytest.mark.parametrize("stage", ["extract", "refine", "ocr"])
@pytest.mark.parametrize("finish", [PRIVATE, None, 37, {"private": PRIVATE}])
def test_AC_SRC_6_DEV_238_unknown_finish_cannot_escape(monkeypatch, stage, finish):
    requests, closed = stub(monkeypatch, generated(finish))
    with pytest.raises(ai.ExtractionError) as caught:
        invoke(stage)
    assert observations(caught.value) == dict.fromkeys(FIELDS)
    assert len(requests) == len(closed) == 1
    assert_private_absent(caught.value)


@pytest.mark.parametrize("stage", ["extract", "refine", "ocr"])
@pytest.mark.parametrize(
    "kind",
    [
        "timeout",
        "connection",
        "status401",
        "status403",
        "status400",
        "status429",
        "status500",
        "other",
    ],
)
def test_AC_SRC_5_6_DEV_238_transport_failure_is_fixed_classification(monkeypatch, stage, kind):
    request = httpx.Request("POST", f"https://example.invalid/{PRIVATE}")
    status = int(kind[6:]) if kind.startswith("status") else None
    if kind == "timeout":
        failure = APITimeoutError(request=request)
        typename = "APITimeoutError"
    elif kind == "connection":
        failure = APIConnectionError(message=PRIVATE, request=request)
        typename = "APIConnectionError"
    elif status:
        failure = APIStatusError(
            PRIVATE, response=httpx.Response(status, request=request), body={"private": PRIVATE}
        )
        typename = "APIStatusError"
    else:
        failure = type(PRIVATE, (APIConnectionError,), {})(message=PRIVATE, request=request)
        typename = "OtherError"
    requests, closed = stub(monkeypatch, failure)
    with pytest.raises(ai.ExtractionError) as caught:
        invoke(stage)
    expected = (
        "PROVIDER_AUTH"
        if status in {401, 403}
        else ("PROVIDER_REJECTED" if status and status < 500 else "REQUEST_UNCERTAIN")
    )
    if status == 429 and stage == "extract":
        expected = "RATE_LIMITED"
    assert caught.value.code == expected
    assert str(caught.value) == expected
    assert observations(caught.value) == dict(
        finishReason=None,
        responseStatus=None,
        exceptionType=typename,
        httpStatus=status,
    )
    assert caught.value.usage == {}
    assert len(requests) == len(closed) == 1
    assert_private_absent(caught.value)


@pytest.mark.parametrize("stage", ["extract", "refine"])
@pytest.mark.parametrize(
    "status", ["incomplete", "failed", "cancelled", "queued", "in_progress", PRIVATE]
)
def test_AC_SRC_5_6_DEV_238_response_status_is_observable_without_payload(
    monkeypatch, stage, status
):
    outcome = SimpleNamespace(
        id="synthetic-request-238",
        usage=None,
        status=status,
        output_parsed=None,
        output=PRIVATE,
        error=PRIVATE,
    )
    requests, closed = stub(monkeypatch, outcome)
    with pytest.raises(ai.ExtractionError) as caught:
        invoke(stage, mode="openai")
    assert observations(caught.value) == dict(
        finishReason=None,
        responseStatus=None if status == PRIVATE else status,
        exceptionType=None,
        httpStatus=None,
    )
    assert len(requests) == len(closed) == 1
    assert_private_absent(caught.value)


@pytest.mark.parametrize("stage", ["extract", "refine", "ocr"])
def test_AC_SRC_5_6_DEV_238_failure_entry_retains_observations_after_abort(monkeypatch, stage):
    stub(monkeypatch, generated("length"))
    calls = ev.Calls("mock", 1)
    with pytest.raises(ai.ExtractionError) as caught:
        calls(stage, MODEL, {}, [], [], lambda: invoke(stage))
    assert len(calls.entries) == 1
    entry = calls.entries[0]
    assert {field: entry[field] for field in FIELDS} == observations(caught.value)
    assert entry["finishReason"] == "length"
    assert PRIVATE not in json.dumps(entry)


def test_AC_SRC_5_6_DEV_238_legacy_failure_entry_has_explicit_null_observations():
    calls = ev.Calls("mock", 1)

    def fail():
        raise ai.ExtractionError("REQUEST_UNCERTAIN")

    with pytest.raises(ai.ExtractionError):
        calls("extract", MODEL, {}, [], [], fail)
    assert len(calls.entries) == 1
    assert {field: calls.entries[0][field] for field in FIELDS} == dict.fromkeys(FIELDS)


def test_AC_SRC_5_6_DEV_238_calls_unknown_exception_keeps_safe_classification():
    calls = ev.Calls("mock", 1)
    failure = type(PRIVATE, (RuntimeError,), {})(PRIVATE)

    def fail():
        raise failure

    with pytest.raises(RuntimeError) as caught:
        calls("extract", MODEL, {}, [], [], fail)
    assert caught.value is failure
    assert len(calls.entries) == 1
    assert {field: calls.entries[0][field] for field in FIELDS} == dict(
        finishReason=None,
        responseStatus=None,
        exceptionType="OtherError",
        httpStatus=None,
    )
    assert PRIVATE not in json.dumps(calls.entries)
