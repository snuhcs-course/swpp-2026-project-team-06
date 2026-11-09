"""Quoted replies and timed human response (DEV-289)."""

import sqlalchemy as sa
from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels = depends_on = None


def upgrade():
    op.add_column("threads", sa.Column("human_reply_until", sa.DateTime(timezone=True)))
    op.add_column(
        "thread_messages",
        sa.Column("reply_to_message_id", sa.String(64), sa.ForeignKey("thread_messages.id")),
    )
    op.add_column("thread_messages", sa.Column("reply_to", sa.JSON()))
    op.execute("""UPDATE threads t SET human_reply_until =
      (SELECT max(m.created_at) + interval '10 minutes' FROM thread_messages m
       WHERE m.thread_id=t.id AND m.sender_type='PRODUCER'),
      ai_mode=CASE WHEN EXISTS (SELECT 1 FROM thread_messages m
        WHERE m.thread_id=t.id AND m.sender_type='PRODUCER') THEN 'HUMAN' ELSE 'AUTO' END
      WHERE t.ai_mode='HUMAN' AND t.consumer_id <> 'u-farmclub'
      AND NOT EXISTS (SELECT 1 FROM order_inquiries i
        WHERE i.thread_id=t.id AND i.status='OPEN')""")


def downgrade():
    op.execute(
        "UPDATE threads SET ai_mode = CASE WHEN human_reply_until > CURRENT_TIMESTAMP "
        "THEN 'HUMAN' ELSE 'AUTO' END WHERE human_reply_until IS NOT NULL"
    )
    op.drop_column("thread_messages", "reply_to")
    op.drop_column("thread_messages", "reply_to_message_id")
    op.drop_column("threads", "human_reply_until")
