"""FEAT-03 AI 초안, FEAT-04 상품 편집·공급 승인, FEAT-05 단계, FEAT-07 상세."""

import uuid

from sqlalchemy import update

from app.ai import service as ai
from app.ai.schemas import DraftExtraction
from app.catalog.models import StageAllocation
from app.core.db import get_sessionmaker

STAGES = {
    "stages": [
        {
            "name": "1단계",
            "startsAt": "2026-10-10",
            "endsAt": "2026-10-20",
            "options": {"opt-5": {"price": 25000, "quantity": 30}},
        },
        {
            "name": "2단계",
            "startsAt": "2026-10-21",
            "endsAt": "2026-10-31",
            "options": {"opt-5": {"price": 28000, "quantity": 30}},
        },
    ]
}


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def test_product_detail_has_stage_prices_and_counts(client):
    body = client.get("/api/products/p-house").json()

    assert body["currentStageId"] == "st-house-1"
    assert body["currentPrice"] == 29000
    assert body["reservedCount"] == 37
    assert body["brixRecordCount"] == 5
    assert body["stages"][0]["options"]["opt-5"] == {
        "price": 29000,
        "quantity": 80,
        "reservedCount": 38,
    }
    assert body["info"]["packedAt"] == "출하 당일"
    assert "latestNews" not in body


def test_AC_07_1_sold_out_shows_next_stage(client):
    body = client.get("/api/products/p-redhyang").json()

    assert body["soldOut"] is True
    assert body["nextStageStartsAt"] == "2026-11-01"


def test_AC_07_1_house_sold_out_when_current_stage_full(client):
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(StageAllocation)
            .where(StageAllocation.stage_id == "st-house-1")
            .values(reserved_count=StageAllocation.quantity)
        )

    body = client.get("/api/products/p-house").json()
    assert body["soldOut"] is True
    assert body["nextStageStartsAt"] == "2026-10-13"


def test_AC_07_2_measured_brix_shown(client):
    body = client.get("/api/products/p-house").json()

    assert body["measuredBrix"] == 11.8
    assert body["expectedBrix"] == 12


def test_AC_04_2_unpublished_product_not_visible(client):
    for product_id in ("p-cheonggyeon", "p-cheonhye", "p-hallabong", "p-josaeng"):
        assert client.get(f"/api/products/{product_id}").status_code == 404


def test_my_product_has_missing_fields(client, login):
    body = client.get("/api/products/mine/p-hallabong", headers=login("u-kang")).json()

    assert body["status"] == "DRAFT"
    assert set(body["missingFields"]) == {"받는 시기", "최대 지연 기한", "단계 가격"}


def test_AC_01_6_consumer_token_on_producer_api_is_403(client, login):
    response = client.get("/api/products/mine/p-house", headers=login("u-minji"))

    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "WRONG_APP"


def test_AC_01_3_unapproved_producer_is_refused(client, login):
    for user in ("u-misook", "u-soonja", "u-taeho", "u-new"):
        response = client.get("/api/products/stage-presets", headers=login(user))
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"


def test_other_farms_product_is_not_found(client, login):
    response = client.get("/api/products/mine/p-noji", headers=login("u-kang"))

    assert response.status_code == 404


def test_stage_presets(client, login):
    body = client.get("/api/products/stage-presets", headers=login("u-kang")).json()

    assert [p["presetId"] for p in body] == ["three", "two", "custom"]


def test_AC_03_3_ai_failure_returns_failed_draft(client, login):
    response = client.post(
        "/api/products/drafts",
        headers=login("u-kang"),
        json={"inputText": "올해 하우스 감귤 예약 받습니다"},
    )

    body = response.json()
    assert response.status_code == 200
    assert body["failed"] is True
    assert body["extracted"]["name"] is None
    assert len(body["missingFields"]) == 7


