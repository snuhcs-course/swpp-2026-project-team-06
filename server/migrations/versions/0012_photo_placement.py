"""Photo descriptions and placement (DEV-58)."""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "source_assets",
        sa.Column("description_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "source_runs", sa.Column("inputs", sa.JSON(), nullable=False, server_default="[]")
    )
    op.add_column(
        "source_assets", sa.Column("description", sa.String(300), nullable=False, server_default="")
    )
    op.add_column(
        "source_assets", sa.Column("placement", sa.JSON(), nullable=False, server_default="{}")
    )


def downgrade():
    op.drop_column("source_assets", "description_version")
    op.drop_column("source_runs", "inputs")
    op.drop_column("source_assets", "placement")
    op.drop_column("source_assets", "description")
