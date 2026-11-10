"""소식별 읽음 위치와 팬 답장 연결 (DEV-297).

- room_reads: 소비자의 소식방 읽음 위치(농가·소비자당 하나)
- room_replies.broadcast_id: 답장이 답한 소식(보낸 순간 그 농가의 가장 최근 지우지 않은 소식)
- room_replies.producer_read_at: 생산자가 읽은 시각(없으면 팬 답장 시트에서 '안 읽음')
- broadcasts.quoted_reply_id: 생산자 인용 답장의 원문 답장 id(서버 전용, FK 고리를 피하려고 FK 없음)

기존 답장은 같은 규칙(그 답장을 보낸 순간 지우지 않은 가장 최근 소식)으로 소식을 채운다.
안 읽음은 '시트에서 확인하지 않은 답장'이다. 기존 답장은 시트를 처음 열 때 한꺼번에
안 읽음으로 뜨지 않게 읽음으로 채운다.
"""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "room_reads",
        sa.Column("farm_id", sa.String(length=64), sa.ForeignKey("farms.id"), primary_key=True),
        sa.Column("consumer_id", sa.String(length=64), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column(
            "last_read_broadcast_id",
            sa.String(length=64),
            sa.ForeignKey("broadcasts.id"),
            nullable=False,
        ),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column(
        "room_replies",
        sa.Column("broadcast_id", sa.String(length=64), sa.ForeignKey("broadcasts.id")),
    )
    op.create_index("ix_room_replies_broadcast_id", "room_replies", ["broadcast_id"])
    op.add_column("room_replies", sa.Column("producer_read_at", sa.DateTime(timezone=True)))
    op.add_column("broadcasts", sa.Column("quoted_reply_id", sa.String(length=64)))
    op.create_index("ix_broadcasts_quoted_reply_id", "broadcasts", ["quoted_reply_id"])
    op.execute(
        """
        UPDATE room_replies AS r
        SET producer_read_at = r.created_at,
            broadcast_id = (
                SELECT b.id FROM broadcasts AS b
                WHERE b.farm_id = r.farm_id
                  AND (b.deleted_at IS NULL OR b.deleted_at > r.created_at)
                  AND b.created_at <= r.created_at
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT 1
            )
        """
    )


def downgrade():
    op.drop_index("ix_broadcasts_quoted_reply_id", table_name="broadcasts")
    op.drop_column("broadcasts", "quoted_reply_id")
    op.drop_column("room_replies", "producer_read_at")
    op.drop_index("ix_room_replies_broadcast_id", table_name="room_replies")
    op.drop_column("room_replies", "broadcast_id")
    op.drop_table("room_reads")
