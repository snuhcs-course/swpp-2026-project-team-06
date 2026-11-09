"""How a consumer's AI answer check request was closed and by whom (DEV-296)."""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = depends_on = None


def upgrade():
    # CONFIRMED: producer said the AI answer was right · CORRECTED: producer replied quoting it
    op.add_column("escalations", sa.Column("resolution", sa.String(16), nullable=True))
    op.add_column(
        "escalations",
        sa.Column(
            "resolved_by",
            sa.String(64),
            sa.ForeignKey("users.id", name="fk_escalations_resolved_by_users"),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_constraint("fk_escalations_resolved_by_users", "escalations", type_="foreignkey")
    op.drop_column("escalations", "resolved_by")
    op.drop_column("escalations", "resolution")
