"""AC-33-2: additive schema rollout on a disposable PostgreSQL database."""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import psycopg
from psycopg import sql
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core import seed
from app.core.clock import now
from app.messaging.models import OrderInquiry, Thread, ThreadMessage, ThreadOrderContext


def test_AC_33_2_context_migration_preserves_existing_data():
    base = make_url(os.environ["DATABASE_URL"])
    assert base.host in {"localhost", "127.0.0.1"}, "Disposable local database only"
    name = f"{base.database}_migration_{uuid.uuid4().hex[:8]}"
    url = base.set(database=name)
    admin = base.set(drivername="postgresql", database="postgres")
    with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
    engine = create_engine(url)
    env = os.environ | {"DATABASE_URL": url.render_as_string(hide_password=False)}
    server = Path(__file__).resolve().parents[1]

    def migrate(target):
        subprocess.run(
            [sys.executable, "-m", "alembic", target[0], target[1]],
            cwd=server,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

    def counts():
        with engine.connect() as conn:
            return {
                table: conn.execute(text(f'SELECT count(*) FROM "{table}"')).scalar_one()
                for table in inspect(engine).get_table_names()
                if table not in {"alembic_version", "thread_order_contexts"}
            }

    try:
        migrate(("upgrade", "head"))
        assert "thread_order_contexts" in inspect(engine).get_table_names()
        # Seed with the current ORM before rolling back to the legacy schema.
        with Session(engine) as db, db.begin():
            seed.seed(db)
            protected = db.scalar(
                select(Thread).where(Thread.farm_id == "f-kang", Thread.consumer_id == "u-seojun")
            )
            protected.ai_mode = "HUMAN"
            protected.human_reply_until = None
            question = db.scalar(
                select(ThreadMessage)
                .where(
                    ThreadMessage.thread_id == protected.id, ThreadMessage.sender_type == "CONSUMER"
                )
                .order_by(ThreadMessage.created_at, ThreadMessage.seq)
            )
            assert question is not None
            question.order_id = "o-38"
            question.inquiry_id = "migration-open-order-inquiry"
            db.add(
                OrderInquiry(
                    id="migration-open-order-inquiry",
                    order_id="o-38",
                    thread_id=protected.id,
                    message_id=question.id,
                    type="DAMAGE",
                    text="주문 문제는 농가의 직접 응대를 유지해야 합니다",
                    attachment_ids=[],
                    status="OPEN",
                    version=1,
                    created_at=now(),
                )
            )
            protected_id = protected.id
        migrate(("downgrade", "0025"))
        before = counts()
        migrate(("upgrade", "head"))
        after = counts()
        with Session(engine) as db:
            protected = db.get(Thread, protected_id)
            assert protected.ai_mode == "HUMAN"
            assert protected.human_reply_until is None
            assert db.get(OrderInquiry, "migration-open-order-inquiry").status == "OPEN"
        # 뒤 마이그레이션이 만든 새 테이블(0027 notice_reads, DEV-121)은 비어 있다
        assert {table: after[table] for table in before} == before
        assert all(after[table] == 0 for table in after.keys() - before.keys())
        foreign_keys = inspect(engine).get_foreign_keys("thread_order_contexts")
        assert len(foreign_keys) == 2
        assert all(fk["options"]["ondelete"] == "CASCADE" for fk in foreign_keys)
        with Session(engine) as db, db.begin():
            thread = db.scalar(
                select(Thread).where(Thread.farm_id == "f-kang", Thread.consumer_id == "u-seojun")
            )
            db.add(ThreadOrderContext(thread_id=thread.id, order_id="o-38", created_at=now()))
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "check"],
            cwd=server,
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr
        migrate(("downgrade", "0025"))
        assert counts() == before
        migrate(("upgrade", "head"))
        after = counts()
        # 뒤 마이그레이션이 만든 새 테이블(0027 notice_reads, DEV-121)은 비어 있다
        assert {table: after[table] for table in before} == before
        assert all(after[table] == 0 for table in after.keys() - before.keys())
        with engine.connect() as conn:
            assert (
                conn.execute(text("SELECT count(*) FROM thread_order_contexts")).scalar_one() == 0
            )
    finally:
        engine.dispose()
        with psycopg.connect(admin.render_as_string(hide_password=False), autocommit=True) as conn:
            conn.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))
