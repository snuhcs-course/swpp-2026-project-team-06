"""Private product draft of a buyer-visible product and its admin-only change history (DEV-361)."""

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = depends_on = None


def upgrade():
    # {"values": {...}, "base": {...}, "savedAt": ...}: applied to the product only by apply-all
    op.add_column(
        "source_product_workspaces", sa.Column("product_draft", sa.JSON(), nullable=True)
    )
    op.create_table(
        "product_change_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("product_id", sa.String(64), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("actor_user_id", sa.String(64), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("product_status", sa.String(20), nullable=False),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("page_changed", sa.Boolean(), nullable=False),
        sa.Column("delivery_window_proposed", sa.Boolean(), nullable=False),
        sa.Column("reserved_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_product_change_events_product_created",
        "product_change_events",
        ["product_id", "created_at"],
    )


def downgrade():
    # Unapplied drafts are dropped (buyers never saw them); the history goes with its table.
    op.drop_index("ix_product_change_events_product_created", table_name="product_change_events")
    op.drop_table("product_change_events")
    op.drop_column("source_product_workspaces", "product_draft")
