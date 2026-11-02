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
    # Sequential contract: no further crop is sent after a hard failure.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
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


def test_AC_SRC_10_parallel_crop_failure_settles_every_sent_call(client, login, monkeypatch):
    # Under concurrency, crops already in flight still finish; each one is reserved and settled.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
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
        # As in the sequential test, only the failed call keeps an unsettled reservation;
        # crops stopped before sending settle at 0.
        assert len(rows) >= len(calls)
        assert sum(r.charged_micros is None for r in rows) <= 1
        assert sum(r.charged_micros or 0 for r in rows) == 1000 * (len(calls) - 1)
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


@pytest.fixture
def single_page_extraction_chunks(monkeypatch):
    # Legacy fakes inspect only pages[0]; preserve their per-page failure/cost assertions.
    # New packing regressions exercise the production four-page limit separately.
    monkeypatch.setattr(worker, "EXTRACTION_MAX_PAGES", 1)


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
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_pdf_photo_only_pages_skip_without_inventing_text(
    client, login, monkeypatch, all_empty
):
    # This fixture keys responses by sequential invocation count.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
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
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_10_pdf_page_failure_preserves_other_pages_and_accounting(
    client, login, monkeypatch, code
):
    # This fixture keys responses by sequential invocation count.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
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


@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_5_10_partial_ocr_retry_requires_ack_and_rereads_entire_item(
    client, login, monkeypatch
):
    # This fixture keys responses by sequential invocation count.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
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
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_long_ocr_chunks_keep_original_page_and_span_evidence(
    client, login, monkeypatch, reject_middle
):
    # This fake keys failure/candidate responses by sequential chunk invocation.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
    iid, _ = ready_pdf(client, login, monkeypatch, count=2)
    calls = []
    lines = ["합성 보관 안내입니다. " * 100 + str(index) for index in range(7)]
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
        assert item.diagnostics["acceptedCount"] == len(values)
        assert len(item.diagnostics["rejected"]) == (2 if reject_middle else 0)
        assert item.diagnostics["emptyReason"] is None
        rejected_values = [r["candidate"] for r in item.diagnostics["rejected"]]
        assert all(
            not (c.value == rejected["value"] and c.evidence == rejected["evidence"])
            for c in values
            for rejected in rejected_values
        )  # Even a quote present elsewhere cannot rescue an out-of-chunk span.


@pytest.mark.parametrize("failure", ["later_crop", "text_limit"])
def test_AC_SRC_2_3_5_failed_page_discards_partial_ocr_and_continues(monkeypatch, failure):
    # This fixture keys responses by sequential invocation count.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
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


@pytest.mark.parametrize("failure", ["middle", "all", "auth"])
@pytest.mark.parametrize("code", ["REQUEST_UNCERTAIN", "INVALID_MODEL_OUTPUT"])
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_10_stage1_chunk_failures_preserve_paid_ocr(
    client, login, monkeypatch, failure, code
):
    # This fake keys failure/candidate responses by sequential chunk invocation.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
    iid, _ = ready_pdf(client, login, monkeypatch)
    attempted = []
    monkeypatch.setattr(
        worker,
        "transcribe",
        lambda _: Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr"),
    )

    def extract(*args):
        number = args[2]["pages"][0]["number"]
        attempted.append(number)
        if failure == "all" or number == 2:
            raise ExtractionError(
                "PROVIDER_AUTH" if failure == "auth" else code,
                retry_after=1,
                usage={"cost": 0.0005},
                request_id=f"failed-{number}",
            )
        return page_extraction(*args)

    monkeypatch.setattr(worker, "extract", extract)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert all(p["ocrSpans"] for p in item.pages)  # Already paid OCR survives.
        assert item.status == ("PARTIAL" if failure == "middle" else "FAILED")
        assert item.error == (
            "PROVIDER_AUTH"
            if failure == "auth"
            else "EXTRACT_CHUNKS_FAILED"
            if failure == "middle" and code != "REQUEST_UNCERTAIN"
            else code
        )
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        rows = list(db.scalars(select(Spend)))
        if failure == "middle":
            assert attempted == [1, 2, 3]
            assert {c.evidence[0]["page"] for c in candidates} == {1, 3}
            assert len(candidates) == item.diagnostics["acceptedCount"] == 2
            assert item.diagnostics["chunksFailed"] == [{"index": 1, "pages": [2], "code": code}]
            assert item.diagnostics["pagesFailed"] == []  # OCR read every page successfully.
            from app.source_analysis.service import run_view

            public = next(
                i for i in run_view(db, db.get(Run, item.run_id))["items"] if i["id"] == iid
            )
            assert public["pagesFailed"] == 0 and public["chunksFailed"] == 1
            assert "diagnostics" not in public
            assert len(rows) == 6 and sum(r.charged_micros for r in rows) == 7500
            refine = db.scalar(
                select(Item).where(Item.run_id == item.run_id, Item.phase == "REFINE")
            )
            assert refine is not None
            refine.status = "CANCELLED"
            worker.refresh_runs(db, db.get(Run, item.run_id).batch_id)
        else:
            assert candidates == []
            assert attempted == ([1, 2] if failure == "auth" else [1, 2, 3])
            assert item.provider_request_id == ("failed-2" if failure == "auth" else "failed-1")
            assert item.usage == {"cost": 0.0005}
            assert len(rows) == (5 if failure == "auth" else 6)
            assert sum(r.charged_micros for r in rows) == (5500 if failure == "auth" else 4500)
        db.commit()
    assert not worker.run_once()  # retry_after must never replay the file.


