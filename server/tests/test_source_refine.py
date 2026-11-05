"""DEV-186 grounded two-stage drafts. Only local provider fixtures are used."""

import json
from copy import deepcopy
from datetime import timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.ai.source_analysis import ExtractionResponse
from app.ai.source_refine import RefineError, Refinement, RefineResponse, refine
from app.core.db import get_sessionmaker
from app.source_analysis import refinement, worker
from app.source_analysis.models import Asset, Item, Page, Run, Spend, utcnow
from app.source_analysis.preprocess import PREPROCESS_VERSION, parse
from app.source_analysis.schemas import Extraction
from app.source_analysis.text_safety import has_money
from tests.test_source_analysis import (  # noqa: F401
    PREFIX,
    create,
    drain,
    key,
    source_settings,
    start,
    upload,
)


@pytest.mark.parametrize(
    "text",
    [
        "32,000원",
        "0원 (50,000원 이상 구매 시 무료)",
        "₩ 32000",
        "￦5000",
        "3만원",
        "3 만 원",
        "3.2만원",
        "1만5천원",
        "반품비 5천 원",
        "$30",
        "KRW 32000",
        "32,000 KRW",
        "1백만원",
        "3천만원",
        "₩3천만",
    ],
)
def test_AC_SRC_3_money_amounts(text):
    assert has_money(text)


@pytest.mark.parametrize("text", ["3kg", "12과", "13~14 브릭스", "2004년", "1-3일"])
def test_AC_SRC_3_non_money_numbers(text):
    assert not has_money(text)


ROWS = [
    ("composition", "천혜향 3kg 32,000원", False),
    ("delivery", "0원 (50,000원 이상 구매 시 무료)", False),
    ("historicalSales", "작년 300상자 완판", True),
    ("historicalSales", "작년 가격 29,000원", True),
    ("summary", "🍊 제주에서 자란", False),
    ("summary", "천혜향이에요!!", False),
    ("storage", "간혹 껍질이 마를 수 있어요. 서늘한 곳에 보관해 주세요.", False),
    ("delivery", "수확 후 1-3일 내 배송해요.", False),
]


def candidates():
    return [
        {
            "id": f"c{i}",
            "targetId": "target",
            "fieldKey": field,
            "value": value,
            "historical": historical,
            "evidence": [{"quote": value}],
        }
        for i, (field, value, historical) in enumerate(ROWS)
    ]


def test_AC_SRC_2_3_mock_polishes_and_preserves_candidates():
    original = candidates()
    before = deepcopy(original)
    result = refine("mock", "fixture", {"id": "target"}, original)
    assert original == before
    assert result == refine("mock", "fixture", {"id": "target"}, original)
    modules = {m.module: m.texts for m in result.refinement.modules}
    assert modules["farmStory"][0].value == "작년 300상자 완판"
    assert modules["farmStory"][0].candidate_ids == ["c2"]
    assert modules["summary"][0].value == "제주에서 자란 천혜향이에요"
    assert modules["summary"][0].candidate_ids == ["c4", "c5"]
    assert "productionProcess" not in modules
    assert any(
        e.candidate_ids == ["c7"] and e.reason == "period" for e in result.refinement.excluded
    )
    assert "간혹" in modules["storage"][0].value
    assert "수 있어요" in modules["storage"][0].value
    for texts in modules.values():
        for text in texts:
            assert text.candidate_ids and "c3" not in text.candidate_ids
            assert not has_money(text.value) and "🍊" not in text.value
    accepted, diagnostics = refinement.validate(result.refinement, original, "target")
    assert accepted and diagnostics["rejectedCount"] == 0


@pytest.mark.parametrize(
    ("module", "value", "ids", "code"),
    [
        ("summary", "가격 32,000원", ["c0"], "MONEY_AMOUNT"),
        ("summary", "전화 010-1234-5678", ["c0"], "PRIVATE_VALUE"),
        ("summary", "example@example.test", ["c0"], "PRIVATE_VALUE"),
        ("summary", "천혜향 7kg", ["c0"], "UNSUPPORTED_NUMBER"),
        ("summary", "3과", ["c0"], "UNSUPPORTED_NUMBER"),
        ("summary", "내용", ["unknown"], "INVALID_EVIDENCE"),
        ("summary", "내용", ["foreign"], "INVALID_EVIDENCE"),
        ("farmPhotos", "내용", ["c0"], "INVALID_TEXT_MODULE"),
        ("historicalSales", "내용", ["c0"], "INVALID_TEXT_MODULE"),
        ("farmStory", "작년 가격", ["c3"], "PRICED_HISTORY"),
        ("summary", "작년 300상자 완판", ["c2"], "HISTORICAL_MODULE"),
    ],
)
def test_AC_SRC_2_3_6_validation_drops_records_invalid_text(module, value, ids, code):
    foreign = {**candidates()[0], "id": "foreign", "targetId": "another-target"}
    result = Refinement(
        modules=[{"module": module, "texts": [{"value": value, "candidateIds": ids}]}]
    )
    accepted, diagnostics = refinement.validate(result, candidates() + [foreign], "target")
    assert accepted == []
    assert diagnostics["rejectedCount"] == 1
    assert diagnostics["rejected"][0]["code"] == code


def test_AC_SRC_3_validation_cited_quotes_ranges_and_units():
    source = candidates()
    source[0]["evidence"][0]["quote"] += " 13~14 브릭스, 12과, 2004년, 1-3일"
    good = Refinement(
        modules=[
            {
                "module": "summary",
                "texts": [
                    {"value": "3kg, 13~14 브릭스, 12과, 2004년, 1-3일", "candidateIds": ["c0"]}
                ],
            }
        ]
    )
    assert refinement.validate(good, source, "target")[1]["rejectedCount"] == 0
    bad = Refinement(
        modules=[{"module": "summary", "texts": [{"value": "300상자", "candidateIds": ["c0"]}]}]
    )
    assert refinement.validate(bad, source, "target")[1]["rejectedCount"] == 1


def fixture_extract(mode, model, chunk, targets, images):
    assert mode == "mock" and images == []
    return ExtractionResponse(
        Extraction(
            candidates=[
                {
                    "targetId": targets[0]["id"],
                    "fieldKey": field,
                    "value": value,
                    "historical": historical,
                    "evidence": [
                        {
                            "sourceId": chunk["sourceId"],
                            "sourceRevision": chunk["sourceRevision"],
                            "page": 1,
                            "spanIds": [chunk["pages"][0]["spans"][i]["id"]],
                            "quote": value,
                        }
                    ],
                }
                for i, (field, value, historical) in enumerate(ROWS)
            ],
            photo_requests=[],
        ),
        {"mock": True},
        None,
    )


def ready(client, login, monkeypatch, *, count=1, common=False, text=None):
    monkeypatch.setattr(worker, "extract", fixture_extract)
    h = login("u-kang")
    batch = create(client, h, count=count)
    text = text if text is not None else "\n".join(row[1] for row in ROWS)
    source = upload(client, h, batch, text=text, common=common)
    # Start at real parsed text, isolating durable extraction/refinement from subprocess OCR.
    parsed = parse(text.encode(), "text/plain")[0]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.status, asset.preprocess_version = "PREPARED", PREPROCESS_VERSION
        asset.sanitization_version, asset.privacy_approved = 1, True
        db.add(
            Page(
                asset_id=asset.id,
                revision=asset.revision,
                number=1,
                spans=parsed["spans"],
                redacted_spans=parsed["spans"],
                redactions=[],
            )
        )
        db.commit()
    run = start(client, h, batch["id"])
    return h, batch, run


def review(client, h, batch):
    return client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()


def test_AC_SRC_2_3_7_11_worker_editor_draft_and_reference(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)
    calls, original = [], refinement.refine

    def track(*args):
        with get_sessionmaker()() as db:
            items = list(
                db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "EXTRACT"))
            )
            assert items and all(i.status in {"SUCCEEDED", "PARTIAL", "FAILED"} for i in items)
        calls.append(args)
        return original(*args)

    monkeypatch.setattr(refinement, "refine", track)
    drain()
    r = review(client, h, batch)
    assert len(calls) == 1
    fields = {e["field"]["fieldKey"]: e["field"] for e in r["editorFields"]}
    assert fields["summary"]["value"] == "제주에서 자란 천혜향이에요"
    assert fields["summary"]["provenance"] == "REFINED"
    assert fields["farmStory"]["value"] == "작년 300상자 완판"
    assert {c["value"] for c in r["candidates"]} == {row[1] for row in ROWS}
    excluded = r["refinementResults"][batch["targets"][0]["id"]]["excluded"]
    assert {c["value"] for c in excluded} == {ROWS[i][1] for i in (0, 1, 3, 7)}
    response = client.put(
        f"{PREFIX}/{batch['id']}/editor",
        headers=key(h),
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": list(fields.values()),
            "targets": [
                {
                    "targetId": batch["targets"][0]["id"],
                    "enabledModuleIds": ["summary", "composition", "farmStory"],
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    snapshot = response.json()["drafts"][0]["snapshot"]
    assert all(not has_money(t["value"]) for m in snapshot["previewModules"] for t in m["texts"])
    assert all(
        f["provenance"] == "REFINED"
        for m in snapshot["modules"]
        if m["id"] in {"summary", "composition", "farmStory"}
        for f in m["fields"]
    )
    with get_sessionmaker()() as db:
        assert db.get(Run, run["id"]).status == "SUCCEEDED"
        assert not list(db.scalars(select(Spend)))


def test_AC_SRC_5_refine_failure_fallback_run_completes(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)

    def fail(*args):
        raise RefineError(
            "FIXTURE_REFINE_FAILED", usage={"mock": True}, request_id="fixture-failure"
        )

    monkeypatch.setattr(refinement, "refine", fail)
    drain()
    r = review(client, h, batch)
    field = next(e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] == "composition")
    assert field["value"] == "" and field["candidateIds"] == []
    assert next(e["status"] for e in r["editorFields"] if e["field"] == field) == "missing"
    storage = next(e for e in r["editorFields"] if e["field"]["fieldKey"] == "storage")
    assert storage["status"] == "ready" and storage["field"]["provenance"] == "EXTRACTED"
    assert any(c["value"] == ROWS[0][1] for c in r["candidates"])
    with get_sessionmaker()() as db:
        assert db.get(Run, run["id"]).status == "PARTIAL"
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        assert item.status == "FAILED" and item.error == "FIXTURE_REFINE_FAILED"
        assert item.usage == {"mock": True} and item.provider_request_id == "fixture-failure"


def test_AC_SRC_2_3_11_patch_exact_refined_and_reject_money(client, login, monkeypatch):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    endpoint = f"{PREFIX}/{batch['id']}/review"
    r = review(client, h, batch)
    field = next(e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] == "farmStory")
    field["state"] = "CONFIRMED"
    response = client.patch(
        endpoint, headers=h, json={"reviewVersion": r["reviewVersion"], "fields": [field]}
    )
    assert response.status_code == 200, response.text
    for changes in [
        {"value": "작년 301상자 완판"},
        {"candidateIds": []},
        {"value": "판매가 30,000원", "provenance": "PRODUCER", "candidateIds": []},
    ]:
        response = client.patch(
            endpoint,
            headers=h,
            json={
                "reviewVersion": review(client, h, batch)["reviewVersion"],
                "fields": [{**field, **changes}],
            },
        )
        assert response.status_code == 400, response.text


def test_AC_SRC_5_11_reanalysis_preserves_producer_edit_and_exclusion(client, login, monkeypatch):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    r = review(client, h, batch)
    fields = [
        e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] in {"summary", "storage"}
    ]
    for field in fields:
        field.update(
            value="생산자가 직접 쓴 문구예요.",
            provenance="PRODUCER",
            candidateIds=[],
            state="CONFIRMED" if field["fieldKey"] == "summary" else "EXCLUDED",
        )
    saved = client.patch(
        f"{PREFIX}/{batch['id']}/review",
        headers=h,
        json={"reviewVersion": r["reviewVersion"], "fields": fields},
    )
    assert saved.status_code == 200
    start(client, h, batch["id"])
    drain()
    refreshed = review(client, h, batch)
    assert all(
        next(
            e["field"]
            for e in refreshed["editorFields"]
            if e["field"]["fieldKey"] == field["fieldKey"]
        )
        == field
        for field in fields
    )


