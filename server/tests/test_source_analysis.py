"""AC-SRC contracts: real PostgreSQL, local fixture provider, no paid calls."""

import io
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from PIL import Image
from sqlalchemy import select

from app.ai.source_analysis import MOCK_TEXT
from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.security import issue_token
from app.source_analysis import worker
from app.source_analysis.models import Asset, Candidate, Item, Run, utcnow
from app.source_analysis.schemas import MODULE_FIELDS

PREFIX = "/api/source-analysis/batches"


@pytest.fixture(autouse=True)
def source_settings(monkeypatch, tmp_path):
    settings = get_settings()
    monkeypatch.setattr(settings, "source_analysis_enabled", True)
    monkeypatch.setattr(settings, "source_analysis_provider", "mock")
    monkeypatch.setattr(settings, "source_storage", "local")
    monkeypatch.setattr(settings, "source_storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "openai_api_key", "")

    # An accidental real request in this module is always a test failure.
    def blocked(*args, **kwargs):
        raise AssertionError("Network is forbidden in source-analysis tests")

    monkeypatch.setattr("app.ai.source_analysis.OpenAI", blocked)


def key(headers):
    return {**headers, "Idempotency-Key": uuid4().hex}


def create(client, headers, count=1):
    response = client.post(
        PREFIX,
        headers=key(headers),
        json={"targets": [{"name": f"테스트 감귤 {i}"} for i in range(count)]},
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload(client, headers, batch, text=MOCK_TEXT, common=False):
    fields = {"batchVersion": batch["version"], "text": text, "common": str(common).lower()}
    if not common:
        fields["targetIds"] = batch["targets"][0]["id"]
    response = client.post(f"{PREFIX}/{batch['id']}/sources", headers=headers, data=fields)
    assert response.status_code == 201, response.text
    return response.json()


def start(client, headers, bid):
    batch = client.get(f"{PREFIX}/{bid}", headers=headers).json()
    response = client.post(
        f"{PREFIX}/{bid}/runs", headers=key(headers), json={"batchVersion": batch["version"]}
    )
    assert response.status_code == 202, response.text
    return response.json()


def drain():
    for _ in range(20):
        if not worker.run_once():
            return
    raise AssertionError("Queue did not drain")


def reviewed(client, headers, bid):
    result = client.get(f"{PREFIX}/{bid}/review", headers=headers).json()
    fields = [
        {
            "targetId": c["targetId"],
            "fieldKey": c["fieldKey"],
            "value": c["value"],
            "state": "CONFIRMED",
            "provenance": "EXTRACTED",
            "candidateIds": [c["id"]],
        }
        for c in result["candidates"]
    ]
    response = client.patch(
        f"{PREFIX}/{bid}/review",
        headers=headers,
        json={"reviewVersion": result["reviewVersion"], "fields": fields},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_AC_SRC_1_2_7_full_flow_and_private_draft(client, login):
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    run = start(client, h, batch["id"])
    drain()
    status = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h).json()
    assert status["status"] == "SUCCEEDED", status
    review = reviewed(client, h, batch["id"])
    body = {
        "reviewVersion": review["reviewVersion"],
        "targets": [
            {"targetId": batch["targets"][0]["id"], "enabledModuleIds": list(MODULE_FIELDS)}
        ],
    }
    idem = key(h)
    url = f"{PREFIX}/{batch['id']}/drafts"
    first = client.post(url, headers=idem, json=body)
    assert first.status_code == 201, first.text
    assert client.post(url, headers=idem, json=body).json() == first.json()
    draft = first.json()["drafts"][0]
    assert draft["snapshot"]["mode"] == "mock"
    assert len(draft["snapshot"]["modules"]) == 18
    assert len(draft["snapshot"]["previewModules"]) == 3
    assert source["id"] in draft["snapshot"]["sourceIds"]
    # Public product remains unchanged; no source-analysis Product was created.
    from app.catalog.models import Product

    with get_sessionmaker()() as db:
        assert not list(db.scalars(select(Product).where(Product.name == "테스트 감귤")))
    response = client.delete(f"{PREFIX}/{batch['id']}/sources/{source['id']}?version=1", headers=h)
    assert response.status_code == 409
    assert client.delete(f"{url}/{draft['id']}?version=1", headers=h).status_code == 200


def test_AC_SRC_5_6_tenant_roles_and_feature_flag(client, login, monkeypatch):
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    url = f"{PREFIX}/{batch['id']}"
    other = {"Authorization": "Bearer " + issue_token("u-halla", "PRODUCER")}
    for suffix in ("", f"/sources/{source['id']}", f"/sources/{source['id']}/content", "/review"):
        assert client.get(url + suffix, headers=other).status_code == 404
    assert client.get(url, headers=login("u-minji")).status_code == 403
    assert client.get(url, headers=login("u-misook")).status_code == 403
    assert client.get(url).status_code == 401
    monkeypatch.setattr(get_settings(), "source_analysis_enabled", False)
    assert client.get(url, headers=h).status_code == 404


def test_AC_SRC_6_real_mode_waits_for_privacy(client, login, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "source_analysis_provider", "openai")
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch, text="담당자: 예시이름\n이메일: example@example.test\n감귤")
    run = start(client, h, batch["id"])
    assert worker.run_once()
    assert not worker.run_once()
    url = f"{PREFIX}/{batch['id']}"
    assert client.get(f"{url}/runs/{run['id']}", headers=h).json()["status"] == "PRIVACY_REVIEW"
    page = client.get(f"{url}/sources/{source['id']}/pages/1", headers=h).json()
    assert "example@example.test" not in str(page["redactedSpans"])
    received = []
    from app.ai.source_analysis import ExtractionResponse
    from app.source_analysis.schemas import Extraction

    def fake(mode, model, chunk, targets, images):
        received.append(chunk)
        return ExtractionResponse(
            Extraction(candidates=[], photo_requests=[]), {"input_tokens": 1}, "r"
        )

    monkeypatch.setattr(worker, "extract", fake)
    response = client.patch(
        f"{url}/sources/{source['id']}/privacy",
        headers=h,
        json={"sourceRevision": 1, "sanitizationVersion": 1, "approved": True},
    )
    assert response.status_code == 200, response.text
    drain()
    assert len(received) == 1
    assert "example@example.test" not in str(received)


def test_AC_SRC_5_reanalysis_preserves_review_and_cancel(client, login):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch)
    start(client, h, batch["id"])
    drain()
    review = reviewed(client, h, batch["id"])
    start(client, h, batch["id"])
    drain()
    later = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    assert later["fields"] == review["fields"]
    run = start(client, h, batch["id"])
    assert (
        client.post(f"{PREFIX}/{batch['id']}/runs/{run['id']}/cancel", headers=h).status_code == 202
    )
    assert not worker.run_once()


