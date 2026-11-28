"""농가 주문 알림 outbox와 농가별 알림 설정(DEV-495, FEAT-18)."""

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("event", sa.String(length=32), nullable=False),
        sa.Column("dedupe_key", sa.String(length=200), nullable=False),
        sa.Column(
            "order_id",
            sa.String(length=64),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "farm_id",
            sa.String(length=64),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("template", sa.String(length=64), nullable=False),
        sa.Column("variables", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("skip_reason", sa.String(length=32), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("lease_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lease_token", sa.String(length=64), nullable=True),
        sa.Column("phone_last4", sa.String(length=4), nullable=True),
        sa.Column("provider_group_id", sa.String(length=100), nullable=True),
        sa.Column("provider_message_id", sa.String(length=100), nullable=True),
        sa.Column("last_error", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retried_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_notifications_order_id", "notifications", ["order_id"])
    op.create_index("ix_notifications_farm_id", "notifications", ["farm_id"])
    op.create_index(
        "ix_notifications_status_next", "notifications", ["status", "next_attempt_at"]
    )
    op.create_table(
        "notification_settings",
        sa.Column(
            "farm_id",
            sa.String(length=64),
            sa.ForeignKey("farms.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "order_alimtalk_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("notification_settings")
    op.drop_index("ix_notifications_status_next", table_name="notifications")
    op.drop_index("ix_notifications_farm_id", table_name="notifications")
    op.drop_index("ix_notifications_order_id", table_name="notifications")
    op.drop_table("notifications")
