"""DEV-98 관리자 페이지 테스트 농가 숨기기·되돌리기 API."""

import uuid

from sqlalchemy import select

from app.admin.models import ManagerEvent
from app.admin.retire_test_farm import RETIRE_REASON
from app.core.db import get_sessionmaker
from app.farms.models import Farm
from tests.test_retire_test_farm import make_order_consumers_test_accounts


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def farm_state(farm_id: str) -> tuple[str, str | None]:
    with get_sessionmaker()() as session:
        farm = session.get(Farm, farm_id)
        return farm.approval_status, farm.suspend_reason


def farm_events(farm_id: str) -> list[ManagerEvent]:
    with get_sessionmaker()() as session:
        return list(
            session.scalars(
                select(ManagerEvent)
                .where(ManagerEvent.target_type == "farm", ManagerEvent.target_id == farm_id)
                .order_by(ManagerEvent.created_at)
            )
        )


def test_DEV_98_admin_only(client, login):
    for method, path in [
        ("get", "/admin/farms"),
        ("get", "/admin/farms/f-kang/preview"),
        ("post", "/admin/farms/f-kang/retire"),
        ("post", "/admin/farms/f-kang/restore"),
    ]:
        assert getattr(client, method)(path, headers=key()).status_code == 401, path
        response = getattr(client, method)(path, headers=login("u-kang") | key())
        assert response.status_code == 403, path
    assert farm_state("f-kang") == ("APPROVED", None)


def test_DEV_98_list_shows_public_and_hidden_farms(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    rows = client.get("/admin/farms", headers=admin_headers).json()
    by_id = {r["farmId"]: r for r in rows}
    assert by_id["f-kang"]["hidden"] is False
    assert by_id["f-kang"]["producerName"] == "강영수"
    assert by_id["f-kang"]["productCount"] >= 1
    # 승인 전·반려·제재 정지 농가는 목록에 없다(숨길 대상이 아니다)
    with get_sessionmaker()() as session:
        others = session.scalars(select(Farm.id).where(Farm.approval_status != "APPROVED")).all()
    assert others and not set(others) & set(by_id)

    client.post("/admin/farms/f-kang/retire", headers=admin_headers | key())
    rows = client.get("/admin/farms", headers=admin_headers).json()
    assert rows[0]["farmId"] == "f-kang" and rows[0]["hidden"] is True


def test_DEV_98_preview_changes_nothing(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    preview = client.get("/admin/farms/f-kang/preview", headers=admin_headers).json()
    assert preview["action"] == "retire"
    assert preview["refusal"] is None
    assert preview["name"] == "강씨네 귤밭"
    assert farm_state("f-kang") == ("APPROVED", None)
    assert farm_events("f-kang") == []
    assert client.get("/admin/farms/f-404/preview", headers=admin_headers).status_code == 404


def test_DEV_98_retire_hides_and_restore_reopens(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    assert client.get("/api/farms/f-kang").status_code == 200
    done = client.post("/admin/farms/f-kang/retire", headers=admin_headers | key())
    assert done.status_code == 200, done.text
    assert done.json()["hidden"] is True
    assert farm_state("f-kang") == ("SUSPENDED", RETIRE_REASON)
    assert client.get("/api/farms/f-kang").status_code == 404
    assert client.get("/api/products/p-house").status_code == 404
    assert client.get("/api/farms/f-halla").status_code == 200

    preview = client.get("/admin/farms/f-kang/preview", headers=admin_headers).json()
    assert preview["action"] == "restore" and preview["refusal"] is None

    back = client.post("/admin/farms/f-kang/restore", headers=admin_headers | key())
    assert back.status_code == 200, back.text
    assert back.json()["hidden"] is False
    assert farm_state("f-kang") == ("APPROVED", None)
    assert client.get("/api/farms/f-kang").status_code == 200


def test_DEV_98_audit_names_the_admin(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    client.post("/admin/farms/f-kang/retire", headers=admin_headers | key())
    client.post("/admin/farms/f-kang/restore", headers=admin_headers | key())
    events = farm_events("f-kang")
    assert [(e.event_type, e.actor_id, e.status) for e in events] == [
        ("test_farm.retire", "u-admin", "SUCCEEDED"),
        ("test_farm.restore", "u-admin", "SUCCEEDED"),
    ]


def test_DEV_98_same_key_runs_once(client, admin_headers):
    make_order_consumers_test_accounts("f-kang")
    same = admin_headers | key()
    first = client.post("/admin/farms/f-kang/retire", headers=same)
    again = client.post("/admin/farms/f-kang/retire", headers=same)
    assert first.status_code == again.status_code == 200
    assert first.json() == again.json()
    assert len(farm_events("f-kang")) == 1
    assert (
        client.post("/admin/farms/f-kang/retire", headers=admin_headers).status_code == 400
    )  # 키 필요


def test_DEV_98_refused_like_the_command(client, admin_headers):
    # 시드 f-kang에는 테스트 계정이 아닌 구매자 주문이 있다 → 숨기지 않는다(R-24 환불은 사람이 처리)
    preview = client.get("/admin/farms/f-kang/preview", headers=admin_headers).json()
    assert "실사용자 주문" in preview["refusal"]
    refused = client.post("/admin/farms/f-kang/retire", headers=admin_headers | key())
    assert refused.status_code == 409
    assert refused.json()["details"]["reason"] == "TEST_FARM_REFUSED"
    assert "실사용자 주문" in refused.json()["message"]
    assert farm_state("f-kang") == ("APPROVED", None)
    assert [(e.event_type, e.status) for e in farm_events("f-kang")] == [
        ("test_farm.retire", "REJECTED")
    ]

    # 이 기능으로 숨긴 농가가 아니면(공개 중) 되돌리기는 거부
    assert (
        client.post("/admin/farms/f-halla/restore", headers=admin_headers | key()).status_code
        == 409
    )
    assert (
        client.post("/admin/farms/f-404/retire", headers=admin_headers | key()).status_code == 404
    )


def test_DEV_98_sanction_suspension_is_not_restorable(client, admin_headers):
    # 제재로 정지된 농가(다른 사유)는 목록에 없고 되돌릴 수 없다
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, "f-halla")
        farm.approval_status = "SUSPENDED"
        farm.suspend_reason = "운영 정책 위반"
    assert "f-halla" not in {
        r["farmId"] for r in client.get("/admin/farms", headers=admin_headers).json()
    }
    preview = client.get("/admin/farms/f-halla/preview", headers=admin_headers).json()
    assert preview["action"] == "retire" and "이미 숨겨진" in preview["refusal"]
    assert (
        client.post("/admin/farms/f-halla/restore", headers=admin_headers | key()).status_code
        == 409
    )
    assert farm_state("f-halla") == ("SUSPENDED", "운영 정책 위반")
