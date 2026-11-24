"""아이디·비밀번호 로그인 (DEV-363, FEAT-01 AC-01-22~33, PM 결정 11/18).

공개 아이디 가입은 없다. 운영자가 관리자 웹에서 아이디 계정을 만들고(서버가 임시 비밀번호
생성), 사용자는 첫 로그인에서 비밀번호를 바꾸고 필수 약관에 동의해야 쓴다.

보안 요구: argon2id 해시만 저장, 더미 검증, 재해시, 평문 비노출(400 본문·실패 응답·DB·감사·
멱등 기록), DB 카운터 아이디별 잠금(429 Retry-After, IP별 제한 없음), 토큰 버전 무효화,
임시 비밀번호 강제 변경, 탈퇴 시 아이디·해시 삭제.
"""

import json
from datetime import timedelta

import pytest
from sqlalchemy import select, text

from app.accounts import passwords, service, throttle
from app.accounts.models import AuthThrottle, User
from app.accounts.schemas import CONSENT_VERSION
from app.admin.models import ManagerEvent
from app.catalog.models import Product
from app.core import config
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.models import IdempotencyRecord
from app.farms.models import Farm

PASSWORD = "Gamgyul-Sweet-77"
NEW_PASSWORD = "Hallabong-Brix-14"
CONSENTS = [
    {"kind": "TERMS", "version": CONSENT_VERSION},
    {"kind": "PRIVACY", "version": CONSENT_VERSION},
    {"kind": "AGE14", "version": CONSENT_VERSION},
    {"kind": "MARKETING", "version": CONSENT_VERSION, "agreed": False},
]
PRODUCER_CONSENTS = [
    {"kind": "TERMS", "version": CONSENT_VERSION},
    {"kind": "PRIVACY", "version": CONSENT_VERSION},
]
_keys = iter(range(10_000))


def _create(client, admin_headers, username="mandarin7", app="consumer", key=None, **extra):
    body = {"app": app, "username": username}
    if app == "consumer":
        body |= {"nickname": "귤친구", "phone": "010-3456-7890"}
    body |= extra
    headers = {**admin_headers, "Idempotency-Key": key or f"create-{next(_keys)}"}
    return client.post("/admin/id-accounts", json=body, headers=headers)


def _created(client, admin_headers, username="mandarin7", app="consumer", **extra) -> dict:
    response = _create(client, admin_headers, username, app, **extra)
    assert response.status_code == 200, response.text
    return response.json()


def _login(client, username="mandarin7", password=PASSWORD, app="consumer", **kw):
    return client.post(
        "/api/auth/login",
        json={"app": app, "username": username, "password": password},
        **kw,
    )


def _bearer(response) -> dict:
    return {"Authorization": f"Bearer {response.json()['accessToken']}"}


def _ready(client, admin_headers, username="mandarin7", app="consumer") -> tuple[dict, dict]:
    """운영자가 만들고 → 임시 비밀번호로 로그인 → PASSWORD로 바꾸고 → 필수 동의까지 마친 계정."""
    created = _created(client, admin_headers, username, app)
    logged = _login(client, username, created["temporaryPassword"], app)
    assert logged.status_code == 200, logged.text
    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": created["temporaryPassword"], "newPassword": PASSWORD},
        headers=_bearer(logged),
    )
    assert changed.status_code == 200, changed.text
    headers = _bearer(changed)
    consents = CONSENTS if app == "consumer" else PRODUCER_CONSENTS
    saved = client.post("/api/auth/me/consents", json={"consents": consents}, headers=headers)
    assert saved.status_code == 200, saved.text
    return created, headers


def _row(user_id: str) -> User:
    with get_sessionmaker()() as session:
        return session.get(User, user_id)


def _seed_existing_uat_producer() -> None:
    """기존 계정·농가·상품 관계를 만든다. provisioning 요청은 이 상태를 바꾸면 안 된다."""
    at = now()
    with get_sessionmaker()() as session, session.begin():
        session.add(
            User(
                id="u-uat-p3",
                kakao_id=None,
                is_test_account=True,
                role="PRODUCER",
                name="UAT 생산자 3",
                phone="010-0000-0103",
                nickname=None,
                email=None,
                created_at=at,
            )
        )
        session.flush()
        session.add(
            Farm(
                id="f-uat-3",
                producer_id="u-uat-p3",
                name="UAT 농가 3",
                region="제주 남원",
                intro="UAT",
                main_items="하우스 감귤",
                contact_phone="010-0000-0103",
                approval_status="APPROVED",
                follower_count=0,
                applied_at=at,
                decided_at=at,
            )
        )
        session.flush()
        session.add(
            Product(
                id="p-56ef428b08",
                farm_id="f-uat-3",
                name="UAT 하우스 감귤 5kg",
                status="PUBLISHED",
                updated_at=at,
            )
        )


