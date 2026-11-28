"""AC-SRC-5/10 request recovery without provider traffic."""

from copy import deepcopy

import pytest

from app.ai.source_analysis import ExtractionError
from app.ai.source_ocr import Transcription
from app.source_analysis.ocr_recovery import Recovery, successful_checkpoints
from tests.test_source_analysis import source_settings  # noqa: F401


def harness(binding="source-v1"):
    stored, delays, stages = {}, [], []

    def save(key, value):
        stored[key] = deepcopy(value)

    recovery = Recovery(binding, stored.get, save, sleep=delays.append, jitter=lambda: 0)

    def invoke(send, image="crop"):
        def call(stage, model, chunk, targets, images, fn, tokens):
            stages.append(stage)
            return fn()

        return recovery(call, "ocr-1-0", "model", {}, [], [image], send, 2048)

    return recovery, stored, delays, stages, invoke


def transient(category="CONNECTION", **kwargs):
    return ExtractionError(
        "REQUEST_UNCERTAIN", details={"automaticRetry": True, "errorCategory": category, **kwargs}
    )


def test_AC_SRC_10_recover_and_cache_without_resending_success():
    _, stored, delays, stages, invoke = harness()
    attempts = []

    def send():
        attempts.append(1)
        if len(attempts) < 3:
            raise transient()
        return Transcription(["서늘한 곳"], {"cost": 0.01}, "id")

    assert invoke(send).lines == ["서늘한 곳"]
    assert invoke(lambda: pytest.fail("cache must not send")).usage == {"cost": 0}
    assert stages == ["ocr-1-0", "ocr-1-0-recovery-2", "ocr-1-0-recovery-3"]
    assert delays == [2, 4]
    assert next(iter(stored.values()))["attempts"] == 3


def test_AC_SRC_10_exhaustion_is_bounded_and_retains_history():
    _, stored, delays, stages, invoke = harness()
    with pytest.raises(ExtractionError):
        invoke(lambda: (_ for _ in ()).throw(transient("TIMEOUT")))
    assert len(stages) == 3 and len(delays) == 2
    assert len(next(iter(stored.values()))["history"]) == 3


@pytest.mark.parametrize(
    "code",
    [
        "PROVIDER_AUTH",
        "BUDGET_EXCEEDED",
        "PRIVACY_CHANGED",
        "SOURCE_CHANGED",
        "REQUEST_UNCERTAIN",
        "RATE_LIMITED",
    ],
)
def test_AC_SRC_5_unknown_or_hard_error_not_retried(code):
    _, _, delays, stages, invoke = harness()
    with pytest.raises(ExtractionError, match=code):
        invoke(lambda: (_ for _ in ()).throw(ExtractionError(code)))
    assert len(stages) == 1 and not delays


def test_AC_SRC_5_inflight_after_crash_not_resent():
    _, stored, _, stages, invoke = harness()
    with pytest.raises(KeyboardInterrupt):
        invoke(lambda: (_ for _ in ()).throw(KeyboardInterrupt()))
    with pytest.raises(ExtractionError) as error:
        invoke(lambda: pytest.fail("must not replay unknown request"))
    assert error.value.details["errorCategory"] == "INTERRUPTED_IN_FLIGHT"
    assert len(stages) == 1
    assert successful_checkpoints({"ocrRecovery": stored}) == {}


def test_AC_SRC_5_cache_is_bound_to_image_and_source():
    recovery, stored, _, stages, invoke = harness()
    invoke(lambda: Transcription(["one"], {}, None))
    assert invoke(lambda: Transcription(["two"], {}, None), "changed-crop").lines == ["two"]
    other = Recovery("changed-source", stored.get, lambda k, v: stored.update({k: deepcopy(v)}))
    other(
        lambda *a: Transcription(["three"], {}, None),
        "ocr-1-0",
        "model",
        {},
        [],
        ["crop"],
        lambda: None,
        2048,
    )
    assert len(stored) == 3 and len(stages) == 2
    assert len(successful_checkpoints({"ocrRecovery": stored})) == 3


def test_AC_SRC_10_respect_retry_after_and_avoid_long_block():
    _, _, delays, stages, invoke = harness()
    count = []

    def send():
        count.append(1)
        if len(count) == 1:
            raise transient(retryAfterSeconds=12)
        return Transcription([], {}, None)

    invoke(send)
    assert delays == [12]
    _, _, delays, stages, invoke = harness()
    with pytest.raises(ExtractionError):
        invoke(lambda: (_ for _ in ()).throw(transient(retryAfterSeconds=120)))
    assert delays == [] and len(stages) == 1