@pytest.mark.parametrize("accepted_text", [False, True])
def test_AC_SRC_3_rejected_output_never_resurrects_candidates(
    client, login, monkeypatch, accepted_text
):
    h, batch, run = ready(client, login, monkeypatch)

    def invalid(mode, model, target, source):
        return RefineResponse(
            Refinement(
                modules=[
                    {
                        "module": "composition",
                        "texts": [{"value": "999kg", "candidateIds": [source[0]["id"]]}],
                    }
                ]
                + (
                    [
                        {
                            "module": "summary",
                            "texts": [
                                {
                                    "value": "제주에서 자란 천혜향이에요",
                                    "candidateIds": [source[4]["id"], source[5]["id"]],
                                }
                            ],
                        }
                    ]
                    if accepted_text
                    else []
                )
            ),
            {"mock": True},
            None,
        )

    monkeypatch.setattr(refinement, "refine", invalid)
    drain()
    r = review(client, h, batch)
    field = next(e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] == "composition")
    assert field["value"] == "" and field["candidateIds"] == []
    if accepted_text:
        summary = next(e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] == "summary")
        assert summary["value"] == "제주에서 자란 천혜향이에요"
        assert summary["provenance"] == "REFINED"
    excluded = r["refinementResults"][batch["targets"][0]["id"]]["excluded"]
    assert any(e["value"] == ROWS[0][1] and e["reason"] == "unsupported" for e in excluded)
    public_run = client.get(f"{PREFIX}/{batch['id']}/runs", headers=h).json()["items"][0]
    assert public_run["status"] == "SUCCEEDED"
    public_item = next(i for i in public_run["items"] if i["phase"] == "REFINE")
    assert public_item["status"] == "SUCCEEDED" and public_item["error"] is None
    assert all("refinement" not in item for item in public_run["items"])
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        assert item.diagnostics["rejectedCount"] == 1 and item.error is None
        assert item.diagnostics["rejected"][0]["code"] == "UNSUPPORTED_NUMBER"


def await_refine(run):
    for _ in range(10):
        with get_sessionmaker()() as db:
            item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
            if item:
                return item.id
        assert worker.run_once()
    raise AssertionError("Refine was not enqueued")


def test_AC_SRC_5_10_sent_lease_expiry_does_not_repeat_call(client, login, monkeypatch):
    _, _, run = ready(client, login, monkeypatch)
    iid = await_refine(run)
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        item.status, item.sent = "RUNNING", True
        item.lease_until, item.lease_token = utcnow() - timedelta(seconds=1), "dead"
        db.commit()
    drain()
    with get_sessionmaker()() as db:
        item = db.get(Item, iid)
        assert item.status == "FAILED" and item.error == "REQUEST_UNCERTAIN"
        assert db.get(Run, run["id"]).status == "PARTIAL"


def test_AC_SRC_10_budget_wrapper_with_local_stub(client, login, monkeypatch):
    _, _, run = ready(client, login, monkeypatch)
    await_refine(run)
    with get_sessionmaker()() as db:
        db.get(Run, run["id"]).mode = "openrouter"
        db.get(Run, run["id"]).model = "google/gemini-3-flash-preview"
        db.commit()

    def local_refine(mode, model, target, source):
        response = refine("mock", model, target, source)
        response.usage, response.request_id = {"cost": 0.001}, "local-stub"
        return response

    monkeypatch.setattr(refinement, "refine", local_refine)
    drain()
    with get_sessionmaker()() as db:
        spend = db.scalar(select(Spend).where(Spend.id.endswith(":refine")))
        assert spend.reserved_micros > 1000 and spend.charged_micros == 1000
        assert db.get(Run, run["id"]).status == "SUCCEEDED"


@pytest.mark.parametrize("mode", ["openai", "openrouter"])
def test_AC_SRC_10_adapter_structured_output_stub_only(monkeypatch, mode):
    from app.ai import source_analysis as provider

    calls, output = [], Refinement(modules=[])

    def fake(**kwargs):
        calls.append(kwargs)
        if mode == "openrouter":
            return SimpleNamespace(
                id="stub",
                usage=SimpleNamespace(model_dump=lambda: {"cost": 0}),
                choices=[
                    SimpleNamespace(
                        finish_reason="stop",
                        message=SimpleNamespace(content=output.model_dump_json(by_alias=True)),
                    )
                ],
            )
        return SimpleNamespace(id="stub", usage=None, status="completed", output_parsed=output)

    client = SimpleNamespace(
        responses=SimpleNamespace(parse=fake),
        chat=SimpleNamespace(completions=SimpleNamespace(create=fake)),
        close=lambda: calls.append("closed"),
    )
    monkeypatch.setattr(provider, "OpenAI", lambda **kwargs: client)
    response = refine(
        mode,
        "google/gemini-3-flash-preview" if mode == "openrouter" else "fixture",
        {"id": "target"},
        [],
    )
    assert response.refinement == output and calls[-1] == "closed"
    assert "response_format" in calls[0] if mode == "openrouter" else calls[0]["store"] is False


def test_AC_SRC_2_11_waiting_refine_does_not_offer_raw_text(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)
    await_refine(run)
    pending = review(client, h, batch)
    field = next(
        e["field"] for e in pending["editorFields"] if e["field"]["fieldKey"] == "composition"
    )
    assert field["value"] == "" and field["candidateIds"] == []
    assert pending["candidates"]
    drain()
    assert (
        next(
            e["field"]
            for e in review(client, h, batch)["editorFields"]
            if e["field"]["fieldKey"] == "composition"
        )["provenance"]
        == "REFINED"
    )


def test_AC_SRC_5_11_inactive_stale_refined_is_private_and_revalidated(client, login, monkeypatch):
    from app.source_analysis.models import Candidate

    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    endpoint = f"{PREFIX}/{batch['id']}/editor"

    def body():
        current = review(client, h, batch)
        return {
            "reviewVersion": current["reviewVersion"],
            "fields": [e["field"] for e in current["editorFields"]],
            "targets": [
                {"targetId": batch["targets"][0]["id"], "enabledModuleIds": ["summary", "storage"]}
            ],
        }

    assert client.put(endpoint, headers=key(h), json=body()).status_code == 200
    with get_sessionmaker()() as db:
        for candidate in db.scalars(
            select(Candidate).where(
                Candidate.batch_id == batch["id"], Candidate.field_key == "storage"
            )
        ):
            candidate.outdated = True
        db.commit()
    assert client.put(endpoint, headers=key(h), json=body()).status_code == 409
    hidden = body()
    hidden["targets"][0]["enabledModuleIds"] = ["summary"]
    response = client.put(endpoint, headers=key(h), json=hidden)
    assert response.status_code == 200, response.text
    assert [m["id"] for m in response.json()["drafts"][0]["snapshot"]["previewModules"]] == [
        "summary"
    ]


def test_AC_SRC_1_mock_ignores_foreign_target_and_deduplicates():
    source = candidates()
    source.append({**source[0], "id": "foreign", "targetId": "elsewhere", "value": "다른 상품 9kg"})
    source.append({**source[6], "id": "duplicate"})
    result = refine("mock", "fixture", {"id": "target"}, source)
    assert all("foreign" not in t.candidate_ids for m in result.refinement.modules for t in m.texts)
    storage = next(m for m in result.refinement.modules if m.module == "storage")
    assert len(storage.texts) == 1 and set(storage.texts[0].candidate_ids) == {"c6", "duplicate"}


@pytest.mark.parametrize("change", ["source", "privacy"])
def test_AC_SRC_5_10_post_call_input_change_discards_result_preserves_diagnostics(
    client, login, monkeypatch, change
):
    from app.source_analysis.models import Candidate

    _, _, run = ready(client, login, monkeypatch)
    original = refinement.refine

    def change_inputs(*args):
        response = original(*args)
        response.usage = {"input_tokens": 120, "output_tokens": 35, "cost": 0.001}
        response.request_id = "post-call-local-stub"
        with get_sessionmaker()() as db:
            candidate = db.get(Candidate, args[3][0]["id"])
            if change == "source":
                candidate.outdated = True
            else:
                # The provider call above is a local mock; exercise the real post-call guard.
                db.get(Run, run["id"]).mode = "openrouter"
                db.get(Asset, db.get(Item, candidate.item_id).asset_id).privacy_approved = False
            db.commit()
        return response

    monkeypatch.setattr(refinement, "refine", change_inputs)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        assert item.status == "FAILED"
        assert item.error == ("SOURCE_CHANGED" if change == "source" else "PRIVACY_CHANGED")
        assert item.usage == {"input_tokens": 120, "output_tokens": 35, "cost": 0.001}
        assert item.provider_request_id == "post-call-local-stub"
        assert "modules" not in item.refinement
        assert db.get(Run, run["id"]).status == "PARTIAL"


def test_AC_SRC_5_refine_only_retry_is_enqueued_and_finishes(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)
    original = refinement.refine

    def fail(*args):
        raise RefineError("FIXTURE_FAILURE")

    monkeypatch.setattr(refinement, "refine", fail)
    drain()
    with get_sessionmaker()() as db:
        iid = db.scalar(select(Item.id).where(Item.run_id == run["id"], Item.phase == "REFINE"))
    monkeypatch.setattr(refinement, "refine", original)
    response = client.post(
        f"{PREFIX}/{batch['id']}/runs/{run['id']}/retry",
        headers=key(h),
        json={"itemIds": [iid], "acknowledgeUncertain": False},
    )
    assert response.status_code == 202, response.text
    assert response.json()["items"] and all(
        i["phase"] == "REFINE" for i in response.json()["items"]
    )
    drain()
    with get_sessionmaker()() as db:
        assert db.get(Run, response.json()["id"]).status == "SUCCEEDED"
    assert any(
        e["field"]["provenance"] == "REFINED" for e in review(client, h, batch)["editorFields"]
    )


