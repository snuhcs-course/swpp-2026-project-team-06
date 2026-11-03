"""무통장 입금(DEV-68): 농가 입금 계좌, 주문 입금 기한·신고·확인·취소 사유, 환불 송금 완료."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("farms", sa.Column("bank_name", sa.String(50), nullable=True))
    op.add_column("farms", sa.Column("account_number", sa.String(32), nullable=True))
    op.add_column("farms", sa.Column("account_holder", sa.String(50), nullable=True))
    op.add_column(
        "farms", sa.Column("account_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("orders", sa.Column("deposit_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "orders", sa.Column("deposit_reported_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("orders", sa.Column("deposit_confirmed_by", sa.String(16), nullable=True))
    op.add_column("orders", sa.Column("cancel_reason", sa.Text(), nullable=True))
    op.add_column("refunds", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True))
    # 기존 결제 행은 Mock 카드였다. 이후 결제는 모두 농가 계좌 무통장 입금이다(R-01 개정).
    op.alter_column("payments", "method", server_default="BANK_TRANSFER")
    op.alter_column("payments", "provider", server_default="FARM_ACCOUNT")


def downgrade():
    # 0013까지는 server_default가 없었다(ORM 기본값만)
    op.alter_column("payments", "provider", server_default=None)
    op.alter_column("payments", "method", server_default=None)
    op.drop_column("refunds", "settled_at")
    for name in ("cancel_reason", "deposit_confirmed_by", "deposit_reported_at", "deposit_due_at"):
        op.drop_column("orders", name)
    for name in ("account_updated_at", "account_holder", "account_number", "bank_name"):
        op.drop_column("farms", name)
