"""원산지 표시제도 안내 읽음 기록(DEV-121, 원산지표시법 제6조 ⑥·시행규칙 제4조의2 1호)."""

from datetime import datetime

from sqlalchemy import func, select

from app.accounts.models import NoticeRead
from app.accounts.schemas import ORIGIN_NOTICE_VERSION
from app.core.db import get_sessionmaker


def _me(client, headers):
    response = client.get("/api/auth/me", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_DEV_121_AC_14_6_producer_starts_unread_then_read_is_recorded_once(client, login):
    headers = login("u-kang")
    assert _me(client, headers)["originNoticeReadAt"] is None

    first = client.post(
        "/api/auth/me/notices",
        json={"kind": "ORIGIN", "version": ORIGIN_NOTICE_VERSION},
        headers=headers,
    )
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["kind"] == "ORIGIN" and body["version"] == ORIGIN_NOTICE_VERSION
    at = datetime.fromisoformat(body["readAt"])
    assert datetime.fromisoformat(_me(client, headers)["originNoticeReadAt"]) == at

    # 다시 읽어도 처음 시각을 지키고 줄이 늘지 않는다(고지 증빙)
    again = client.post(
        "/api/auth/me/notices",
        json={"kind": "ORIGIN", "version": ORIGIN_NOTICE_VERSION},
        headers=headers,
    )
    assert again.status_code == 200
    assert datetime.fromisoformat(again.json()["readAt"]) == at
    with get_sessionmaker()() as db:
        count = db.scalar(select(func.count()).where(NoticeRead.user_id == "u-kang"))
    assert count == 1


def test_DEV_121_old_version_is_rejected(client, login):
    headers = login("u-kang")
    response = client.post(
        "/api/auth/me/notices", json={"kind": "ORIGIN", "version": "2000-01-01"}, headers=headers
    )
    assert response.status_code == 400
    assert _me(client, headers)["originNoticeReadAt"] is None


def test_DEV_121_unknown_kind_is_rejected(client, login):
    response = client.post(
        "/api/auth/me/notices",
        json={"kind": "MARKETING", "version": ORIGIN_NOTICE_VERSION},
        headers=login("u-kang"),
    )
    assert response.status_code in (400, 422)


def test_DEV_121_consumer_cannot_record_and_sees_no_field_value(client, login):
    headers = login("u-minji")
    response = client.post(
        "/api/auth/me/notices",
        json={"kind": "ORIGIN", "version": ORIGIN_NOTICE_VERSION},
        headers=headers,
    )
    assert response.status_code == 403
    assert _me(client, headers)["originNoticeReadAt"] is None


def test_DEV_121_pending_producer_can_record(client, login):
    # 승인 전 농가도 입점 정책에서 안내를 열 수 있다(승인 여부와 무관하게 기록)
    headers = login("u-misook")
    response = client.post(
        "/api/auth/me/notices",
        json={"kind": "ORIGIN", "version": ORIGIN_NOTICE_VERSION},
        headers=headers,
    )
    assert response.status_code == 200, response.text


def test_DEV_121_concurrent_read_keeps_one_row(client, login, monkeypatch):
    # 다른 요청이 먼저 줄을 넣은 경우(첫 조회는 비었는데 넣을 때 unique 충돌).
    # 500이 아니라 그 줄을 돌려준다
    from app.accounts import service

    headers = login("u-kang")
    body = {"kind": "ORIGIN", "version": ORIGIN_NOTICE_VERSION}
    first = client.post("/api/auth/me/notices", json=body, headers=headers).json()
    real = service._notice_row
    calls = {"n": 0}

    def stale_first(*args):
        calls["n"] += 1
        return None if calls["n"] == 1 else real(*args)

    monkeypatch.setattr(service, "_notice_row", stale_first)
    again = client.post("/api/auth/me/notices", json=body, headers=headers)
    assert again.status_code == 200, again.text
    assert datetime.fromisoformat(again.json()["readAt"]) == datetime.fromisoformat(first["readAt"])
    with get_sessionmaker()() as db:
        count = db.scalar(select(func.count()).where(NoticeRead.user_id == "u-kang"))
    assert count == 1