def test_AC_SRC_5_10_budget_exceeded_falls_back_without_provider_call(client, login, monkeypatch):
    from app.core.config import get_settings

    _, _, run = ready(client, login, monkeypatch)
    iid = await_refine(run)
    with get_sessionmaker()() as db:
        db.get(Run, run["id"]).mode = "openrouter"
        db.get(Run, run["id"]).model = "google/gemini-3-flash-preview"
        db.commit()
    monkeypatch.setattr(get_settings(), "source_budget_usd", 0)

    def forbidden(*args):
        raise AssertionError("Budget must reject before any request")

    monkeypatch.setattr(refinement, "refine", forbidden)
    drain()
    with get_sessionmaker()() as db:
        assert db.get(Item, iid).error == "BUDGET_EXCEEDED"
        assert db.get(Run, run["id"]).status == "PARTIAL"
        assert not list(db.scalars(select(Spend)))


@pytest.mark.parametrize(
    "text",
    [
        "면역력 증진",
        "소화를 돕습니다",
        "피로 회복",
        "다이어트",
        "피부 미용",
        "질병 예방",
        "비타민C가 풍부해 면역에 좋아요",
        "효능",
    ],
)
def test_AC_SRC_3_health_detector(text):
    from app.source_analysis.text_safety import has_health_claim

    assert has_health_claim(text)


@pytest.mark.parametrize(
    "text",
    [
        "건강하게 키운 감귤",
        "비타민C 함유",
        "수확 후 바로 포장",
        "제주 농장",
        "재배 기간",
        "교배한 품종",
        "작년 300상자 완판",
    ],
)
def test_AC_SRC_3_safety_false_positives(text):
    from app.source_analysis.text_safety import has_health_claim, has_platform_text

    assert not has_health_claim(text)
    assert not has_platform_text(text)


@pytest.mark.parametrize(
    "text",
    [
        "반품",
        "교환",
        "환불",
        "고객센터",
        "운영시간",
        "배송비",
        "무료 배송",
        "품절",
        "판매종료",
        "예약판매기간",
    ],
)
def test_AC_SRC_3_platform_detector(text):
    from app.source_analysis.text_safety import has_platform_text

    assert has_platform_text(text)


def test_AC_SRC_3_client_and_server_share_safety_source():
    root = Path(__file__).resolve().parents[2]
    client = root / "packages/api/src/sourceTextSafety.ts"
    assert 'from "../../../server/app/source_analysis/text_safety_lists.json"' in client.read_text()
    assert "new RegExp(lists.moneyPattern" in client.read_text()
    assert not (client.parent / "sourceTextSafety.json").is_symlink()


SAFETY_CASES = json.loads(
    Path(__file__).parents[1].joinpath("app/source_analysis/text_safety_cases.json").read_text()
)


@pytest.mark.parametrize("case", SAFETY_CASES, ids=lambda c: c["value"])
def test_AC_SRC_3_shared_safety_cases(case):
    from app.source_analysis.text_safety import (
        has_health_claim,
        has_period_text,
        has_platform_text,
    )

    assert has_health_claim(case["value"]) == case["health"]
    assert has_platform_text(case["value"]) == case["platform"]
    assert has_money(case["value"]) == case["money"]
    assert has_period_text(case["value"]) == case["period"]


@pytest.mark.parametrize(
    "value,expected",
    [
        ("3개월", {("3", "개월")}),
        ("3개", {("3", "개")}),
        ("3kg", {("3", "kg")}),
        ("3㎏", {("3", "㎏")}),
        ("3mg", {("3", "mg")}),
        ("3g", {("3", "g")}),
        ("3mm", {("3", "mm")}),
        ("3ml", {("3", "ml")}),
    ],
)
def test_AC_SRC_3_longest_numeric_unit(value, expected):
    from app.source_analysis.text_safety import numbers

    assert numbers(value) == expected


@pytest.mark.parametrize(
    ("value", "code", "reason"),
    [
        ("면역력 증진에 좋아요", "HEALTH_CLAIM", "health"),
        ("32,000원", "MONEY_AMOUNT", "price"),
        ("010-1234-5678", "PRIVATE_VALUE", "pii"),
        ("7kg", "UNSUPPORTED_NUMBER", "unsupported"),
    ],
)
def test_AC_SRC_3_rejected_text_explains_reason(value, code, reason):
    output = Refinement(
        modules=[{"module": "summary", "texts": [{"value": value, "candidateIds": ["c0"]}]}]
    )
    modules, diagnostics = refinement.validate(output, candidates(), "target")
    assert not modules
    assert diagnostics["rejected"][0]["code"] == code
    assert {tuple(e["candidateIds"]): e["reason"] for e in diagnostics["excluded"]}[
        ("c0",)
    ] == reason
    assert {cid for e in diagnostics["excluded"] for cid in e["candidateIds"]} == {
        c["id"] for c in candidates()
    }


def test_AC_SRC_2_3_mixed_source_classification_split_and_coverage():
    from app.ai.source_analysis import MOCK_REFINE_ROWS
    from app.source_analysis.text_safety import has_health_claim, has_platform_text

    source = [
        {
            **candidates()[0],
            "id": f"mixed{i}",
            "fieldKey": key,
            "value": value,
            "historical": key == "historicalSales",
            "evidence": [{"quote": value}],
        }
        for i, (key, value) in enumerate(MOCK_REFINE_ROWS)
    ]
    original = deepcopy(source)
    output = refine("mock", "fixture", {"id": "target"}, source).refinement
    assert output == refine("mock", "fixture", {"id": "target"}, source).refinement
    modules, diagnostics = refinement.validate(output, source, "target")
    assert source == original
    assert diagnostics["rejectedCount"] == 0
    texts = {m["module"]: " ".join(t["value"] for t in m["texts"]) for m in modules}
    assert texts["composition"] == "천혜향 3kg"
    assert texts["summary"] == "청견과 구치노쓰37호에 마코트를 교배한 품종으로"
    assert texts["taste"] == "당도가 높고 과즙이 풍부합니다"
    assert texts["farmStory"] == "작년 300상자 완판"
    assert texts["delivery"] == "우체국 택배로 보내드려요"
    assert not any(
        has_money(v) or has_health_claim(v) or has_platform_text(v) for v in texts.values()
    )
    excluded = {e["candidateIds"][0]: e["reason"] for e in diagnostics["excluded"]}
    assert excluded == {
        "mixed0": "price",
        "mixed1": "price",
        "mixed2": "platform",
        "mixed3": "health",
        "mixed7": "period",
    }
    covered = {cid for m in modules for t in m["texts"] for cid in t["candidateIds"]} | set(
        excluded
    )
    assert covered == {c["id"] for c in source}


@pytest.mark.parametrize(
    "value,reason",
    [
        ("예약 판매 기간 10월 1일~20일", "period"),
        ("판매가 10월 1일~20일", "period"),
        ("품절", "period"),
        ("판매 종료", "period"),
        ("재입고 예정", "period"),
        ("무통장 입금", "platform"),
        ("1인 2상자", "platform"),
        ("3kg/5kg/10kg 선택 가능", "platform"),
        ("선택하신 범위 안에서 랜덤 발송", "platform"),
        ("무료배송", "platform"),
        ("1-3일 이내 배송", "period"),
        ("월·수 출고", "period"),
        ("주문 후 2-3일", "period"),
        ("구매처로 문의", "platform"),
    ],
)
def test_AC_SRC_3_mock_drops_operational_text(value, reason):
    source = [{**candidates()[0], "value": value}]
    output = refine("mock", "fixture", {"id": "target"}, source).refinement
    assert not output.modules
    assert output.excluded[0].reason == reason


@pytest.mark.parametrize(
    ("value", "module", "expected"),
    [
        (
            "재배 중 생긴 얼룩·점은 교환 불가",
            "appearanceFaq",
            "재배 과정에서 얼룩·점·색 차이가 생길 수 있어요",
        ),
        ("1-3일 이내 제주에서 직배송", "delivery", "제주 농장에서 직접 보내요"),
        ("수확 후 바로 포장", "delivery", "수확 후 바로 포장"),
        ("우체국 택배로 보내드려요", "delivery", "우체국 택배로 보내드려요"),
        ("택배사", "delivery", "택배사"),
        ("완충재로 포장해요", "delivery", "완충재로 포장해요"),
        ("종이 상자로 포장", "delivery", "종이 상자로 포장"),
        ("제주 농장에서 직접 보내요", "delivery", "제주 농장에서 직접 보내요"),
        ("수확 후 순차 출고하며 도착일은 확정하지 않습니다", "delivery", "수확 후 순차 출고해요"),
        ("수확 후 바로 포장해 발송해요", "delivery", "수확 후 바로 포장해 발송해요"),
        ("도서산간 배송 가능", "delivery", "도서산간 배송 가능"),
    ],
)
def test_AC_SRC_3_mock_preserves_product_facts(value, module, expected):
    source = [{**candidates()[0], "value": value, "evidence": [{"quote": value}]}]
    output = refine("mock", "fixture", {"id": "target"}, source).refinement
    modules, diagnostics = refinement.validate(output, source, "target")
    assert diagnostics["rejectedCount"] == 0
    assert modules == [{"module": module, "texts": [{"value": expected, "candidateIds": ["c0"]}]}]


@pytest.mark.parametrize(
    "status", ["FAILED", "PARTIAL", "CANCELLED", "PRIVACY_REVIEW", "QUEUED", "RUNNING"]
)
def test_AC_SRC_5_10_incomplete_extraction_never_enqueues_refine(
    client, login, monkeypatch, status
):
    from app.source_analysis.models import Batch
    from app.source_analysis.service import refresh_runs

    _, batch, run = ready(client, login, monkeypatch)
    with get_sessionmaker()() as db:
        before_version = db.get(Batch, batch["id"]).review_version
        items = list(db.scalars(select(Item).where(Item.run_id == run["id"])))
        for item in items:
            item.status = "SUCCEEDED"
        db.add(
            Item(
                run_id=run["id"],
                asset_id=items[0].asset_id,
                revision=items[0].revision,
                sanitization_version=items[0].sanitization_version,
                target_ids=[batch["targets"][0]["id"]],
                phase="EXTRACT",
                status=status,
                error="REQUEST_UNCERTAIN" if status == "FAILED" else None,
            )
        )
        refresh_runs(db, batch["id"])
        assert not list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        )
        assert db.get(Batch, batch["id"]).review_version == before_version


