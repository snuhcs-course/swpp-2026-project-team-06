"""AC-01-30: password changes release the request connection before the counter."""

from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.accounts import passwords, service, throttle
from app.accounts.models import User
from app.accounts.schemas import PasswordChangeInput

CURRENT_PASSWORD = "Gamgyul-Sweet-77"
NEW_PASSWORD = "Hallabong-Brix-14"


@pytest.fixture
def request_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        poolclass=QueuePool,
        pool_size=1,
        max_overflow=0,
        pool_timeout=0.1,
    )
    User.__table__.create(engine)
    with Session(engine) as seed:
        seed.add(
            User(
                id="password-change-user",
                role="CONSUMER",
                name="Password change user",
                username="mandarin7",
                password_hash=passwords.hash_password(CURRENT_PASSWORD),
                must_change_password=True,
                token_version=0,
                created_at=datetime.now(UTC),
            )
        )
        seed.commit()
    with Session(engine) as request:
        yield engine, request
    engine.dispose()


@pytest.mark.parametrize("initial_state", ["loaded", "expired"])
def test_AC_01_30_change_password_releases_request_connection_before_counter(
    request_session, monkeypatch, initial_state
):
    """Real ORM expiration must not reacquire a connection at the counter boundary."""
    engine, request = request_session
    user = request.get(User, "password-change-user")
    assert user is not None
    assert request.in_transaction()
    assert engine.pool.checkedout() == 1
    if initial_state == "expired":
        request.rollback()
        assert not request.in_transaction()
        assert engine.pool.checkedout() == 0

    calls = []

    def counter_hit(raw):
        calls.append(raw)
        assert not request.in_transaction(), (
            "password-change request still has an ORM transaction at throttle.hit"
        )
        assert engine.pool.checkedout() == 0, (
            "password-change request holds the only database connection at throttle.hit"
        )
        # The independent counter transaction can immediately take the sole connection.
        with engine.begin() as counter_connection:
            assert counter_connection.scalar(text("select 1")) == 1

    result_marker = object()
    monkeypatch.setattr(throttle, "hit", counter_hit)
    monkeypatch.setattr(service, "_login_result", lambda *args, **kwargs: result_marker)

    result = service.change_password(
        request,
        user,
        PasswordChangeInput(
            current_password=CURRENT_PASSWORD,
            new_password=NEW_PASSWORD,
        ),
    )

    assert calls, "password change must pass through the independent counter boundary"
    assert result is result_marker
    request.commit()
    request.close()
    with Session(engine) as observer:
        saved = observer.get(User, "password-change-user")
        assert saved is not None
        assert passwords.verify_password(saved.password_hash, NEW_PASSWORD)
        assert not passwords.verify_password(saved.password_hash, CURRENT_PASSWORD)