def test_AC_01_37_DEV_439_existing_producer_gets_id_login_without_moving_farm(
    client, admin_headers
):
    _seed_existing_uat_producer()
    old = client.post("/api/auth/test-login", json={"userId": "u-uat-p3", "app": "producer"})
    assert old.status_code == 200

    provisioned = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "  UatProducer3  "},
        headers=admin_headers,
    )
    assert provisioned.status_code == 200, provisioned.text
    assert provisioned.headers["cache-control"] == "no-store"
    body = provisioned.json()
    assert body["userId"] == "u-uat-p3" and body["username"] == "uatproducer3"
    assert body["mustChangePassword"] is True
    temporary = body["temporaryPassword"]
    assert len(temporary) == 12 and passwords.password_error(temporary) is None
    assert client.get("/api/auth/me", headers=_bearer(old)).status_code == 401

    logged = _login(client, "uatproducer3", temporary, app="producer")
    assert logged.status_code == 200, logged.text
    headers = _bearer(logged)
    blocked = client.get("/api/farms/me", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "PASSWORD_CHANGE_REQUIRED"
    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": temporary, "newPassword": NEW_PASSWORD},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    headers = _bearer(changed)
    blocked = client.get("/api/farms/me", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "CONSENT_REQUIRED"
    saved = client.post(
        "/api/auth/me/consents",
        json={"consents": PRODUCER_CONSENTS},
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    farm = client.get("/api/farms/me", headers=headers)
    products = client.get("/api/products/mine", headers=headers)
    assert farm.status_code == 200 and farm.json()["farmId"] == "f-uat-3"
    assert products.status_code == 200
    assert [p["productId"] for p in products.json()["items"]] == ["p-56ef428b08"]

    with get_sessionmaker()() as session:
        user = session.get(User, "u-uat-p3")
        linked_farm = session.get(Farm, "f-uat-3")
        product = session.get(Product, "p-56ef428b08")
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.event_type == "user.id_credentials_provisioned")
        )
        stored = [
            json.dumps([e.original_body, e.request_summary, e.result], ensure_ascii=False)
            for e in session.scalars(select(ManagerEvent))
        ] + [
            json.dumps(row.response, ensure_ascii=False)
            for row in session.scalars(select(IdempotencyRecord))
        ]
        assert user.id == "u-uat-p3" and user.role == "PRODUCER" and user.is_test_account
        assert user.username == "uatproducer3" and user.password_hash.startswith("$argon2id$")
        assert temporary not in user.password_hash
        assert linked_farm.producer_id == "u-uat-p3" and linked_farm.approval_status == "APPROVED"
        assert product.farm_id == "f-uat-3" and product.status == "PUBLISHED"
        assert event.actor_id == "u-admin" and event.target_id == "u-uat-p3"
        assert event.result == {"status": "ISSUED"}
        assert event.original_body == {} and event.request_summary == {}
        assert not any(temporary in item for item in stored)


def test_AC_01_37_DEV_439_invalid_and_repeated_provisioning_does_not_mutate_or_store_secret(
    client, admin_headers
):
    _seed_existing_uat_producer()
    invalid = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "u-uat-p3"},
        headers=admin_headers,
    )
    assert invalid.status_code == 400
    assert _row("u-uat-p3").username is None

    with get_sessionmaker()() as session, session.begin():
        session.get(User, "u-uat-p3").role = "CONSUMER"
    wrong_role = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert wrong_role.status_code == 409
    assert wrong_role.json()["details"]["reason"] == "NOT_ELIGIBLE_PRODUCER"
    assert _row("u-uat-p3").username is None
    with get_sessionmaker()() as session, session.begin():
        session.get(User, "u-uat-p3").role = "PRODUCER"

    issued = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert issued.status_code == 200
    secret = issued.json()["temporaryPassword"]
    repeated = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert repeated.status_code == 409
    assert repeated.json()["details"]["reason"] == "ID_CREDENTIALS_ALREADY_PROVISIONED"
    assert _row("u-uat-p3").username == "uatproducer3"
    with get_sessionmaker()() as session:
        events = list(
            session.scalars(
                select(ManagerEvent).where(
                    ManagerEvent.event_type == "user.id_credentials_provisioned"
                )
            )
        )
        assert len(events) == 1
        payloads = [
            json.dumps([e.original_body, e.request_summary, e.result, e.error_message])
            for e in session.scalars(select(ManagerEvent))
        ] + [json.dumps(row.response) for row in session.scalars(select(IdempotencyRecord))]
        assert not any(secret in payload for payload in payloads)


def test_AC_01_37_DEV_439_rejects_non_seed_and_non_producer_accounts(client, admin_headers):
    for user_id in ("u-minji", "u-admin", "missing-user"):
        response = client.post(
            f"/admin/users/{user_id}/id-credentials",
            json={"username": "uatproducer3"},
            headers=admin_headers,
        )
        assert response.status_code in (404, 409)
        assert "temporaryPassword" not in response.json()


@pytest.mark.parametrize("change", ["real", "kakao", "deleted", "username", "hash", "no-farm"])
def test_AC_01_37_DEV_439_ineligible_producer_keeps_credentials_unchanged(
    client, admin_headers, change
):
    _seed_existing_uat_producer()
    with get_sessionmaker()() as session, session.begin():
        user = session.get(User, "u-uat-p3")
        if change == "real":
            user.is_test_account = False
        elif change == "kakao":
            user.kakao_id = "uat-kakao"
        elif change == "deleted":
            user.deleted_at = now()
        elif change == "username":
            user.username = "alreadyset"
        elif change == "hash":
            user.password_hash = passwords.hash_password(PASSWORD)
        else:
            session.delete(session.get(Product, "p-56ef428b08"))
            session.flush()
            session.delete(session.get(Farm, "f-uat-3"))
    before = _row("u-uat-p3")
    response = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert response.status_code == 409
    assert "temporaryPassword" not in response.json()
    after = _row("u-uat-p3")
    assert (after.username, after.password_hash, after.token_version) == (
        before.username,
        before.password_hash,
        before.token_version,
    )
    with get_sessionmaker()() as session:
        assert (
            session.scalar(
                select(ManagerEvent).where(
                    ManagerEvent.event_type == "user.id_credentials_provisioned"
                )
            )
            is None
        )


def test_AC_01_37_DEV_439_only_admin_can_provision(client, login):
    _seed_existing_uat_producer()
    for headers, expected in (({}, 401), (login("u-minji"), 403), (login("u-kang"), 403)):
        response = client.post(
            "/admin/users/u-uat-p3/id-credentials",
            json={"username": "uatproducer3"},
            headers=headers,
        )
        assert response.status_code == expected
    assert _row("u-uat-p3").username is None


def test_AC_01_37_DEV_439_username_collision_is_atomic(client, admin_headers):
    _created(client, admin_headers, "uatproducer3", app="producer")
    _seed_existing_uat_producer()
    response = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "UATPRODUCER3"},
        headers=admin_headers,
    )
    assert response.status_code == 400
    assert "username" in response.json()["details"]["fields"]
    user = _row("u-uat-p3")
    assert user.username is None and user.password_hash is None and user.token_version == 0


def test_AC_01_37_DEV_439_provisioning_unlocks_the_new_login(client, admin_headers):
    _seed_existing_uat_producer()
    for _ in range(throttle.LIMIT):
        throttle.hit("PRODUCER:uatproducer3")
    assert _login(client, "uatproducer3", PASSWORD, app="producer").status_code == 429
    issued = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert issued.status_code == 200
    assert (
        _login(
            client, "uatproducer3", issued.json()["temporaryPassword"], app="producer"
        ).status_code
        == 200
    )


def test_AC_01_37_DEV_439_unlock_failure_preserves_the_one_time_response(
    client, admin_headers, monkeypatch, caplog
):
    _seed_existing_uat_producer()

    def unavailable(*args):
        raise RuntimeError("counter unavailable")

    monkeypatch.setattr(service, "unlock_login", unavailable)
    issued = client.post(
        "/admin/users/u-uat-p3/id-credentials",
        json={"username": "uatproducer3"},
        headers=admin_headers,
    )
    assert issued.status_code == 200
    temporary = issued.json()["temporaryPassword"]
    assert passwords.verify_password(_row("u-uat-p3").password_hash, temporary)
    assert temporary not in caplog.text
    assert issued.headers["cache-control"] == "no-store"