def test_AC_03_1_and_03_2_draft_leaves_missing_empty_and_no_price(client, login, monkeypatch):
    sent: list[str] = []

    def fake_claude(text: str) -> str:
        sent.append(text)
        return '{"name": "하우스 감귤 5kg", "variety": "궁천조생", "options": ["5kg"]}'

    monkeypatch.setattr(ai.get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(ai, "_call_claude", fake_claude)
    text = "하우스 감귤 5키로 3만원 예약 받아요. 문의 010-1234-5678"

    body = client.post(
        "/api/products/drafts", headers=login("u-kang"), json={"inputText": text}
    ).json()

    assert body["failed"] is False
    assert body["extracted"]["name"] == "하우스 감귤 5kg"
    assert "expectedBrix" in body["missingFields"]
    assert "deliveryWindow" in body["missingFields"]
    assert body["priceMentioned"] == "3만원"
    assert "price" not in body["extracted"]
    assert "010-1234-5678" not in sent[0]


def test_draft_input_limit(client, login):
    response = client.post(
        "/api/products/drafts", headers=login("u-kang"), json={"inputText": "가" * 3001}
    )

    assert response.status_code == 400
    assert "inputText" in response.json()["details"]["fields"]


def test_create_product_from_draft(client, login, monkeypatch):
    monkeypatch.setattr(
        ai, "draft_product", lambda text: DraftExtraction(name="한라봉 5kg", options=["5kg"])
    )
    headers = login("u-kang")
    draft = client.post(
        "/api/products/drafts", headers=headers, json={"inputText": "한라봉"}
    ).json()

    product = client.post(
        "/api/products", headers=headers, json={"draftId": draft["draftId"]}
    ).json()

    assert product["status"] == "DRAFT"
    assert product["name"] == "한라봉 5kg"
    assert product["options"][0]["optionId"] == "opt-5"
    assert product["info"]["origin"] == "제주 서귀포"


def _new_product(client, headers) -> str:
    product = client.post("/api/products", headers=headers, json={}).json()
    pid = product["productId"]
    response = client.patch(
        f"/api/products/{pid}",
        headers=headers | key(),
        json={
            "version": product["version"],
            "name": "청귤 5kg",
            "variety": "청귤",
            "options": [{"label": "5kg", "weightKg": 5}],
            "deliveryWindow": {"start": "2026-11-10", "end": "2026-11-20"},
            "maxDelayUntil": "2026-11-30",
        },
    )
    assert response.status_code == 200, response.text
    return pid


def test_AC_04_8_initial_capacity_requires_complete_product(client, login):
    headers = login("u-kang")
    product = client.post("/api/products", headers=headers, json={}).json()

    response = client.post(
        f"/api/products/{product['productId']}/capacity-requests",
        headers=headers | key(),
        json={"requestedTotalGrams": 100_000, "version": product["version"]},
    )

    assert response.status_code == 400
    assert "받는 시기" in response.json()["details"]["fields"]


def test_AC_05_1_earlier_stage_must_be_cheaper(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [dict(STAGES["stages"][0]), dict(STAGES["stages"][1])]}
    bad["stages"][0] = {**bad["stages"][0], "options": {"opt-5": {"price": 30000, "quantity": 30}}}

    version = client.get(f"/api/products/mine/{pid}", headers=headers).json()["version"]
    response = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={**bad, "version": version},
    )

    assert response.status_code == 400
    assert "stages.1.opt-5.price" in response.json()["details"]["fields"]


def test_AC_05_2_overlapping_periods_rejected(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [dict(STAGES["stages"][0]), dict(STAGES["stages"][1])]}
    bad["stages"][1] = {**bad["stages"][1], "startsAt": "2026-10-15"}

    version = client.get(f"/api/products/mine/{pid}", headers=headers).json()["version"]
    response = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={**bad, "version": version},
    )

    assert response.status_code == 400
    assert "stages.1.period" in response.json()["details"]["fields"]


def test_last_stage_must_end_before_delivery(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [{**STAGES["stages"][0], "endsAt": "2026-11-12"}]}

    version = client.get(f"/api/products/mine/{pid}", headers=headers).json()["version"]
    response = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={**bad, "version": version},
    )

    assert response.status_code == 400
    assert "stages.period" in response.json()["details"]["fields"]


