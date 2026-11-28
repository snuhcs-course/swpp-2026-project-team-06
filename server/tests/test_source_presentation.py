"""AC-SRC-2/3/5/11: persisted optional presentation, provider-free controls."""

import copy
import sys
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.ai.source_analysis import ExtractionError
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.source_analysis import source_presentation as presentation
from app.source_analysis import worker
from app.source_analysis.models import Asset, Batch, Item, ReviewedField
from tests.test_source_analysis import (  # noqa: F401
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)


class Session:
    def __init__(self, rows=None):
        self.rows = rows or {}
        self.added = []
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def scalars(self, query):
        return self.rows.get(query.column_descriptions[0]["entity"], [])

    def add(self, item):
        self.added.append(item)

    def flush(self):
        pass

    def commit(self):
        self.commits += 1


@pytest.fixture
def context(monkeypatch):
    cfg = SimpleNamespace(source_presentation_enabled=True, openrouter_api_key="fixture")
    monkeypatch.setattr(presentation, "get_settings", lambda: cfg)
    batch = SimpleNamespace(
        id="batch",
        source_copy_enabled=True,
        review_version=3,
        targets=[{"id": "target", "name": "감귤"}],
    )
    base = {
        "modules": [
            {
                "module": "summary",
                "texts": [
                    {
                        "value": "제주에서 길렀습니다.",
                        "candidateIds": ["candidate"],
                        "passageIds": ["passage"],
                    }
                ],
            }
        ],
        "passages": [{"id": "passage", "liveFlag": "PENDING"}],
    }
    policy = SimpleNamespace()
    policy.content_hash = lambda plan, target: presentation.digest(plan["modules"])
    policy.prepare = lambda plan, target: {
        "id": target["id"],
        "target": target,
        "texts": [
            {
                "id": "t001",
                "module": "summary",
                "value": plan["modules"][0]["texts"][0]["value"],
                "passageIds": ["passage"],
                "ownerFlags": ["TIMING"],
            }
        ],
    }
    policy.admit = lambda plan, target, output: {
        **copy.deepcopy(plan),
        "presentation": {"status": "APPLIED", "baselineWordingRetained": 0},
    }
    monkeypatch.setitem(sys.modules, "app.source_analysis.presentation_plan", policy)
    monkeypatch.setattr(
        presentation, "current", lambda db, batch, target_id: (base, batch.targets[0])
    )
    state = {"decisions": [], "fields": [], "sources": [{"id": "source", "revision": 1}]}
    monkeypatch.setattr(presentation, "snapshot", lambda db, batch: copy.deepcopy(state))
    source = SimpleNamespace(
        id="source", revision=1, sanitization_version=1, privacy_approved=True, product_photo=None
    )
    run = SimpleNamespace(id="run", mode="mock")
    row = policy.prepare(base, batch.targets[0])
    item = SimpleNamespace(
        id="item",
        target_ids=["target"],
        phase="ASSEMBLE",
        status="RUNNING",
        refinement={
            "version": presentation.VERSION,
            "assemblyVersion": presentation.ASSEMBLY_VERSION,
            "contentHash": policy.content_hash(base, batch.targets[0]),
            "model": presentation.MODEL,
            "input": row,
            "snapshotHash": presentation.digest(state),
        },
        sanitization_version=1,
        sent=False,
        attempt=1,
    )
    db = Session({Asset: [source], Item: [item]})
    monkeypatch.setattr(presentation, "get_sessionmaker", lambda: lambda: db)
    monkeypatch.setattr(worker, "lock_context", lambda *args: (batch, source, run, item))
    monkeypatch.setattr("app.source_analysis.service.refresh_runs", lambda *args: None)
    return SimpleNamespace(
        cfg=cfg,
        batch=batch,
        base=base,
        policy=policy,
        state=state,
        source=source,
        run=run,
        item=item,
        db=db,
        row=row,
    )


def test_AC_SRC_5_disabled_resolver_never_queries(context):
    context.cfg.source_presentation_enabled = False
    result = presentation.resolve(None, context.batch, context.batch.targets[0], context.base)
    assert result["presentation"] == {"status": "DISABLED"}
    assert "presentation" not in context.base
    assert presentation.enqueue(None, context.batch, None, []) is False


