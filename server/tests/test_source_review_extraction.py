"""AC-SRC-2/3/5: trusted source-copy extraction policy, no DB or provider calls."""

from copy import deepcopy
from types import SimpleNamespace

import pytest

from app.ai.source_analysis import PROMPT_VERSION, ExtractionError, ExtractionResponse
from app.source_analysis import worker
from app.source_analysis.models import Item
from app.source_analysis.schemas import Extraction


@pytest.fixture(scope="session", autouse=True)
def _schema():
    yield


@pytest.fixture(autouse=True)
def seeded():
    yield


def case(*, historical=True, field="composition"):
    quote = "지난해 선물 상자 3kg 구성"
    chunk = {
        "sourceId": "source",
        "sourceRevision": 2,
        "pages": [{"number": 1, "spans": [{"id": "span", "text": quote}]}],
    }
    extraction = Extraction.model_validate(
        {
            "candidates": [
                {
                    "targetId": "target",
                    "fieldKey": field,
                    "value": quote,
                    "historical": historical,
                    "evidence": [
                        {
                            "sourceId": "source",
                            "sourceRevision": 2,
                            "page": 1,
                            "spanIds": ["span"],
                            "quote": quote,
                        }
                    ],
                }
            ],
            "photoRequests": [],
        }
    )
    return extraction, chunk


def test_AC_SRC_2_historical_text_requires_explicit_opt_in():
    extraction, chunk = case()
    with pytest.raises(ExtractionError, match="HISTORICAL_FIELD"):
        worker.validate(extraction, chunk, {"target"})
    rejected, diagnostics = worker.validate_candidates(extraction, chunk, {"target"})
    assert rejected.candidates == []
    assert diagnostics["rejected"][0]["code"] == "HISTORICAL_FIELD"
    accepted, diagnostics = worker.validate_candidates(
        extraction, chunk, {"target"}, allow_historical_fields=True
    )
    assert accepted.model_dump() == extraction.model_dump()
    assert diagnostics["rejectedCount"] == 0
    assert accepted.candidates[0].historical is True


@pytest.mark.parametrize(
    "mutation,code",
    [
        ("target", "INVALID_TARGET"),
        ("quote", "INVALID_EVIDENCE"),
        ("revision", "INVALID_EVIDENCE"),
        ("source", "INVALID_EVIDENCE"),
        ("span", "INVALID_EVIDENCE"),
        ("number", "UNSUPPORTED_NUMBER"),
        ("private", "UNSUPPORTED_PRIVATE_VALUE"),
        ("photo", "HISTORICAL_FIELD"),
        ("masked", "INVALID_EVIDENCE"),
    ],
)
def test_AC_SRC_3_opt_in_retains_all_guards(mutation, code):
    extraction, chunk = case()
    candidate = extraction.candidates[0]
    evidence = candidate.evidence[0]
    if mutation == "target":
        candidate.target_id = "foreign"
    elif mutation == "quote":
        evidence.quote = "없는 원문 3kg"
    elif mutation == "revision":
        evidence.source_revision = 1
    elif mutation == "source":
        evidence.source_id = "foreign"
    elif mutation == "span":
        evidence.span_ids = ["foreign"]
    elif mutation == "number":
        candidate.value += " 99kg"
    elif mutation == "private":
        candidate.value = "연락 test@example.com"
    elif mutation == "photo":
        candidate.field_key = "packagePhoto"
    elif mutation == "masked":
        candidate.value = "구성"
        evidence.quote = "[가림]"
        chunk["pages"][0]["spans"][0]["text"] = "[가림]"
    accepted, diagnostics = worker.validate_candidates(
        extraction, chunk, {"target"}, allow_historical_fields=True
    )
    assert accepted.candidates == []
    assert diagnostics["rejected"][0]["code"] == code


@pytest.mark.parametrize("enabled", [False, True])
def test_AC_SRC_2_nonhistorical_and_legacy_history_unchanged(enabled):
    for historical, field in [(False, "composition"), (True, "historicalSales")]:
        extraction, chunk = case(historical=historical, field=field)
        assert (
            worker.validate(
                extraction, chunk, {"target"}, allow_historical_fields=enabled
            ).model_dump()
            == extraction.model_dump()
        )