def test_AC_SRC_5_identical_reanalysis_reuses_refinement(client, login, monkeypatch):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    before = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    result = before["refinementResults"][tid]
    assert result["refinementVersion"] and result["excluded"]
    assert {e["value"] for e in result["excluded"]} >= {ROWS[i][1] for i in (0, 1, 3, 7)}
    run = start(client, h, batch["id"])
    drain()
    after = review(client, h, batch)
    assert after == before
    with get_sessionmaker()() as db:
        assert not list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        )


@pytest.mark.parametrize("endpoint", ["review", "editor"])
def test_AC_SRC_3_11_producer_health_rejected_platform_allowed(
    client, login, monkeypatch, endpoint
):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    current = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    fields = [e["field"] for e in current["editorFields"]]
    field = next(f for f in fields if f["fieldKey"] == "summary")
    field.update(provenance="PRODUCER", candidateIds=[], state="CONFIRMED")
    for value, expected in [
        ("면역력 증진에 좋아요", 400),
        ("건강하게 키운 감귤", 200),
        ("고객센터로 문의해 주세요", 200),
    ]:
        field["value"] = value
        body = {
            "reviewVersion": review(client, h, batch)["reviewVersion"],
            "fields": fields if endpoint == "editor" else [field],
        }
        if endpoint == "editor":
            body["targets"] = [{"targetId": tid, "enabledModuleIds": ["summary"]}]
            response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
        else:
            response = client.patch(f"{PREFIX}/{batch['id']}/review", headers=h, json=body)
        assert response.status_code == expected, response.text
        if expected == 400:
            assert "건강 효능" in response.text


def test_AC_SRC_3_health_linked_nutrient_cannot_be_rescued():
    source = [{**candidates()[0], "value": "비타민C가 풍부해 면역력 증진에 좋아요"}]
    output = Refinement(
        modules=[
            {
                "module": "summary",
                "texts": [{"value": "비타민C가 풍부해요", "candidateIds": ["c0"]}],
            }
        ]
    )
    modules, diagnostics = refinement.validate(output, source, "target")
    assert modules == []
    assert diagnostics["rejected"][0]["code"] == "HEALTH_CLAIM"
    assert diagnostics["excluded"] == [{"candidateIds": ["c0"], "reason": "health"}]


def test_AC_SRC_2_uncovered_and_foreign_excluded_ids():
    output = Refinement(
        modules=[], excluded=[{"candidateIds": ["foreign"], "reason": "other_product"}]
    )
    _, diagnostics = refinement.validate(output, candidates(), "target")
    assert diagnostics["excluded"] == [
        {"candidateIds": [c["id"]], "reason": "unused"} for c in candidates()
    ]


def test_AC_SRC_2_3_11_mixed_mock_worker_api_and_saved_preview(client, login, monkeypatch):
    from app.ai.source_analysis import MOCK_REFINE_TEXT
    from app.source_analysis.models import Candidate
    from app.source_analysis.text_safety import has_health_claim, has_platform_text

    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch, text=MOCK_REFINE_TEXT)
    parsed = parse(MOCK_REFINE_TEXT.encode(), "text/plain")[0]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.status, asset.preprocess_version = "PREPARED", PREPROCESS_VERSION
        asset.sanitization_version, asset.privacy_approved = 1, True
        db.add(
            Page(
                asset_id=asset.id,
                revision=asset.revision,
                number=1,
                spans=parsed["spans"],
                redacted_spans=parsed["spans"],
                redactions=[],
            )
        )
        db.commit()
    start(client, h, batch["id"])
    drain()
    current = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    result = current["refinementResults"][tid]
    assert len(result["excluded"]) == 5
    assert len(result["refinementVersion"]) == 64
    fields = [entry["field"] for entry in current["editorFields"]]
    with get_sessionmaker()() as db:
        refine_item = db.scalar(
            select(Item).join(Run).where(Run.batch_id == batch["id"], Item.phase == "REFINE")
        )
        assert refine_item.status == "SUCCEEDED"
        assert len(refine_item.refinement["excluded"]) == 5
        all_ids = {
            c.id for c in db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"]))
        }
        covered = {
            cid
            for m in refine_item.refinement["modules"]
            for t in m["texts"]
            for cid in t["candidateIds"]
        }
        covered.update(cid for e in refine_item.refinement["excluded"] for cid in e["candidateIds"])
        assert covered == all_ids
    saved = client.put(
        f"{PREFIX}/{batch['id']}/editor",
        headers=key(h),
        json={
            "reviewVersion": current["reviewVersion"],
            "fields": fields,
            "targets": [
                {
                    "targetId": tid,
                    "enabledModuleIds": [
                        "hero",
                        "summary",
                        "taste",
                        "composition",
                        "storage",
                        "farmStory",
                        "delivery",
                    ],
                }
            ],
        },
    )
    assert saved.status_code == 200, saved.text
    assert review(client, h, batch)["refinementResults"][tid] == result
    texts = [
        t["value"]
        for m in saved.json()["drafts"][0]["snapshot"]["previewModules"]
        for t in m["texts"]
    ]
    assert "당도가 높고 과즙이 풍부합니다" in texts
    assert "우체국 택배로 보내드려요" in texts
    assert "작년 300상자 완판" in texts
    assert not any(has_money(t) or has_health_claim(t) or has_platform_text(t) for t in texts)


@pytest.mark.parametrize("stage", ["fallback", "omitted", "pending"])
@pytest.mark.parametrize("target_choices", [1, 2])
@pytest.mark.parametrize("field_key,value", [
    ("storage", "서늘한 곳에 보관해 주세요 {i}"),
    ("summary", "제주 감귤 소개 {i}"),
    ("farmStory", "감귤 농가 이야기 {i}"),
    ("composition", "감귤 {i}kg 구성"),
])
def test_AC_SRC_1_2_target_choices_precede_shared_candidates(
    stage, target_choices, field_key, value
):
    from app.source_analysis.editor import suggestions

    tid = "target"
    target = {"id": tid, "name": "감귤"}
    specific = [
        {
            "id": f"specific-{i}",
            "targetId": tid,
            "fieldKey": field_key,
            "value": value.format(i=i + 3 if field_key == "composition" else i),
            "candidateIds": [f"specific-{i}"],
            "historical": False,
            "outdated": False,
        }
        for i in range(target_choices)
    ]
    shared = {**specific[0], "id": "shared", "targetId": None, "candidateIds": ["shared"]}
    entries = suggestions(
        {
            "targets": [target, {"id": "second", "name": "천혜향"}],
            "refinements": {} if stage == "fallback" else {tid: [] if stage == "omitted" else None},
            "candidates": [*specific, shared],
            "fields": [],
        }
    )
    field = next(
        e for e in entries
        if e["field"]["targetId"] == tid and e["field"]["fieldKey"] == field_key
    )
    if stage == "fallback" and target_choices == 1:
        assert field["status"] == "ready"
        assert field["field"]["value"] == specific[0]["value"]
        assert field["field"]["provenance"] == "EXTRACTED"
        assert field["field"]["candidateIds"] == ["specific-0"]
    else:
        expected = "conflict" if target_choices > 1 and stage != "omitted" else "missing"
        assert field["status"] == expected
        assert field["field"]["value"] == ""
        assert field["field"]["candidateIds"] == []


@pytest.mark.parametrize("pending", [False, True])
def test_AC_SRC_1_2_multi_product_shared_source_stays_unassigned(
    client, login, monkeypatch, pending
):
    h, batch, _ = ready(client, login, monkeypatch, count=2, common=True)

    if pending:
        monkeypatch.setattr(refinement, "enqueue", lambda *args: None)
    drain()
    if pending:
        from app.source_analysis.editor import suggestions
        from app.source_analysis.models import Batch

        with get_sessionmaker()() as db:
            r = review(client, h, batch)
            r["refinements"] = {t["id"]: None for t in db.get(Batch, batch["id"]).targets}
        entries = suggestions(r)
    else:
        r = review(client, h, batch)
        entries = r["editorFields"]
        assert all(r["refinementResults"][t["id"]]["refinementVersion"] for t in batch["targets"])
    for t in batch["targets"]:
        storage = next(
            e
            for e in entries
            if e["field"]["targetId"] == t["id"] and e["field"]["fieldKey"] == "storage"
        )
        assert storage["status"] == "unassigned" and storage["field"]["value"] == ""
    shared = next(
        c for c in r["candidates"] if c["targetId"] is None and c["fieldKey"] == "storage"
    )
    assert shared["evidence"][0]["quote"] == ROWS[6][1]


def test_AC_SRC_3_partial_extract_refines_and_omits_money(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)

    def partial(*args):
        result = fixture_extract(*args)
        invalid = result.extraction.candidates[0].model_copy(deep=True)
        invalid.evidence[0].quote = "根拠のない文"
        result.extraction.candidates.append(invalid)
        return result

    monkeypatch.setattr(worker, "extract", partial)
    drain()
    r = review(client, h, batch)
    field = next(e for e in r["editorFields"] if e["field"]["fieldKey"] == "composition")
    assert field["status"] == "ready" and field["field"]["value"] == "천혜향 3kg"
    assert any(c["value"] == ROWS[0][1] for c in r["candidates"])
    with get_sessionmaker()() as db:
        assert db.get(Run, run["id"]).status == "PARTIAL"
        items = list(db.scalars(select(Item).where(Item.run_id == run["id"])))
        extraction = next(i for i in items if i.phase == "EXTRACT")
        assert extraction.status == "PARTIAL" and extraction.error == "CANDIDATES_REJECTED"
        assert extraction.diagnostics["acceptedCount"] > 0
        assert extraction.diagnostics["rejectedCount"] == 1
        assert any(i.phase == "REFINE" and i.status == "SUCCEEDED" for i in items)
        assert not worker.run_once()  # No automatic replay after the completed run.


def test_AC_SRC_3_legacy_saved_autofill_with_money_is_recomputed(client, login, monkeypatch):
    from app.source_analysis.models import ReviewedField

    h, batch, _ = ready(client, login, monkeypatch)

    def partial(*args):
        result = fixture_extract(*args)
        invalid = result.extraction.candidates[0].model_copy(deep=True)
        invalid.evidence[0].quote = "根拠のない文"
        result.extraction.candidates.append(invalid)
        return result

    monkeypatch.setattr(worker, "extract", partial)
    drain()
    before = review(client, h, batch)
    money = next(c for c in before["candidates"] if c["value"] == ROWS[0][1])
    # 배포 전 editor가 원문 그대로 저장해 둔 자동 값(금액 포함)을 흉내 낸다.
    with get_sessionmaker()() as db:
        db.add(
            ReviewedField(
                batch_id=batch["id"],
                target_id=batch["targets"][0]["id"],
                field_key="composition",
                value=money["value"],
                state="UNREVIEWED",
                provenance="EXTRACTED",
                candidate_ids=[money["id"]],
                photo_asset_ids=[],
            )
        )
        db.commit()
    r = review(client, h, batch)
    field = next(e for e in r["editorFields"] if e["field"]["fieldKey"] == "composition")
    assert field["field"]["value"] != money["value"]
    assert not has_money(field["field"]["value"])


