"""Private per-target refinement results (DEV-186 · AC-SRC-2/3/11)."""

import sqlalchemy as sa
from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "source_items", sa.Column("refinement", sa.JSON(), nullable=False, server_default="{}")
    )


def downgrade():
    op.drop_column("source_items", "refinement")
