"""Private candidate validation diagnostics (DEV-58)."""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "source_items", sa.Column("diagnostics", sa.JSON(), nullable=False, server_default="{}")
    )


def downgrade():
    op.drop_column("source_items", "diagnostics")