def test_AC_04_8_9_capacity_lifecycle_and_increase(client, login, admin_headers):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    product = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    stages = client.put(
        f"/api/products/{pid}/stages",
        headers=headers | key(),
        json={**STAGES, "version": product["version"]},
    )
    assert stages.status_code == 200, stages.text

    request_key = key()
    request_body = {"requestedTotalGrams": 100_000, "version": stages.json()["version"]}
    requested = client.post(
        f"/api/products/{pid}/capacity-requests",
        headers=headers | request_key,
        json=request_body,
    ).json()
    repeated = client.post(
        f"/api/products/{pid}/capacity-requests",
        headers=headers | request_key,
        json=request_body,
    ).json()
    assert repeated == requested
    assert requested["kind"] == "INITIAL"
    pending = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert pending["status"] == "PENDING_APPROVAL"
    assert client.get(f"/api/products/{pid}").status_code == 404

    duplicate = client.post(
        f"/api/products/{pid}/capacity-requests",
        headers=headers | key(),
        json={"requestedTotalGrams": 200_000, "version": stages.json()["version"] + 1},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["details"]["reason"] == "CAPACITY_REQUEST_PENDING"

    approved = client.post(
        f"/admin/products/{pid}/capacity-requests/{requested['requestId']}/approve",
        headers=admin_headers | key(),
        json={"version": requested["version"]},
    )
    assert approved.status_code == 200, approved.text
    assert client.get(f"/api/products/{pid}").status_code == 200
    product = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert product["approvedSupplyGrams"] == 100_000
    assert product["salesLimitGrams"] == 100_000

    increase = client.post(
        f"/api/products/{pid}/capacity-requests",
        headers=headers | key(),
        json={"requestedTotalGrams": 150_000, "version": product["version"]},
    ).json()
    assert client.get(f"/api/products/{pid}").status_code == 200
    rejected = client.post(
        f"/admin/products/{pid}/capacity-requests/{increase['requestId']}/reject",
        headers=admin_headers | key(),
        json={"version": increase["version"], "reason": "추가 확인"},
    )
    assert rejected.status_code == 200, rejected.text
    product = client.get(f"/api/products/mine/{pid}", headers=headers).json()
    assert product["status"] == "PUBLISHED"
    assert product["approvedSupplyGrams"] == 100_000

    history = client.get(f"/api/products/{pid}/capacity-requests", headers=headers).json()
    assert {item["status"] for item in history["items"]} == {"REJECTED", "APPROVED"}


def test_AC_04_8_capacity_withdrawal_authorization_and_reason(client, login, admin_headers):
    producer = login("u-kang")
    pending = client.get("/api/products/mine/p-cheonggyeon", headers=producer).json()
    request = pending["pendingCapacityRequest"]

    forbidden = client.post(
        f"/admin/products/p-cheonggyeon/capacity-requests/{request['requestId']}/approve",
        headers=producer | key(),
        json={"version": request["version"]},
    )
    assert forbidden.status_code == 403

    no_reason = client.post(
        f"/admin/products/p-cheonggyeon/capacity-requests/{request['requestId']}/reject",
        headers=admin_headers | key(),
        json={"version": request["version"], "reason": ""},
    )
    assert no_reason.status_code == 400

    withdrawn = client.post(
        f"/api/products/p-cheonggyeon/capacity-requests/{request['requestId']}/withdraw",
        headers=producer | key(),
        json={"version": request["version"]},
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["status"] == "WITHDRAWN"
    product = client.get("/api/products/mine/p-cheonggyeon", headers=producer).json()
    assert product["status"] == "DRAFT"


def test_AC_05_6_paid_snapshot_and_delivery_window_proposal(client, login):
    consumer = login("u-minji")
    producer = login("u-kang")
    order = client.get("/api/orders/o-42", headers=consumer).json()
    product = client.get("/api/products/mine/p-house", headers=producer).json()

    changed = client.patch(
        "/api/products/p-house",
        headers=producer | key(),
        json={
            "version": product["version"],
            "deliveryWindow": {"start": "2026-11-12", "end": "2026-11-22"},
        },
    )
    assert changed.status_code == 200, changed.text
    updated = client.get("/api/orders/o-42", headers=consumer).json()
    assert updated["deliveryWindow"] == order["deliveryWindow"]
    assert updated["proposedDeliveryWindow"] == {
        "start": "2026-11-12",
        "end": "2026-11-22",
    }

    accepted = client.post(
        "/api/orders/o-42/delivery-window-response",
        headers=consumer,
        json={"choice": "accept"},
    ).json()
    assert accepted["deliveryWindow"] == {"start": "2026-11-12", "end": "2026-11-22"}
    assert accepted["proposedDeliveryWindow"] is None


def test_reserved_stage_quantity_cannot_drop_below_reserved(client, login):
    headers = login("u-kang")
    current = client.get("/api/products/mine/p-house", headers=headers).json()
    stages = [
        {
            "name": s["name"],
            "startsAt": s["startsAt"],
            "endsAt": s["endsAt"],
            "options": {
                k: {"price": v["price"], "quantity": v["quantity"]} for k, v in s["options"].items()
            },
        }
        for s in current["stages"]
    ]
    stages[0]["options"]["opt-5"]["quantity"] = 10

    response = client.put(
        "/api/products/p-house/stages",
        headers=headers | key(),
        json={"stages": stages, "version": current["version"]},
    )

    assert response.status_code == 400
    assert "stages.0.opt-5.quantity" in response.json()["details"]["fields"]