@pytest.mark.parametrize("code", ["BUDGET_EXCEEDED", "PROVIDER_AUTH", "REQUEST_UNCERTAIN"])
@pytest.mark.parametrize("stage", ["ocr", "extract"])
def test_AC_SRC_5_10_diagnostics_fencing_preserves_original_exception(
    client, login, monkeypatch, code, stage
):
    iid, _ = ready_pdf(client, login, monkeypatch)
    claimed_id, token = worker.claim()
    assert claimed_id == iid
    original = ExtractionError(code, usage={"cost": 0.001}, request_id="original-request")

    def fail_ocr(*args):
        raise original

    if stage == "ocr":
        monkeypatch.setattr(worker, "transcribe_pages", fail_ocr)
    else:
        monkeypatch.setattr(
            worker, "transcribe_pages", lambda *args: {"pagesEmpty": [], "pagesFailed": []}
        )
        monkeypatch.setattr(worker, "extract_vision_chunks", fail_ocr)
    monkeypatch.setattr(worker, "lock_context", lambda *args: None)
    with pytest.raises(ExtractionError) as err:
        worker.vision_extraction(iid, token, {"pages": []}, [], "openrouter", OCR_MODEL, {})
    assert err.value is original
    assert err.value.code == code and err.value.usage == {"cost": 0.001}
    assert err.value.request_id == "original-request"
    worker.fail(iid, token, err.value)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.usage == {"cost": 0.001} and item.provider_request_id == "original-request"


def legacy_items(db, item, *, statuses=("SUCCEEDED", "SUCCEEDED", "SUCCEEDED")):
    current = db.get(Run, item.run_id)
    prior = Run(
        batch_id=current.batch_id,
        mode=current.mode,
        model=current.model,
        prompt_version=current.prompt_version,
        targets=current.targets,
        visual_pages=current.visual_pages,
        status="SUCCEEDED",
    )
    db.add(prior)
    db.flush()
    items = []
    for page, status in zip(item.pages, statuses, strict=True):
        old = Item(
            run_id=prior.id,
            asset_id=item.asset_id,
            revision=item.revision,
            sanitization_version=item.sanitization_version,
            target_ids=item.target_ids,
            phase="EXTRACT",
            pages=[page],
            status=status,
        )
        db.add(old)
        items.append(old)
    db.flush()
    return items


@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_legacy_page_candidates_are_superseded_by_file_extraction(
    client, login, monkeypatch
):
    from app.source_analysis.models import Batch
    from app.source_analysis.service import review

    iid, _ = ready_pdf(client, login, monkeypatch)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        run = db.get(Run, item.run_id)
        old_ids = []
        for index, old in enumerate(legacy_items(db, item), 1):
            candidate = Candidate(
                batch_id=run.batch_id,
                item_id=old.id,
                target_id=item.target_ids[0],
                field_key="storage",
                value=f"예전 보관 문구 {index}",
                historical=False,
                evidence=[
                    {
                        "sourceId": item.asset_id,
                        "sourceRevision": item.revision,
                        "page": index,
                        "spanIds": ["legacy"],
                        "quote": "예전 보관 문구",
                    }
                ],
            )
            db.add(candidate)
            db.flush()
            old_ids.append(candidate.id)
        db.commit()
    monkeypatch.setattr(
        worker,
        "transcribe",
        lambda _: Transcription(["서늘한 곳에 보관해 주세요."], {"cost": 0.001}, "ocr"),
    )
    monkeypatch.setattr(worker, "extract", page_extraction)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        assert all(db.get(Candidate, cid).outdated for cid in old_ids)
        item = db.get(Item, iid)
        assert item.status == "SUCCEEDED" and item.diagnostics["acceptedCount"] == 3
        result = review(db, db.get(Batch, db.get(Run, item.run_id).batch_id))
        current = [c for c in result["candidates"] if not c["outdated"]]
        assert len(current) == 1 and len(current[0]["candidateIds"]) == 3
        assert len(current[0]["evidence"]) == 3 and result["conflicts"] == []


@pytest.mark.parametrize(
    "kind", ["complete", "failed", "missing_span", "other_revision", "other_targets"]
)
def test_AC_SRC_5_10_legacy_success_reuse_requires_complete_scope(client, login, monkeypatch, kind):
    iid, sid = ready_pdf(client, login, monkeypatch)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        prior = legacy_items(db, item)
        if kind == "failed":
            prior[1].status = "FAILED"
        elif kind == "missing_span":
            prior[1].pages = [{**prior[1].pages[0], "spanIds": []}]
        elif kind == "other_revision":
            prior[1].revision += 1
        elif kind == "other_targets":
            prior[1].target_ids = []
        run = db.get(Run, item.run_id)
        source = db.get(Asset, sid)
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
        assert len(jobs) == (0 if kind == "complete" else 1)
        assert db.scalar(select(Spend)) is None  # Reuse planning never sends a paid request.


@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_3_5_vision_merge_deduplicates_and_caps_in_source_order(monkeypatch):
    # The legacy fake also asserts invocation order; parallel merge is covered separately.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)
    chunk = {
        "sourceId": "synthetic",
        "sourceRevision": 1,
        "pages": [
            {
                "number": number,
                "spans": [
                    {"id": f"s-{index}", "text": f"보관 안내 {number}번 {index}항"}
                    for index in range(40)
                ],
            }
            for number in range(1, 4)
        ],
    }
    seen = []

    def extract(part):
        page = part["pages"][0]
        values = []
        for span in page["spans"]:
            value = {
                "targetId": "target",
                "fieldKey": "storage",
                "value": span["text"],
                "historical": False,
                "evidence": [
                    {
                        "sourceId": "synthetic",
                        "sourceRevision": 1,
                        "page": page["number"],
                        "spanIds": [span["id"]],
                        "quote": span["text"],
                    }
                ],
            }
            values.extend([value, value])
        seen.append(page["number"])
        return ExtractionResponse(
            Extraction.model_validate(
                {
                    "candidates": values,
                    "photo_requests": [f"photo-{page['number']}-{i}" for i in range(20)],
                }
            ),
            {},
            None,
        )

    response, diagnostics = worker.extract_vision_chunks(
        chunk,
        [{"id": "target"}],
        "fixture",
        lambda *args: args[5](),
        extract,
        {"pagesEmpty": [], "pagesFailed": []},
    )
    assert seen == [1, 2, 3]
    assert diagnostics["acceptedCount"] == len(response.extraction.candidates) == 100
    assert diagnostics["candidatesSkipped"] == 20  # Unique omissions, not duplicate count.
    assert diagnostics["rejectedCount"] == 0 and diagnostics["chunksFailed"] == []
    expected = [s["text"] for page in chunk["pages"] for s in page["spans"]][:100]
    assert [c.value for c in response.extraction.candidates] == expected
    assert len(response.extraction.photo_requests) == 30
    assert diagnostics["photoRequestsSkipped"] == 30
    assert Extraction.model_validate(response.extraction.model_dump()) == response.extraction


