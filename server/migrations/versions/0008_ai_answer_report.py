"""DEV-39 AI answer wrong-answer report (FEAT-13 AC-13-5, M-17)

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 신고된 AI 답변. 답변당 신고 하나(중복 신고는 기존 질문을 돌려준다).
    op.add_column(
        "escalations", sa.Column("reported_message_id", sa.String(64), nullable=True)
    )
    op.create_foreign_key(
        "fk_escalations_reported_message_id_thread_messages",
        "escalations",
        "thread_messages",
        ["reported_message_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "escalations_reported_message_id_key", "escalations", ["reported_message_id"]
    )


def downgrade() -> None:
    op.drop_constraint("escalations_reported_message_id_key", "escalations", type_="unique")
    op.drop_constraint(
        "fk_escalations_reported_message_id_thread_messages", "escalations", type_="foreignkey"
    )
    op.drop_column("escalations", "reported_message_id")