def test_AC_SRC_5_enqueue_once_only_after_successful_source_items(context):
    pending = SimpleNamespace(phase="EXTRACT", status="RUNNING")
    assert not presentation.enqueue(context.db, context.batch, context.run, [pending])
    finished = SimpleNamespace(phase="EXTRACT", status="SUCCEEDED")
    assert presentation.enqueue(context.db, context.batch, context.run, [finished])
    assert context.db.added[0].phase == "ASSEMBLE"
    assert context.db.added[0].refinement["provider"] == "mock"
    assert not presentation.enqueue(
        context.db, context.batch, context.run, [finished, context.item]
    )
    assert len(context.db.added) == 1


def test_AC_SRC_2_mock_identity_activates_with_review_version_fence(context, monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Mock presentation cannot call provider or reserve")

    monkeypatch.setattr(worker, "paid_vision_call", blocked)
    monkeypatch.setattr(presentation, "extract", blocked)
    presentation.process("item", "token")
    assert context.item.status == "SUCCEEDED"
    assert (
        context.item.refinement["raw"]["modules"][0]["texts"][0]["value"]
        == context.row["texts"][0]["value"]
    )
    assert context.item.refinement["accepted"] is True
    assert context.batch.review_version == 4


@pytest.mark.parametrize("field", ["decisions", "fields", "sources"])
def test_AC_SRC_5_late_owner_editor_media_or_source_work_rejects_result(
    context, monkeypatch, field
):
    original = presentation.generate

    def late(mode, row):
        result = original(mode, row)
        context.state[field].append({"changed": "full-state-or-photo"})
        return result

    monkeypatch.setattr(presentation, "generate", late)
    presentation.process("item", "token")
    assert context.item.status == "FAILED"
    assert context.item.error == "SOURCE_CHANGED"
    assert context.item.refinement["accepted"] is False
    assert context.item.refinement["raw"]
    assert context.batch.review_version == 3


def test_AC_SRC_5_missing_key_falls_back_before_send(context, monkeypatch):
    context.run.mode = "openai"
    context.cfg.openrouter_api_key = ""
    monkeypatch.setattr(worker, "paid_vision_call", lambda *a, **k: pytest.fail("must not send"))
    presentation.process("item", "token")
    assert context.item.error == "PROVIDER_AUTH"
    assert not context.item.refinement["accepted"]


def test_AC_SRC_5_presentation_actual_provider_reservation_uses_openrouter(context, monkeypatch):
    context.run.mode = "openai"
    original = presentation.generate
    monkeypatch.setattr(presentation, "generate", lambda mode, row: original("mock", row))
    recorded = {}

    def paid(*args, **kwargs):
        recorded.update(kwargs)
        kwargs["guard"](context.db, (context.batch, context.source, context.run, context.item))
        return args[7]()

    monkeypatch.setattr(worker, "paid_vision_call", paid)
    presentation.process("item", "token")
    assert recorded["reservation_mode"] == "openrouter"
    assert context.item.status == "SUCCEEDED"


@pytest.mark.parametrize("reason", ["REQUEST_UNCERTAIN", "BUDGET_EXCEEDED"])
def test_AC_SRC_5_paid_failure_is_explicit_baseline_fallback_no_retry(context, monkeypatch, reason):
    context.run.mode = "openrouter"

    def failed(*args, **kwargs):
        raise ExtractionError(reason, retry_after=2, usage={"cost": 0.001}, request_id="fixture")

    monkeypatch.setattr(worker, "paid_vision_call", failed)
    presentation.process("item", "token")
    assert context.item.status == "FAILED"
    assert context.item.error == reason
    assert context.item.usage == {"cost": 0.001}
    assert context.batch.review_version == 3


def test_AC_SRC_5_whole_input_limit_falls_back_without_truncating(context):
    context.item.refinement["input"]["texts"] *= presentation.MAX_INPUT_TEXTS + 1
    presentation.process("item", "token")
    assert context.item.error == "PRESENTATION_INPUT_LIMIT"
    assert len(context.item.refinement["input"]["texts"]) == presentation.MAX_INPUT_TEXTS + 1


def test_AC_SRC_11_live_flags_recomputed_while_keep_ack_preserves_content(context):
    context.item.status = "SUCCEEDED"
    context.item.refinement["raw"] = presentation.generate(
        "mock", context.row
    ).extraction.model_dump(by_alias=True)
    context.base["passages"][0]["liveFlag"] = "ACKNOWLEDGED"
    result = presentation.resolve(context.db, context.batch, context.batch.targets[0], context.base)
    assert result["presentation"]["status"] == "APPLIED"
    assert result["passages"][0]["liveFlag"] == "ACKNOWLEDGED"
    context.base["modules"][0]["texts"][0]["value"] = "생산자가 직접 수정했습니다."
    result = presentation.resolve(context.db, context.batch, context.batch.targets[0], context.base)
    assert result["presentation"]["status"] == "STALE"
    assert result["modules"][0]["texts"][0]["value"] == "생산자가 직접 수정했습니다."


def test_AC_SRC_5_worker_dispatches_assemble_before_generic_source(context, monkeypatch):
    monkeypatch.setattr(worker, "get_sessionmaker", lambda: lambda: SimpleNamespace())

    class Lookup:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args):
            return context.item

    monkeypatch.setattr(worker, "get_sessionmaker", lambda: Lookup)
    called = []
    monkeypatch.setattr(presentation, "process", lambda *args: called.append(args))
    worker.process("item", "token")
    assert called == [("item", "token")]


