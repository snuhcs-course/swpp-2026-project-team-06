"""FEAT-03 AI 초안, FEAT-04 상품 편집·게시 요청, FEAT-05 단계, FEAT-07 상품 상세."""

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
    client.patch(
        f"/api/products/{pid}",
        headers=headers,
        json={
            "name": "청귤 5kg",
            "variety": "청귤",
            "options": [{"label": "5kg", "weightKg": 5}],
            "deliveryWindow": {"start": "2026-11-10", "end": "2026-11-20"},
            "maxDelayUntil": "2026-11-30",
        },
    )
    return pid


def test_AC_04_1_publish_requires_delivery_window(client, login):
    headers = login("u-kang")
    pid = client.post("/api/products", headers=headers, json={}).json()["productId"]

    response = client.post(f"/api/products/{pid}/publish-request", headers=headers)

    assert response.status_code == 400
    assert "받는 시기" in response.json()["details"]["fields"]


def test_AC_05_1_earlier_stage_must_be_cheaper(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [dict(STAGES["stages"][0]), dict(STAGES["stages"][1])]}
    bad["stages"][0] = {**bad["stages"][0], "options": {"opt-5": {"price": 30000, "quantity": 30}}}

    response = client.put(f"/api/products/{pid}/stages", headers=headers, json=bad)

    assert response.status_code == 400
    assert "stages.1.opt-5.price" in response.json()["details"]["fields"]


def test_AC_05_2_overlapping_periods_rejected(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [dict(STAGES["stages"][0]), dict(STAGES["stages"][1])]}
    bad["stages"][1] = {**bad["stages"][1], "startsAt": "2026-10-15"}

    response = client.put(f"/api/products/{pid}/stages", headers=headers, json=bad)

    assert response.status_code == 400
    assert "stages.1.period" in response.json()["details"]["fields"]


def test_last_stage_must_end_before_delivery(client, login):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    bad = {"stages": [{**STAGES["stages"][0], "endsAt": "2026-11-12"}]}

    response = client.put(f"/api/products/{pid}/stages", headers=headers, json=bad)

    assert response.status_code == 400
    assert "stages.period" in response.json()["details"]["fields"]


def test_AC_04_3_publish_then_admin_approve(client, login, admin_headers):
    headers = login("u-kang")
    pid = _new_product(client, headers)
    stages = client.put(f"/api/products/{pid}/stages", headers=headers, json=STAGES)
    assert stages.status_code == 200, stages.text

    requested = client.post(f"/api/products/{pid}/publish-request", headers=headers).json()
    assert requested["status"] == "PENDING_APPROVAL"
    assert client.get(f"/api/products/{pid}").status_code == 404

    approved = client.post(f"/admin/products/{pid}/approve", headers=admin_headers)
    assert approved.json()["status"] == "PUBLISHED"
    assert client.get(f"/api/products/{pid}").status_code == 200
    farm = client.get("/api/farms/f-kang").json()
    assert pid in [p["productId"] for p in farm["products"]]


def test_admin_approve_requires_admin(client, login):
    response = client.post("/admin/products/p-cheonggyeon/approve", headers=login("u-kang"))

    assert response.status_code == 403


def test_AC_04_4_published_edit_needs_reapproval(client, login, admin_headers):
    headers = login("u-kang")
    body = client.patch(
        "/api/products/p-house",
        headers=headers,
        json={"deliveryWindow": {"start": "2026-11-12", "end": "2026-11-22"}},
    ).json()

    assert body["pendingReapproval"] is True
    approved = client.post("/admin/products/p-house/approve", headers=admin_headers).json()
    assert approved["pendingReapproval"] is False


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

    response = client.put("/api/products/p-house/stages", headers=headers, json={"stages": stages})

    assert response.status_code == 400
    assert "stages.0.opt-5.quantity" in response.json()["details"]["fields"]