@pytest.mark.parametrize("failure", ["ocr", "chunk", "partial_chunk"])
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_partial_file_preserves_failed_page_legacy_candidates(
    client, login, monkeypatch, failure
):
    from app.source_analysis.models import Batch
    from app.source_analysis.service import review

    # The fake fails by call order, so keep calls sequential.
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 1)

    iid, _ = ready_pdf(client, login, monkeypatch)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        run = db.get(Run, item.run_id)
        prior = legacy_items(db, item, statuses=("SUCCEEDED", "SUCCEEDED", "FAILED"))
        # Superseding spans settings; the older run must remain usable on failed pages.
        db.get(Run, prior[0].run_id).model = "older-model"
        old_ids = []
        for number, old in enumerate(prior[:2], 1):
            candidate = Candidate(
                batch_id=run.batch_id,
                item_id=old.id,
                target_id=item.target_ids[0],
                field_key="storage",
                value=f"이전 보관 안내 {number}",
                historical=False,
                evidence=[
                    {
                        "sourceId": item.asset_id,
                        "sourceRevision": item.revision,
                        "page": number,
                        "spanIds": ["legacy"],
                        "quote": f"이전 보관 안내 {number}",
                    }
                ],
            )
            db.add(candidate)
            db.flush()
            old_ids.append(candidate.id)
        db.commit()
    ocr_calls, extract_calls = [], []

    def ocr(encoded):
        ocr_calls.append(encoded)
        if failure == "ocr" and len(ocr_calls) == 2:
            raise ExtractionError("REQUEST_UNCERTAIN")
        lines = ["합성 보관 안내입니다. " * 170] * (2 if failure == "partial_chunk" else 1)
        return Transcription(lines, {"cost": 0.001}, "ocr")

    def extract(*args):
        page = args[2]["pages"][0]
        extract_calls.append((page["number"], page["spans"][0]["id"]))
        if page["number"] == 2 and (
            failure == "chunk"
            or failure == "partial_chunk"
            and page["spans"][0]["id"] == "vision-gemini-1"
        ):
            raise ExtractionError("REQUEST_UNCERTAIN")
        return page_extraction(*args)

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", extract)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == "PARTIAL" and item.error == "REQUEST_UNCERTAIN"
        assert db.get(Candidate, old_ids[0]).outdated
        assert not db.get(Candidate, old_ids[1]).outdated
        assert item.diagnostics["pagesFailed"] == (
            [{"number": 2, "code": "REQUEST_UNCERTAIN"}] if failure == "ocr" else []
        )
        assert item.diagnostics["chunksFailed"] == (
            []
            if failure == "ocr"
            else [
                {
                    "index": 3 if failure == "partial_chunk" else 1,
                    "pages": [2],
                    "code": "REQUEST_UNCERTAIN",
                }
            ]
        )
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        assert (
            len(candidates)
            == item.diagnostics["acceptedCount"]
            == (5 if failure == "partial_chunk" else 2)
        )
        assert {c.evidence[0]["page"] for c in candidates} == (
            {1, 2, 3} if failure == "partial_chunk" else {1, 3}
        )
        result = review(db, db.get(Batch, db.get(Run, item.run_id).batch_id))
        active_ids = {
            cid for c in result["candidates"] if not c["outdated"] for cid in c["candidateIds"]
        }
        assert old_ids[1] in active_ids and old_ids[0] not in active_ids
        assert {c.id for c in candidates} <= active_ids
        assert len(ocr_calls) == 3
        assert len(extract_calls) == (
            2 if failure == "ocr" else 6 if failure == "partial_chunk" else 3
        )


@pytest.mark.parametrize("setting", ["mode", "model", "prompt_version", "visual_pages"])
def test_AC_SRC_5_10_superseded_candidates_cannot_cover_returning_run_settings(
    client, login, monkeypatch, setting
):
    from app.source_analysis.models import Batch

    iid, sid = ready_pdf(client, login, monkeypatch)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        run = db.get(Run, item.run_id)
        prior = legacy_items(db, item)
        old_run = db.get(Run, prior[0].run_id)
        setattr(
            old_run,
            setting,
            {
                "mode": "mock",
                "model": "older-model",
                "prompt_version": "older-prompt",
                "visual_pages": {sid: [1]},
            }[setting],
        )
        old_candidate = Candidate(
            batch_id=run.batch_id,
            item_id=prior[1].id,
            target_id=item.target_ids[0],
            field_key="storage",
            value="이전 보관 안내",
            historical=False,
            evidence=[],
        )
        db.add(old_candidate)
        db.flush()
        worker.store_candidates(
            db, db.get(Batch, run.batch_id), item, Extraction(candidates=[], photo_requests=[])
        )
        db.flush()
        assert old_candidate.outdated
        # All legacy items still report success, but their results no longer cover p2.
        assert [old.status for old in prior] == ["SUCCEEDED"] * 3
        returning = Run(
            batch_id=run.batch_id,
            mode=old_run.mode,
            model=old_run.model,
            prompt_version=old_run.prompt_version,
            targets=old_run.targets,
            visual_pages=old_run.visual_pages,
        )
        db.add(returning)
        db.flush()
        worker.enqueue_extraction(
            db,
            db.get(Asset, sid),
            returning,
            SimpleNamespace(target_ids=item.target_ids),
            list(db.scalars(select(Page).where(Page.asset_id == sid))),
        )
        db.flush()
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == returning.id, Item.phase == "EXTRACT"))
        )
        assert len(jobs) == 1
        assert {p["number"] for p in jobs[0].pages} == ({2} if setting == "mode" else {1, 2, 3})
        assert db.scalar(select(Spend)) is None