def test_AC_SRC_5_unknown_mock_and_retry_uncertain(client, login, monkeypatch):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch, text="모르는 원문")
    run = start(client, h, batch["id"])
    drain()
    url = f"{PREFIX}/{batch['id']}/runs/{run['id']}"
    result = client.get(url, headers=h).json()
    assert result["status"] == "FAILED"
    failed = [i for i in result["items"] if i["status"] == "FAILED"]
    assert failed[0]["error"] == "UNSUPPORTED_MOCK_SOURCE"
    with get_sessionmaker()() as db:
        item = db.get(Item, failed[0]["id"])
        item.error = "REQUEST_UNCERTAIN"
        db.commit()
    body = {"itemIds": [failed[0]["id"]]}
    assert client.post(url + "/retry", headers=key(h), json=body).status_code == 409
    body["acknowledgeUncertain"] = True
    assert client.post(url + "/retry", headers=key(h), json=body).status_code == 202


def test_AC_SRC_5_worker_claim_is_exclusive_and_expired_sent_not_recalled(client, login):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch)
    run = start(client, h, batch["id"])
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs = list(pool.map(lambda _: worker.claim(), range(2)))
    claimed = [j for j in jobs if j]
    assert len(claimed) == 1
    with get_sessionmaker()() as db:
        item = db.get(Item, claimed[0][0])
        item.sent = True
        item.lease_until = utcnow() - timedelta(seconds=1)
        db.commit()
    assert worker.claim() is None
    result = client.get(f"{PREFIX}/{batch['id']}/runs/{run['id']}", headers=h).json()
    assert result["items"][0]["error"] == "REQUEST_UNCERTAIN"


def test_AC_SRC_7_idempotent_concurrency_and_versions(client, login):
    h = login("u-kang")
    idem = key(h)
    body = {"targets": [{"name": "감귤"}]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: client.post(PREFIX, headers=idem, json=body), range(2)))
    assert all(r.status_code == 201 for r in responses)
    assert responses[0].json() == responses[1].json()
    assert (
        client.post(PREFIX, headers=idem, json={"targets": [{"name": "다른"}]}).status_code == 409
    )
    batch = responses[0].json()
    upload(client, h, batch)
    stale = client.post(
        f"{PREFIX}/{batch['id']}/sources",
        headers=h,
        data={"batchVersion": 1, "text": "새로운 문서"},
    )
    assert stale.status_code == 409