@pytest.mark.parametrize("editor", [False, True])
@pytest.mark.parametrize("value", ["32,000원", "피로회복"])
@pytest.mark.parametrize("visibility", ["disabled", "hidden", "active"])
def test_AC_SRC_3_11_save_checks_inactive_fields_only_outside_editor_with_field_key(
    client, login, monkeypatch, value, visibility, editor
):
    from app.core.errors import ApiError
    from app.source_analysis.models import Batch, ReviewedField
    from app.source_analysis.schemas import DraftSave
    from app.source_analysis.service import save_drafts

    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    tid = batch["targets"][0]["id"]
    with get_sessionmaker()() as db:
        row = db.get(Batch, batch["id"])
        db.add(
            ReviewedField(
                batch_id=row.id,
                target_id=tid,
                field_key="summary",
                value=value,
                state="CONFIRMED",
                provenance="PRODUCER",
                candidate_ids=[],
                photo_asset_ids=[],
            )
        )
        db.flush()
        body = DraftSave(
            reviewVersion=row.review_version,
            targets=[
                {
                    "targetId": tid,
                    "enabledModuleIds": [] if visibility == "disabled" else ["summary"],
                    "hiddenSectionIds": ["intro"] if visibility == "hidden" else [],
                }
            ],
        )
        if visibility == "active" or not editor:
            with pytest.raises(ApiError) as exc:
                save_drafts(db, row, body, editor=editor)
            assert "summary" in str(exc.value.details)
        else:
            result = save_drafts(db, row, body, editor=editor)
            assert not result["drafts"][0]["snapshot"]["previewModules"]


@pytest.mark.parametrize("endpoint", ["review", "editor"])
@pytest.mark.parametrize("value", ["32,000원", "피로회복"])
def test_AC_SRC_3_11_excluded_text_allowed_and_active_errors_name_field(
    client, login, monkeypatch, endpoint, value
):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    r = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    fields = [e["field"] for e in r["editorFields"]]
    field = next(f for f in fields if f["fieldKey"] == "summary")
    field.update(value=value, provenance="PRODUCER", candidateIds=[])
    for state, enabled, expected in [
        ("CONFIRMED", ["summary"], 400),
        ("EXCLUDED", ["summary"], 200),
        ("CONFIRMED", [], 200),
    ]:
        if endpoint == "review" and not enabled:
            continue  # The review endpoint does not have visibility settings.
        field["state"] = state
        body = {
            "reviewVersion": review(client, h, batch)["reviewVersion"],
            "fields": fields if endpoint == "editor" else [field],
        }
        if endpoint == "editor":
            body["targets"] = [{"targetId": tid, "enabledModuleIds": enabled}]
            response = client.put(f"{PREFIX}/{batch['id']}/editor", headers=key(h), json=body)
        else:
            response = client.patch(f"{PREFIX}/{batch['id']}/review", headers=h, json=body)
        assert response.status_code == expected, response.text
        if expected == 400:
            assert "summary" in response.text
        if endpoint == "editor" and expected == 200:
            assert all(
                m["id"] != "summary"
                for m in response.json()["drafts"][0]["snapshot"]["previewModules"]
            )


def test_AC_SRC_3_historical_sales_cannot_be_confirmed(client, login, monkeypatch):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    r = review(client, h, batch)
    historic = next(
        c
        for c in r["candidates"]
        if c["fieldKey"] == "historicalSales" and not has_money(c["value"])
    )
    response = client.patch(
        f"{PREFIX}/{batch['id']}/review",
        headers=h,
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": [
                {
                    "targetId": batch["targets"][0]["id"],
                    "fieldKey": "historicalSales",
                    "value": historic["value"],
                    "candidateIds": historic["candidateIds"],
                    "state": "CONFIRMED",
                    "provenance": "EXTRACTED",
                }
            ],
        },
    )
    assert response.status_code == 400, response.text
    assert "historicalSales" in response.text and "과거 판매 정보는 참고용" in response.text
    farm_story = next(
        e["field"] for e in r["editorFields"] if e["field"]["fieldKey"] == "farmStory"
    )
    assert (
        farm_story["provenance"] == "REFINED"
        and historic["candidateIds"][0] in farm_story["candidateIds"]
    )
    response = client.patch(
        f"{PREFIX}/{batch['id']}/review",
        headers=h,
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": [{**farm_story, "state": "CONFIRMED"}],
        },
    )
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("action", ["cancel_after_extract", "delete_source"])
def test_AC_SRC_5_11_stale_refinement_restores_verbatim_fallback(
    client, login, monkeypatch, action
):
    from app.source_analysis.models import Batch

    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    with get_sessionmaker()() as db:
        # start()가 대표 사진(original_photo)을 붙이므로 묶음에는 자료가 둘이다. 순서 없는
        # 조회는 사진을 고를 수 있어 글 자료만 집는다(DEV-192)
        original_id = db.scalar(
            select(Asset.id).where(Asset.batch_id == batch["id"], Asset.original_photo.is_(False))
        )
    batch = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    text = "\n".join(row[1] for row in ROWS) + "\n추가 자료"
    source = upload(client, h, batch, text=text)
    parsed = parse(text.encode(), "text/plain")[0]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.status, asset.preprocess_version = "PREPARED", PREPROCESS_VERSION
        asset.sanitization_version, asset.privacy_approved = 1, True
        db.add(
            Page(
                asset_id=asset.id,
                revision=asset.revision,
                number=1,
                spans=parsed["spans"],
                redacted_spans=parsed["spans"],
                redactions=[],
            )
        )
        db.commit()
    run = start(client, h, batch["id"])
    await_refine(run)
    if action == "cancel_after_extract":
        response = client.post(f"{PREFIX}/{batch['id']}/runs/{run['id']}/cancel", headers=h)
        assert response.status_code == 202, response.text
    else:
        drain()
        # 두 자료에 같은 문장이 있어 어느 쪽이 후보를 갖는지는 처리 순서에 달려 있다.
        # 정리 입력 후보를 실제로 가진 자료를 지워야 정리 결과가 반드시 낡는다.
        from app.source_analysis.models import Candidate

        with get_sessionmaker()() as db:
            refine_item = db.scalar(
                select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE")
            )
            owner = db.get(
                Item, db.get(Candidate, refine_item.refinement["inputCandidateIds"][0]).item_id
            )
            owner_asset = db.get(Asset, owner.asset_id)
            assert owner_asset.id in {original_id, source["id"]}
            owner_id, owner_revision = owner_asset.id, owner_asset.revision
        response = client.delete(
            f"{PREFIX}/{batch['id']}/sources/{owner_id}?version={owner_revision}", headers=h
        )
        assert response.status_code == 202, response.text
    tid = batch["targets"][0]["id"]
    with get_sessionmaker()() as db:
        stale = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        candidates = refinement.current_candidates(db, batch["id"], tid)
        current = refinement.current_refinements(db, db.get(Batch, batch["id"]))
        # 이번 정리는 낡았으므로 쓰이면 안 된다. 남은 후보가 이전 분석의 정리 입력과 같으면
        # 그 이전 정리가 다시 쓰이는 것은 정상이다.
        if action == "cancel_after_extract" or stale.status != "SUCCEEDED":
            assert tid not in current
        else:
            assert not refinement.is_current(stale, candidates)
            assert current.get(tid, []) is not None
    result = review(client, h, batch)
    storage = next(e for e in result["editorFields"] if e["field"]["fieldKey"] == "storage")
    assert storage["status"] == "ready"
    assert storage["field"]["value"] == ROWS[6][1]
    assert storage["field"]["provenance"] == "EXTRACTED"
    assert result["refinementResults"][batch["targets"][0]["id"]]["refinementVersion"] is None


