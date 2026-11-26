"""Persist first-follow receipts, verified reviews and moderated farm reports (DEV-465)."""

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = depends_on = None


def upgrade():
    op.create_index("ix_follows_farm_id", "follows", ["farm_id"])
    op.create_table(
        "follow_receipts",
        sa.Column("consumer_id", sa.String(64), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("farm_id", sa.String(64), sa.ForeignKey("farms.id"), primary_key=True),
        sa.Column("fan_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("farm_id", "fan_number", name="uq_follow_receipts_farm_number"),
        sa.CheckConstraint("fan_number > 0", name="ck_follow_receipts_positive_number"),
    )
    # Only real current Follow records are known. Never derive ordinals from the
    # cached/seeded follower_count, or fabricate missing historical unfollows.
    op.execute("""
        INSERT INTO follow_receipts (consumer_id, farm_id, fan_number, created_at)
        SELECT consumer_id, farm_id,
               row_number() OVER (PARTITION BY farm_id ORDER BY created_at, consumer_id), created_at
        FROM follows
    """)
    op.create_table(
        "customer_reviews",
        sa.Column("order_id", sa.String(64), sa.ForeignKey("orders.id"), primary_key=True),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("stars BETWEEN 1 AND 5", name="ck_customer_reviews_stars"),
    )
    op.create_table(
        "farm_reports",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("consumer_id", sa.String(64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("farm_id", sa.String(64), sa.ForeignKey("farms.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("incident_key", sa.String(100)),
        sa.Column("reviewed_by", sa.String(64), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("consumer_id", "farm_id", name="uq_farm_reports_consumer_farm"),
        sa.CheckConstraint(
            "status IN ('PENDING','CONFIRMED','REJECTED','OVERTURNED')",
            name="ck_farm_reports_status",
        ),
        sa.CheckConstraint(
            "status != 'CONFIRMED' OR incident_key IS NOT NULL",
            name="ck_farm_reports_confirmed_incident",
        ),
    )
    op.create_index("ix_farm_reports_consumer_id", "farm_reports", ["consumer_id"])
    op.create_index("ix_farm_reports_farm_id", "farm_reports", ["farm_id"])


def downgrade():
    op.drop_index("ix_follows_farm_id", table_name="follows")
    op.drop_table("farm_reports")
    op.drop_table("customer_reviews")
    op.drop_table("follow_receipts")
