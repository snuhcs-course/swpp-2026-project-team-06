"""Composer batches reference existing product page photos and record their page (DEV-346)."""

import sqlalchemy as sa
from alembic import op

revision = "0033"
down_revision = "0032"
branch_labels = depends_on = None


def upgrade():
    # {"uri": ..., "alt": ...}: the product's own photo, used as-is on apply (no copy)
    op.add_column("source_assets", sa.Column("product_photo", sa.JSON(), nullable=True))
    # fingerprint of the product story the composer draft last matched
    op.add_column(
        "source_product_workspaces", sa.Column("page_source", sa.String(64), nullable=True)
    )
    op.add_column(
        "source_product_workspaces", sa.Column("page_draft_id", sa.String(64), nullable=True)
    )


def downgrade():
    # Referenced page photos have no stored bytes; mark them cleaned up so older code's
    # cleanup never calls Storage.delete("") on them.
    op.execute(
        "UPDATE source_assets SET deleted = true, status = 'DELETED', target_ids = '[]' "
        "WHERE product_photo IS NOT NULL"
    )
    op.drop_column("source_product_workspaces", "page_draft_id")
    op.drop_column("source_product_workspaces", "page_source")
    op.drop_column("source_assets", "product_photo")
