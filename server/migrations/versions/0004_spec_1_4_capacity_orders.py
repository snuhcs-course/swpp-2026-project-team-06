"""spec 1.4 capacity and order lifecycle

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CAPACITY = {
    "p-house": 2_400_000,
    "p-redhyang": 300_000,
    "p-josaeng": 300_000,
    "p-noji": 800_000,
    "p-hyodon": 180_000,
}


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("approved_supply_grams", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "products", sa.Column("sales_limit_grams", sa.Integer(), nullable=False, server_default="0")
    )
    op.add_column(
        "products",
        sa.Column("sales_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("products", sa.Column("version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("orders", sa.Column("unit_weight_grams", sa.Integer(), nullable=True))
    op.add_column(
        "orders", sa.Column("released_quantity", sa.Integer(), nullable=False, server_default="0")
    )
    op.create_table(
        "capacity_requests",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("requested_total_grams", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_capacity_requests_product_id", "capacity_requests", ["product_id"])
    op.create_index("ix_capacity_requests_status", "capacity_requests", ["status"])
    op.create_index("ix_capacity_requests_created_at", "capacity_requests", ["created_at"])

    connection = op.get_bind()
    live_ids = {
        row[0]
        for row in connection.execute(
            sa.text("SELECT id FROM products WHERE status IN ('PUBLISHED', 'CLOSED')")
        )
    }
    unknown = sorted(live_ids - CAPACITY.keys())
    if unknown:
        raise RuntimeError(f"Explicit capacity mapping required for products: {unknown}")
    for product_id, grams in CAPACITY.items():
        connection.execute(
            sa.text(
                "UPDATE products SET approved_supply_grams=:grams, sales_limit_grams=:grams "
                "WHERE id=:product_id AND status IN ('PUBLISHED', 'CLOSED')"
            ),
            {"product_id": product_id, "grams": grams},
        )
    connection.execute(
        sa.text(
            "UPDATE orders AS o SET unit_weight_grams = ROUND(po.weight_kg * 1000)::integer "
            "FROM product_options AS po "
            "WHERE po.product_id=o.product_id AND po.id=o.option_id"
        )
    )
    missing = connection.scalar(sa.text("SELECT COUNT(*) FROM orders WHERE unit_weight_grams IS NULL"))
    if missing:
        raise RuntimeError("Every existing order must map to an option weight")
    op.alter_column("orders", "unit_weight_grams", nullable=False)
    connection.execute(
        sa.text(
            "INSERT INTO capacity_requests "
            "(id, product_id, kind, requested_total_grams, status, reason, created_at, decided_at, version) "
            "SELECT 'capacity-' || id, id, 'INITIAL', 250000, 'PENDING', NULL, updated_at, NULL, 1 "
            "FROM products WHERE status='PENDING_APPROVAL'"
        )
    )
    op.drop_column("products", "pending_reapproval")


def downgrade() -> None:
    op.add_column(
        "products",
        sa.Column("pending_reapproval", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.drop_index("ix_capacity_requests_created_at", table_name="capacity_requests")
    op.drop_index("ix_capacity_requests_status", table_name="capacity_requests")
    op.drop_index("ix_capacity_requests_product_id", table_name="capacity_requests")
    op.drop_table("capacity_requests")
    op.drop_column("orders", "released_quantity")
    op.drop_column("orders", "unit_weight_grams")
    op.drop_column("products", "version")
    op.drop_column("products", "sales_paused")
    op.drop_column("products", "sales_limit_grams")
    op.drop_column("products", "approved_supply_grams")
