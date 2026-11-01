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
        e.candidate_ids == ["c7"] and e.reason == "platform" for e in result.refinement.excluded
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


def ready(client, login, monkeypatch, *, count=1, common=False):
    monkeypatch.setattr(worker, "extract", fixture_extract)
    h = login("u-kang")
    batch = create(client, h, count=count)
    text = "\n".join(row[1] for row in ROWS)
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
        "택배사",
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
    from app.source_analysis.text_safety import has_health_claim, has_platform_text

    assert has_health_claim(case["value"]) == case["health"]
    assert has_platform_text(case["value"]) == case["platform"]
    assert has_money(case["value"]) == case["money"]


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
        ("고객센터 평일 10시~5시", "PLATFORM_TEXT", "platform"),
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
    assert not any(
        has_money(v) or has_health_claim(v) or has_platform_text(v) for v in texts.values()
    )
    excluded = {e["candidateIds"][0]: e["reason"] for e in diagnostics["excluded"]}
    assert excluded == {
        "mixed0": "price",
        "mixed1": "price",
        "mixed2": "platform",
        "mixed3": "health",
    }
    covered = {cid for m in modules for t in m["texts"] for cid in t["candidateIds"]} | set(
        excluded
    )
    assert covered == {c["id"] for c in source}


@pytest.mark.parametrize(
    "value",
    [
        "예약 판매 기간 10월 1일~20일",
        "판매가 10월 1일~20일",
        "품절",
        "판매 종료",
        "재입고 예정",
        "무통장 입금",
        "1인 2상자",
        "3kg/5kg/10kg 선택 가능",
        "선택하신 범위 안에서 랜덤 발송",
        "무료배송",
        "1-3일 이내 배송",
        "택배사",
        "구매처로 문의",
    ],
)
def test_AC_SRC_3_mock_drops_operational_text(value):
    source = [{**candidates()[0], "value": value}]
    output = refine("mock", "fixture", {"id": "target"}, source).refinement
    assert not output.modules
    assert any(e.reason == "platform" for e in output.excluded)


@pytest.mark.parametrize(
    ("value", "module", "expected"),
    [
        (
            "재배 중 생긴 얼룩·점은 교환 불가",
            "appearanceFaq",
            "재배 과정에서 얼룩·점·색 차이가 생길 수 있어요",
        ),
        ("1-3일 이내 제주에서 직배송", "productionProcess", "제주 농장에서 직접 보내요"),
        ("수확 후 바로 포장", "productionProcess", "수확 후 바로 포장"),
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
    assert len(result["excluded"]) == 4
    assert len(result["refinementVersion"]) == 64
    fields = [entry["field"] for entry in current["editorFields"]]
    with get_sessionmaker()() as db:
        refine_item = db.scalar(
            select(Item).join(Run).where(Run.batch_id == batch["id"], Item.phase == "REFINE")
        )
        assert refine_item.status == "SUCCEEDED"
        assert len(refine_item.refinement["excluded"]) == 4
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
    assert "작년 300상자 완판" in texts
    assert not any(has_money(t) or has_health_claim(t) or has_platform_text(t) for t in texts)


@pytest.mark.parametrize("stage", ["fallback", "omitted", "pending"])
@pytest.mark.parametrize("target_choices", [1, 2])
def test_AC_SRC_1_2_target_choices_precede_shared_candidates(stage, target_choices):
    from app.source_analysis.editor import suggestions

    tid = "target"
    target = {"id": tid, "name": "감귤"}
    specific = [
        {
            "id": f"specific-{i}",
            "targetId": tid,
            "fieldKey": "storage",
            "value": f"서늘한 곳에 보관해 주세요 {i}",
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
        e for e in entries if e["field"]["targetId"] == tid and e["field"]["fieldKey"] == "storage"
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


def test_AC_SRC_3_partial_extract_fallback_omits_money(client, login, monkeypatch):
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
    assert field["status"] == "missing" and field["field"]["value"] == ""
    assert any(c["value"] == ROWS[0][1] for c in r["candidates"])
    with get_sessionmaker()() as db:
        assert db.get(Run, run["id"]).status == "PARTIAL"
        assert not list(
            db.scalars(select(Item).where(Item.run_id == run["id"], Item.phase == "REFINE"))
        )


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
        original_id = db.scalar(select(Asset.id).where(Asset.batch_id == batch["id"]))
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
        response = client.delete(
            f"{PREFIX}/{batch['id']}/sources/{original_id}?version=1", headers=h
        )
        assert response.status_code == 202, response.text
    with get_sessionmaker()() as db:
        assert batch["targets"][0]["id"] not in refinement.current_refinements(
            db, db.get(Batch, batch["id"])
        )
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

    assert PROMPT_VERSION == "source-refine-v3"
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