def test_AC_SRC_8_upload_and_decode_validation(client, login):
    h = login("u-kang")
    batch = create(client, h)
    url = f"{PREFIX}/{batch['id']}/sources"
    bad = client.post(
        url,
        headers=h,
        data={"batchVersion": 1},
        files={"file": ("fake.jpg", b"not a jpeg", "image/jpeg")},
    )
    assert bad.status_code == 400
    duplicate = upload(client, h, batch)
    current = client.get(f"{PREFIX}/{batch['id']}", headers=h).json()
    dup = client.post(url, headers=h, data={"batchVersion": current["version"], "text": MOCK_TEXT})
    assert dup.status_code == 409
    assert dup.json()["details"]["sourceId"] == duplicate["id"]


def test_AC_SRC_1_3_common_ambiguous_and_invalid_evidence(client, login):
    h = login("u-kang")
    batch = create(client, h, count=2)
    upload(client, h, batch, common=True)
    start(client, h, batch["id"])
    drain()
    review = client.get(f"{PREFIX}/{batch['id']}/review", headers=h).json()
    assert all(c["targetId"] is None for c in review["candidates"])
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.schemas import Extraction

    extraction = Extraction(
        candidates=[
            {
                "targetId": None,
                "fieldKey": "summary",
                "value": "감귤",
                "historical": False,
                "evidence": [
                    {
                        "sourceId": "abc",
                        "sourceRevision": 1,
                        "page": 1,
                        "spanIds": ["s0"],
                        "quote": "없는 문구",
                    }
                ],
            }
        ],
        photo_requests=[],
    )
    with pytest.raises(ExtractionError, match="INVALID_EVIDENCE"):
        worker.validate(
            extraction,
            {
                "sourceId": "abc",
                "sourceRevision": 1,
                "pages": [{"number": 1, "spans": [{"id": "s0", "text": "감귤"}]}],
            },
            set(),
        )


def test_AC_SRC_6_redaction_removes_pixels_and_metadata():
    from app.source_analysis.preprocess import PreparationError, identify, redact, scrub

    image = Image.new("RGB", (20, 20), "white")
    raw = io.BytesIO()
    image.save(raw, "PNG")
    sanitized, spans = redact(
        raw.getvalue(), [{"id": "s0", "text": "010-1111-2222", "box": [0, 0, 0.5, 0.5]}]
    )
    assert "[가림]" in spans[0]["text"]
    assert Image.open(io.BytesIO(sanitized)).getpixel((2, 2)) == (0, 0, 0)
    assert "example@test.com" not in scrub("example@test.com")
    with pytest.raises(PreparationError):
        identify(b"\xff", "file.txt")


def test_AC_SRC_5_late_result_after_cancel_discarded(client, login, monkeypatch):
    h = login("u-kang")
    batch = create(client, h)
    upload(client, h, batch)
    run = start(client, h, batch["id"])
    assert worker.run_once()
    original = worker.extract

    def cancel_then_return(*args):
        client.post(f"{PREFIX}/{batch['id']}/runs/{run['id']}/cancel", headers=h)
        return original(*args)

    monkeypatch.setattr(worker, "extract", cancel_then_return)
    assert worker.run_once()
    with get_sessionmaker()() as db:
        assert not list(db.scalars(select(Candidate)))
        assert db.get(Run, run["id"]).status == "CANCELLED"


def test_AC_SRC_5_revision_invalidates_result_and_draft(client, login):
    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    start(client, h, batch["id"])
    drain()
    review = reviewed(client, h, batch["id"])
    url = f"{PREFIX}/{batch['id']}"
    changed = client.patch(
        f"{url}/sources/{source['id']}",
        headers=h,
        json={"sourceVersion": 1, "targetIds": [batch["targets"][0]["id"]]},
    )
    assert changed.status_code == 200
    after = client.get(url + "/review", headers=h).json()
    assert after["fields"] == review["fields"]
    assert all(c["outdated"] for c in after["candidates"])
    response = client.post(
        url + "/drafts",
        headers=key(h),
        json={
            "reviewVersion": after["reviewVersion"],
            "targets": [{"targetId": batch["targets"][0]["id"], "enabledModuleIds": ["hero"]}],
        },
    )
    assert response.status_code == 409
    assert response.json()["details"]["reason"] == "OUTDATED_EVIDENCE"


def test_AC_SRC_7_batch_delete_clears_private_files_and_cached_drafts(client, login):
    from app.source_analysis.models import Batch, Page, RequestRecord
    from app.source_analysis.storage import Storage

    h = login("u-kang")
    batch = create(client, h)
    source = upload(client, h, batch)
    start(client, h, batch["id"])
    drain()
    with get_sessionmaker()() as db:
        storage_key = db.get(Asset, source["id"]).storage_key
    url = f"{PREFIX}/{batch['id']}"
    current = client.get(url, headers=h).json()
    assert (
        client.request("DELETE", url, headers=h, json={"version": current["version"]}).status_code
        == 202
    )
    assert client.get(url, headers=h).status_code == 404
    worker.cleanup()
    assert not Storage().path(storage_key).exists()
    with get_sessionmaker()() as db:
        assert db.get(Batch, batch["id"]).targets == []
        assert not list(db.scalars(select(Page)))
        assert not list(db.scalars(select(Candidate)))
        assert not list(db.scalars(select(RequestRecord)))


