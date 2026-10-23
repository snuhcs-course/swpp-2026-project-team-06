"""spec-check 실행 비용 기록: spec_check_runs (DEV-144)."""

import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "spec_check_runs",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("pr_number", sa.Integer(), nullable=False),
        sa.Column("pr_title", sa.String(300), nullable=False),
        sa.Column("head_sha", sa.String(40), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("mode", sa.String(32), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Numeric(12, 6), nullable=True),
        sa.Column("run_url", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_spec_check_runs_pr_number", "spec_check_runs", ["pr_number"])
    op.create_index("ix_spec_check_runs_created_at", "spec_check_runs", ["created_at"])


def downgrade():
    op.drop_index("ix_spec_check_runs_created_at", table_name="spec_check_runs")
    op.drop_index("ix_spec_check_runs_pr_number", table_name="spec_check_runs")
    op.drop_table("spec_check_runs")
