"""공개 미디어: public_media (DEV-102)."""

import sqlalchemy as sa
from alembic import op

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "public_media",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("farm_id", sa.String(length=64), sa.ForeignKey("farms.id"), nullable=False),
        sa.Column("uploader_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("mime_type", sa.String(length=32), nullable=False),
        sa.Column("ext", sa.String(length=8), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("storage_key", sa.String(length=300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_public_media_farm_id", "public_media", ["farm_id"])


def downgrade():
    op.drop_index("ix_public_media_farm_id", table_name="public_media")
    op.drop_table("public_media")