# DEV-191 regressions below are authored from the behavior contract without reading
# worker implementation. Provider responses and crop labels are entirely invented.


def _parallel_chunk(count):
    return {
        "sourceId": "parallel-fixture",
        "sourceRevision": 1,
        "checksum": "invented",
        "pages": [{"number": n, "spans": []} for n in range(1, count + 1)],
    }


def test_AC_SRC_5_parallel_concurrency_setting_contract(monkeypatch):
    from pydantic import ValidationError

    from app.core.config import Settings

    monkeypatch.delenv("SOURCE_OCR_CONCURRENCY", raising=False)
    assert Settings(_env_file=None).source_ocr_concurrency == 4
    for value in (1, 4, 8):
        assert (
            Settings(_env_file=None, source_ocr_concurrency=value).source_ocr_concurrency == value
        )
    for value in (0, -1, 9):
        with pytest.raises(ValidationError):
            Settings(_env_file=None, source_ocr_concurrency=value)


@pytest.mark.parametrize("failure", ["REQUEST_UNCERTAIN", "RATE_LIMITED"])
@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_10_parallel_order_spans_diagnostics_and_candidates(monkeypatch, failure):
    import copy
    import threading
    import time

    monkeypatch.setattr(worker, "crops", lambda data: data.decode().split(","))
    images = {1: b"a,b,c", 2: b"blank", 3: b"discard,fail", 4: b"last"}
    observed = []
    for concurrency in (1, 4):
        monkeypatch.setattr(get_settings(), "source_ocr_concurrency", concurrency)
        active = maximum = 0
        lock = threading.Lock()
        attempted, completed = [], []

        def ocr(label, lock=lock, attempted=attempted, completed=completed):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
                attempted.append(label)
            try:
                time.sleep(0.06 if label == "a" else 0.01)
                if label == "fail":
                    raise ExtractionError(failure)
                return Transcription([] if label == "blank" else [f"보관 안내 {label}"], {}, label)
            finally:
                with lock:
                    active -= 1
                    completed.append(label)

        monkeypatch.setattr(worker, "transcribe", ocr)
        chunk = _parallel_chunk(4)
        diagnostics = worker.transcribe_pages(chunk, images, lambda *args: args[5]())
        response, merged = worker.extract_vision_chunks(
            chunk,
            [{"id": "target"}],
            "fixture",
            lambda *args: args[5](),
            lambda part: page_extraction("openrouter", OCR_MODEL, part, [{"id": "target"}], []),
            diagnostics,
        )
        assert 1 <= maximum <= concurrency
        assert active == 0 and sorted(attempted) == sorted(completed)
        assert attempted.count("fail") == 1
        if concurrency == 4:
            assert maximum > 1 and completed.index("b") < completed.index("a")
        assert diagnostics["pagesEmpty"] == [2]
        assert diagnostics["pagesFailed"] == [{"number": 3, "code": failure}]
        assert chunk["pages"][2]["spans"] == []
        assert [s["text"] for s in chunk["pages"][0]["spans"]] == [
            "보관 안내 a",
            "보관 안내 b",
            "보관 안내 c",
        ]
        assert [s["id"] for s in chunk["pages"][0]["spans"]] == [
            f"vision-gemini-{index}" for index in range(3)
        ]
        observed.append(copy.deepcopy((chunk, merged, response.extraction.model_dump())))
    assert observed[0] == observed[1]


def test_AC_SRC_2_5_parallel_single_long_page_is_bounded_and_faster(monkeypatch):
    import threading
    import time

    monkeypatch.setattr(worker, "crops", lambda _: [str(n) for n in range(8)])
    timings, outputs = [], []
    for concurrency in (1, 4):
        monkeypatch.setattr(get_settings(), "source_ocr_concurrency", concurrency)
        active = maximum = 0
        lock = threading.Lock()

        def ocr(label, lock=lock):
            nonlocal active, maximum
            with lock:
                active += 1
                maximum = max(maximum, active)
            try:
                time.sleep(0.04)
                return Transcription([f"합성 안내 {label}"], {}, label)
            finally:
                with lock:
                    active -= 1

        monkeypatch.setattr(worker, "transcribe", ocr)
        chunk = _parallel_chunk(1)
        before = time.monotonic()
        diagnostics = worker.transcribe_pages(chunk, {1: b"long page"}, lambda *a: a[5]())
        timings.append(time.monotonic() - before)
        outputs.append((chunk, diagnostics))
        assert maximum <= concurrency and active == 0
        assert maximum == 1 if concurrency == 1 else maximum > 1
    assert outputs[0] == outputs[1]
    assert timings[1] < timings[0] * 0.8


@pytest.mark.parametrize(
    "code",
    ["BUDGET_EXCEEDED", "PROVIDER_AUTH", "SOURCE_CHANGED", "PRIVACY_CHANGED", "PROMPT_CHANGED"],
)
def test_AC_SRC_5_10_parallel_fast_later_hard_error_stops_and_drains(monkeypatch, code):
    import threading
    import time

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    monkeypatch.setattr(worker, "crops", lambda _: [str(n) for n in range(20)])
    first_started, error_seen = threading.Event(), threading.Event()
    lock = threading.Lock()
    started, finished, after_error = [], [], []

    def ocr(label):
        with lock:
            started.append(label)
            if error_seen.is_set():
                after_error.append(label)
        try:
            if label == "0":
                first_started.set()
                assert error_seen.wait(2), "A later crop must run while the first crop waits"
            elif label == "1":
                assert first_started.wait(2)
                raise ExtractionError(code, usage={"cost": 0.0005})
            else:
                assert error_seen.wait(2)
            time.sleep(0.04)
            return Transcription([f"보관 문구 {label}"], {"cost": 0.001}, label)
        finally:
            with lock:
                finished.append(label)

    def call(*args):
        try:
            return args[5]()
        except ExtractionError:
            error_seen.set()
            raise

    monkeypatch.setattr(worker, "transcribe", ocr)
    with pytest.raises(ExtractionError) as err:
        worker.transcribe_pages(_parallel_chunk(1), {1: b"long page"}, call)
    assert err.value.code == code
    assert 2 <= len(started) <= 4 and after_error == []
    assert sorted(started) == sorted(finished), "The caller must wait for in-flight settlement"


