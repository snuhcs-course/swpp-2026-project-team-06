"""farmclub 문의 대화방(DEV-111, FEAT-34, M-22).

농가가 승인되면 운영팀 계정 u-farmclub과 그 농가 사이에 1:1 대화방을 하나 만들고
환영 메시지를 넣는다. 생산자는 이 방에서 운영팀에 문의하고, 운영자는 관리자 페이지
문의함에서 답한다. 기존 Thread를 그대로 쓴다. 운영자 메시지는 senderType OPERATOR이고,
이 방은 AI를 쓰지 않는다(ai_mode HUMAN).
운영자 읽음 위치는 consumer_last_read_message_id 칸을 쓴다.
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.errors import invalid, not_found
from app.core.ids import new_id
from app.messaging.models import Thread, ThreadMessage
from app.messaging.schemas import ChatMessage

SUPPORT_USER_ID = "u-farmclub"
SUPPORT_NAME = "farmclub"
WELCOME = (
    "안녕하세요, farmclub 운영팀이에요. 농가 가입을 환영해요!\n"
    "앱을 쓰다가 모르는 게 생기면 언제든 이 대화방에 편하게 남겨 주세요. "
    "운영팀이 확인하고 답해 드릴게요.\n"
    "화면 오른쪽 위 ? 버튼을 누르면 사용 안내도 처음부터 다시 볼 수 있어요."
)


def is_support(thread: Thread) -> bool:
    return thread.consumer_id == SUPPORT_USER_ID


def support_thread_id(farm_id: str) -> str:
    return f"thread-support-{farm_id}"


def ensure_support_user(db: Session) -> None:
    """운영팀 계정. ADMIN이라 소비자 목록·관리자 사용자 목록에 나오지 않고 로그인 수단도 없다."""
    from app.accounts.models import User

    if db.get(User, SUPPORT_USER_ID) is None:
        db.add(User(id=SUPPORT_USER_ID, name=SUPPORT_NAME, role="ADMIN", created_at=now()))
        db.flush()


def ensure_support_thread(db: Session, farm_id: str) -> Thread:
    """농가 승인 때 부른다. 방이 이미 있으면 그대로 두고, 처음 만들 때만 환영 메시지를 넣는다."""
    from app.messaging.service import get_thread

    ensure_support_user(db)
    thread = get_thread(db, farm_id, SUPPORT_USER_ID)
    if thread is not None:
        return thread
    created = now()
    thread = Thread(
        id=support_thread_id(farm_id),
        farm_id=farm_id,
        consumer_id=SUPPORT_USER_ID,
        ai_mode="HUMAN",
        version=1,
        created_at=created,
    )
    db.add(thread)
    db.flush()
    db.add(_operator_message(thread.id, WELCOME, created))
    db.flush()
    return thread


def _operator_message(thread_id: str, text: str, at: datetime) -> ThreadMessage:
    return ThreadMessage(
        id=new_id("m"),
        thread_id=thread_id,
        sender_type="OPERATOR",
        body=text,
        photos=[],
        attachment_ids=[],
        source_refs=[],
        masked=False,
        needs_human=False,
        created_at=at,
    )


def _support_thread(db: Session, farm_id: str, lock: bool = False) -> Thread:
    from app.messaging.service import get_thread

    thread = get_thread(db, farm_id, SUPPORT_USER_ID, lock=lock)
    if thread is None:
        raise not_found("이 농가의 farmclub 대화방이 없어요.")
    return thread


def _last(db: Session, thread_id: str) -> ThreadMessage | None:
    return db.scalar(
        select(ThreadMessage)
        .where(ThreadMessage.thread_id == thread_id)
        .order_by(ThreadMessage.seq.desc())
        .limit(1)
    )


def operator_unread(db: Session, thread: Thread) -> int:
    """운영자가 아직 읽지 않은 생산자 메시지 수."""
    from app.messaging.service import _seq_of

    last = _seq_of(db, thread.consumer_last_read_message_id)
    return (
        db.scalar(
            select(func.count()).where(
                ThreadMessage.thread_id == thread.id,
                ThreadMessage.seq > last,
                ThreadMessage.sender_type == "PRODUCER",
            )
        )
        or 0
    )


def inbox(db: Session) -> list[dict]:
    """문의함 목록. 답변 대기(마지막 메시지가 생산자)를 먼저, 그다음 최근 순."""
    from app.accounts.models import User
    from app.farms.models import Farm

    rows = db.execute(
        select(Thread, Farm, User)
        .join(Farm, Farm.id == Thread.farm_id)
        .join(User, User.id == Farm.producer_id)
        .where(Thread.consumer_id == SUPPORT_USER_ID)
    ).all()
    items = []
    for thread, farm, producer in rows:
        last = _last(db, thread.id)
        items.append(
            {
                "farm_id": farm.id,
                "farm_name": farm.name,
                "region": farm.region,
                "producer_name": producer.name,
                "last_message": (last.body or "(사진)") if last else "",
                "last_sender_type": last.sender_type if last else "OPERATOR",
                "last_at": last.created_at if last else thread.created_at,
                "unread_count": operator_unread(db, thread),
                "waiting": bool(last and last.sender_type == "PRODUCER"),
            }
        )
    items.sort(key=lambda r: r["last_at"], reverse=True)
    items.sort(key=lambda r: not r["waiting"])
    return items


def thread_page(db: Session, farm_id: str) -> dict:
    """운영자가 보는 방 전체(문의는 짧아서 한 번에 내려 준다)."""
    from app.accounts.models import User
    from app.farms.models import Farm
    from app.messaging.service import _message_views, _messages

    thread = _support_thread(db, farm_id)
    farm = db.get(Farm, farm_id)
    producer = db.get(User, farm.producer_id) if farm else None
    return {
        "farm_id": farm_id,
        "farm_name": farm.name if farm else "",
        "producer_name": producer.name if producer else "",
        "items": _message_views(db, _messages(db, thread.id)),
        "unread_count": operator_unread(db, thread),
    }


def operator_send(db: Session, farm_id: str, text: str) -> ChatMessage:
    """운영자 답장. 읽음 위치는 바꾸지 않는다.

    대화를 연 뒤 온 문의가 안 읽음으로 남도록 읽음은 /read만 옮긴다.
    """
    text = text.strip()
    if not text or len(text) > 1000:
        raise invalid({"text": "답장은 1~1,000자로 적어 주세요"})
    thread = _support_thread(db, farm_id, lock=True)
    message = _operator_message(thread.id, text, now())
    db.add(message)
    db.flush()
    from app.messaging.service import _message_view

    return _message_view(message)


def operator_read(db: Session, farm_id: str, message_id: str) -> int:
    from app.messaging.service import mark_read

    thread = _support_thread(db, farm_id, lock=True)
    mark_read(db, thread, message_id, producer=False)
    return operator_unread(db, thread)