def test_AC_01_37_DEV_439_concurrent_provisioning_issues_only_once(client, admin_headers):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    _seed_existing_uat_producer()
    start = Barrier(2)

    def issue(username):
        start.wait(timeout=5)
        return client.post(
            "/admin/users/u-uat-p3/id-credentials",
            json={"username": username},
            headers=admin_headers,
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(issue, ("uatproducer3", "uatproducer4")))
    assert sorted(r.status_code for r in responses) == [200, 409]
    winner = next(r.json() for r in responses if r.status_code == 200)
    user = _row("u-uat-p3")
    assert user.username == winner["username"] and user.token_version == 1
    assert passwords.verify_password(user.password_hash, winner["temporaryPassword"])
    with get_sessionmaker()() as session:
        assert (
            len(
                list(
                    session.scalars(
                        select(ManagerEvent).where(
                            ManagerEvent.event_type == "user.id_credentials_provisioned"
                        )
                    )
                )
            )
            == 1
        )
        assert session.get(Farm, "f-uat-3").producer_id == user.id


# ---------------- AC-01-22 운영자가 아이디 계정을 만든다 ----------------


def test_AC_01_22_public_signup_endpoints_do_not_exist(client):
    """PM 11/18: 공개 아이디 가입은 없다."""
    body = {"app": "consumer", "username": "mandarin7", "password": PASSWORD, "consents": CONSENTS}
    assert client.post("/api/auth/signup", json=body).status_code == 404
    check = client.post("/api/auth/username-check", json={"app": "consumer", "username": "abcd"})
    assert check.status_code == 404


def test_AC_01_22_admin_creates_consumer_account_with_temporary_password(client, admin_headers):
    response = _create(client, admin_headers, "  Mandarin7 ")

    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["username"] == "mandarin7"  # 소문자로 저장
    assert body["role"] == "CONSUMER"
    assert body["mustChangePassword"] is True
    assert body["consented"] is False
    assert body["phoneLast4"] == "7890"
    temp = body["temporaryPassword"]
    assert len(temp) == 12 and passwords.password_error(temp) is None
    row = _row(body["userId"])
    assert row.kakao_id is None and row.is_test_account is False
    assert row.nickname == "귤친구"
    assert row.password_hash.startswith("$argon2id$") and temp not in row.password_hash
    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.event_type == "id_account.create")
        )
    assert event.actor_id == "u-admin" and event.status == "SUCCEEDED"


def test_AC_01_22_admin_creates_producer_account(client, admin_headers):
    body = _created(client, admin_headers, "farmer01", app="producer", nickname="한라봉")

    assert body["role"] == "PRODUCER"
    assert body["name"] == "한라봉"
    assert body["farmStatus"] is None
    assert body["phoneLast4"] is None
    default = _created(client, admin_headers, "farmer02", app="producer")
    assert default["name"] == "농가 사용자"


@pytest.mark.parametrize(
    ("username", "ok"),
    [
        ("abc", False),
        ("a" * 21, False),
        ("1abc", False),
        ("ab_cd", False),
        ("귤사랑", False),
        ("admin", False),
        ("Farmclub", False),
        ("abcd", True),
        ("a2345678901234567890", True),
    ],
)
def test_AC_01_22_username_rules(client, admin_headers, username, ok):
    response = _create(client, admin_headers, username)

    assert (response.status_code == 200) is ok, response.text
    if not ok:
        assert "username" in response.json()["details"]["fields"]


def test_AC_01_22_consumer_needs_nickname_phone_optional(client, admin_headers):
    bad = _create(client, admin_headers, nickname="귤", phone="12345")
    assert bad.status_code == 400
    assert set(bad.json()["details"]["fields"]) == {"nickname", "phone"}
    # 휴대폰 없이 만들면 첫 로그인 온보딩(SCR-06)이 받는다
    body = _created(client, admin_headers, "nophone1", phone="")
    logged = _login(client, "nophone1", body["temporaryPassword"])
    assert logged.json()["user"]["needsOnboarding"] is True


def test_AC_01_22_username_unique_case_insensitive_per_app(client, admin_headers):
    _created(client, admin_headers, "mandarin7")

    again = _create(client, admin_headers, "MANDARIN7")
    assert again.status_code == 400
    assert again.json()["details"]["fields"]["username"] == "이미 쓰는 아이디예요"
    # 계정 분리(ADR 0010): 생산자 앱에서는 같은 아이디를 따로 만들 수 있다
    producer = _created(client, admin_headers, "mandarin7", app="producer")
    assert producer["role"] == "PRODUCER"


def test_AC_01_22_non_ascii_lookalike_username_is_not_folded(client, admin_headers):
    """켈빈 기호(U+212A)는 소문자로 바꾸면 k가 되지만 다른 아이디로 들어오지 않는다."""
    _ready(client, admin_headers, "kakaofan1")
    assert passwords.normalize_username("Kakaofan1") != "kakaofan1"
    assert _login(client, username="Kakaofan1").status_code == 401
    assert _create(client, admin_headers, "Kakaofan2").status_code == 400


def test_AC_01_22_create_requires_admin_and_idempotency_key(client, login):
    body = {"app": "consumer", "username": "mandarin7", "nickname": "귤친구"}
    headers = {**login("u-minji"), "Idempotency-Key": "x"}
    assert client.post("/admin/id-accounts", json=body, headers=headers).status_code == 403
    assert client.get("/admin/id-accounts", headers=login("u-minji")).status_code == 403


def test_AC_01_22_replayed_create_returns_no_password_and_stores_none(client, admin_headers):
    first = _create(client, admin_headers, key="same-key")
    temp = first.json()["temporaryPassword"]
    replay = _create(client, admin_headers, key="same-key")

    assert replay.status_code == 200
    assert replay.json()["userId"] == first.json()["userId"]
    assert replay.json()["temporaryPassword"] is None
    with get_sessionmaker()() as session:
        records = [json.dumps(r.response) for r in session.scalars(select(IdempotencyRecord))]
        events = [
            json.dumps([e.original_body, e.request_summary, e.result], ensure_ascii=False)
            for e in session.scalars(select(ManagerEvent))
        ]
    assert records and not any(temp in r for r in records + events)


def test_AC_01_22_audit_keeps_no_username_or_phone_even_after_withdrawal(client, admin_headers):
    """감사·멱등 기록에는 앱·요청 HMAC·사용자 ID만 남는다(개인정보 원문 없음)."""
    created, headers = _ready(client, admin_headers)
    assert client.post("/api/auth/me/withdraw", headers=headers).status_code == 204

    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.event_type == "id_account.create")
        )
        assert event.target_id == created["userId"]
        assert (
            event.original_body["app"] == "consumer" and len(event.original_body["request"]) == 32
        )
        dumps = [
            json.dumps(
                [e.target_id, e.original_body, e.request_summary, e.result], ensure_ascii=False
            )
            for e in session.scalars(select(ManagerEvent))
        ] + [
            json.dumps(r.response, ensure_ascii=False)
            for r in session.scalars(select(IdempotencyRecord))
        ]
    for line in dumps:
        for secret in ("mandarin7", "010-3456-7890", "01034567890", "7890", "귤친구"):
            assert secret not in line, (secret, line)


