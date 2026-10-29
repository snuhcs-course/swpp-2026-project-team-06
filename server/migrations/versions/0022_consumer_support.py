"""소비자 farmclub 문의 대화방: support_threads·support_messages와 기존 소비자 백필 (DEV-150)

새로 가입하는 소비자는 accounts.kakao_signup이 같은 방을 만든다(app/messaging/support.py).
"""

import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None

# app/messaging/support.py의 CONSUMER_WELCOME·consumer_thread_id와 같은 값.
# 마이그레이션은 앱 코드를 불러오지 않으므로 문구를 여기에 둔다. 테스트도 같은 SQL을 실행한다.
CONSUMER_WELCOME = (
    "안녕하세요, farmclub 운영팀이에요. 가입을 환영해요!\n"
    "주문·입금·배송이나 앱을 쓰다가 궁금한 점이 생기면 언제든 이 대화방에 편하게 남겨 주세요. "
    "운영팀이 확인하고 답해 드릴게요.\n"
    "상품이나 농가에 대한 질문은 그 농가와의 1:1 채팅에서 물어보면 더 빨리 답을 받을 수 있어요."
)

THREADS_SQL = """
INSERT INTO support_threads (id, user_id, created_at)
SELECT 'support-' || u.id, u.id, now()
FROM users u
WHERE u.role = 'CONSUMER' AND u.deleted_at IS NULL
ON CONFLICT DO NOTHING
"""

WELCOME_SQL = """
INSERT INTO support_messages (id, thread_id, sender_type, body, masked, created_at)
SELECT 'm-cwelcome-' || md5(t.id), t.id, 'OPERATOR', :welcome, false, now()
FROM support_threads t
WHERE NOT EXISTS (SELECT 1 FROM support_messages m WHERE m.thread_id = t.id)
"""


def upgrade():
    op.create_table(
        "support_threads",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("user_last_read_message_id", sa.String(64), nullable=True),
        sa.Column("operator_last_read_message_id", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "support_messages",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("seq", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column(
            "thread_id", sa.String(64), sa.ForeignKey("support_threads.id"), nullable=False
        ),
        sa.Column("sender_type", sa.String(16), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("masked", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("seq"),
    )
    op.create_index("ix_support_messages_thread_id", "support_messages", ["thread_id"])
    op.create_index("ix_support_messages_created_at", "support_messages", ["created_at"])
    op.execute(THREADS_SQL)
    op.get_bind().execute(sa.text(WELCOME_SQL), {"welcome": CONSUMER_WELCOME})


def downgrade():
    op.drop_index("ix_support_messages_created_at", table_name="support_messages")
    op.drop_index("ix_support_messages_thread_id", table_name="support_messages")
    op.drop_table("support_messages")
    op.drop_table("support_threads")