@pytest.mark.parametrize("stale", ["version", "safetyListsHash"])
def test_AC_SRC_2_5_stale_version_falls_back_and_reanalysis_refines(
    client, login, monkeypatch, stale
):
    from app.ai.source_refine import PROMPT_VERSION
    from app.source_analysis.text_safety import SAFETY_LISTS_HASH

    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(
            select(Item).join(Run).where(Run.batch_id == batch["id"], Item.phase == "REFINE")
        )
        assert item.refinement["version"] == PROMPT_VERSION
        assert item.refinement["safetyListsHash"] == SAFETY_LISTS_HASH
        changed = dict(item.refinement)
        changed[stale] = "obsolete"
        item.refinement = changed
        db.commit()
    before = review(client, h, batch)
    assert before["refinementResults"][batch["targets"][0]["id"]] == {
        "excluded": [],
        "refinementVersion": None,
    }
    storage = next(e for e in before["editorFields"] if e["field"]["fieldKey"] == "storage")
    assert storage["status"] == "ready" and storage["field"]["provenance"] == "EXTRACTED"
    run = start(client, h, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        assert item.status == "SUCCEEDED"
        assert item.refinement["version"] == PROMPT_VERSION
        assert item.refinement["safetyListsHash"] == SAFETY_LISTS_HASH
    after = review(client, h, batch)
    assert after["refinementResults"][batch["targets"][0]["id"]]["refinementVersion"]


@pytest.mark.parametrize("value, reason", [("32,000원", "price"), ("면역력에 좋아요", "health")])
def test_AC_SRC_3_served_refinement_rechecks_safety(client, login, monkeypatch, value, reason):
    h, batch, _ = ready(client, login, monkeypatch)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(
            select(Item).join(Run).where(Run.batch_id == batch["id"], Item.phase == "REFINE")
        )
        changed = deepcopy(item.refinement)
        summary = next(m for m in changed["modules"] if m["module"] == "summary")
        cid = summary["texts"][0]["candidateIds"][0]
        summary["texts"][0]["value"] = value
        item.refinement = changed
        stored_version = changed["refinementVersion"]
        db.commit()
    result = review(client, h, batch)
    assert "refinements" not in result
    summary = next(e for e in result["editorFields"] if e["field"]["fieldKey"] == "summary")
    assert summary["status"] == "missing" and summary["field"]["value"] == ""
    assert (
        next(e for e in result["editorFields"] if e["field"]["fieldKey"] == "storage")["field"][
            "provenance"
        ]
        == "REFINED"
    )
    exclusions = result["refinementResults"][batch["targets"][0]["id"]]
    assert {"candidateId": cid, "value": ROWS[4][1], "reason": reason} in exclusions["excluded"]
    assert exclusions["refinementVersion"] != stored_version


def test_AC_SRC_3_prompt_excludes_entire_health_candidate():
    from app.ai.source_refine import PROMPT, PROMPT_VERSION

    assert PROMPT_VERSION == "source-refine-v8-bounded-batches"
    assert "NEVER cite a candidate containing a health claim" in PROMPT
    assert "List that entire candidate in excluded with reason health" in PROMPT


def test_AC_SRC_3_safety_lists_utf8_independent_of_locale(monkeypatch):
    import hashlib
    import importlib.util

    from app.source_analysis import text_safety

    original = Path.read_text

    def explicit_utf8(path, *args, **kwargs):
        assert kwargs.get("encoding") == "utf-8"
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", explicit_utf8)
    spec = importlib.util.spec_from_file_location("isolated_text_safety", text_safety.__file__)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    assert loaded.has_health_claim("면역력")
    assert (
        loaded.SAFETY_LISTS_HASH
        == hashlib.sha256(
            Path(text_safety.__file__).with_name("text_safety_lists.json").read_bytes()
        ).hexdigest()
    )


@pytest.mark.parametrize(
    "value,code",
    [
        ("반품 시 연락 주세요", "PLATFORM_TEXT"),
        ("고객센터 평일 10시~5시", "PLATFORM_TEXT"),
        ("1-3일 이내 도착", "PERIOD_TEXT"),
    ],
)
def test_AC_SRC_3_refined_policy_is_warning_not_rejection(value, code):
    source = [{**candidates()[0], "value": value, "evidence": [{"quote": value}]}]
    output = Refinement(
        modules=[{"module": "delivery", "texts": [{"value": value, "candidateIds": ["c0"]}]}]
    )
    modules, diagnostics = refinement.validate(output, source, "target")
    assert modules == [{"module": "delivery", "texts": [{"value": value, "candidateIds": ["c0"]}]}]
    assert diagnostics["rejectedCount"] == 0
    assert diagnostics["excluded"] == []
    assert diagnostics["warningCount"] == 1
    assert diagnostics["warnings"] == [
        {"module": "delivery", "code": code, "text": {"value": value, "candidateIds": ["c0"]}}
    ]


@pytest.mark.parametrize(
    "value", ["1-3일 이내 도착", "3일 이내 발송", "월·수 출고", "주문 후 2-3일"]
)
@pytest.mark.parametrize("saved", [False, True])
def test_AC_SRC_3_fallback_skips_period_candidates_and_saved_autofill(value, saved):
    from app.source_analysis.editor import suggestions

    candidate = {
        **candidates()[0],
        "fieldKey": "delivery",
        "value": value,
        "candidateIds": ["c0"],
        "outdated": False,
    }
    field = dict(
        targetId="target",
        fieldKey="delivery",
        value=value,
        state="UNREVIEWED",
        provenance="EXTRACTED",
        candidateIds=["c0"],
        photoAssetIds=[],
        illustrationId=None,
    )
    entries = suggestions(
        {
            "targets": [{"id": "target"}],
            "refinements": {},
            "candidates": [candidate],
            "fields": [field] if saved else [],
        }
    )
    delivery = next(e for e in entries if e["field"]["fieldKey"] == "delivery")
    assert delivery["status"] == "missing"
    assert delivery["field"]["value"] == ""
    assert delivery["field"]["candidateIds"] == []


@pytest.mark.parametrize(
    "quote,rewritten",
    [
        ("생산 시기: 1월-3월", "1월부터 3월까지 생산해요"),
        ("생산 시기: 5월-7월", "5월에서 7월 사이에 생산해요"),
        ("수확 시기: 5-7월", "5월에서 7월 사이에 수확해요"),
    ],
)
def test_AC_SRC_3_month_range_measurement_fix_preserves_evidence(quote, rewritten):
    """Range tokens share units; product evidence checks stay strict."""
    from app.source_analysis.final_score import sensitive_tokens, unsupported_tokens

    source = [{**candidates()[0], "value": quote, "evidence": [{"quote": quote}]}]
    safe = sensitive_tokens(quote)
    assert not unsupported_tokens(sensitive_tokens(rewritten), safe)["number"]
    copied = f"합성 품목은 {quote.split(': ')[1]}에 생산해요"
    assert not unsupported_tokens(sensitive_tokens(copied), safe)["number"]
    # Both wordings are numerically grounded; do not discard the supported season.
    for value in (rewritten, copied):
        output = Refinement(
            modules=[
                {"module": "productionProcess", "texts": [{"value": value, "candidateIds": ["c0"]}]}
            ]
        )
        modules, diagnostics = refinement.validate(output, source, "target")
        assert modules[0]["texts"][0]["value"] == value
        assert diagnostics["rejectedCount"] == 0


@pytest.mark.parametrize(
    "quote,tainted_value,output_value",
    [
        ("합성 배 6.5k", "합성 배 6.5kg", "합성 배 6.5kg"),
        ("중량 8g", "중량 8kg", "중량 8kg"),
        ("표본 9개", "품질 9%", "품질 9%"),
        ("중량 4kg과 6kg", "중량 10kg", "중량 10kg"),
        ("중량 8kg", "중량 8000g", "중량 8000g"),
        ("중량 미확인", "중량 7kg", "중량 7kg"),
    ],
)
def test_AC_SRC_3_refine_numbers_need_quotes_not_tainted_candidate(
    quote, tainted_value, output_value
):
    source = [{**candidates()[0], "value": tainted_value, "evidence": [{"quote": quote}]}]
    output = Refinement(
        modules=[
            {"module": "composition", "texts": [{"value": output_value, "candidateIds": ["c0"]}]},
            {
                "module": "storage",
                "texts": [{"value": "그늘에 보관해요", "candidateIds": ["safe"]}],
            },
        ]
    )
    source.append(
        {
            **candidates()[0],
            "id": "safe",
            "value": "그늘에 보관해요",
            "evidence": [{"quote": "그늘에 보관해요"}],
        }
    )
    modules, diagnostics = refinement.validate(output, source, "target")
    assert modules == [
        {"module": "storage", "texts": [{"value": "그늘에 보관해요", "candidateIds": ["safe"]}]}
    ]
    assert diagnostics["rejectedCount"] == 1
    assert diagnostics["rejected"][0]["code"] == "UNSUPPORTED_NUMBER"


def test_AC_SRC_3_final_prompt_keeps_r3_coverage_and_excludes_contact_policy():
    from app.ai.source_analysis import PROMPT as EXTRACT_PROMPT
    from app.ai.source_analysis import PROMPT_VERSION as EXTRACT_VERSION
    from app.ai.source_refine import PROMPT

    assert EXTRACT_VERSION == "source-v8-exact-numbers"
    assert "IDENTITY AND COVERAGE AUDIT" in EXTRACT_PROMPT
    assert "FACT PRESERVATION AND MODULE AUDIT" in PROMPT
    assert "production/harvest months or seasons, including year-round production" in PROMPT
    assert "Copy each number, attached unit and complete range expression exactly" in EXTRACT_PROMPT
    assert "Copy numbers, units and the COMPLETE range expression exactly" in PROMPT
    assert "Never compute, convert units, round, repair" in PROMPT
    assert "app chat, farm inquiry, seller messaging" in PROMPT
    assert "excluded as platform, never kept under support" in PROMPT
    assert "A contact-only candidate produces no text" in PROMPT


def test_AC_SRC_2_5_refine_input_cap_is_deterministic_and_bounded():
    source = candidates() * 30
    selected, diagnostics = refinement.limit_candidates(source)
    assert selected == source[: len(selected)]
    assert len(selected) <= refinement.MAX_REFINE_CANDIDATES
    assert (
        len(json.dumps(selected, ensure_ascii=False, sort_keys=True)) <= refinement.MAX_REFINE_CHARS
    )
    assert diagnostics["candidatesSkipped"] == len(source) - len(selected) > 0
    assert refinement.limit_candidates(source) == (selected, diagnostics)
    giant = [{**source[0], "value": "합성" * 20000}]
    selected, diagnostics = refinement.limit_candidates(giant)
    assert selected == []
    assert diagnostics == {
        "candidatesAnalysed": 0,
        "candidatesSkipped": 1,
        "emptyReason": "REFINE_INPUT_LIMIT",
    }


@pytest.mark.parametrize(
    "source,reason",
    [
        ([], None),
        ([{"targetId": None}], "NO_TARGET_CANDIDATES"),
        ([{"targetId": "target"}], "ALL_TEXTS_FILTERED"),
    ],
)
def test_AC_SRC_5_8_refine_empty_reasons(source, reason):
    assert refinement.empty_reason(source, "target", []) == reason
    assert refinement.empty_reason(source, "target", [{"module": "summary"}]) is None


def test_AC_SRC_2_5_refine_batches_keep_full_freshness_and_cover_all_candidates(
    client,
    login,
    monkeypatch,
):
    h, batch, run = ready(client, login, monkeypatch)
    monkeypatch.setattr(refinement, "MAX_REFINE_CANDIDATES", 1)
    drain()
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        current = refinement.current_candidates(db, batch["id"], batch["targets"][0]["id"])
        assert item.status == "SUCCEEDED" and refinement.is_current(item, current)
        assert item.diagnostics["candidatesSkipped"] == 0
        assert item.diagnostics["candidatesAnalysed"] == len(current)
        assert item.diagnostics["refinementBatches"] == len(current)
        cited = {
            cid for m in item.refinement["modules"] for t in m["texts"] for cid in t["candidateIds"]
        }
        excluded = {cid for e in item.refinement["excluded"] for cid in e["candidateIds"]}
        assert cited | excluded == {c.id for c in current}
        assert cited & {c.id for c in current[1:]}
    assert not worker.run_once()
    r = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h).json()
    assert next(i for i in r["items"] if i["phase"] == "REFINE")["candidatesSkipped"] == 0


@pytest.mark.parametrize("code", ["CANDIDATES_REJECTED", "REQUEST_UNCERTAIN"])
def test_AC_SRC_3_5_failed_extraction_never_automatically_refines_or_replays(
    client,
    login,
    monkeypatch,
    code,
):
    from app.ai.source_analysis import ExtractionError

    _, _, run = ready(client, login, monkeypatch)
    calls = []

    def fail_extract(*args):
        calls.append(1)
        if code == "REQUEST_UNCERTAIN":
            raise ExtractionError(code)
        response = fixture_extract(*args)
        for candidate in response.extraction.candidates:
            candidate.evidence[0].quote = "합성 근거에 없는 문구"
        return response

    monkeypatch.setattr(worker, "extract", fail_extract)
    drain()
    assert calls == [1] and not worker.run_once()
    with get_sessionmaker()() as db:
        items = list(db.scalars(select(Item).where(Item.run_id == run["id"])))
        assert not any(i.phase == "REFINE" for i in items)
        extraction = next(i for i in items if i.phase == "EXTRACT")
        assert extraction.status == "FAILED" and extraction.error == code