def test_AC_01_22_same_key_with_different_request_is_a_mismatch(client, admin_headers):
    """같은 멱등 키에 다른 아이디·닉네임·휴대폰이 오면 첫 결과를 돌려주지 않고 409."""
    assert _create(client, admin_headers, "mandarin7", key="k-1").status_code == 200
    other = _create(client, admin_headers, "tangerine9", key="k-1")
    assert other.status_code == 409
    assert other.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    phone = _create(client, admin_headers, "mandarin7", key="k-1", phone="010-9999-0000")
    assert phone.status_code == 409
    assert phone.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    nickname = _create(client, admin_headers, "mandarin7", key="k-1", nickname="새귤친구")
    assert nickname.status_code == 409
    assert nickname.json()["details"]["reason"] == "IDEMPOTENCY_MISMATCH"
    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.event_type == "id_account.create")
        )
    assert set(event.original_body) == {"app", "request"}
    assert "mandarin7" not in json.dumps(event.original_body)


def test_AC_01_22_normalized_equivalent_request_replays_without_password(client, admin_headers):
    first = _create(client, admin_headers, "  Mandarin7 ", key="normalized-create")
    assert first.status_code == 200, first.text
    replay = _create(
        client,
        admin_headers,
        "mandarin7",
        key="normalized-create",
        nickname=" 귤친구 ",
        phone=" 010-3456-7890 ",
    )
    assert replay.status_code == 200, replay.text
    assert replay.json()["userId"] == first.json()["userId"]
    assert replay.json()["temporaryPassword"] is None


def test_AC_01_22_admin_lists_id_accounts(client, admin_headers):
    _created(client, admin_headers, "mandarin7")
    _created(client, admin_headers, "farmer01", app="producer")

    rows = client.get("/admin/id-accounts", headers=admin_headers).json()
    assert {r["username"] for r in rows} == {"mandarin7", "farmer01"}
    assert all("temporaryPassword" not in r for r in rows)
    consumers = client.get("/admin/id-accounts?app=consumer", headers=admin_headers).json()
    assert [r["username"] for r in consumers] == ["mandarin7"]
    found = client.get("/admin/id-accounts?q=FARM", headers=admin_headers).json()
    assert [r["username"] for r in found] == ["farmer01"]
    users = client.get("/admin/users?q=mandarin", headers=admin_headers).json()["items"]
    assert users[0]["signup"] == "PASSWORD" and users[0]["username"] == "mandarin7"


def test_AC_01_22_password_hash_is_argon2id_and_never_plaintext(client, admin_headers):
    created, _ = _ready(client, admin_headers)

    row = _row(created["userId"])
    assert row.password_hash.startswith("$argon2id$")
    with get_sessionmaker()() as session:
        dump = session.execute(text("select row_to_json(u)::text from users u")).scalars().all()
    assert not any(PASSWORD in line or created["temporaryPassword"] in line for line in dump)


# ---------------- AC-01-23 첫 로그인: 비밀번호 변경 → 필수 동의 → 사용 ----------------


def test_AC_01_23_first_login_changes_password_then_consents(client, admin_headers):
    created = _created(client, admin_headers)
    logged = _login(client, password=created["temporaryPassword"])
    assert logged.status_code == 200
    assert logged.json()["user"]["mustChangePassword"] is True
    headers = _bearer(logged)
    blocked = client.get("/api/orders", headers=headers)
    assert blocked.json()["details"]["reason"] == "PASSWORD_CHANGE_REQUIRED"
    assert client.get("/api/auth/me/consents", headers=headers).status_code == 403

    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": created["temporaryPassword"], "newPassword": NEW_PASSWORD},
        headers=headers,
    )
    headers = _bearer(changed)
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["mustChangePassword"] is False
    assert me["consentRequired"] is True and me["needsOnboarding"] is True
    # 동의 전에는 동의·온보딩 API와 탈퇴만 열린다(앱은 SCR-06을 연다)
    for method, path in (
        ("GET", "/api/orders"),
        ("GET", "/api/farms/following"),
        ("GET", "/api/auth/me/addresses"),
    ):
        response = client.request(method, path, headers=headers)
        assert response.status_code == 403, path
        assert response.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
    assert client.get("/api/home", headers=headers).status_code == 200  # 공개는 비로그인처럼
    old = client.post(
        "/api/auth/me/consents",
        json={"consents": [{"kind": k, "version": "2020-01-01"} for k in ("TERMS", "PRIVACY")]},
        headers=headers,
    )
    assert old.status_code == 200
    assert client.get("/api/orders", headers=headers).status_code == 403  # 옛 버전은 동의가 아니다
    saved = client.post("/api/auth/me/consents", json={"consents": CONSENTS}, headers=headers)
    assert saved.status_code == 200
    assert client.get("/api/orders", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=headers).json()["needsOnboarding"] is False