def test_AC_SRC_5_paid_call_reserves_with_actual_provider_not_source_run(context, monkeypatch):
    from app.source_analysis import budget

    context.run.mode = "openai"
    monkeypatch.setattr(worker, "get_sessionmaker", lambda: lambda: context.db)
    reservations, settlements = [], []
    monkeypatch.setattr(
        budget,
        "reserve",
        lambda db, item, mode, *args, **kwargs: reservations.append(mode) or "reservation",
    )
    monkeypatch.setattr(budget, "settle", lambda db, rid, usage: settlements.append((rid, usage)))
    result = worker.paid_vision_call(
        "item",
        "token",
        "assemble",
        presentation.MODEL,
        {},
        [],
        [],
        lambda: presentation.generate("mock", context.row),
        reservation_mode="openrouter",
    )
    assert reservations == ["openrouter"]
    assert settlements == [("reservation", result.usage)]


def ready_integration(client, login, monkeypatch):
    monkeypatch.setattr(get_settings(), "source_presentation_enabled", True)
    headers = login("u-kang")
    batch = create(client, headers)
    with get_sessionmaker()() as db:
        row = db.get(Batch, batch["id"])
        row.source_copy_enabled = True
        db.commit()
    upload(client, headers, batch)
    result = start(client, headers, batch["id"])
    return headers, batch, result


def test_AC_SRC_2_integration_mock_job_persisted_and_live_plan_applied(client, login, monkeypatch):
    _, batch, run = ready_integration(client, login, monkeypatch)
    drain()
    from app.source_analysis.source_copy_service import plan

    with get_sessionmaker()() as db:
        row = db.get(Batch, batch["id"])
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
        assert len(jobs) == 1 and jobs[0].status == "SUCCEEDED", [
            (item.phase, item.status, item.error)
            for item in db.scalars(select(Item).where(Item.run_id == run["id"]))
        ]
        assert jobs[0].usage == {"mock": True}
        assert plan(db, row, row.targets[0]["id"])["presentation"]["status"] == "APPLIED"
        assert not presentation.enqueue_completed(db, row)


def test_AC_SRC_5_integration_late_manual_text_and_photo_are_preserved(client, login, monkeypatch):
    _, batch, run = ready_integration(client, login, monkeypatch)
    original = presentation.generate

    def late(mode, input_row):
        result = original(mode, input_row)
        with get_sessionmaker()() as db:
            db.add(
                ReviewedField(
                    batch_id=batch["id"],
                    target_id=input_row["target"]["id"],
                    field_key="summary",
                    value="직접 쓴 문장",
                    state="CONFIRMED",
                    provenance="PRODUCER",
                    candidate_ids=[],
                    photo_asset_ids=["retained-photo"],
                )
            )
            db.commit()
        return result

    monkeypatch.setattr(presentation, "generate", late)
    drain()
    with get_sessionmaker()() as db:
        job = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        manual = db.scalar(select(ReviewedField).where(ReviewedField.batch_id == batch["id"]))
        assert (job.status, job.error) == ("FAILED", "SOURCE_CHANGED")
        assert manual.value == "직접 쓴 문장" and manual.photo_asset_ids == ["retained-photo"]


