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
    uploaded = upload(client, h, b)
    r = start(client, h, b["id"])
    # Isolate the OCR job from the required cover photo preparation.
    with get_sessionmaker()() as db:
        for cover_item in db.scalars(
            select(Item).join(Asset).where(Item.run_id == r["id"], Asset.original_photo.is_(True))
        ):
            cover_item.status = "SUCCEEDED"
        db.commit()
    assert worker.run_once()  # local preparation only
    out = io.BytesIO()
    Image.new("RGB", (100, height), "black").save(out, "PNG")
    with get_sessionmaker()() as db:
        run = db.get(Run, r["id"])
        run.mode, run.model = "openrouter", OCR_MODEL
        source = db.get(Asset, uploaded["id"])
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


def ready_pdf(client, login, monkeypatch, count=3):
    """Invented images and in-process text preparation isolate OCR from OS sandboxing."""
    from app.source_analysis.preprocess import parse

    monkeypatch.setattr(worker, "prepare", parse)
    iid, sid, _ = ready(client, login)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        run = db.get(Run, item.run_id)
        source = db.get(Asset, sid)
        source.mime, source.filename, source.page_count = "application/pdf", "invented.pdf", count
        page = db.scalar(select(Page).where(Page.asset_id == sid))
        for number in range(2, count + 1):
            db.add(
                Page(
                    asset_id=sid,
                    revision=source.revision,
                    number=number,
                    spans=page.spans,
                    redacted_spans=page.redacted_spans,
                    redactions=[],
                    image_key=page.sanitized_key,
                    sanitized_key=page.sanitized_key,
                )
            )
        db.delete(item)
        db.flush()
        prepare_item = db.scalar(
            select(Item).where(Item.run_id == run.id, Item.asset_id == sid, Item.phase == "PREPARE")
        )
        worker.enqueue_extraction(
            db,
            source,
            run,
            prepare_item,
            list(db.scalars(select(Page).where(Page.asset_id == sid))),
        )
        db.flush()
        jobs = list(db.scalars(select(Item).where(Item.run_id == run.id, Item.phase == "EXTRACT")))
        assert len(jobs) == 1 and len(jobs[0].pages) == count
        iid = jobs[0].id
        db.commit()
    return iid, sid


def page_extraction(mode, model, chunk, targets, images):
    page = chunk["pages"][0]
    span = page["spans"][0]
    value = {
        "targetId": targets[0]["id"],
        "fieldKey": "storage",
        "value": span["text"],
        "historical": False,
        "evidence": [
            {
                "sourceId": chunk["sourceId"],
                "sourceRevision": chunk["sourceRevision"],
                "page": page["number"],
                "spanIds": [span["id"]],
                "quote": span["text"],
            }
        ],
    }
    # An exact duplicate must not be stored twice after chunk merging.
    return ExtractionResponse(
        Extraction.model_validate({"candidates": [value, value], "photo_requests": []}),
        {"cost": 0.002},
        "extract",
    )


@pytest.mark.parametrize("all_empty", [False, True])
def test_AC_SRC_2_5_pdf_photo_only_pages_skip_without_inventing_text(
    client, login, monkeypatch, all_empty
):
    iid, sid = ready_pdf(client, login, monkeypatch)
    seen = []

    def ocr(encoded):
        seen.append(encoded)
        lines = [] if all_empty or len(seen) == 2 else ["서늘한 곳에 보관해 주세요."]
        return Transcription(lines, {"cost": 0.001}, "ocr")

    extracted_pages = []

    def extract(*args):
        extracted_pages.append(args[2]["pages"][0]["number"])
        return page_extraction(*args)

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", extract)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == ("FAILED" if all_empty else "SUCCEEDED")
        assert item.error == ("OCR_UNCERTAIN" if all_empty else None)
        assert item.diagnostics["pagesEmpty"] == ([1, 2, 3] if all_empty else [2])
        assert item.diagnostics["pagesFailed"] == []
        assert all(not p["ocrSpans"] for p in item.pages if all_empty or p["number"] == 2)
        assert extracted_pages == ([] if all_empty else [1, 3])
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        assert len(candidates) == (0 if all_empty else 2)
        assert {c.evidence[0]["page"] for c in candidates} == (set() if all_empty else {1, 3})
        assert db.get(Asset, sid).status == "PREPARED"
        from app.source_analysis.service import run_view

        view = run_view(db, db.get(Run, item.run_id))
        public = next(i for i in view["items"] if i["id"] == iid)
        assert public["pagesEmpty"] == (3 if all_empty else 1)
        assert public["pagesFailed"] == 0


