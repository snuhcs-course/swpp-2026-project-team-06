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
def test_AC_SRC_2_5_10_stage1_chunk_failures_preserve_paid_ocr(
    client, login, monkeypatch, failure, code
):
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


def test_AC_SRC_2_3_5_vision_merge_deduplicates_and_caps_in_source_order():
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
def test_AC_SRC_2_5_partial_file_preserves_failed_page_legacy_candidates(
    client, login, monkeypatch, failure
):
    from app.source_analysis.models import Batch
    from app.source_analysis.service import review

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
