"""농가 법정 안내 읽음 기록: notice_reads (DEV-121, 원산지표시법 제6조 ⑥)."""

import sqlalchemy as sa
from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notice_reads",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "kind", "version"),
    )
    op.create_index("ix_notice_reads_user_id", "notice_reads", ["user_id"])


def downgrade():
    op.drop_index("ix_notice_reads_user_id", table_name="notice_reads")
    op.drop_table("notice_reads")
