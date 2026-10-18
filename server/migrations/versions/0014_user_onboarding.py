"""가입 온보딩: users.nickname·email, user_consents (FEAT-01 I2, DEV-32)."""

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("nickname", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("email", sa.String(length=200), nullable=True))
    op.create_table(
        "user_consents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("version", sa.String(length=32), nullable=False),
        sa.Column("agreed", sa.Boolean(), nullable=False),
        sa.Column("agreed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "kind"),
    )
    op.create_index("ix_user_consents_user_id", "user_consents", ["user_id"])


def downgrade():
    op.drop_index("ix_user_consents_user_id", table_name="user_consents")
    op.drop_table("user_consents")
    op.drop_column("users", "email")
    op.drop_column("users", "nickname")
