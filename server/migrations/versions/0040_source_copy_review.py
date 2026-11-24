"""Opt-in source-preserving editor and private source-bound owner decisions."""

import sqlalchemy as sa
from alembic import op

revision = "0040"
down_revision = "0039"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "source_batches",
        sa.Column("source_copy_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "source_copy_decisions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("batch_id", sa.String(64), sa.ForeignKey("source_batches.id"), nullable=False),
        sa.Column("target_id", sa.String(64), nullable=False),
        sa.Column("binding_hash", sa.String(64), nullable=False),
        sa.Column("action", sa.String(32), nullable=False),
        sa.Column("value", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("module", sa.String(64), nullable=True),
        sa.Column("actor_id", sa.String(64), nullable=False),
        sa.Column("source_binding", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("batch_id", "target_id", "binding_hash"),
    )
    op.create_index("ix_source_copy_decisions_batch_id", "source_copy_decisions", ["batch_id"])


def downgrade():
    op.drop_table("source_copy_decisions")
    op.drop_column("source_batches", "source_copy_enabled")
