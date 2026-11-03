"""Version shipped tracking corrections (DEV-179 / AC-17-9)."""

import sqlalchemy as sa
from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "orders", sa.Column("tracking_version", sa.Integer(), nullable=False, server_default="1")
    )


def downgrade():
    op.drop_column("orders", "tracking_version")
