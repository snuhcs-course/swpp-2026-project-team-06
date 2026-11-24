"""Persist optional Farmclub sticker IDs without changing existing messages."""

import sqlalchemy as sa
from alembic import op

revision = "0038"
down_revision = "0037"
branch_labels = depends_on = None


def upgrade():
    for table in ("thread_messages", "broadcasts", "room_replies"):
        op.add_column(table, sa.Column("emoticon_id", sa.String(64), nullable=True))


def downgrade():
    for table in ("room_replies", "broadcasts", "thread_messages"):
        op.drop_column(table, "emoticon_id")