@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_2_5_10_parallel_real_worker_partial_and_call_accounting(client, login, monkeypatch):
    import threading
    import time

    iid, _ = ready_pdf(client, login, monkeypatch, count=4)
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    labels = iter(["slow", "empty", "uncertain", "last"])
    monkeypatch.setattr(worker, "crops", lambda _: [next(labels)])
    lock = threading.Lock()
    attempted = []

    def ocr(label):
        with lock:
            attempted.append(label)
        time.sleep(0.06 if label == "slow" else 0.01)
        if label == "uncertain":
            raise ExtractionError("REQUEST_UNCERTAIN")
        return Transcription(
            [] if label == "empty" else [f"서늘한 곳 보관 {label}"], {"cost": 0.001}, label
        )

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", page_extraction)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == "PARTIAL"
        assert item.diagnostics["pagesEmpty"] == [2]
        assert item.diagnostics["pagesFailed"] == [{"number": 3, "code": "REQUEST_UNCERTAIN"}]
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        assert len(candidates) == 2 and {c.evidence[0]["page"] for c in candidates} == {1, 4}
        rows = list(db.scalars(select(Spend)))
        assert len(rows) == 6
        assert sum(r.charged_micros or 0 for r in rows) == 7000
        assert sum(r.charged_micros is None for r in rows) == 1
        assert next(r for r in rows if r.charged_micros is None).reserved_micros > 0
    assert sorted(attempted) == ["empty", "last", "slow", "uncertain"]


def test_AC_SRC_5_10_parallel_cancellation_fences_new_sends_but_settles_sent_calls(
    client, login, monkeypatch
):
    import threading

    iid, _ = ready_pdf(client, login, monkeypatch, count=8)
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    monkeypatch.setattr(worker, "crops", lambda _: ["invented"])
    four_started, cancelled = threading.Event(), threading.Event()
    lock = threading.Lock()
    started, finished = [], []

    def ocr(_):
        with lock:
            index = len(started)
            started.append(index)
            if len(started) == 4:
                four_started.set()
        assert four_started.wait(3), "Four OCR sends should be allowed concurrently"
        if index == 0:
            with get_sessionmaker()() as db:
                item = db.get(Item, iid)
                item.status, item.lease_token = "CANCELLED", None
                db.commit()
            cancelled.set()
        assert cancelled.wait(3)
        with lock:
            finished.append(index)
        return Transcription(["서늘한 곳에 보관"], {"cost": 0.001}, "sent")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(
        worker, "extract", lambda *a: pytest.fail("Cancelled source cannot extract")
    )
    assert worker.run_once()
    assert sorted(started) == sorted(finished) == list(range(4))
    with get_sessionmaker()() as db:
        assert db.get(Item, iid).status == "CANCELLED"
        assert db.scalar(select(Candidate).where(Candidate.item_id == iid)) is None
        rows = list(db.scalars(select(Spend)))
        assert len(rows) == 4 and sum(r.charged_micros for r in rows) == 4000


def test_AC_SRC_5_10_parallel_admitted_call_is_fenced_before_actual_send(monkeypatch):
    import threading

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 2)
    monkeypatch.setattr(worker, "crops", lambda _: ["fails", "waiting", "later"])
    waiting, error_observed = threading.Event(), threading.Event()
    sent = []

    def ocr(label):
        sent.append(label)
        if label == "fails":
            assert waiting.wait(3)
            raise ExtractionError("PROVIDER_AUTH")
        return Transcription(["보관 안내"], {}, label)

    def call(*args):
        # Model a reservation callback that has admitted work but has not sent it.
        # The worker must re-check its hard-error fence at the actual fn boundary.
        if args[0].endswith("-1"):
            waiting.set()
            assert error_observed.wait(3)
        try:
            return args[5]()
        except ExtractionError:
            error_observed.set()
            raise

    monkeypatch.setattr(worker, "transcribe", ocr)
    with pytest.raises(ExtractionError, match="PROVIDER_AUTH"):
        worker.transcribe_pages(_parallel_chunk(1), {1: b"invented"}, call)
    assert sent == ["fails"]


def test_AC_SRC_2_10_parallel_same_page_failure_uses_first_crop_error(monkeypatch):
    import threading

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    monkeypatch.setattr(worker, "crops", lambda data: data.decode().split(","))
    later_failed = threading.Event()

    def ocr(label):
        if label == "earlier":
            assert later_failed.wait(3)
            raise ExtractionError("REQUEST_UNCERTAIN")
        if label == "later":
            later_failed.set()
            raise ExtractionError("RATE_LIMITED", retry_after=1)
        return Transcription(["다른 쪽의 보관 안내"], {}, label)

    monkeypatch.setattr(worker, "transcribe", ocr)
    chunk = _parallel_chunk(2)
    diagnostics = worker.transcribe_pages(
        chunk, {1: b"earlier,later", 2: b"survives"}, lambda *a: a[5]()
    )
    assert diagnostics == {
        "pagesEmpty": [],
        "pagesFailed": [{"number": 1, "code": "REQUEST_UNCERTAIN"}],
    }
    assert chunk["pages"][0]["spans"] == []
    assert chunk["pages"][1]["spans"][0]["text"] == "다른 쪽의 보관 안내"