@pytest.mark.parametrize("enabled", [False, True])
@pytest.mark.parametrize("vision", [False, True])
@pytest.mark.parametrize("changes_in_flight", [False, True])
def test_AC_SRC_5_worker_uses_current_trusted_batch_policy(
    monkeypatch, enabled, vision, changes_in_flight
):
    extraction, chunk = case()
    batch = SimpleNamespace(source_copy_enabled=enabled, id="batch", review_version=1)
    source = SimpleNamespace(
        id="source",
        revision=2,
        mime="image/png" if vision else "text/plain",
        storage_key="key",
        status="PREPARED",
        preprocess_version=worker.PREPROCESS_VERSION,
        sanitization_version=1,
        privacy_approved=True,
        checksum="checksum",
    )
    item = SimpleNamespace(
        phase="EXTRACT",
        sanitization_version=1,
        target_ids=["target"],
        pages=[{"number": 1, "spanIds": ["span"]}],
    )
    run = SimpleNamespace(
        prompt_version=PROMPT_VERSION,
        mode="openrouter" if vision else "mock",
        model="test",
        targets=[{"id": "target", "name": "감귤"}],
        visual_pages={},
    )
    page = SimpleNamespace(
        number=1,
        redacted_spans=chunk["pages"][0]["spans"],
        sanitized_key="image" if vision else None,
    )

    class Session:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, model, key):
            assert model is Item
            return item

        def scalar(self, query):
            return page

        def commit(self):
            pass

    monkeypatch.setattr(worker, "get_sessionmaker", lambda: Session)
    monkeypatch.setattr(worker, "lock_context", lambda *args: (batch, source, run, item))
    monkeypatch.setattr(worker, "Storage", lambda: SimpleNamespace(get=lambda key: b"image"))
    monkeypatch.setattr(worker, "refresh_runs", lambda *args: None)
    saved, calls = [], []
    monkeypatch.setattr(
        worker, "store_candidates", lambda db, batch, item, result: saved.append(result)
    )
    monkeypatch.setattr("app.source_analysis.budget.settle", lambda *args: None)

    def provider(mode, model, payload, targets, images):
        calls.append(deepcopy(payload))
        # A provider/payload cannot opt in: process uses only batch state.
        payload["allowHistoricalFields"] = True
        if changes_in_flight:
            batch.source_copy_enabled = not enabled
        return ExtractionResponse(extraction.model_copy(deep=True), {"cost": 0}, "fixture")

    monkeypatch.setattr(worker, "extract", provider)
    if vision:
        monkeypatch.setattr(worker, "transcribe_pages", lambda *args: {})
        monkeypatch.setattr(worker, "save_vision_diagnostics", lambda *args: None)
        monkeypatch.setattr(worker, "paid_vision_call", lambda *args: args[-1]())
    worker.process("item", "token")
    assert len(calls) == 1
    if changes_in_flight:
        assert not saved
        assert (item.status, item.error) == ("CANCELLED", "SOURCE_CHANGED")
        return
    assert bool(saved) is enabled
    assert item.status == ("SUCCEEDED" if enabled else "FAILED")
    assert item.diagnostics["extractionPolicy"] == worker.extraction_policy(enabled)
    if enabled:
        assert saved[0].model_dump() == extraction.model_dump()


@pytest.mark.parametrize(
    "enabled,old_policy,reused",
    [
        (False, None, True),
        (False, worker.SOURCE_COPY_EXTRACTION_POLICY, False),
        (True, None, False),
        (True, worker.SOURCE_COPY_EXTRACTION_POLICY, True),
    ],
)
@pytest.mark.parametrize("vision", [False, True])
def test_AC_SRC_5_cache_only_reuses_matching_extraction_policy(enabled, old_policy, reused, vision):
    pages = [SimpleNamespace(number=1, redacted_spans=[{"id": "span", "text": "구성"}])]
    requested = [{"number": 1, "spanIds": ["span"]}]
    previous_run = SimpleNamespace(id="old", targets=[], visual_pages={})
    old = SimpleNamespace(
        status="SUCCEEDED",
        target_ids=["target"],
        pages=requested,
        diagnostics={} if old_policy is None else {"extractionPolicy": old_policy},
    )
    run = SimpleNamespace(
        id="new",
        batch_id="batch",
        targets=[],
        visual_pages={},
        mode="openrouter" if vision else "mock",
        model="test",
        prompt_version="v",
    )
    source = SimpleNamespace(
        id="source",
        original_photo=False,
        revision=1,
        sanitization_version=1,
        privacy_approved=True,
        mime="image/png" if vision else "text/plain",
    )
    item = SimpleNamespace(target_ids=["target"])

    class Session:
        def __init__(self):
            self.reads, self.added = 0, []

        def scalars(self, query):
            self.reads += 1
            return [previous_run] if self.reads == 1 else [old]

        def get(self, model, key):
            return SimpleNamespace(source_copy_enabled=enabled)

        def add(self, row):
            self.added.append(row)

    db = Session()
    worker.enqueue_extraction(db, source, run, item, pages)
    assert len(db.added) == (0 if reused else 1)
