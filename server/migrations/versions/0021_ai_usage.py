"""AI 호출 비용 기록: ai_usage (DEV-144).

기능별(spec-check, 상품 초안, 상세 초안, AI 답변, 자료 분석).
"""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("feature", sa.String(32), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("ref", sa.String(40), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("link", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ai_usage_feature", "ai_usage", ["feature"])
    op.create_index("ix_ai_usage_created_at", "ai_usage", ["created_at"])


def downgrade():
    op.drop_index("ix_ai_usage_created_at", table_name="ai_usage")
    op.drop_index("ix_ai_usage_feature", table_name="ai_usage")
    op.drop_table("ai_usage")