@pytest.mark.usefixtures("single_page_extraction_chunks")
def test_AC_SRC_5_10_parallel_worker_heartbeat_renews_while_calls_are_blocked(
    client, login, monkeypatch
):
    import threading
    import time

    iid, _ = ready_pdf(client, login, monkeypatch, count=4)
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    monkeypatch.setattr(worker, "crops", lambda _: ["invented"])
    real_event = threading.Event

    class ShortHeartbeatEvent:
        def __init__(self):
            self.event = real_event()

        def set(self):
            return self.event.set()

        def is_set(self):
            return self.event.is_set()

        def wait(self, timeout=None):
            return self.event.wait(0.02 if timeout is None else min(timeout, 0.02))

    monkeypatch.setattr(worker, "Event", ShortHeartbeatEvent)
    barrier = threading.Barrier(4)
    renewed = real_event()
    lock = threading.Lock()
    started = []

    def ocr(_):
        with lock:
            index = len(started)
            started.append(index)
        barrier.wait(timeout=3)
        if index == 0:
            with get_sessionmaker()() as db:
                original_lease = db.get(Item, iid).lease_until
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                with get_sessionmaker()() as db:
                    current_lease = db.get(Item, iid).lease_until
                if current_lease > original_lease:
                    renewed.set()
                    break
                time.sleep(0.01)
        assert renewed.wait(3), "Heartbeat must renew while all OCR requests are in flight"
        return Transcription(["서늘한 곳에 보관"], {"cost": 0.001}, "heartbeat")

    monkeypatch.setattr(worker, "transcribe", ocr)
    monkeypatch.setattr(worker, "extract", page_extraction)
    assert worker.run_once()
    assert renewed.is_set() and len(started) == 4
    with get_sessionmaker()() as db:
        assert db.get(Item, iid).status == "SUCCEEDED"
        assert len(list(db.scalars(select(Spend)))) == 8


def test_AC_SRC_5_10_parallel_provider_hard_error_fences_during_slow_settlement(monkeypatch):
    import threading
    import time

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 2)
    monkeypatch.setattr(worker, "crops", lambda _: ["earlier", "hard-error", "forbidden", "later"])
    earlier_started = threading.Event()
    provider_failed = threading.Event()
    earlier_finished = threading.Event()
    settled = threading.Event()
    lock = threading.Lock()
    started, finished = [], []

    def ocr(label):
        with lock:
            started.append(label)
        if label == "earlier":
            earlier_started.set()
            assert provider_failed.wait(3)
            # Free a worker while the failing call's callback is still settling.
            earlier_finished.set()
            with lock:
                finished.append(label)
            return Transcription(["먼저 시작한 보관 안내"], {"cost": 0.001}, label)
        if label == "hard-error":
            assert earlier_started.wait(3)
            with lock:
                finished.append(label)
            raise ExtractionError("PROVIDER_AUTH", usage={"cost": 0.0005})
        pytest.fail("A provider hard error must fence sends before callback settlement finishes")

    def call(*args):
        try:
            return args[5]()
        except ExtractionError:
            provider_failed.set()
            assert earlier_finished.wait(3)
            time.sleep(0.08)
            settled.set()
            raise

    monkeypatch.setattr(worker, "transcribe", ocr)
    with pytest.raises(ExtractionError, match="PROVIDER_AUTH"):
        worker.transcribe_pages(_parallel_chunk(1), {1: b"invented"}, call)
    assert provider_failed.is_set() and settled.is_set()
    assert sorted(started) == sorted(finished) == ["earlier", "hard-error"]


def _followup_chunk(texts):
    return {
        "sourceId": "synthetic",
        "sourceRevision": 1,
        "checksum": "fixture",
        "pages": [
            {
                "number": number,
                "spans": [
                    {"id": f"local-{index}", "text": text} for index, text in enumerate(lines)
                ],
            }
            for number, lines in enumerate(texts, 1)
        ],
    }


def _followup_response(part, *, duplicates=False, photos=0):
    candidates = []
    for page in part["pages"]:
        for span in page["spans"]:
            value = {
                "targetId": "target",
                "fieldKey": "storage",
                "value": span["text"],
                "historical": False,
                "evidence": [
                    {
                        "sourceId": part["sourceId"],
                        "sourceRevision": part["sourceRevision"],
                        "page": page["number"],
                        "spanIds": [span["id"]],
                        "quote": span["text"],
                    }
                ],
            }
            candidates.extend([value, value] if duplicates else [value])
    first = part["pages"][0]["number"]
    return ExtractionResponse(
        Extraction.model_validate(
            {
                "candidates": candidates,
                "photo_requests": [f"photo-{first}-{i}" for i in range(photos)],
            }
        ),
        {"cost": 0.0002},
        f"extract-{first}",
    )


def test_AC_SRC_2_5_followup_pack_exact_text_size_four_pages_and_skip_empty():
    import copy

    for texts, expected in [
        ([["가" * 1000]] * 4 + [["나"]], [[1, 2, 3, 4], [5]]),
        ([["짧은 문구"]] * 5, [[1, 2, 3, 4], [5]]),
        ([["짧은 문구"]] * 20, [list(range(n, n + 4)) for n in range(1, 21, 4)]),
        ([["처음"], [], ["중간"], [], ["마지막"]], [[1, 3, 5]]),
    ]:
        chunk = _followup_chunk(texts)
        original = copy.deepcopy(chunk)
        parts = list(worker.extraction_chunks(chunk, skip_empty=True))
        assert [[p["number"] for p in part["pages"]] for part in parts] == expected
        assert [p for part in parts for p in part["pages"]] == [
            p for p in original["pages"] if p["spans"]
        ]
        assert chunk == original
        assert all(
            part["sourceId"] == "synthetic" and part["checksum"] == "fixture" for part in parts
        )
    # Empty pages retain their old observable position for text extraction.
    text_parts = list(worker.extraction_chunks(_followup_chunk([["처음"], [], ["끝"]])))
    assert [[p["number"] for p in part["pages"]] for part in text_parts] == [[1], [2], [3]]
    assert text_parts[1]["pages"][0]["spans"] == []