@pytest.mark.parametrize("status", [400, 401, 403, 429, 500, 503])
def test_AC_SRC_10_adapter_retains_safe_http_classification(monkeypatch, status):
    import httpx
    from openai import APIStatusError

    from app.ai import source_ocr

    response = httpx.Response(
        status,
        headers={"retry-after": "9"},
        request=httpx.Request("POST", "https://example.invalid"),
    )

    class Client:
        def __init__(self, **kwargs):
            self.chat = self
            self.completions = self

        def create(self, **kwargs):
            raise APIStatusError(
                "private provider message", response=response, body={"secret": "must not persist"}
            )

        def close(self):
            pass

    monkeypatch.setattr(source_ocr, "OpenAI", Client)
    with pytest.raises(ExtractionError) as error:
        source_ocr.transcribe("invented")
    assert error.value.details["httpStatus"] == status
    assert error.value.details["automaticRetry"] == (status == 429 or status >= 500)
    assert "secret" not in str(error.value.details)
    if status == 429:
        assert error.value.details["retryAfterSeconds"] == 9


def test_AC_SRC_10_durable_worker_recovers_one_crop_and_keeps_uncertain_reservation(
    client, login, monkeypatch
):
    from sqlalchemy import select

    from app.core.db import get_sessionmaker
    from app.source_analysis import worker
    from app.source_analysis.models import Item, Spend
    from tests.test_source_gemini_ocr import extraction, ready

    iid, _, _ = ready(client, login)
    attempts = []

    def ocr(encoded):
        attempts.append(encoded)
        if len(attempts) == 1:
            raise transient()
        return Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", extraction)
    assert worker.run_once()
    assert len(attempts) == 2
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == "SUCCEEDED"
        checkpoints = item.diagnostics["ocrRecovery"]
        assert len(checkpoints) == 1
        checkpoint = next(iter(checkpoints.values()))
        assert checkpoint["status"] == "SUCCEEDED" and checkpoint["attempts"] == 2
        assert checkpoint["history"][0]["category"] == "CONNECTION"
        spends = list(db.scalars(select(Spend)))
        assert len(spends) == 3  # failed OCR, successful OCR, extraction
        assert sum(s.charged_micros is None for s in spends) == 1
        assert sum(s.charged_micros or 0 for s in spends) == 3000


def test_AC_SRC_5_cancelled_unsent_crop_never_becomes_success_cache():
    _, stored, _, _, invoke = harness()
    invoke(lambda: Transcription([], {"cost": 0}, None, skipped=True))
    assert successful_checkpoints({"ocrRecovery": stored}) == {}
    assert next(iter(stored.values()))["status"] == "NOT_SENT"


@pytest.mark.parametrize("change", ["budget", "privacy", "cancel"])
def test_AC_SRC_5_every_recovery_attempt_rechecks_live_guards(client, login, monkeypatch, change):
    from sqlalchemy import select

    from app.core.config import get_settings
    from app.core.db import get_sessionmaker
    from app.source_analysis import worker
    from app.source_analysis.models import Asset, Candidate, Item, Spend
    from tests.test_source_gemini_ocr import ready

    iid, sid, _ = ready(client, login)
    sent = []

    def ocr(encoded):
        sent.append(encoded)
        if change == "budget":
            monkeypatch.setattr(get_settings(), "source_budget_usd", 0)
        else:
            with get_sessionmaker()() as db:
                if change == "privacy":
                    db.get(Asset, sid).privacy_approved = False
                else:
                    item = db.get(Item, iid)
                    item.status, item.lease_token = "CANCELLED", None
                db.commit()
        raise transient()

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(
        worker, "extract", lambda *a: pytest.fail("No extraction after guard failure")
    )
    assert worker.run_once()
    assert len(sent) == 1
    with get_sessionmaker()() as db:
        assert db.get(Item, iid).status in {"FAILED", "CANCELLED"}
        assert db.scalar(select(Candidate).where(Candidate.item_id == iid)) is None
        spends = list(db.scalars(select(Spend)))
        assert len(spends) == 1 and spends[0].charged_micros is None