def test_AC_01_23_producer_first_login_consents_then_application(client, admin_headers):
    created = _created(client, admin_headers, "farmer01", app="producer")
    logged = _login(client, "farmer01", created["temporaryPassword"], app="producer")
    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": created["temporaryPassword"], "newPassword": NEW_PASSWORD},
        headers=_bearer(logged),
    )
    headers = _bearer(changed)
    me = client.get("/api/auth/me", headers=headers).json()
    assert me["consentRequired"] is True and me["farmStatus"] == "NONE"
    application = {
        "ownerName": "한라봉",
        "farmName": "한라 감귤밭",
        "region": "제주 서귀포",
        "mainItems": "감귤",
        "phone": "010-1111-2222",
    }
    blocked = client.post("/api/auth/producer-application", json=application, headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "CONSENT_REQUIRED"
    client.post("/api/auth/me/consents", json={"consents": PRODUCER_CONSENTS}, headers=headers)
    applied = client.post("/api/auth/producer-application", json=application, headers=headers)
    assert applied.status_code == 200, applied.text
    assert applied.json()["status"] == "PENDING"
    # 소비자 앱에서는 이 계정으로 로그인되지 않는다(ADR 0010)
    assert _login(client, "farmer01", NEW_PASSWORD, app="consumer").status_code == 401


def test_AC_01_23_kakao_and_test_accounts_are_not_gated(client, login):
    headers = login("u-minji")
    assert client.get("/api/orders", headers=headers).status_code == 200
    assert client.get("/api/auth/me", headers=login("u-kang")).status_code == 200


def test_AC_01_17_DEV_363_policy_bump_asks_existing_members_to_reconsent(client, monkeypatch):
    """PM 11/18: 처리방침에 아이디 계정 항목을 더해 버전을 올렸다(2026-10-29 → CONSENT_VERSION).
    예전 버전에 동의한 기존 회원은 다음 이용 때 다시 동의해야 쓴다(DEV-113 재동의 흐름)."""
    from tests.test_accounts import PROFILE, _kakao_consumer, _kakao_on

    assert CONSENT_VERSION == "2026-11-20"
    _kakao_on(monkeypatch)
    _, headers = _kakao_consumer(client)
    previous = [{**c, "version": "2026-10-29"} for c in CONSENTS]
    client.post("/api/auth/me/consents", json={"consents": previous}, headers=headers)
    me = client.patch("/api/auth/me", json=PROFILE, headers=headers).json()
    assert me["consentRequired"] is True and me["needsOnboarding"] is True
    blocked = client.put("/api/farms/f-kang/follow", headers=headers)
    assert blocked.json()["details"]["reason"] == "ONBOARDING_REQUIRED"
    client.post("/api/auth/me/consents", json={"consents": CONSENTS}, headers=headers)
    assert client.get("/api/auth/me", headers=headers).json()["consentRequired"] is False
    assert client.put("/api/farms/f-kang/follow", headers=headers).status_code == 200


# ---------------- AC-01-26 로그인 한 문구·더미 검증·재해시 ----------------


def test_AC_01_26_wrong_username_and_wrong_password_look_the_same(client, admin_headers):
    _ready(client, admin_headers)

    wrong_password = _login(client, password="not-the-password")
    no_user = _login(client, username="nobody99")
    other_app = _login(client, app="producer")  # 다른 앱 계정은 없는 것과 같다
    for response in (wrong_password, no_user, other_app):
        assert response.status_code == 401
        assert response.json() == {
            "code": "UNAUTHENTICATED",
            "message": "아이디 또는 비밀번호가 맞지 않아요",
            "details": {"reason": "INVALID_CREDENTIALS"},
        }
    ok = _login(client)
    assert ok.status_code == 200
    assert ok.headers["cache-control"] == "no-store"
    assert client.get("/api/orders", headers=_bearer(ok)).status_code == 200


def test_AC_01_26_unknown_username_still_runs_a_hash_verify(client, monkeypatch):
    calls = []
    real = passwords.dummy_verify
    monkeypatch.setattr(passwords, "dummy_verify", lambda pw: (calls.append(1), real(pw)))

    _login(client, username="nobody99")
    _login(client, username="!!bad name!!")
    assert len(calls) == 2


def test_AC_01_26_rehash_does_not_restore_a_password_changed_meanwhile(
    client, admin_headers, monkeypatch
):
    """로그인 검증 뒤 재해시하는 사이에 비밀번호가 바뀌면 덮어쓰지 않고, 그 로그인도 받지 않는다."""
    from argon2 import PasswordHasher

    created, _ = _ready(client, admin_headers)
    weak = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash(PASSWORD)
    with get_sessionmaker()() as session, session.begin():
        session.get(User, created["userId"]).password_hash = weak

    real_hash = passwords.hash_password

    def change_meanwhile(value):
        # 재해시를 만드는 순간 다른 요청이 비밀번호를 바꿨다고 친다
        with get_sessionmaker()() as session, session.begin():
            session.get(User, created["userId"]).password_hash = real_hash(NEW_PASSWORD)
        return real_hash(value)

    monkeypatch.setattr(passwords, "hash_password", change_meanwhile)
    assert _login(client).status_code == 401
    monkeypatch.setattr(passwords, "hash_password", real_hash)
    stored = _row(created["userId"]).password_hash
    assert passwords.verify_password(stored, NEW_PASSWORD)  # 바뀐 비밀번호가 남는다
    assert not passwords.verify_password(stored, PASSWORD)


def test_AC_01_26_temporary_password_issued_during_rehash_survives(
    client, admin_headers, monkeypatch
):
    from argon2 import PasswordHasher

    created, old_headers = _ready(client, admin_headers)
    weak = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash(PASSWORD)
    with get_sessionmaker()() as session, session.begin():
        session.get(User, created["userId"]).password_hash = weak

    real_hash = passwords.hash_password
    issued = {}

    def issue_during_rehash(value):
        replacement_hash = real_hash(value)
        if not issued:
            issued["started"] = True
            response = client.post(
                f"/admin/users/{created['userId']}/temporary-password", headers=admin_headers
            )
            assert response.status_code == 200, response.text
            issued["password"] = response.json()["temporaryPassword"]
        return replacement_hash

    monkeypatch.setattr(passwords, "hash_password", issue_during_rehash)
    stale_login = _login(client)
    monkeypatch.setattr(passwords, "hash_password", real_hash)

    assert stale_login.status_code == 401, stale_login.text
    assert "accessToken" not in stale_login.json()
    assert client.get("/api/auth/me", headers=old_headers).status_code == 401
    stored = _row(created["userId"]).password_hash
    assert passwords.verify_password(stored, issued["password"])
    assert not passwords.verify_password(stored, PASSWORD)
    replacement_login = _login(client, password=issued["password"])
    assert replacement_login.status_code == 200, replacement_login.text
    assert replacement_login.json()["user"]["mustChangePassword"] is True


def test_AC_01_26_login_releases_the_db_connection_before_hashing(
    client, admin_headers, monkeypatch
):
    """argon2를 도는 동안 요청 세션이 DB 트랜잭션(연결)을 쥐고 있지 않다."""
    from argon2 import PasswordHasher
    from sqlalchemy import delete

    from app.core import db as core_db
    from app.main import app as fastapi_app

    created, _ = _ready(client, admin_headers)
    weak = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash(PASSWORD)
    with get_sessionmaker()() as session, session.begin():
        session.get(User, created["userId"]).password_hash = weak
    passwords.dummy_verify(PASSWORD)
    seen = []
    real_verify = passwords.verify_password
    real_dummy = passwords.dummy_verify
    real_hash = passwords.hash_password
    sessions = []
    real_get_db = core_db.get_db

    def tracking_get_db():
        for session in real_get_db():
            sessions.append(session)
            yield session

    def check(fn, operation):
        def wrapper(*args):
            assert sessions
            released = all(not s.in_transaction() for s in sessions)
            seen.append((operation, released))
            assert released
            if operation in {"verify", "dummy"}:
                # 별도 트랜잭션에서도 검증 전에 커밋된 시도 기록을 읽을 수 있어야 한다
                with get_sessionmaker()() as observer:
                    attempts = list(observer.scalars(select(AuthThrottle)))
                assert len(attempts) == 1
            return fn(*args)

        return wrapper

    def clear_attempts():
        with get_sessionmaker()() as session, session.begin():
            session.execute(delete(AuthThrottle))

    fastapi_app.dependency_overrides[core_db.get_db] = tracking_get_db
    monkeypatch.setattr(passwords, "verify_password", check(real_verify, "verify"))
    monkeypatch.setattr(passwords, "dummy_verify", check(real_dummy, "dummy"))
    monkeypatch.setattr(passwords, "hash_password", check(real_hash, "rehash"))
    try:
        clear_attempts()
        assert _login(client).status_code == 200
        clear_attempts()
        assert _login(client, username="nobody99").status_code == 401
    finally:
        fastapi_app.dependency_overrides.pop(core_db.get_db, None)
    assert seen == [("verify", True), ("rehash", True), ("dummy", True)]


def test_AC_01_26_kakao_account_has_no_password_login(client):
    # 카카오 계정(아이디 없음)과 아이디 계정은 합치지 않는다. 카카오 계정은 아이디 로그인이 없다
    assert _login(client, username="u-minji").status_code == 401


def test_AC_01_26_startup_prepares_dummy_hash_before_first_unknown_login():
    import subprocess
    import sys
    import textwrap

    script = textwrap.dedent("""\
        from argon2 import PasswordHasher

        hash_calls = []
        real_hash = PasswordHasher.hash

        def tracked_hash(self, *args, **kwargs):
            hash_calls.append(1)
            return real_hash(self, *args, **kwargs)

        PasswordHasher.hash = tracked_hash

        from fastapi.testclient import TestClient
        from app.main import app

        with TestClient(app) as client:
            prepared = len(hash_calls)
            assert prepared > 0, "No hash prepared before serving requests"
            response = client.post(
                "/api/auth/login",
                json={
                    "app": "consumer",
                    "username": "coldstartmissing99",
                    "password": "Gamgyul-Sweet-77",
                },
            )
            assert response.status_code == 401, response.text
            assert len(hash_calls) == prepared, "First unknown login generated another hash"
    """)
    result = subprocess.run(
        [sys.executable, "-c", script], capture_output=True, text=True, timeout=30
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_AC_01_26_outdated_hash_parameters_are_rehashed_on_login(client, admin_headers):
    from argon2 import PasswordHasher

    created, _ = _ready(client, admin_headers)
    weak = PasswordHasher(time_cost=1, memory_cost=8192, parallelism=1).hash(PASSWORD)
    with get_sessionmaker()() as session, session.begin():
        session.get(User, created["userId"]).password_hash = weak

    assert _login(client).status_code == 200
    stored = _row(created["userId"]).password_hash
    assert stored != weak and stored.startswith("$argon2id$")
    assert passwords.needs_rehash(stored) is False
    assert _login(client).status_code == 200


def test_AC_01_26_argon2_parameters_are_owasp_and_bounded(client, admin_headers):
    """argon2id m=19MiB·t=2·p=1(OWASP), 더미 검증도 같은 매개변수, 동시 해시는 4개까지."""
    from argon2 import extract_parameters

    created, _ = _ready(client, admin_headers)
    params = extract_parameters(_row(created["userId"]).password_hash)
    assert (params.memory_cost, params.time_cost, params.parallelism) == (19456, 2, 1)
    assert params.type.name == "ID"
    dummy = extract_parameters(passwords._dummy_hash())
    assert (dummy.memory_cost, dummy.time_cost, dummy.parallelism) == (19456, 2, 1)
    assert passwords.HASH_CONCURRENCY == 4
    assert passwords._slots._initial_value == 4


def test_AC_01_26_concurrent_hashing_is_bounded(monkeypatch):
    """동시 해시·검증이 4개를 넘지 않는다(로그인이 몰려도 메모리를 묶어 둔다)."""
    import threading
    import time

    active = 0
    peak = 0
    lock = threading.Lock()
    real = passwords._hasher().verify

    def slow_verify(h, p):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.05)
        with lock:
            active -= 1
        return real(h, p)

    class Wrapped:
        verify = staticmethod(slow_verify)

    hashed = passwords.hash_password(PASSWORD)
    monkeypatch.setattr(passwords, "_hasher", lambda: Wrapped())
    threads = [
        threading.Thread(target=passwords.verify_password, args=(hashed, PASSWORD))
        for _ in range(12)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert 1 <= peak <= 4


# ---------------- AC-01-27 아이디별 로그인 잠금(429 Retry-After, IP별 제한 없음) ----------------


def test_AC_01_27_concurrent_attempts_prune_stale_batches_without_deadlock(client, monkeypatch):
    import threading
    from concurrent.futures import ThreadPoolExecutor

    raws = sorted([f"CONSUMER:prunerace{i}" for i in range(4)], key=throttle._key)
    target_b, target_a, *_ = raws
    for raw in raws:
        throttle.hit(raw)
    stale = throttle._now() - timedelta(days=2)
    keys = [throttle._key(raw) for raw in raws]
    with get_sessionmaker()() as session, session.begin():
        for row in session.scalars(select(AuthThrottle).where(AuthThrottle.key.in_(keys))):
            row.updated_at = stale
            row.window_started_at = stale

    before_prune = threading.Barrier(2)
    after_prune = threading.Barrier(2)
    first_pruned = threading.Event()
    worker_state = threading.local()
    real_prune = throttle._prune

    def overlapping_prune(session, at):
        session.execute(text("SET LOCAL lock_timeout = '2s'"))
        before_prune.wait(timeout=5)
        if worker_state.raw == target_b:
            assert first_pruned.wait(timeout=5)
        real_prune(session, at)
        if worker_state.raw == target_a:
            first_pruned.set()
        after_prune.wait(timeout=5)

    def attempt(raw):
        worker_state.raw = raw
        throttle.hit(raw)

    with monkeypatch.context() as patch:
        patch.setattr(throttle, "PRUNE_BATCH", 1)
        patch.setattr(throttle, "_prune", overlapping_prune)
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(attempt, target_a), executor.submit(attempt, target_b)]
            for future in futures:
                future.result(timeout=15)

    with get_sessionmaker()() as session:
        targets = list(
            session.scalars(
                select(AuthThrottle).where(
                    AuthThrottle.key.in_([throttle._key(target_a), throttle._key(target_b)])
                )
            )
        )
        assert len(targets) == 2
        assert all(row.updated_at > stale for row in targets)
    for raw in (target_a, target_b):
        username = raw.partition(":")[2]
        for _ in range(9):
            assert _login(client, username=username).status_code == 401
        assert _login(client, username=username).status_code == 429


def test_AC_01_27_ten_failures_lock_the_username_for_15_minutes(client, admin_headers, monkeypatch):
    _ready(client, admin_headers)

    for _ in range(10):
        assert _login(client, password="wrong-password-1").status_code == 401
    locked = _login(client)  # 맞는 비밀번호도 잠긴 동안은 검증하지 않는다
    assert locked.status_code == 429
    assert locked.headers["retry-after"] == "900"
    assert locked.json()["code"] == "RATE_LIMITED"
    assert locked.json()["details"] == {"retryAfter": 900}
    assert "15분" in locked.json()["message"]
    assert _login(client, username="MANDARIN7").status_code == 429
    later = throttle._now() + timedelta(minutes=15, seconds=1)
    monkeypatch.setattr(throttle, "_now", lambda: later)
    assert _login(client).status_code == 200


def test_AC_01_27_success_resets_the_username_counter(client, admin_headers):
    _ready(client, admin_headers)

    for _ in range(9):
        _login(client, password="wrong-password-1")
    assert _login(client).status_code == 200
    for _ in range(9):
        assert _login(client, password="wrong-password-1").status_code == 401
    assert _login(client).status_code == 200


def test_AC_01_27_no_per_ip_limit_and_spoofed_forwarded_for_has_no_effect(client, admin_headers):
    """PM 11/18: IP별 제한 없음, 아이디별 잠금만.

    X-Forwarded-For를 바꿔도 잠금을 피하지도 걸지도 못한다.
    """
    _ready(client, admin_headers)
    # 같은 아이디는 IP(헤더)를 바꿔 가며 틀려도 10번이면 잠긴다
    for i in range(10):
        spoofed = {"X-Forwarded-For": f"203.0.113.{i}", "X-Real-IP": f"198.51.100.{i}"}
        assert _login(client, password="wrong-password-1", headers=spoofed).status_code == 401
    assert _login(client, headers={"X-Forwarded-For": "192.0.2.99"}).status_code == 429
    # 한 클라이언트가 다른 아이디들로 55번 틀려도 IP로 막히지 않는다(IP별 제한 없음)
    for i in range(55):
        assert _login(client, username=f"nobody{i:03d}").status_code == 401
    with get_sessionmaker()() as session:
        kinds = {k.split(":")[0] for k in session.scalars(select(AuthThrottle.key))}
    assert kinds == {"login-user"}


def test_AC_01_27_day_old_attempts_are_pruned_on_every_attempt(client, admin_headers):
    """처리방침 ‘최대 1일’: 새 행을 만들지 않는 시도(같은 아이디)에서도 하루 지난 기록을 지운다."""
    from datetime import datetime

    _ready(client, admin_headers)
    _login(client, username="oldattempt1")  # 지워질 기록
    _login(client, password="wrong-password-1")  # 계속 쓰는 아이디의 행
    old = datetime.now(throttle.UTC) - timedelta(days=1, minutes=1)
    with get_sessionmaker()() as session, session.begin():
        rows = list(session.scalars(select(AuthThrottle)))
        assert len(rows) == 2
        for row in rows:
            if row.key == throttle._key("CONSUMER:oldattempt1"):
                row.updated_at = old
    # 이미 있는 아이디로 다시 시도(새 행 없음)해도 오래된 행이 지워진다
    _login(client, password="wrong-password-1")
    with get_sessionmaker()() as session:
        keys = set(session.scalars(select(AuthThrottle.key)))
    assert keys == {throttle._key("CONSUMER:mandarin7")}


def test_AC_01_27_counters_store_no_raw_username(client):
    _login(client, username="secretname1")

    with get_sessionmaker()() as session:
        keys = list(session.scalars(select(AuthThrottle.key)))
    assert keys and not any("secretname1" in k for k in keys)


def test_AC_01_27_locks_use_the_real_clock_not_fixed_now():
    """FIXED_NOW(데모·테스트)여도 잠금 창은 실제 시각으로 끝난다."""
    assert abs((throttle._now() - now()).total_seconds()) > 60  # 테스트는 2026-10-07로 고정


# ---------------- AC-01-29 평문 비노출 ----------------

MARKER = "Pl41ntext-Marker-Zz"


def test_AC_01_29_validation_errors_do_not_echo_passwords(client, login):
    too_long = MARKER * 60  # 1024자 넘음 → 요청 검증 오류
    cases = [
        ("/api/auth/login", {"app": "consumer", "username": "mandarin7", "password": too_long}),
        ("/api/auth/login", {"app": "nope", "username": "mandarin7", "password": MARKER}),
        ("/api/auth/login", {"app": "consumer", "username": MARKER * 10, "password": MARKER}),
    ]
    for path, body in cases:
        response = client.post(path, json=body)
        assert response.status_code == 400, response.text
        assert MARKER not in response.text
    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": too_long, "newPassword": too_long},
        headers=login("u-minji"),
    )
    assert changed.status_code == 400 and MARKER not in changed.text
    assert changed.json()["details"]["fields"] == {
        "currentPassword": "비밀번호를 확인해 주세요",
        "newPassword": "비밀번호를 확인해 주세요",
    }