def test_AC_SRC_2_3_followup_large_page_splits_only_at_original_spans():
    chunk = _followup_chunk([["가" * 2500, "나" * 1500, "다" * 1500], ["라" * 1000]])
    parts = list(worker.extraction_chunks(chunk, skip_empty=True))
    assert [[(p["number"], [s["id"] for s in p["spans"]]) for p in c["pages"]] for c in parts] == [
        [(1, ["local-0", "local-1"])],
        [(1, ["local-2"]), (2, ["local-0"])],
    ]
    assert [s for c in parts for p in c["pages"] for s in p["spans"]] == [
        s for p in chunk["pages"] for s in p["spans"]
    ]
    oversized = list(
        worker.extraction_chunks(_followup_chunk([["가" * 4001], ["끝"]]), skip_empty=True)
    )
    assert [sum(len(s["text"]) for p in c["pages"] for s in p["spans"]) for c in oversized] == [
        4001,
        1,
    ]


def test_AC_SRC_3_followup_multipage_evidence_uses_page_local_span_ids_and_quotes():
    import copy

    chunk = _followup_chunk([["첫 페이지의 보관 안내"], ["둘째 페이지의 배송 안내"]])
    first, second = _followup_response(chunk).extraction.candidates
    valid = first.model_dump(by_alias=True)
    valid["evidence"].extend(second.model_dump(by_alias=True)["evidence"])
    borrowed = copy.deepcopy(valid)
    borrowed["evidence"][0]["quote"] = "둘째 페이지의 배송 안내"
    unknown = copy.deepcopy(valid)
    unknown["evidence"][1]["spanIds"] = ["absent"]
    outside = copy.deepcopy(valid)
    outside["evidence"][1]["page"] = 3
    accepted, diagnostics = worker.validate_candidates(
        Extraction.model_validate(
            {
                "candidates": [valid, borrowed, unknown, outside],
                "photo_requests": [],
            }
        ),
        chunk,
        {"target"},
    )
    assert len(accepted.candidates) == 1
    assert [e.page for e in accepted.candidates[0].evidence] == [1, 2]
    assert diagnostics["acceptedCount"] == 1 and diagnostics["rejectedCount"] == 3
    # A valid page/span pair from the source is still invalid in a different chunk.
    rejected, diagnostics = worker.validate_candidates(
        Extraction(candidates=[second], photo_requests=[]),
        {**chunk, "pages": chunk["pages"][:1]},
        {"target"},
    )
    assert rejected.candidates == [] and diagnostics["rejectedCount"] == 1


def test_AC_SRC_2_3_5_followup_parallel_extract_deterministic_merge_caps_and_wrapper(monkeypatch):
    import threading

    chunk = _followup_chunk(
        [[f"보관 안내 {page}-{span} " + "가" * 80 for span in range(8)] for page in range(16)]
    )
    outputs = []
    for concurrency in (1, 4):
        monkeypatch.setattr(get_settings(), "source_ocr_concurrency", concurrency)
        barrier = threading.Barrier(4)
        second_finished = threading.Event()
        lock = threading.Lock()
        active = maximum = 0
        wrapped, sent, completed = [], [], []

        def extract(
            part,
            lock=lock,
            sent=sent,
            concurrency=concurrency,
            barrier=barrier,
            second_finished=second_finished,
            completed=completed,
        ):
            nonlocal active, maximum
            number = part["pages"][0]["number"]
            with lock:
                active += 1
                maximum = max(maximum, active)
                sent.append(number)
            try:
                if concurrency == 4:
                    barrier.wait(timeout=3)
                    if number == 1:
                        assert second_finished.wait(3)
                with lock:
                    completed.append(number)
                if number == 5:
                    second_finished.set()
                return _followup_response(part, duplicates=True, photos=20)
            finally:
                with lock:
                    active -= 1

        def call(stage, model, part, targets, images, fn, lock=lock, wrapped=wrapped):
            assert model == "fixture" and targets == [{"id": "target"}] and images == []
            with lock:
                wrapped.append(tuple(p["number"] for p in part["pages"]))
            return fn()

        response, diagnostics = worker.extract_vision_chunks(
            chunk,
            [{"id": "target"}],
            "fixture",
            call,
            extract,
            {"pagesEmpty": [], "pagesFailed": []},
        )
        assert len(wrapped) == len(sent) == 4 and active == 0 and maximum == concurrency
        assert sorted(wrapped) == [(1, 2, 3, 4), (5, 6, 7, 8), (9, 10, 11, 12), (13, 14, 15, 16)]
        if concurrency == 4:
            assert completed.index(5) < completed.index(1)
        expected = [s["text"] for p in chunk["pages"] for s in p["spans"]][:100]
        assert [c.value for c in response.extraction.candidates] == expected
        assert diagnostics["acceptedCount"] == 100 and diagnostics["candidatesSkipped"] == 28
        assert diagnostics["photoRequestsSkipped"] == 50
        assert (
            response.extraction.photo_requests
            == [f"photo-{p}-{i}" for p in (1, 5) for i in range(20)][:30]
        )
        outputs.append((response.extraction.model_dump(), diagnostics))
    assert outputs[0] == outputs[1]


@pytest.mark.parametrize("all_failed", [False, True])
def test_AC_SRC_2_5_10_followup_multipage_chunk_failure_keeps_original_indices(
    monkeypatch, all_failed
):
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    chunk = _followup_chunk(
        [[f"페이지 {i} " + "가" * (1000 - len(f"페이지 {i} "))] for i in range(1, 12)]
    )
    chunk["pages"][1]["spans"] = []
    chunk["pages"][2]["spans"] = []
    diagnostics = {"pagesEmpty": [2], "pagesFailed": [{"number": 3, "code": "OCR_TEXT_LIMIT"}]}
    first_error = ExtractionError("REQUEST_UNCERTAIN", request_id="first-chunk")
    seen = []

    def extract(part):
        numbers = [p["number"] for p in part["pages"]]
        seen.append(numbers)
        if all_failed or numbers[0] == 7:
            raise first_error if numbers[0] == 1 else ExtractionError("INVALID_MODEL_OUTPUT")
        return _followup_response(part)

    if all_failed:
        with pytest.raises(ExtractionError) as err:
            worker.extract_vision_chunks(
                chunk, [{"id": "target"}], "fixture", lambda *a: a[5](), extract, diagnostics
            )
        assert err.value is first_error
    else:
        response, diagnostics = worker.extract_vision_chunks(
            chunk,
            [{"id": "target"}],
            "fixture",
            lambda *a: a[5](),
            extract,
            diagnostics,
        )
        assert [c.evidence[0].page for c in response.extraction.candidates] == [1, 4, 5, 6, 11]
        assert diagnostics["chunksFailed"] == [
            {"index": 1, "pages": [7, 8, 9, 10], "code": "INVALID_MODEL_OUTPUT"}
        ]
        assert diagnostics["pagesFailed"] == [{"number": 3, "code": "OCR_TEXT_LIMIT"}]
    assert sorted(seen) == [[1, 4, 5, 6], [7, 8, 9, 10], [11]]


