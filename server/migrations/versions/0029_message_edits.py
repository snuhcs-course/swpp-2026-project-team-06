"""Own message text editing (DEV-289)."""

import sqlalchemy as sa
from alembic import op

revision = "0029"
down_revision = "0028"
branch_labels = depends_on = None


def upgrade():
    for table in ["broadcasts", "room_replies", "thread_messages"]:
        op.add_column(table, sa.Column("edited_at", sa.DateTime(timezone=True)))
        op.add_column(
            table, sa.Column("edit_version", sa.Integer(), nullable=False, server_default="0")
        )


def downgrade():
    for table in ["broadcasts", "room_replies", "thread_messages"]:
        op.drop_column(table, "edit_version")
        op.drop_column(table, "edited_at")