@pytest.mark.parametrize(
    "code", ["REQUEST_UNCERTAIN", "PROVIDER_REJECTED", "OCR_TEXT_LIMIT", "PROVIDER_AUTH"]
)
def test_AC_SRC_2_5_10_pdf_page_failure_preserves_other_pages_and_accounting(
    client, login, monkeypatch, code
):
    iid, _ = ready_pdf(client, login, monkeypatch)
    attempted = []

    def ocr(encoded):
        attempted.append(encoded)
        if len(attempted) == 2:
            raise ExtractionError(
                code, usage={"cost": 0.0005} if code == "PROVIDER_REJECTED" else {}
            )
        return Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", page_extraction)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        rows = list(db.scalars(select(Spend)))
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        if code == "PROVIDER_AUTH":
            assert item.status == "FAILED" and item.error == "PROVIDER_AUTH"
            assert len(attempted) == 2 and len(rows) == 2 and candidates == []
            assert not db.scalar(
                select(Item).where(Item.run_id == item.run_id, Item.phase == "REFINE")
            )
            return
        assert item.status == "PARTIAL"
        assert item.diagnostics["pagesFailed"] == [{"number": 2, "code": code}]
        assert item.pages[1]["ocrSpans"] == []
        assert len(attempted) == 3 and len(candidates) == 2
        assert {c.evidence[0]["page"] for c in candidates} == {1, 3}
        assert len(rows) == 5
        assert sum(r.charged_micros or 0 for r in rows) == (
            6500 if code == "PROVIDER_REJECTED" else 6000
        )
        if code == "PROVIDER_REJECTED":
            assert all(r.charged_micros is not None for r in rows)
        else:
            assert sum(r.reserved_micros for r in rows if r.charged_micros is None) > 0
        refine_item = db.scalar(
            select(Item).where(Item.run_id == item.run_id, Item.phase == "REFINE")
        )
        assert refine_item is not None  # Accepted PARTIAL candidates may refine.
        # Remove only the pending REFINE from the queue to prove EXTRACT is never replayed.
        refine_item.status = "CANCELLED"
        from app.source_analysis.service import refresh_runs

        refresh_runs(db, db.get(Run, item.run_id).batch_id)
        db.commit()
    assert not worker.run_once()
    assert len(attempted) == 3


def test_AC_SRC_5_10_partial_ocr_retry_requires_ack_and_rereads_entire_item(
    client, login, monkeypatch
):
    from app.core.errors import ApiError
    from app.source_analysis.models import Batch
    from app.source_analysis.schemas import Retry
    from app.source_analysis.service import retry

    iid, _ = ready_pdf(client, login, monkeypatch)
    attempted = []

    def ocr(encoded):
        attempted.append(encoded)
        if len(attempted) == 2:
            raise ExtractionError("REQUEST_UNCERTAIN")
        return Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", page_extraction)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        run = db.get(Run, item.run_id)
        batch = db.get(Batch, run.batch_id)
        # Finish the unrelated refinement job to make this a terminal PARTIAL Run.
        for r in db.scalars(select(Item).where(Item.run_id == run.id, Item.phase == "REFINE")):
            r.status = "SUCCEEDED"
            r.refinement = {**r.refinement, "modules": [], "excluded": []}
        worker.refresh_runs(db, batch.id)
        assert run.status == "PARTIAL"
        db.commit()  # Match the worker's committed terminal run before retrying.
        with pytest.raises(ApiError) as err:
            retry(db, batch, run, Retry(item_ids=[iid], acknowledge_uncertain=False))
        assert err.value.code == "CONFLICT"
        assert err.value.details["reason"] == "RETRY_ACK_REQUIRED"
        monkeypatch.setattr(get_settings(), "source_analysis_provider", "openrouter")
        monkeypatch.setattr(get_settings(), "source_analysis_model", OCR_MODEL)
        new = retry(db, batch, run, Retry(item_ids=[iid], acknowledge_uncertain=True))
        new_id = next(i["id"] for i in new["items"] if i["phase"] == "EXTRACT")
        assert len(db.get(Item, new_id).pages) == 3
        db.commit()
    assert worker.run_once()
    assert len(attempted) == 6  # Explicitly re-read all pages, including the failed one.
    with get_sessionmaker()() as db:
        assert db.get(Item, new_id).status == "SUCCEEDED"
        current = list(db.scalars(select(Candidate).where(Candidate.outdated.is_(False))))
        assert len(current) == 3
        assert {c.evidence[0]["page"] for c in current} == {1, 2, 3}