@pytest.mark.parametrize(
    "code",
    ["PROVIDER_AUTH", "BUDGET_EXCEEDED", "SOURCE_CHANGED", "PRIVACY_CHANGED", "PROMPT_CHANGED"],
)
def test_AC_SRC_5_10_followup_extract_hard_error_stops_before_slow_settlement(monkeypatch, code):
    import threading
    import time

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 2)
    chunk = _followup_chunk([[f"{n} 보관 안내"] for n in range(40)])
    earlier_started, provider_failed, earlier_finished, settled = [
        threading.Event() for _ in range(4)
    ]
    sent, finished = [], []
    lock = threading.Lock()

    def extract(part):
        number = part["pages"][0]["number"]
        with lock:
            sent.append(number)
        if number == 1:
            earlier_started.set()
            assert provider_failed.wait(3)
            earlier_finished.set()
        elif number == 5:
            assert earlier_started.wait(3)
            with lock:
                finished.append(number)
            raise ExtractionError(code, usage={"cost": 0.0001})
        else:
            pytest.fail("Hard provider error must stop new sends during settlement")
        with lock:
            finished.append(number)
        return _followup_response(part)

    def call(*args):
        try:
            return args[5]()
        except ExtractionError:
            provider_failed.set()
            assert earlier_finished.wait(3)
            time.sleep(0.08)
            settled.set()
            raise

    with pytest.raises(ExtractionError, match=code):
        worker.extract_vision_chunks(
            chunk,
            [{"id": "target"}],
            "fixture",
            call,
            extract,
            {"pagesEmpty": [], "pagesFailed": []},
        )
    assert sorted(sent) == sorted(finished) == [1, 5]
    assert settled.is_set()


def test_AC_SRC_5_10_followup_extract_waiting_reservation_is_fenced_and_drained(monkeypatch):
    import threading

    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 2)
    waiting, provider_failed, released = [threading.Event() for _ in range(3)]
    sent, callbacks, settled = [], [], []

    def extract(part):
        number = part["pages"][0]["number"]
        sent.append(number)
        assert number == 1, "An admitted reservation may not send after a hard failure"
        assert waiting.wait(3)
        raise ExtractionError("PROVIDER_AUTH")

    def call(*args):
        number = args[2]["pages"][0]["number"]
        callbacks.append(number)
        if number == 5:
            waiting.set()
            assert provider_failed.wait(3)
        try:
            return args[5]()
        except ExtractionError:
            provider_failed.set()
            raise
        finally:
            settled.append(number)
            if number == 5:
                released.set()

    with pytest.raises(ExtractionError, match="PROVIDER_AUTH"):
        worker.extract_vision_chunks(
            _followup_chunk([["페이지"]] * 40),
            [{"id": "target"}],
            "fixture",
            call,
            extract,
            {"pagesEmpty": [], "pagesFailed": []},
        )
    assert sent == [1] and sorted(callbacks) == sorted(settled) == [1, 5]
    assert released.is_set()


@pytest.mark.parametrize("all_failed", [False, True])
def test_AC_SRC_2_5_10_followup_product_multipage_failure_status_and_ledger(
    client, login, monkeypatch, all_failed
):
    import threading

    iid, _ = ready_pdf(client, login, monkeypatch, count=12)
    monkeypatch.setattr(get_settings(), "source_ocr_concurrency", 4)
    monkeypatch.setattr(
        worker,
        "transcribe",
        lambda _: Transcription(
            ["서늘한 곳에 보관해 주세요."],
            {"cost": 0.001},
            "ocr",
        ),
    )
    barrier = threading.Barrier(3)
    seen = []

    def extract(mode, model, part, targets, images):
        numbers = [p["number"] for p in part["pages"]]
        seen.append(numbers)
        barrier.wait(timeout=3)
        if all_failed or numbers[0] == 5:
            raise ExtractionError("REQUEST_UNCERTAIN", usage={"cost": 0.0005})
        response = _followup_response(part)
        for candidate in response.extraction.candidates:
            candidate.target_id = targets[0]["id"]
        return response

    monkeypatch.setattr(worker, "extract", extract)
    assert worker.run_once()
    assert sorted(seen) == [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == ("FAILED" if all_failed else "PARTIAL")
        assert item.error == "REQUEST_UNCERTAIN"
        assert all(page["ocrSpans"] for page in item.pages)
        candidates = list(db.scalars(select(Candidate).where(Candidate.item_id == iid)))
        if all_failed:
            assert candidates == []
        else:
            assert item.diagnostics["chunksFailed"] == [
                {
                    "index": 1,
                    "pages": [5, 6, 7, 8],
                    "code": "REQUEST_UNCERTAIN",
                }
            ]
            assert sorted(c.evidence[0]["page"] for c in candidates) == [1, 2, 3, 4, 9, 10, 11, 12]
            assert item.diagnostics["acceptedCount"] == len(candidates) == 8
        rows = list(db.scalars(select(Spend)))
        assert len(rows) == 15  # OCR12 + three packed extraction requests, no replay.
        assert all(row.charged_micros is not None for row in rows)
        assert sum(row.charged_micros for row in rows) == (13500 if all_failed else 12900)