def test_AC_SRC_3_7_manual_values_and_atomic_failure(client, login):
    h = login("u-kang")
    batch = create(client, h)
    url = f"{PREFIX}/{batch['id']}"
    body = {
        "reviewVersion": 1,
        "fields": [
            {
                "targetId": batch["targets"][0]["id"],
                "fieldKey": "summary",
                "value": "직접 적은 설명",
                "state": "CONFIRMED",
                "provenance": "PRODUCER",
            }
        ],
    }
    assert client.patch(url + "/review", headers=h, json=body).status_code == 200
    review = client.get(url + "/review", headers=h).json()
    save = {
        "reviewVersion": review["reviewVersion"],
        "targets": [
            {"targetId": batch["targets"][0]["id"], "enabledModuleIds": ["summary"]},
            {"targetId": "wrong-target", "enabledModuleIds": ["summary"]},
        ],
    }
    assert client.post(url + "/drafts", headers=key(h), json=save).status_code == 400
    from app.source_analysis.models import Draft

    with get_sessionmaker()() as db:
        assert not list(db.scalars(select(Draft)))
    save["targets"] = save["targets"][:1]
    response = client.post(url + "/drafts", headers=key(h), json=save)
    assert response.status_code == 201, response.text
    snapshot = response.json()["drafts"][0]["snapshot"]
    assert snapshot["mode"] == "producer"
    assert "candidateIds" not in str(snapshot["previewModules"])


def test_AC_SRC_8_read_body_limit_and_noncacheable(client, login):
    h = login("u-kang")
    response = client.post(
        PREFIX, headers={**h, "Content-Length": str(22 * 1024 * 1024)}, content=b""
    )
    assert response.status_code == 413
    batch = create(client, h)
    response = client.get(f"{PREFIX}/{batch['id']}", headers=h)
    assert response.headers["cache-control"] == "no-store"


def test_AC_SRC_3_unsupported_number_rejected():
    from app.ai.source_analysis import ExtractionError
    from app.source_analysis.schemas import Extraction

    data = Extraction(
        candidates=[
            {
                "targetId": None,
                "fieldKey": "pieceCount",
                "value": "30개",
                "historical": False,
                "evidence": [
                    {
                        "sourceId": "s",
                        "sourceRevision": 1,
                        "page": 1,
                        "spanIds": ["s0"],
                        "quote": "5kg",
                    }
                ],
            }
        ],
        photo_requests=[],
    )
    with pytest.raises(ExtractionError, match="UNSUPPORTED_NUMBER"):
        worker.validate(
            data,
            {
                "sourceId": "s",
                "sourceRevision": 1,
                "pages": [{"number": 1, "spans": [{"id": "s0", "text": "5kg"}]}],
            },
            set(),
        )


def test_AC_SRC_6_openai_adapter_contract(monkeypatch):
    from types import SimpleNamespace

    from app.ai import source_analysis as adapter
    from app.source_analysis.schemas import Extraction

    calls = {}

    class Client:
        def __init__(self, **kwargs):
            calls["client"] = kwargs
            self.responses = self

        def parse(self, **kwargs):
            calls["request"] = kwargs
            return SimpleNamespace(
                status="completed",
                output_parsed=Extraction(candidates=[], photo_requests=[]),
                usage=None,
                id="response",
                _request_id="req",
            )

        def close(self):
            calls["closed"] = True

    monkeypatch.setattr(adapter, "OpenAI", Client)
    result = adapter.extract("openai", "gpt-6.1-sol", {"pages": []}, [], [])
    assert calls["client"]["max_retries"] == 0
    assert calls["request"]["store"] is False
    assert calls["request"]["model"] == "gpt-6.1-sol"
    assert "tools" not in calls["request"]
    assert result.request_id == "req" and calls["closed"]


def test_evaluation_reports_missing_not_invented_metrics():
    from app.source_analysis.evaluate import evaluate

    row = {"targetId": "t", "fieldKey": "name", "value": "감귤"}
    result = evaluate([{"expected": [row], "actual": [], "durationMs": 2} for _ in range(20)])
    assert result["sets"] == 20 and result["missing"] == 20
    assert result["precision"] is None and result["recall"] == 0
    assert result["totalCostUsd"] is None
