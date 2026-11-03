"""농가 미승인(DEV-68): 입금 미승인 사유(입금 대기 유지), 환불 송금 보류 사유."""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("orders", sa.Column("deposit_issue", sa.Text(), nullable=True))
    op.add_column(
        "orders", sa.Column("deposit_issue_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("orders", sa.Column("refund_issue", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("refund_issue_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    for name in ("refund_issue_at", "refund_issue", "deposit_issue_at", "deposit_issue"):
        op.drop_column("orders", name)
