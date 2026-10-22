"""farmclub 문의 대화방: 운영팀 계정과 기존 승인 농가의 대화방·환영 메시지 (DEV-111)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-22

표 구조는 바꾸지 않는다(senderType OPERATOR는 문자열 값). 새로 승인되는 농가는
accounts.decide_producer_application이 같은 방을 만든다(app/messaging/support.py).
"""

import sqlalchemy as sa
from alembic import op

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None

# app/messaging/support.py의 SUPPORT_USER_ID·WELCOME·support_thread_id와 같은 값.
# 마이그레이션은 앱 코드를 불러오지 않으므로 문구를 여기에 둔다. 테스트도 같은 SQL을 실행한다.
WELCOME = (
    "안녕하세요, farmclub 운영팀이에요. 농가 가입을 환영해요!\n"
    "앱을 쓰다가 모르는 게 생기면 언제든 이 대화방에 편하게 남겨 주세요. "
    "운영팀이 확인하고 답해 드릴게요.\n"
    "화면 오른쪽 위 ? 버튼을 누르면 사용 안내도 처음부터 다시 볼 수 있어요."
)
SUPPORT_USER_SQL = """
INSERT INTO users (id, kakao_id, is_test_account, ops_tester, role, name, phone, created_at)
VALUES ('u-farmclub', NULL, false, false, 'ADMIN', 'farmclub', '', now())
ON CONFLICT (id) DO NOTHING
"""

SUPPORT_THREADS_SQL = """
INSERT INTO threads (id, farm_id, consumer_id, ai_mode, version, created_at)
SELECT 'thread-support-' || f.id, f.id, 'u-farmclub', 'HUMAN', 1, now()
FROM farms f
WHERE f.approval_status = 'APPROVED'
ON CONFLICT DO NOTHING
"""

WELCOME_SQL = """
INSERT INTO thread_messages (
    id, thread_id, sender_type, body, photos, attachment_ids, source_refs,
    masked, needs_human, created_at
)
SELECT
    'm-welcome-' || md5(t.id),
    t.id,
    'OPERATOR',
    :welcome,
    '[]', '[]', '[]',
    false, false, now()
FROM threads t
WHERE t.consumer_id = 'u-farmclub'
  AND NOT EXISTS (SELECT 1 FROM thread_messages m WHERE m.thread_id = t.id)
"""


def upgrade():
    op.execute(SUPPORT_USER_SQL)
    op.execute(SUPPORT_THREADS_SQL)
    op.get_bind().execute(sa.text(WELCOME_SQL), {"welcome": WELCOME})


def downgrade():
    op.execute(
        "DELETE FROM thread_messages WHERE thread_id IN "
        "(SELECT id FROM threads WHERE consumer_id = 'u-farmclub')"
    )
    op.execute("DELETE FROM threads WHERE consumer_id = 'u-farmclub'")
    op.execute("DELETE FROM users WHERE id = 'u-farmclub'")
