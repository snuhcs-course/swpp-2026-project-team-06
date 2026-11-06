"""Record an explicit paid-order conversation entry (DEV-245 / M-04)."""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "thread_order_contexts",
        sa.Column("thread_id", sa.String(64), nullable=False),
        sa.Column("order_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["thread_id"], ["threads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("thread_id", "order_id"),
    )
    op.create_index("ix_thread_order_contexts_order_id", "thread_order_contexts", ["order_id"])


def downgrade():
    op.drop_index("ix_thread_order_contexts_order_id", table_name="thread_order_contexts")
    op.drop_table("thread_order_contexts")
