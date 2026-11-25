"""Move paid reservations into the shipping queue and support UAT account closure."""

import sqlalchemy as sa
from alembic import op

revision = "0037"
down_revision = "0036"
branch_labels = depends_on = None


AMOUNTS = (("orders", "total_amount"), ("payments", "amount"), ("refunds", "amount"))


def upgrade():
    for table, column in AMOUNTS:
        op.alter_column(table, column, existing_type=sa.Integer(), type_=sa.BigInteger())
    op.add_column("users", sa.Column("uat_closed_at", sa.DateTime(timezone=True)))
    op.execute(
        "UPDATE orders SET status = 'PREPARING' WHERE status = 'RESERVED' AND paid_at IS NOT NULL"
    )


def downgrade():
    # Preparing orders may already have been processed by the producer.
    for table, column in AMOUNTS:
        op.alter_column(table, column, existing_type=sa.BigInteger(), type_=sa.Integer())
    op.drop_column("users", "uat_closed_at")
