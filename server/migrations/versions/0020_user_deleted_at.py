"""회원 탈퇴: users.deleted_at (DEV-94). 탈퇴한 회원은 개인정보를 지운 채 행만 남긴다."""

import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("users", "deleted_at")