def test_AC_01_29_failed_login_and_lockout_do_not_contain_password(client, admin_headers):
    _ready(client, admin_headers)

    responses = [_login(client, password=MARKER) for _ in range(11)]
    assert responses[-1].status_code == 429
    for response in responses:
        assert MARKER not in response.text
        assert MARKER not in json.dumps(dict(response.headers))


def test_AC_01_29_redaction_helper():
    from app.core.masking import redact_secret_fields

    assert redact_secret_fields({"password": "x", "body.newPassword": "y", "username": "z"}) == {
        "password": "비밀번호를 확인해 주세요",
        "body.newPassword": "비밀번호를 확인해 주세요",
        "username": "z",
    }


# ---------------- AC-01-30 비밀번호 변경·토큰 무효화 ----------------


def test_AC_01_30_change_password_invalidates_every_token(client, admin_headers):
    _ready(client, admin_headers)
    first = _bearer(_login(client))
    second = _bearer(_login(client))

    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=first,
    )
    assert changed.status_code == 200, changed.text
    assert changed.headers["cache-control"] == "no-store"
    for old in (first, second):
        assert client.get("/api/auth/me", headers=old).status_code == 401
    assert client.get("/api/auth/me", headers=_bearer(changed)).status_code == 200
    assert _login(client).status_code == 401
    assert _login(client, password=NEW_PASSWORD).status_code == 200