@pytest.mark.parametrize("case_id", ["21-long-text", "23-partial-validation"])
def test_AC_SRC_2_3_5_synthetic_chunks_merge_dedup_reject_and_reach_draft(
    client,
    login,
    monkeypatch,
    case_id,
):
    from app.ai import source_analysis as ai
    from app.source_analysis.models import Candidate
    from app.source_analysis.synthetic import CASES

    case = next(c for c in json.loads(CASES.read_text()) if c["id"] == case_id)
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch, text=case["text"])
    parsed = parse(case["text"].encode(), "text/plain")[0]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.status, asset.preprocess_version = "PREPARED", PREPROCESS_VERSION
        asset.sanitization_version, asset.privacy_approved = 1, True
        db.add(
            Page(
                asset_id=asset.id,
                revision=asset.revision,
                number=1,
                spans=parsed["spans"],
                redacted_spans=parsed["spans"],
                redactions=[],
            )
        )
        db.commit()

    def repeated(*args):
        response = ai.extract(*args)
        response.extraction.candidates *= 2
        return response

    monkeypatch.setattr(worker, "extract", repeated)
    run = start(client, h, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        items = list(db.scalars(select(Item).where(Item.run_id == run["id"])))
        assert len([i for i in items if i.phase == "EXTRACT"]) >= (
            3 if case_id == "21-long-text" else 1
        )
        assert all(
            i.status == ("PARTIAL" if i.phase == "EXTRACT" else "SUCCEEDED")
            if case_id == "23-partial-validation"
            else i.status == "SUCCEEDED"
            for i in items
        )
        assert db.get(Run, run["id"]).status == (
            "PARTIAL" if case_id == "23-partial-validation" else "SUCCEEDED"
        )
        candidates = list(db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"])))
        expected_fields = {"composition", "storage"}
        if case_id == "21-long-text":
            expected_fields.add("productionProcess")
        else:
            assert sum(i.diagnostics.get("rejectedCount", 0) for i in items) == 2
        assert len(candidates) == len(expected_fields)  # Exact provider repeats are stored once.
        assert {c.field_key for c in candidates} == expected_fields
        assert not any(c.value == "잘못된 인용 후보" for c in candidates)
    r = review(client, h, batch)
    response = client.put(
        f"{PREFIX}/{batch['id']}/editor",
        headers=key(h),
        json={
            "reviewVersion": r["reviewVersion"],
            "fields": [e["field"] for e in r["editorFields"]],
            "targets": [
                {
                    "targetId": batch["targets"][0]["id"],
                    "enabledModuleIds": ["composition", "storage", "productionProcess"],
                }
            ],
        },
    )
    assert response.status_code == 200, response.text
    modules = response.json()["drafts"][0]["snapshot"]["previewModules"]
    expected_texts = {"감귤 7kg입니다.", "서늘한 곳에 두세요."}
    if case_id == "21-long-text":
        expected_texts.add("바람을 막는 울타리에서 길렀습니다.")
    assert {t["value"] for m in modules for t in m["texts"]} == expected_texts


@pytest.mark.parametrize("changed", [False, True])
def test_AC_SRC_5_partial_retry_reuses_or_outdates_refinement(client, login, monkeypatch, changed):
    h, batch, run = ready(client, login, monkeypatch)

    def partial(*args):
        result = fixture_extract(*args)
        invalid = result.extraction.candidates[0].model_copy(deep=True)
        invalid.evidence[0].quote = "합성 근거에 없는 인용"
        result.extraction.candidates.append(invalid)
        return result

    monkeypatch.setattr(worker, "extract", partial)
    drain()
    before = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    old_version = before["refinementResults"][tid]["refinementVersion"]
    assert old_version
    with get_sessionmaker()() as db:
        extraction = db.scalar(
            select(Item).where(Item.run_id == run["id"], Item.phase == "EXTRACT")
        )
        assert extraction.status == "PARTIAL"
        extraction_id = extraction.id
        old_refine_id = db.scalar(
            select(Item.id).where(Item.run_id == run["id"], Item.phase == "REFINE")
        )

    def retried(*args):
        response = fixture_extract(*args)
        if changed:
            response.extraction.candidates = [
                c for c in response.extraction.candidates if c.field_key != "storage"
            ]
        return response

    monkeypatch.setattr(worker, "extract", retried)
    response = client.post(
        f"{PREFIX}/{batch['id']}/runs/{run['id']}/retry",
        headers=key(h), json={"itemIds": [extraction_id]},
    )
    assert response.status_code == 202, response.text
    retry_id = response.json()["id"]
    assert worker.run_once()  # Retry the PARTIAL item only after the explicit request.
    with get_sessionmaker()() as db:
        current = refinement.current_candidates(db, batch["id"], tid)
        assert refinement.is_current(db.get(Item, old_refine_id), current) is not changed
        queued = list(
            db.scalars(select(Item).where(Item.run_id == retry_id, Item.phase == "REFINE"))
        )
        assert len(queued) == int(changed)
        if changed:
            assert queued[0].status == "QUEUED"
    if changed:
        assert review(client, h, batch)["refinementResults"][tid]["refinementVersion"] is None
    drain()
    after = review(client, h, batch)
    assert (after["refinementResults"][tid]["refinementVersion"] == old_version) is not changed
    retried_run = client.get(f"{PREFIX}/{batch['id']}/runs/{retry_id}", headers=h).json()
    assert retried_run["status"] == "SUCCEEDED"
    assert not worker.run_once()


@pytest.mark.parametrize("all_empty", [False, True])
def test_AC_SRC_5_8_long_text_empty_chunks_notice_is_per_file(
    client, login, monkeypatch, all_empty
):
    from app.ai import source_analysis as ai
    from app.source_analysis.synthetic import CASES

    case = next(c for c in json.loads(CASES.read_text()) if c["id"] == "21-long-text")
    text = case["text"].replace(
        "합성 보관: 서늘한 곳에 두세요.", "합성 구분: 이 문단에는 상품 사실이 없습니다."
    )
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch, text=text)
    parsed = parse(text.encode(), "text/plain")[0]
    with get_sessionmaker()() as db:
        asset = db.get(Asset, source["id"])
        asset.status, asset.preprocess_version = "PREPARED", PREPROCESS_VERSION
        asset.sanitization_version, asset.privacy_approved = 1, True
        db.add(Page(asset_id=asset.id, revision=asset.revision, number=1,
                    spans=parsed["spans"], redacted_spans=parsed["spans"], redactions=[]))
        db.commit()
    calls = []

    def extract(*args):
        response = ai.extract(*args, mock_empty=True)
        if all_empty:
            response.extraction.candidates = []
        calls.append(response)
        return response

    monkeypatch.setattr(worker, "extract", extract)
    run = start(client, h, batch["id"])
    drain()
    response = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h)
    assert response.status_code == 200
    run_items = response.json()["items"]
    items = [i for i in run_items if i["phase"] == "EXTRACT"]
    refine_items = [i for i in run_items if i["phase"] == "REFINE"]
    assert len(refine_items) == 1
    assert refine_items[0]["status"] == "SUCCEEDED"
    assert refine_items[0]["emptyReason"] is None
    assert sum(bool(i["emptyReason"]) for i in run_items) == int(all_empty)
    assert len(items) == len(calls) == 3
    assert [bool(r.extraction.candidates) for r in calls] == (
        [False, False, False] if all_empty else [True, False, True]
    )
    assert response.json()["status"] == "SUCCEEDED"
    assert sum(bool(i["emptyReason"]) for i in items) == int(all_empty)
    if all_empty:
        assert next(i["emptyReason"] for i in items if i["emptyReason"]) == "NO_CANDIDATES"
    else:
        assert sum(i["acceptedCount"] for i in items) > 0
    with get_sessionmaker()() as db:
        internal = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "EXTRACT"))
        )
        assert sum(i.diagnostics["emptyReason"] == "NO_CANDIDATES" for i in internal) == (
            len(items) if all_empty else 1
        )


def test_AC_SRC_5_8_refine_oversized_input_reason_reaches_api(client, login, monkeypatch):
    h, batch, run = ready(client, login, monkeypatch)
    monkeypatch.setattr(refinement, "MAX_REFINE_CHARS", 1)
    drain()
    result = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h).json()
    item = next(i for i in result["items"] if i["phase"] == "REFINE")
    assert item["status"] == "SUCCEEDED" and item["error"] is None
    assert item["emptyReason"] == "REFINE_INPUT_LIMIT"
    assert item["acceptedCount"] == 0 and item["candidatesSkipped"] > 0
    assert not worker.run_once()


@pytest.mark.parametrize("reason", ["NO_SAFE_TEXT", "NO_CANDIDATES"])
def test_AC_SRC_5_8_run_view_empty_file_includes_refine_without_duplicate_reason(
    client, login, monkeypatch, reason
):
    h, batch, run = ready(client, login, monkeypatch)

    def empty_extract(*args):
        return ExtractionResponse(
            Extraction(candidates=[], photo_requests=[]), {"mock": True}, None
        )

    monkeypatch.setattr(worker, "extract", empty_extract)
    if reason == "NO_SAFE_TEXT":
        with get_sessionmaker()() as db:
            for page in db.scalars(select(Page).join(Asset).where(Asset.batch_id == batch["id"])):
                page.redacted_spans = []
            db.commit()
    drain()
    result = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h).json()
    assert result["status"] == "SUCCEEDED"
    extracts = [i for i in result["items"] if i["phase"] == "EXTRACT"]
    refines = [i for i in result["items"] if i["phase"] == "REFINE"]
    assert len(extracts) == len(refines) == 1
    assert extracts[0]["emptyReason"] == reason
    assert refines[0]["status"] == "SUCCEEDED"
    assert refines[0]["acceptedCount"] == 0
    assert refines[0]["emptyReason"] is None
    assert sum(bool(i["emptyReason"]) for i in result["items"]) == 1


@pytest.mark.parametrize("count", [1, 2])
def test_AC_SRC_1_2_11_common_farm_only_refines_for_single_product(
    client, login, monkeypatch, count
):
    from app.ai import source_analysis as ai

    h, batch, run = ready(
        client, login, monkeypatch, count=count, common=True, text=ai.MOCK_FARM_TEXT
    )
    monkeypatch.setattr(worker, "extract", ai.extract)
    calls, original = [], refinement.refine

    def track(mode, model, target, source):
        calls.append(source)
        return original(mode, model, target, source)

    monkeypatch.setattr(refinement, "refine", track)
    drain()
    result = review(client, h, batch)
    assert len(result["candidates"]) == 1
    common_id = result["candidates"][0]["candidateIds"][0]
    assert result["candidates"][0]["targetId"] is None
    assert len(calls) == count
    with get_sessionmaker()() as db:
        items = list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        )
        assert len(items) == count and all(i.status == "SUCCEEDED" for i in items)
        for item in items:
            assert item.refinement["inputCandidateIds"] == ([common_id] if count == 1 else [])
            assert item.diagnostics["emptyReason"] == (
                None if count == 1 else "NO_TARGET_CANDIDATES"
            )
    for target in batch["targets"]:
        story = next(
            e for e in result["editorFields"]
            if e["field"]["targetId"] == target["id"] and e["field"]["fieldKey"] == "farmStory"
        )
        if count == 1:
            assert story["status"] == "ready"
            assert "가상농가에서 재배합니다." in story["field"]["value"]
            assert story["field"]["candidateIds"] == [common_id]
            assert story["field"]["provenance"] == "REFINED"
            assert calls[0][0]["targetId"] is None
        else:
            assert story["status"] == "unassigned" and story["field"]["value"] == ""
            assert not any(calls)
    if count == 1:
        saved = client.put(
            f"{PREFIX}/{batch['id']}/editor", headers=key(h),
            json={
                "reviewVersion": result["reviewVersion"],
                "fields": [e["field"] for e in result["editorFields"]],
                "targets": [{
                    "targetId": batch["targets"][0]["id"], "enabledModuleIds": ["farmStory"],
                }],
            },
        )
        assert saved.status_code == 200, saved.text
        snapshot = saved.json()["drafts"][0]["snapshot"]
        assert any(
            "가상농가에서 재배합니다." in t["value"]
            for m in snapshot["previewModules"] for t in m["texts"]
        )
    assert not worker.run_once()


