"""Add independent admin product visibility without changing approval or orders."""

import sqlalchemy as sa
from alembic import op

revision = "0039"
down_revision = "0038"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "products", sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false())
    )


def downgrade():
    op.drop_column("products", "is_hidden")
