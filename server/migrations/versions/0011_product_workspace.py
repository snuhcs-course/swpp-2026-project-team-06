"""Private product-bound editing workspace (DEV-58)."""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "source_product_workspaces",
        sa.Column("product_id", sa.String(64), sa.ForeignKey("products.id"), primary_key=True),
        sa.Column(
            "batch_id",
            sa.String(64),
            sa.ForeignKey("source_batches.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("published_snapshot", sa.JSON(), nullable=False),
        sa.Column("base_product_version", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
    )


def downgrade():
    op.drop_table("source_product_workspaces")