def test_AC_01_30_change_password_checks_current_and_policy(client, admin_headers):
    _, headers = _ready(client, admin_headers)

    def change(current, new):
        return client.post(
            "/api/auth/me/password",
            json={"currentPassword": current, "newPassword": new},
            headers=headers,
        )

    wrong = change("not-the-password", NEW_PASSWORD)
    assert wrong.status_code == 400
    assert wrong.json()["details"]["fields"] == {"currentPassword": "지금 비밀번호가 맞지 않아요"}
    assert change(PASSWORD, "mandarin7").json()["details"]["fields"].keys() == {"newPassword"}
    assert change(PASSWORD, PASSWORD).json()["details"]["fields"].keys() == {"newPassword"}
    for weak in ("short7!", "x" * 129, "        ", "password123", "12345678", "Qwer1234"):
        response = change(PASSWORD, weak)
        assert response.status_code == 400, weak
        assert weak not in json.dumps(response.json(), ensure_ascii=False) or weak == "        "
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_AC_01_30_wrong_current_password_counts_toward_lock(client, admin_headers):
    _, headers = _ready(client, admin_headers)

    for _ in range(10):
        client.post(
            "/api/auth/me/password",
            json={"currentPassword": "not-the-password", "newPassword": NEW_PASSWORD},
            headers=headers,
        )
    locked = client.post(
        "/api/auth/me/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=headers,
    )
    assert locked.status_code == 429
    assert _login(client).status_code == 429


