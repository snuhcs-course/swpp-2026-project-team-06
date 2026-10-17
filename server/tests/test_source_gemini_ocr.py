"""AC-SRC-4/5/10: real durable worker, deterministic provider, no paid requests."""

import base64
import io
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlalchemy import select

from app.ai.source_analysis import ExtractionError, ExtractionResponse
from app.ai.source_ocr import OCR_MODEL, Transcription, crops, transcribe
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import worker
from app.source_analysis.models import Asset, Candidate, Item, Page, Run, Spend
from app.source_analysis.schemas import Extraction
from app.source_analysis.storage import Storage
from tests.test_source_analysis import create, source_settings, start, upload  # noqa: F401


def ready(client, login, *, approved=True, height=100):
    h = login("u-kang")
    b = create(client, h)
    upload(client, h, b)
    r = start(client, h, b["id"])
    assert worker.run_once()  # local preparation only
    out = io.BytesIO()
    Image.new("RGB", (100, height), "black").save(out, "PNG")
    with get_sessionmaker()() as db:
        run = db.get(Run, r["id"])
        run.mode, run.model = "openrouter", OCR_MODEL
        source = db.scalar(select(Asset).where(Asset.batch_id == b["id"]))
        source.mime = "image/png"
        source.privacy_approved = approved
        page = db.scalar(select(Page).where(Page.asset_id == source.id))
        page.sanitized_key = Storage().put(out.getvalue())
        item = db.scalar(select(Item).where(Item.run_id == run.id, Item.phase == "EXTRACT"))
        item.status = "QUEUED"
        ids = (item.id, source.id, page.id)
        db.commit()
    return ids


def extraction(mode, model, chunk, targets, images):
    assert mode == "openrouter" and model == OCR_MODEL and images == []
    spans = chunk["pages"][0]["spans"]
    assert [s["text"] for s in spans] == ["서늘한 곳에 보관해 주세요."]
    return ExtractionResponse(
        Extraction.model_validate(
            {
                "candidates": [
                    {
                        "targetId": targets[0]["id"],
                        "fieldKey": "storage",
                        "value": spans[0]["text"],
                        "historical": False,
                        "evidence": [
                            {
                                "sourceId": chunk["sourceId"],
                                "sourceRevision": chunk["sourceRevision"],
                                "page": 1,
                                "spanIds": [spans[0]["id"]],
                                "quote": spans[0]["text"],
                            }
                        ],
                    }
                ],
                "photo_requests": [],
            }
        ),
        {"cost": 0.002},
        "extract-id",
    )


def test_AC_SRC_4_gemini_reads_only_approved_image_and_persists_evidence(
    client, login, monkeypatch
):
    iid, sid, pid = ready(client, login)
    calls = []

    def ocr(encoded):
        image = Image.open(io.BytesIO(base64.b64decode(encoded)))
        assert image.getpixel((50, 50)) == (0, 0, 0)  # sanitized, not original
        calls.append(encoded)
        return Transcription(
            ["서늘한 곳에 보관해 주세요.", "연락처 010-1234-5678", "[판독불가]"],
            {"cost": 0.001},
            "ocr-id",
        )

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", extraction)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == "SUCCEEDED"
        assert len(calls) == 1
        spans = item.pages[0]["ocrSpans"]
        assert len(spans) == 1 and spans[0]["id"].startswith("vision-gemini-")
        assert db.get(Page, pid).spans[0]["text"] == "테스트 감귤"
        rows = list(db.scalars(select(Spend)))
        assert len(rows) == 2 and sum(r.charged_micros for r in rows) == 3000
        assert (
            db.scalar(select(Candidate).where(Candidate.item_id == iid)).evidence[0]["quote"]
            == spans[0]["text"]
        )


@pytest.mark.parametrize("kind", ["unapproved", "budget", "uncertain", "cancel", "privacy"])
def test_AC_SRC_5_10_ocr_guards_and_mid_pipeline_fencing(client, login, monkeypatch, kind):
    iid, sid, _ = ready(client, login, approved=kind != "unapproved")
    calls = []
    if kind == "budget":
        monkeypatch.setattr(get_settings(), "source_budget_usd", 0.000001)

    def ocr(encoded):
        calls.append("ocr")
        if kind == "uncertain":
            raise ExtractionError("REQUEST_UNCERTAIN")
        if kind in {"cancel", "privacy"}:
            with get_sessionmaker()() as db:
                if kind == "cancel":
                    item = db.get(Item, iid)
                    item.status, item.lease_token = "CANCELLED", None
                else:
                    db.get(Asset, sid).privacy_approved = False
                db.commit()
        return Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr")

    def forbidden(*args):
        raise AssertionError("Extraction must not run")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", forbidden)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status in {"FAILED", "CANCELLED"}
        assert db.scalar(select(Candidate).where(Candidate.item_id == iid)) is None
        rows = list(db.scalars(select(Spend)))
        if kind in {"unapproved", "budget"}:
            assert calls == [] and rows == []
        elif kind == "uncertain":
            assert len(rows) == 1 and rows[0].charged_micros is None
            assert not worker.run_once()  # no automatic replay
        else:
            assert len(rows) == 1 and rows[0].charged_micros == 1000


def test_AC_SRC_10_later_crop_failure_retains_each_call_accounting(client, login, monkeypatch):
    iid, _, _ = ready(client, login, height=1800)
    calls = []

    def ocr(encoded):
        calls.append(encoded)
        if len(calls) == 2:
            raise ExtractionError("RATE_LIMITED", retry_after=1)
        return Transcription(["읽은 문구"], {"cost": 0.001}, "first")

    monkeypatch.setattr(worker, "transcribe", ocr)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        assert db.get(Item, iid).status == "FAILED"
        rows = list(db.scalars(select(Spend)))
        assert len(rows) == 2
        assert sorted(r.charged_micros or 0 for r in rows) == [0, 1000]
    assert not worker.run_once()


def test_AC_SRC_4_crops_cover_full_long_image_without_overlap():
    out = io.BytesIO()
    Image.new("RGB", (80, 3100), "white").save(out, "PNG")
    parts = [Image.open(io.BytesIO(base64.b64decode(s))) for s in crops(out.getvalue())]
    assert sum(p.height for p in parts) == 3100
    assert all(p.height <= 960 and p.width == 80 for p in parts)


@pytest.mark.parametrize(
    "finish,body,code",
    [
        ("length", '{"lines": []}', "INCOMPLETE_OCR"),
        ("stop", '{"lines": [12]}', "INVALID_OCR"),
        ("stop", '{"lines": ["보관"]}', None),
    ],
)
def test_AC_SRC_10_adapter_uses_same_experiment_contract(monkeypatch, finish, body, code):
    def request(**kwargs):
        assert kwargs["model"] == OCR_MODEL and kwargs["max_tokens"] == 2048
        assert kwargs["extra_body"]["reasoning"]["effort"] == "minimal"
        assert kwargs["extra_body"]["provider"]["allow_fallbacks"] is False
        return SimpleNamespace(
            usage=SimpleNamespace(model_dump=lambda: {"cost": 0.001}),
            id="provider-id",
            choices=[SimpleNamespace(finish_reason=finish, message=SimpleNamespace(content=body))],
        )

    client = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=request)), close=lambda: None
    )
    monkeypatch.setattr("app.ai.source_ocr.OpenAI", lambda **kwargs: client)
    if code:
        with pytest.raises(ExtractionError, match=code) as err:
            transcribe("fixture")
        assert err.value.usage == {"cost": 0.001}
    else:
        assert transcribe("fixture").lines == ["보관"]
