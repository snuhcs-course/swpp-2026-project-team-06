"""DEV-35 manager exception recovery and refund history

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# 기존 전액 환불 주문의 이력 보강. 결제 행이 없으면 주문 합계로 남긴다.
# 테스트도 같은 SQL을 실행한다.
BACKFILL_REFUNDS_SQL = """
INSERT INTO refunds (
    id, order_id, amount, reason, actor, actor_user_id, manager_event_id, created_at
)
SELECT
    'refund-' || md5(o.id),
    o.id,
    COALESCE(p.amount, o.total_amount),
    COALESCE(o.refund_reason, '기존 전액 환불'),
    'SYSTEM',
    NULL,
    NULL,
    COALESCE(o.refunded_at, o.created_at)
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.status = 'REFUNDED'
"""

NORMALIZE_PAYMENTS_SQL = """
UPDATE payments p
SET status = 'REFUNDED'
FROM orders o
WHERE p.order_id = o.id AND o.status = 'REFUNDED'
"""


def upgrade() -> None:
    op.alter_column(
        "payments",
        "status",
        existing_type=sa.String(length=16),
        type_=sa.String(length=24),
        existing_nullable=False,
    )
    op.add_column("capacity_requests", sa.Column("decided_by", sa.String(64), nullable=True))
    op.create_foreign_key(
        "fk_capacity_requests_decided_by_users",
        "capacity_requests",
        "users",
        ["decided_by"],
        ["id"],
    )
    op.create_index(
        "ix_capacity_requests_decided_by", "capacity_requests", ["decided_by"]
    )

    op.create_table(
        "manager_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("event_type", sa.String(64), nullable=False),
        sa.Column("actor_id", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.String(160), nullable=False),
        sa.Column("scope", sa.String(160), nullable=True),
        sa.Column("idempotency_key", sa.String(128), nullable=True),
        sa.Column("original_body", sa.JSON(), nullable=True),
        sa.Column("request_summary", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("retryable", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("message_id", sa.String(64), nullable=True),
        sa.Column("last_retried_by", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.UniqueConstraint(
            "actor_id",
            "scope",
            "idempotency_key",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.UniqueConstraint("message_id"),
    )
    for column in ("event_type", "actor_id", "target_id", "status", "message_id", "created_at"):
        op.create_index(f"ix_manager_events_{column}", "manager_events", [column])

    op.create_table(
        "producer_decisions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("farm_id", sa.String(64), sa.ForeignKey("farms.id"), nullable=False),
        sa.Column("application_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("manager_id", sa.String(64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_producer_decisions_farm_id", "producer_decisions", ["farm_id"])
    op.create_index("ix_producer_decisions_manager_id", "producer_decisions", ["manager_id"])
    op.create_index("ix_producer_decisions_decided_at", "producer_decisions", ["decided_at"])

    op.create_table(
        "refunds",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("order_id", sa.String(64), sa.ForeignKey("orders.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("actor", sa.String(16), nullable=False),
        sa.Column("actor_user_id", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "manager_event_id",
            sa.String(64),
            sa.ForeignKey("manager_events.id"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_refunds_order_id", "refunds", ["order_id"])
    op.create_index("ix_refunds_actor_user_id", "refunds", ["actor_user_id"])
    op.create_index("ix_refunds_manager_event_id", "refunds", ["manager_event_id"])
    op.create_index("ix_refunds_created_at", "refunds", ["created_at"])

    op.execute(BACKFILL_REFUNDS_SQL)
    op.execute(NORMALIZE_PAYMENTS_SQL)


def downgrade() -> None:
    op.drop_table("refunds")
    op.drop_table("producer_decisions")
    op.drop_table("manager_events")
    op.drop_index("ix_capacity_requests_decided_by", table_name="capacity_requests")
    op.drop_constraint(
        "fk_capacity_requests_decided_by_users", "capacity_requests", type_="foreignkey"
    )
    op.drop_column("capacity_requests", "decided_by")
    op.execute(
        "UPDATE payments SET status = 'APPROVED' WHERE status = 'PARTIALLY_REFUNDED'"
    )
    op.alter_column(
        "payments",
        "status",
        existing_type=sa.String(length=24),
        type_=sa.String(length=16),
        existing_nullable=False,
    )
