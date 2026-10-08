"""spec 1.5 storefront detail content

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("farms", sa.Column("detail_content", sa.JSON(), nullable=True))
    op.add_column("products", sa.Column("detail_content", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "detail_content")
    op.drop_column("farms", "detail_content")