def test_AC_SRC_5_integration_provider_failure_not_requeued_by_refresh(client, login, monkeypatch):
    _, batch, run = ready_integration(client, login, monkeypatch)

    def failed(*args):
        raise ExtractionError("REQUEST_UNCERTAIN", retry_after=1)

    monkeypatch.setattr(presentation, "generate", failed)
    drain()
    from app.source_analysis.source_copy_service import plan

    with get_sessionmaker()() as db:
        row = db.get(Batch, batch["id"])
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
        assert len(jobs) == 1 and jobs[0].status == "FAILED"
        assert not presentation.enqueue_completed(db, row)
        assert plan(db, row, row.targets[0]["id"])["presentation"] == {
            "status": "FALLBACK",
            "reason": "REQUEST_UNCERTAIN",
        }


def test_AC_SRC_5_integration_completed_sourcecopy_enqueues_once_when_enabled(
    client, login, monkeypatch
):
    _, batch, run = ready_integration(client, login, monkeypatch)
    monkeypatch.setattr(get_settings(), "source_presentation_enabled", False)
    drain()
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
    monkeypatch.setattr(get_settings(), "source_presentation_enabled", True)
    with get_sessionmaker()() as db:
        row = db.scalar(select(Batch).where(Batch.id == batch["id"]).with_for_update())
        assert presentation.enqueue_completed(db, row)
        assert not presentation.enqueue_completed(db, row)
        db.commit()
    drain()
    with get_sessionmaker()() as db:
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
        assert len(jobs) == 1 and jobs[0].status == "SUCCEEDED"


def test_AC_SRC_5_integration_assemble_retry_is_rejected_without_new_job(
    client, login, monkeypatch
):
    headers, batch, run = ready_integration(client, login, monkeypatch)

    def failed(*args):
        raise ExtractionError("BUDGET_EXCEEDED")

    monkeypatch.setattr(presentation, "generate", failed)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        iid = item.id
    response = client.post(
        f"/api/source-analysis/batches/{batch['id']}/runs/{run['id']}/retry",
        headers=key(headers),
        json={"itemIds": [iid], "acknowledgeUncertain": True},
    )
    assert response.status_code == 409, response.text
    assert response.json()["details"]["reason"] == "PRESENTATION_RETRY_DISABLED"
    with get_sessionmaker()() as db:
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
        assert len(jobs) == 1 and jobs[0].status == "FAILED"


def test_AC_SRC_11_integration_keep_ack_survives_but_owner_edit_invalidates_cache(
    client, login, monkeypatch
):
    _, batch, _ = ready_integration(client, login, monkeypatch)
    drain()
    from app.source_analysis.models import SourceCopyDecision
    from app.source_analysis.source_copy_service import baseline_plan, plan

    with get_sessionmaker()() as db:
        stored = db.get(Batch, batch["id"])
        tid = stored.targets[0]["id"]
        base = baseline_plan(db, stored, tid)
        passage = next(p for p in base["passages"] if p["module"] == "summary")
        decision = SourceCopyDecision(
            batch_id=stored.id,
            target_id=tid,
            binding_hash=passage["bindingHash"],
            action="KEEP",
            note="원문을 확인했습니다.",
            actor_id="u-kang",
            source_binding={"evidence": passage["evidence"]},
        )
        db.add(decision)
        db.commit()
        assert plan(db, stored, tid)["presentation"]["status"] == "APPLIED"
        decision.action, decision.value = "EDIT", "생산자가 고친 상품 설명입니다."
        db.commit()
        changed = plan(db, stored, tid)
        assert changed["presentation"]["status"] == "STALE"
        assert any(t["value"] == decision.value for m in changed["modules"] for t in m["texts"])