@pytest.mark.parametrize("changed_index", [0, 4])
def test_AC_SRC_2_5_common_candidates_source_batches_and_content_freshness(
    client, login, monkeypatch, changed_index
):
    from app.source_analysis.models import Batch, Candidate

    lines = [f"합성 농가 기록 {i}번째 이야기입니다." for i in range(6)]
    h, batch, run = ready(client, login, monkeypatch, text="\n".join(lines))

    def extract(mode, model, chunk, targets, images):
        spans = chunk["pages"][0]["spans"]
        return ExtractionResponse(
            Extraction(candidates=[
                {
                    "targetId": None if i % 2 == 0 else targets[0]["id"],
                    "fieldKey": "farmStory", "value": span["text"], "historical": False,
                    "evidence": [{
                        "sourceId": chunk["sourceId"], "sourceRevision": chunk["sourceRevision"],
                        "page": 1, "spanIds": [span["id"]], "quote": span["text"],
                    }],
                }
                for i, span in reversed(list(enumerate(spans)))
            ], photo_requests=[]), {"mock": True}, None,
        )

    monkeypatch.setattr(worker, "extract", extract)
    monkeypatch.setattr(refinement, "MAX_REFINE_CANDIDATES", 3)
    drain()
    tid = batch["targets"][0]["id"]
    with get_sessionmaker()() as db:
        item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        current = refinement.current_candidates(db, batch["id"], tid)
        assert [c.value for c in current] == lines
        assert [c.target_id is None for c in current] == [True, False] * 3
        assert item.refinement["inputCandidateIds"] == [c.id for c in current]
        assert refinement.is_current(item, current)
        selected, limits = refinement.limit_candidates(refinement.payload(current))
        assert [c["value"] for c in selected] == lines[:3]
        assert refinement.limit_candidates(refinement.payload(current)) == (selected, limits)
        assert item.diagnostics["candidatesAnalysed"] == 6
        assert item.diagnostics["candidatesSkipped"] == 0
        assert item.diagnostics["refinementBatches"] == 2
        cited = {
            cid for m in item.refinement["modules"] for t in m["texts"] for cid in t["candidateIds"]
        }
        assert cited == {c.id for c in current}
        candidate = db.get(Candidate, current[changed_index].id)
        assert candidate.target_id is None
        # Same ID, changed content: common inputs from every batch must go stale.
        candidate.value += " 가상 기록을 고쳤습니다."
        db.commit()
        current = refinement.current_candidates(db, batch["id"], tid)
        assert not refinement.is_current(item, current)
        with pytest.raises(RefineError, match="SOURCE_CHANGED"):
            refinement.check_inputs(
                db, (db.get(Batch, batch["id"]), None, db.get(Run, run["id"]), item)
            )
        assert tid not in refinement.current_refinements(db, db.get(Batch, batch["id"]))
    assert review(client, h, batch)["refinementResults"][tid]["refinementVersion"] is None


@pytest.mark.parametrize("field,module,allowed", [
    ("farmStory", "farmStory", True),
    ("historicalSales", "farmStory", True),
    ("farmUpdates", "farmUpdates", True),
    ("farmStory", "composition", False),
    ("farmStory", "specification", False),
    ("composition", "farmStory", False),
    ("specification", "farmStory", False),
    ("summary", "summary", False),
])
def test_AC_SRC_1_2_3_common_citations_are_restricted_to_farm_modules(field, module, allowed):
    common = {**candidates()[4], "id": "common", "targetId": None, "fieldKey": field}
    output = Refinement(modules=[{
        "module": module, "texts": [{"value": common["value"], "candidateIds": ["common", "c4"]}],
    }])
    source = [common, candidates()[4]]
    modules, diagnostics = refinement.validate(output, source, "target", target_count=1)
    assert bool(modules) is allowed
    assert diagnostics["rejectedCount"] == int(not allowed)
    if not allowed:
        assert diagnostics["rejected"][0]["code"] == "INVALID_COMMON_MODULE"
    # The same citation is always invalid for a multi-product run.
    modules, diagnostics = refinement.validate(output, source, "target", target_count=2)
    assert modules == [] and diagnostics["rejected"][0]["code"] == "INVALID_EVIDENCE"


@pytest.mark.parametrize("stage", ["failed", "outdated", "pending", "omitted"])
def test_AC_SRC_1_3_5_11_common_fallback_obeys_module_and_refinement_state(
    client, login, monkeypatch, stage
):
    from app.ai import source_analysis as ai

    h, batch, run = ready(client, login, monkeypatch, common=True, text=ai.MOCK_FARM_TEXT)
    monkeypatch.setattr(worker, "extract", ai.extract)
    if stage == "failed":
        def fail(*args):
            raise RefineError("FIXTURE_REFINE_FAILED")
        monkeypatch.setattr(refinement, "refine", fail)
    elif stage == "omitted":
        monkeypatch.setattr(refinement, "refine", lambda *args: RefineResponse(
            Refinement(modules=[], excluded=[]), {"mock": True}, None
        ))
    if stage == "pending":
        await_refine(run)
    else:
        drain()
    if stage == "outdated":
        with get_sessionmaker()() as db:
            item = db.scalar(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
            item.refinement = {**item.refinement, "version": "stale-version"}
            db.commit()
    result = review(client, h, batch)
    story = next(e for e in result["editorFields"] if e["field"]["fieldKey"] == "farmStory")
    fallback = stage in {"failed", "outdated"}
    assert bool(story["field"]["value"]) is fallback
    if fallback:
        assert story["status"] == "ready" and story["field"]["provenance"] == "EXTRACTED"
        assert story["field"]["candidateIds"] == result["candidates"][0]["candidateIds"]
    else:
        assert story["field"]["candidateIds"] == []
    # A null-target product specification cannot become a product fallback suggestion.
    from app.source_analysis.editor import suggestions
    result["candidates"][0]["fieldKey"] = "composition"
    result["refinements"] = {}
    composition = next(e for e in suggestions(result) if e["field"]["fieldKey"] == "composition")
    assert composition["field"]["value"] == "" and composition["field"]["candidateIds"] == []


@pytest.mark.parametrize("source,reason", [
    ([], None),
    ([{"targetId": "other"}], "NO_TARGET_CANDIDATES"),
    ([{"targetId": None}], "ALL_TEXTS_FILTERED"),
    ([{"targetId": "target"}], "ALL_TEXTS_FILTERED"),
])
def test_AC_SRC_5_8_single_target_empty_reason_counts_common_input(source, reason):
    assert refinement.empty_reason(source, "target", [], target_count=1) == reason


@pytest.mark.parametrize(
    "field_key,values",
    [
        ("qualityEvidence", ["12 °Bx", "14 °Bx"]),
        ("composition", ["감귤 3kg 구성입니다.", "감귤 5kg 구성입니다."]),
        ("specification", ["중과 크기입니다.", "대과 크기입니다."]),
    ],
)
@pytest.mark.parametrize("choice", ["CONFIRMED", "EXCLUDED"])
def test_AC_SRC_3_11_refinement_and_basic_info_cannot_resolve_conflicting_candidates(
    client, login, monkeypatch, field_key, values, choice
):
    from app.source_analysis.models import Candidate

    h, batch, run = ready(client, login, monkeypatch, text="\n".join(values))

    def conflicting_extract(mode, model, chunk, targets, images):
        return ExtractionResponse(
            Extraction(
                candidates=[
                    {
                        "targetId": targets[0]["id"],
                        "fieldKey": field_key,
                        "value": value,
                        "historical": False,
                        "evidence": [
                            {
                                "sourceId": chunk["sourceId"],
                                "sourceRevision": chunk["sourceRevision"],
                                "page": 1,
                                "spanIds": [chunk["pages"][0]["spans"][i]["id"]],
                                "quote": value,
                            }
                        ],
                    }
                    for i, value in enumerate(values)
                ],
                photo_requests=[],
            ),
            {"mock": True},
            None,
        )

    def automatic_choice(mode, model, target, source):
        return RefineResponse(
            Refinement(
                modules=[
                    {
                        "module": field_key,
                        "texts": [{"value": source[0]["value"], "candidateIds": [source[0]["id"]]}],
                    }
                ],
                excluded=[],
            ),
            {"mock": True},
            None,
        )

    monkeypatch.setattr(worker, "extract", conflicting_extract)
    monkeypatch.setattr(refinement, "refine", automatic_choice)
    drain()
    result = review(client, h, batch)
    tid = batch["targets"][0]["id"]
    assert result["refinementResults"][tid]["refinementVersion"]
    candidates_for_field = [c for c in result["candidates"] if c["fieldKey"] == field_key]
    assert {c["value"] for c in candidates_for_field} == set(values)
    assert {e["quote"] for c in candidates_for_field for e in c["evidence"]} == set(values)
    conflict = next(c for c in result["conflicts"] if c["fieldKey"] == field_key)
    assert conflict["targetId"] == tid and len(conflict["candidateIds"]) == 2
    entry = next(e for e in result["editorFields"] if e["field"]["fieldKey"] == field_key)
    assert entry["status"] == "conflict"
    assert entry["field"]["state"] == "UNREVIEWED"
    with get_sessionmaker()() as db:
        stored = list(db.scalars(select(Candidate).where(Candidate.batch_id == batch["id"])))
        assert {e["quote"] for c in stored for e in c.evidence} == set(values)

    explicit = {
        **entry["field"],
        "value": "생산자가 선택한 감귤 안내입니다.",
        "state": choice,
        "provenance": "PRODUCER",
        "candidateIds": [],
    }
    saved = client.patch(
        f"{PREFIX}/{batch['id']}/review",
        headers=h,
        json={"reviewVersion": result["reviewVersion"], "fields": [explicit]},
    )
    assert saved.status_code == 200, saved.text
    # The underlying sources still disagree; producer decisions remain authoritative.
    start(client, h, batch["id"])
    drain()
    after = review(client, h, batch)
    refreshed = next(e for e in after["editorFields"] if e["field"]["fieldKey"] == field_key)
    assert refreshed["status"] != "conflict"
    assert refreshed["field"] == explicit
    assert {c["value"] for c in after["candidates"] if c["fieldKey"] == field_key} == set(values)
