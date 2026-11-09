"""Anonymous follower broadcast quote snapshots (DEV-289)."""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = depends_on = None


def upgrade():
    op.add_column("broadcasts", sa.Column("reply_to", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("broadcasts", "reply_to")