def test_AC_SRC_11_integration_keep_ack_of_presented_price_placement_preserves_cache(
    client, login, monkeypatch
):
    from app.ai.source_analysis import MOCK_REFINE_TEXT
    from app.ai.source_assembly import AssemblyModule
    from app.source_analysis.models import SourceCopyDecision

    monkeypatch.setattr(get_settings(), "source_presentation_enabled", True)
    headers = login("u-kang")
    batch = create(client, headers)
    target_id = batch["targets"][0]["id"]
    with get_sessionmaker()() as db:
        db.get(Batch, batch["id"]).source_copy_enabled = True
        db.commit()
    upload(client, headers, batch, text=MOCK_REFINE_TEXT)
    original = presentation.generate
    generated = []

    def move_price_to_summary(mode, input_row):
        response = original("mock", input_row)
        price = next(t for t in input_row["texts"] if "32,000원" in t["value"])
        assert price["module"] == "composition"
        assert price["ownerFlags"] and "DATED_OR_HISTORICAL" not in price["ownerFlags"]
        composition = next(m for m in response.extraction.modules if m.module == "composition")
        moved = next(t for t in composition.texts if price["id"] in t.text_ids)
        composition.texts.remove(moved)
        if not composition.texts:
            response.extraction.modules.remove(composition)
        summary = next((m for m in response.extraction.modules if m.module == "summary"), None)
        if summary is None:
            summary = AssemblyModule(module="summary", texts=[])
            response.extraction.modules.append(summary)
        summary.texts.append(moved)
        generated.append(response.extraction.model_dump(by_alias=True))
        return response

    monkeypatch.setattr(presentation, "generate", move_price_to_summary)
    run = start(client, headers, batch["id"])
    drain()
    path = f"/api/source-analysis/batches/{batch['id']}/source-copy"
    state = client.get(path, headers=headers, params={"targetId": target_id}).json()
    assert state["plan"]["presentation"]["status"] == "APPLIED"
    price_passage = next(p for p in state["plan"]["passages"] if "32,000원" in p["value"])
    assert price_passage["module"] == "composition"
    assert price_passage["reasonCodes"]["OWNER_CONFIRMATION"]

    def displayed_module(plan):
        return {
            m["module"]
            for m in plan["modules"]
            for t in m["texts"]
            if price_passage["id"] in t["passageIds"]
        }

    assert displayed_module(state["plan"]) == {"summary"}
    acknowledged = client.put(
        f"{path}/{target_id}",
        headers=key(headers),
        json={
            "reviewVersion": state["reviewVersion"],
            "planHash": state["plan"]["planHash"],
            "decisions": [
                {
                    "bindingHash": price_passage["bindingHash"],
                    "action": "KEEP",
                    "module": "summary",
                    "note": "현재 가격을 확인했습니다.",
                }
            ],
        },
    )
    assert acknowledged.status_code == 200, acknowledged.text
    reloaded = client.get(path, headers=headers, params={"targetId": target_id}).json()
    assert reloaded["plan"]["presentation"]["status"] == "APPLIED"
    assert displayed_module(reloaded["plan"]) == {"summary"}
    # A deliberately different placement remains a real owner change, not an acknowledgement.
    relocated = client.put(
        f"{path}/{target_id}",
        headers=key(headers),
        json={
            "reviewVersion": reloaded["reviewVersion"],
            "planHash": reloaded["plan"]["planHash"],
            "decisions": [
                {
                    "bindingHash": price_passage["bindingHash"],
                    "action": "KEEP",
                    "module": "delivery",
                    "note": "배송 항목으로 직접 옮겼습니다.",
                }
            ],
        },
    )
    assert relocated.status_code == 200, relocated.text
    assert relocated.json()["plan"]["presentation"]["status"] == "STALE"
    assert displayed_module(relocated.json()["plan"]) == {"delivery"}
    with get_sessionmaker()() as db:
        decision = db.scalar(
            select(SourceCopyDecision).where(
                SourceCopyDecision.batch_id == batch["id"],
                SourceCopyDecision.binding_hash == price_passage["bindingHash"],
            )
        )
        jobs = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "ASSEMBLE"))
        )
        assert decision.module == "delivery"
        assert len(jobs) == len(generated) == 1
        assert jobs[0].refinement["raw"] == generated[0]
