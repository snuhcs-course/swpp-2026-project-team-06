"""ID/password login for operator-created accounts and login throttles (DEV-363)."""

import sqlalchemy as sa
from alembic import op

revision = "0036"
down_revision = "0035"
branch_labels = depends_on = None


def upgrade():
    # Only the argon2id hash is stored. Existing rows (Kakao, test, admin) stay without a username.
    op.add_column("users", sa.Column("username", sa.String(20), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column(
        "users",
        sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Tokens issued before this revision carry no `ver` and are read as 0, so nobody is logged out.
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
    )
    op.create_unique_constraint("uq_users_username_role", "users", ["username", "role"])
    op.create_table(
        "auth_throttles",
        sa.Column("key", sa.String(160), primary_key=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("window_started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_throttles_updated_at", "auth_throttles", ["updated_at"])


def downgrade():
    # Password accounts lose their way to log in (rows stay; Kakao/test accounts are unaffected).
    op.drop_index("ix_auth_throttles_updated_at", table_name="auth_throttles")
    op.drop_table("auth_throttles")
    op.drop_constraint("uq_users_username_role", "users", type_="unique")
    for column in (
        "token_version",
        "must_change_password",
        "password_hash",
        "username",
    ):
        op.drop_column("users", column)
