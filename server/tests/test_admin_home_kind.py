"""DEV-307 관리자 홈 건수(AC-23-11)와 목록 계정 필터(AC-23-12)."""

import uuid
from datetime import timedelta

from sqlalchemy import update

from app.accounts.models import User
from app.admin.service import record_refund_request
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.orders.models import Order


def key() -> dict[str, str]:
    return {"Idempotency-Key": str(uuid.uuid4())}


def home(client, admin_headers, **params):
    response = client.get("/admin/home", headers=admin_headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_AC_23_11_admin_only(client, login):
    assert client.get("/admin/home").status_code == 401
    assert client.get("/admin/home", headers=login("u-kang")).status_code == 403


def test_AC_23_11_counts_match_list_definitions(client, admin_headers, login):
    # 시드: 가입 신청 대기 f-wimi(시드 테스트 계정), 공급 물량 대기 1건(f-kang, 시드 테스트 계정)
    body = home(client, admin_headers, kind="all")
    assert body["kind"] == "all"
    assert body["pendingApplications"] == len(
        client.get("/admin/producers?kind=all", headers=admin_headers).json()
    )
    assert body["pendingApplications"] == 1
    assert body["pendingCapacityRequests"] == len(
        client.get("/admin/capacity-requests?kind=all", headers=admin_headers).json()
    )
    assert body["pendingCapacityRequests"] == 1
    waiting = [
        r
        for r in client.get("/admin/support?kind=all", headers=admin_headers).json()
        if r["waiting"]
    ]
    assert body["waitingSupportThreads"] == len(waiting)
    assert body["openExceptions"] == 0
    assert body["overdueDeposits"] == len(
        client.get("/admin/orders/deposit-overdue", headers=admin_headers).json()
    )

    # 실사용자 생산자 문의, 열린 예외, 입금했어요 + 기한 지남 주문을 하나씩 만든다
    sent = client.post(
        "/api/messaging/producer/chats/u-farmclub/messages",
        headers=login("u-kang") | key(),
        json={"text": "정산 문의"},
    )
    assert sent.status_code == 200, sent.text
    with get_sessionmaker()() as session, session.begin():
        record_refund_request(session, "f-kang", "thread-x", "message-x")
        order = session.query(Order).filter(Order.status == "RESERVED").first()
        order.status = "AWAITING_DEPOSIT"
        order.deposit_due_at = now() - timedelta(hours=1)
        order.deposit_reported_at = now() - timedelta(hours=2)
    after = home(client, admin_headers, kind="all")
    assert after["waitingSupportThreads"] == body["waitingSupportThreads"] + 1
    assert after["openExceptions"] == 1
    assert after["overdueDeposits"] == body["overdueDeposits"] + 1


def test_AC_23_11_default_counts_only_real_accounts(client, admin_headers):
    # 시드 대기 신청·공급 물량은 모두 시드 테스트 계정이라 기본(real)에서는 0
    body = home(client, admin_headers)
    assert body["kind"] == "real"
    assert body["pendingApplications"] == 0
    assert body["pendingCapacityRequests"] == 0
    with get_sessionmaker()() as session, session.begin():
        session.execute(
            update(User).where(User.id.in_(("u-misook", "u-kang"))).values(is_test_account=False)
        )
    body = home(client, admin_headers)
    assert body["pendingApplications"] == 1
    assert body["pendingCapacityRequests"] == 1
    assert home(client, admin_headers, kind="test")["pendingApplications"] == 0
    assert client.get("/admin/home?kind=wrong", headers=admin_headers).status_code == 400


# ---------------- 계정 필터 ----------------


def _ids(client, admin_headers, path: str, field: str, **params) -> set[str]:
    response = client.get(path, headers=admin_headers, params=params)
    assert response.status_code == 200, response.text
    data = response.json()
    rows = data["items"] if isinstance(data, dict) else data
    return {r[field] for r in rows}


def test_AC_23_12_users_kind_filter_defaults_to_real_and_flags_withdrawn(client, admin_headers):
    with get_sessionmaker()() as session, session.begin():
        session.execute(update(User).where(User.id == "u-halla").values(ops_tester=True))
        session.execute(update(User).where(User.id == "u-namwon").values(deleted_at=now()))
    real = _ids(client, admin_headers, "/admin/users", "userId")
    test = _ids(client, admin_headers, "/admin/users", "userId", kind="test")
    every = _ids(client, admin_headers, "/admin/users", "userId", kind="all")
    assert "u-minji" in test and "u-minji" not in real  # 시드 테스트
    assert "u-halla" in test and "u-halla" not in real  # 운영 검증
    assert "u-namwon" in real  # 탈퇴는 실사용자로 세고 표시만
    assert real | test == every and not real & test
    rows = client.get("/admin/users?kind=all", headers=admin_headers).json()["items"]
    by_id = {r["userId"]: r for r in rows}
    assert by_id["u-minji"]["accountKind"] == "SEED_TEST"
    assert by_id["u-halla"]["accountKind"] == "OPS_TESTER"
    assert by_id["u-namwon"]["accountKind"] == "REAL" and by_id["u-namwon"]["withdrawn"] is True
    assert by_id["u-hyodon"]["withdrawn"] is False
    assert client.get("/admin/users?kind=wrong", headers=admin_headers).status_code == 400


def test_AC_23_12_producers_capacity_and_support_kind_filter(client, admin_headers, login):
    path = "/admin/producers"
    assert _ids(client, admin_headers, path, "farmId", status="ALL") == {
        "f-halla",
        "f-hyodon",
        "f-namwon",
    }
    assert "f-kang" in _ids(client, admin_headers, path, "farmId", status="ALL", kind="test")
    rows = client.get("/admin/producers?status=ALL&kind=all", headers=admin_headers).json()
    by_id = {r["farmId"]: r for r in rows}
    assert (
        by_id["f-kang"]["accountKind"] == "SEED_TEST" and by_id["f-kang"]["producerId"] == "u-kang"
    )
    assert by_id["f-halla"]["accountKind"] == "REAL" and by_id["f-halla"]["withdrawn"] is False

    cap = "/admin/capacity-requests"
    assert _ids(client, admin_headers, cap, "requestId") == set()
    assert _ids(client, admin_headers, cap, "requestId", kind="test") == {"capacity-p-cheonggyeon"}
    [row] = client.get(f"{cap}?kind=all", headers=admin_headers).json()
    assert row["accountKind"] == "SEED_TEST" and row["producerId"] == "u-kang"

    sent = client.post(
        "/api/messaging/producer/chats/u-farmclub/messages",
        headers=login("u-kang") | key(),
        json={"text": "문의"},
    )
    assert sent.status_code == 200
    support = "/admin/support"
    assert "f-kang" not in _ids(client, admin_headers, support, "targetId")
    assert "f-kang" in _ids(client, admin_headers, support, "targetId", kind="test")
    rows = client.get(f"{support}?kind=all", headers=admin_headers).json()
    kang = next(r for r in rows if r["targetId"] == "f-kang")
    assert kang["accountKind"] == "SEED_TEST" and kang["withdrawn"] is False
    for listing in (path, cap, support):
        assert client.get(f"{listing}?kind=wrong", headers=admin_headers).status_code == 400
