"""DEV-36 PortOne payment id on payments

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-17
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("payments", sa.Column("provider_payment_id", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_payments_provider_payment_id", "payments", ["provider_payment_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_payments_provider_payment_id", table_name="payments")
    op.drop_column("payments", "provider_payment_id")