@pytest.mark.parametrize("reject_middle", [False, True])
def test_AC_SRC_2_5_long_ocr_chunks_keep_original_page_and_span_evidence(
    client, login, monkeypatch, reject_middle
):
    iid, _ = ready_pdf(client, login, monkeypatch, count=2)
    calls = []
    lines = ["합성 보관 안내입니다. " * 100 for _ in range(7)]
    monkeypatch.setattr(
        worker, "transcribe", lambda _: Transcription(lines, {"cost": 0.001}, "ocr")
    )

    def extract(*args):
        calls.append(args[2])
        response = page_extraction(*args)
        if reject_middle and len(calls) == 2:
            for candidate in response.extraction.candidates:
                candidate.evidence[0].span_ids = ["vision-gemini-0"]  # Outside this group.
        return response

    monkeypatch.setattr(worker, "extract", extract)
    assert worker.run_once()
    assert len(calls) == 6
    assert all(sum(len(s["text"]) for s in c["pages"][0]["spans"]) <= 4000 for c in calls)
    assert [c["pages"][0]["number"] for c in calls] == [1, 1, 1, 2, 2, 2]
    for number in (1, 2):
        assert [
            s["id"]
            for c in calls
            if c["pages"][0]["number"] == number
            for s in c["pages"][0]["spans"]
        ] == [f"vision-gemini-{i}" for i in range(7)]
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == ("PARTIAL" if reject_middle else "SUCCEEDED")
        assert item.diagnostics["rejectedCount"] == (2 if reject_middle else 0)
        values = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        assert len(values) == (5 if reject_middle else 6)  # Exact duplicates were merged.
        assert {e["page"] for c in values for e in c.evidence} == {1, 2}


@pytest.mark.parametrize("failure", ["later_crop", "text_limit"])
def test_AC_SRC_2_3_5_failed_page_discards_partial_ocr_and_continues(monkeypatch, failure):
    image = io.BytesIO()
    Image.new("RGB", (24, 24), "white").save(image, "PNG")
    chunk = {
        "pages": [
            {
                "number": number,
                "spans": [{"id": "local", "text": "로컬 전사로 대체하면 안 됩니다."}],
            }
            for number in (1, 2)
        ]
    }
    count = 0
    if failure == "later_crop":
        original = worker.crops
        monkeypatch.setattr(worker, "crops", lambda data: list(original(data)) * 2)

    def ocr(encoded):
        nonlocal count
        count += 1
        if failure == "text_limit" and count == 1:
            lines = ["합" * 3000] * 7  # Real per-page 20,000-character guard.
        elif failure == "later_crop" and count == 2:
            raise ExtractionError("REQUEST_UNCERTAIN")
        else:
            lines = ["서늘한 곳에 보관해 주세요."]
        return Transcription(lines, {}, "fixture")

    monkeypatch.setattr(worker, "transcribe", ocr)
    diagnostics = worker.transcribe_pages(
        chunk,
        {1: image.getvalue(), 2: image.getvalue()},
        lambda *args: args[5](),
    )
    assert diagnostics["pagesFailed"] == [
        {
            "number": 1,
            "code": "REQUEST_UNCERTAIN" if failure == "later_crop" else "OCR_TEXT_LIMIT",
        }
    ]
    assert diagnostics["pagesEmpty"] == []
    assert chunk["pages"][0]["spans"] == []
    assert all(s["text"] == "서늘한 곳에 보관해 주세요." for s in chunk["pages"][1]["spans"])
    assert count == (4 if failure == "later_crop" else 2)
