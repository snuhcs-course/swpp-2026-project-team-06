"""Version prepared geometry and require fresh privacy approval (DEV-58)."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("source_assets", sa.Column("preprocess_version", sa.String(40), nullable=True))


def downgrade():
    op.drop_column("source_assets", "preprocess_version")
