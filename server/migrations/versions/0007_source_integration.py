"""Source detail publication and persistent spend (DEV-57/58)."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("module_detail", sa.JSON(), nullable=True))
    op.add_column(
        "source_runs", sa.Column("visual_pages", sa.JSON(), nullable=False, server_default="{}")
    )
    op.alter_column("source_runs", "visual_pages", server_default=None)
    op.create_table(
        "source_public_photos",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("product_id", sa.String(64), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("storage_key", sa.String(300), nullable=False),
    )
    op.create_index("ix_source_public_photos_product_id", "source_public_photos", ["product_id"])
    op.create_table(
        "source_spend",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("reserved_micros", sa.Integer(), nullable=False),
        sa.Column("charged_micros", sa.Integer(), nullable=True),
        sa.Column("evaluation", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("source_spend")
    op.drop_table("source_public_photos")
    op.drop_column("source_runs", "visual_pages")
    op.drop_column("products", "module_detail")