def test_AC_01_30_kakao_and_test_accounts_cannot_change_password(client, login):
    response = client.post(
        "/api/auth/me/password",
        json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD},
        headers=login("u-minji"),
    )
    assert response.status_code == 403
    assert response.json()["details"]["reason"] == "NOT_PASSWORD_ACCOUNT"


def test_AC_01_30_tokens_without_version_still_work(client):
    """배포 전에 받은 토큰(`ver` 없음)은 버전 0으로 본다."""
    import jwt

    from app.core.security import ALGORITHM

    settings = config.get_settings()
    issued = int(now().timestamp())
    legacy = jwt.encode(
        {"sub": "u-minji", "role": "CONSUMER", "iat": issued, "exp": issued + 3600},
        settings.jwt_secret,
        algorithm=ALGORITHM,
    )
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert me.status_code == 200


# ---------------- AC-01-31 임시 비밀번호·강제 변경·감사 ----------------


def test_AC_01_31_admin_temporary_password_forces_change(client, admin_headers):
    created, old = _ready(client, admin_headers)
    for _ in range(10):
        _login(client, password="wrong-password-1")
    assert _login(client).status_code == 429

    issued = client.post(
        f"/admin/users/{created['userId']}/temporary-password", headers=admin_headers
    )
    assert issued.status_code == 200, issued.text
    assert issued.headers["cache-control"] == "no-store"
    temp = issued.json()["temporaryPassword"]
    assert len(temp) == 12 and passwords.password_error(temp) is None
    assert client.get("/api/auth/me", headers=old).status_code == 401
    assert _login(client).status_code == 401  # 옛 비밀번호는 더 못 쓴다

    logged = _login(client, password=temp)
    assert logged.status_code == 200
    assert logged.json()["user"]["mustChangePassword"] is True
    headers = _bearer(logged)
    blocked = client.get("/api/orders", headers=headers)
    assert blocked.status_code == 403
    assert blocked.json()["details"]["reason"] == "PASSWORD_CHANGE_REQUIRED"
    assert client.post("/api/auth/me/withdraw", headers=headers).status_code == 403
    assert client.get("/api/auth/me", headers=headers).status_code == 200

    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": temp, "newPassword": NEW_PASSWORD},
        headers=headers,
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["user"]["mustChangePassword"] is False
    # 이미 동의했던 계정은 바로 쓴다
    assert client.get("/api/orders", headers=_bearer(changed)).status_code == 200


def test_AC_01_31_temporary_password_is_audited_without_the_password(client, admin_headers):
    created, _ = _ready(client, admin_headers)

    temp = client.post(
        f"/admin/users/{created['userId']}/temporary-password", headers=admin_headers
    ).json()["temporaryPassword"]

    with get_sessionmaker()() as session:
        event = session.scalar(
            select(ManagerEvent).where(ManagerEvent.event_type == "user.temporary_password")
        )
        assert event.actor_id == "u-admin" and event.target_id == created["userId"]
        assert event.result == {"status": "ISSUED"}
        stored = [
            json.dumps([e.original_body, e.request_summary, e.result], ensure_ascii=False)
            for e in session.scalars(select(ManagerEvent))
        ] + [
            json.dumps(r.response, ensure_ascii=False)
            for r in session.scalars(select(IdempotencyRecord))
        ]
        users = session.execute(text("select row_to_json(u)::text from users u")).scalars().all()
    assert not any(temp in line for line in stored + users)


def test_AC_01_31_temporary_password_only_for_password_accounts(client, admin_headers, login):
    response = client.post("/admin/users/u-minji/temporary-password", headers=admin_headers)
    assert response.json()["details"]["reason"] == "NOT_PASSWORD_ACCOUNT"
    missing = client.post("/admin/users/nobody/temporary-password", headers=admin_headers)
    assert missing.status_code == 404
    forbidden = client.post("/admin/users/u-minji/temporary-password", headers=login("u-seojun"))
    assert forbidden.status_code == 403


# ---------------- AC-01-32 탈퇴 시 아이디·해시 삭제 ----------------


def test_AC_01_32_withdraw_clears_username_and_hash(client, admin_headers):
    created, headers = _ready(client, admin_headers)

    assert client.post("/api/auth/me/withdraw", headers=headers).status_code == 204
    row = _row(created["userId"])
    assert row.username is None and row.password_hash is None and row.deleted_at is not None
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert _login(client).status_code == 401
    # 아이디는 예약하지 않는다: 다시 만들면 새 사용자
    again = _created(client, admin_headers)
    assert again["userId"] != created["userId"]
    assert (
        client.get("/admin/id-accounts", headers=admin_headers).json()[0]["userId"]
        == (again["userId"])
    )


def test_AC_01_32_account_before_consent_can_withdraw(client, admin_headers):
    created = _created(client, admin_headers)
    logged = _login(client, password=created["temporaryPassword"])
    changed = client.post(
        "/api/auth/me/password",
        json={"currentPassword": created["temporaryPassword"], "newPassword": NEW_PASSWORD},
        headers=_bearer(logged),
    )

    assert client.post("/api/auth/me/withdraw", headers=_bearer(changed)).status_code == 204
    assert _row(created["userId"]).username is None


# ---------------- 기존 흐름 ----------------


def test_AC_01_33_existing_flows_unchanged(client, login, admin_headers):
    """테스트 로그인·운영자 토큰은 그대로(토큰 버전 0)."""
    assert client.get("/api/auth/me", headers=login("u-kang")).status_code == 200
    assert client.get("/admin/id-accounts", headers=admin_headers).status_code == 200
    assert service.INVALID_LOGIN_MESSAGE == "아이디 또는 비밀번호가 맞지 않아요"
