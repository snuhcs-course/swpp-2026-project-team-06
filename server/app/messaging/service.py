"""messaging 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다.

소식(방송)·좋아요, 소식방 답장, 1:1 대화, AI 응답·전달 (FEAT-12·13·15, contracts-1.2 4장).
"""

import re
from datetime import datetime, timedelta

from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.orm import Session

from app.core import images, masking
from app.core.clock import now
from app.core.errors import ApiError, conflict, forbidden, invalid, not_found
from app.core.ids import new_id
from app.core.pagination import decode_cursor, encode_cursor
from app.core.schemas import Paged
from app.messaging.models import (
    Broadcast,
    Escalation,
    OrderInquiry,
    PrivateAttachment,
    Reaction,
    RoomReply,
    Thread,
    ThreadMessage,
)
from app.messaging.schemas import (
    AttachmentView,
    ChatMessage,
    ChatPage,
    ChatSummary,
    EscalationView,
    InquiryCreated,
    InquiryInput,
    InquiryView,
    LinkedOrder,
    NewsInput,
    NewsItem,
    NewsPosted,
    NewsRoomMessage,
    NewsRoomPage,
    NewsRoomSummary,
    ProducerChatSummary,
    ProducerSendInput,
    ProducerSendResult,
    ReactionState,
    SendInput,
    SendResult,
    StartChatResult,
    ThreadView,
    UnreadState,
)

_VIDEO = re.compile(r"^data:video|\.(mp4|webm|mov)$", re.IGNORECASE)
FORWARDED_TEXT = "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요."
ATTACHMENT_TTL = timedelta(hours=24)


def mask(text: str) -> tuple[str, bool]:
    """전화번호·계좌번호를 가린다(M-16)."""
    return masking.mask(text)


def masked_name(name: str | None) -> str:
    return f"{(name or '고')[:1]}○○"


# ---------------- 농가 공개 소식·팔로우 소식 (FEAT-15) ----------------


def _news_items(db: Session, rows: list[Broadcast], user_id: str | None) -> list[NewsItem]:
    from app.farms import service as farms

    found = farms.get_farms(db, list({b.farm_id for b in rows}))
    mine: set[str] = set()
    if user_id and rows:
        mine = set(
            db.scalars(
                select(Reaction.broadcast_id).where(
                    Reaction.user_id == user_id,
                    Reaction.broadcast_id.in_([b.id for b in rows]),
                )
            )
        )
    return [
        NewsItem(
            broadcast_id=b.id,
            farm_id=b.farm_id,
            farm_name=found[b.farm_id].name,
            farm_photo=found[b.farm_id].photo,
            created_at=b.created_at,
            body=b.body,
            photos=[*b.photos, *b.videos],
            visibility=b.visibility,
            reaction_count=b.reaction_count,
            my_reaction=b.id in mine,
        )
        for b in rows
    ]


def _older_than(column_at, column_id, cursor: list | None):
    if not cursor:
        return None
    at, rid = datetime.fromisoformat(cursor[0]), cursor[1]
    return or_(column_at < at, and_(column_at == at, column_id < rid))


def _news_page(db: Session, query, user_id: str | None, cursor: str | None, limit: int):
    condition = _older_than(Broadcast.created_at, Broadcast.id, decode_cursor(cursor))
    if condition is not None:
        query = query.where(condition)
    query = query.order_by(Broadcast.created_at.desc(), Broadcast.id.desc()).limit(limit + 1)
    rows = list(db.scalars(query))
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor([rows[-1].created_at.isoformat(), rows[-1].id])
    return Paged[NewsItem](items=_news_items(db, rows, user_id), next_cursor=next_cursor)


def farm_public_news(
    db: Session, farm, user_id: str | None, cursor: str | None, limit: int
) -> Paged[NewsItem]:
    """농가의 공개 소식(M-14, AC-15-1). 최신순, cursor = (createdAt, id)."""
    query = select(Broadcast).where(Broadcast.farm_id == farm.id, Broadcast.visibility == "PUBLIC")
    return _news_page(db, query, user_id, cursor, limit)


def latest_public_news(db: Session, farm, user_id: str | None) -> NewsItem | None:
    page = farm_public_news(db, farm, user_id, None, 1)
    return page.items[0] if page.items else None


def followed_news(db: Session, consumer_id: str, cursor: str | None, limit: int) -> Paged[NewsItem]:
    """팔로우한 승인 농가의 소식(공개·팔로워 전용)."""
    from app.farms import service as farms

    farm_ids = [
        f.id
        for f in farms.get_farms(db, farms.followed_farm_ids(db, consumer_id)).values()
        if f.approval_status == "APPROVED"
    ]
    query = select(Broadcast).where(Broadcast.farm_id.in_(farm_ids))
    return _news_page(db, query, consumer_id, cursor, limit)


def _visible_broadcast(db: Session, consumer_id: str, broadcast_id: str) -> Broadcast:
    """볼 수 있는 소식만: 공개, 또는 팔로우한 농가의 팔로워 전용(AC-15-5)."""
    from app.farms import service as farms

    b = db.scalar(select(Broadcast).where(Broadcast.id == broadcast_id).with_for_update())
    if b is None or farms.get_approved_farm(db, b.farm_id) is None:
        raise not_found("볼 수 없는 소식이에요.")
    if b.visibility != "PUBLIC" and not farms.is_following(db, consumer_id, b.farm_id):
        raise not_found("볼 수 없는 소식이에요.")
    return b


def set_reaction(db: Session, consumer_id: str, broadcast_id: str, on: bool) -> ReactionState:
    b = _visible_broadcast(db, consumer_id, broadcast_id)
    existing = db.get(Reaction, (b.id, consumer_id))
    if on and existing is None:
        db.add(Reaction(broadcast_id=b.id, user_id=consumer_id, created_at=now()))
        b.reaction_count += 1
    elif not on and existing is not None:
        db.delete(existing)
        b.reaction_count = max(0, b.reaction_count - 1)
    db.flush()
    return ReactionState(reaction_count=b.reaction_count, my_reaction=on)


def post_news(db: Session, farm, body: NewsInput) -> NewsPosted:
    """소식 올리기(FEAT-12). 사진 5장·영상 1개까지, 연락처는 가려 저장한다(M-16)."""
    if not body.body.strip() and not body.photos and not body.videos:
        raise invalid({"body": "글이나 사진 중 하나는 넣어 주세요"})
    if len(body.body) > 2000:
        raise invalid({"body": "2,000자까지 입력해 주세요"})
    if len(body.photos) > 5 or len(body.videos) > 1:
        raise ApiError(413, "PAYLOAD_TOO_LARGE", "사진은 5장, 영상은 1개까지 올릴 수 있어요.")
    from app.farms import service as farms

    text, _ = mask(body.body.strip())
    b = Broadcast(
        id=new_id("n"),
        farm_id=farm.id,
        body=text,
        photos=body.photos,
        videos=body.videos,
        visibility=body.visibility,
        reaction_count=0,
        created_at=now(),
    )
    db.add(b)
    db.flush()
    return NewsPosted(
        broadcast_id=b.id,
        created_at=b.created_at,
        recipient_count=len(farms.follower_ids(db, farm.id)),
    )


# ---------------- 소식방: 방송 + 본인 비공개 답장 (M-19) ----------------


def _room_access(db: Session, user, farm_id: str):
    """소비자는 팔로우한 승인 농가, 생산자는 승인된 자기 농가만(contracts-1.2 1장)."""
    from app.farms import service as farms

    if user.role == "PRODUCER":
        own = farms.get_farm_of_producer(db, user.id)
        if own is None or own.approval_status != "APPROVED":
            raise forbidden("승인된 농가만 소식방을 열 수 있어요.")
        if own.id != farm_id:
            raise not_found("내 농가의 소식방만 볼 수 있어요.")
        return own
    if user.role != "CONSUMER":
        raise forbidden()
    farm = farms.get_approved_farm(db, farm_id)
    if farm is None:
        raise not_found("지금은 이 농가의 소식방을 열 수 없어요.")
    if not farms.is_following(db, user.id, farm_id):
        raise forbidden("팔로우한 농가의 소식방만 열 수 있어요.")
    return farm


def _room_rows(db: Session, user, farm, cursor: list | None, limit: int):
    """권한 필터를 먼저 걸고 (createdAt, id) 최신순으로 limit+1개를 합친다."""
    broadcasts = select(Broadcast).where(Broadcast.farm_id == farm.id)
    replies = select(RoomReply).where(RoomReply.farm_id == farm.id)
    if user.role == "CONSUMER":
        replies = replies.where(RoomReply.consumer_id == user.id)
    b_cond = _older_than(Broadcast.created_at, Broadcast.id, cursor)
    r_cond = _older_than(RoomReply.created_at, RoomReply.id, cursor)
    if b_cond is not None:
        broadcasts, replies = broadcasts.where(b_cond), replies.where(r_cond)
    rows = [
        *db.scalars(
            broadcasts.order_by(Broadcast.created_at.desc(), Broadcast.id.desc()).limit(limit + 1)
        ),
        *db.scalars(
            replies.order_by(RoomReply.created_at.desc(), RoomReply.id.desc()).limit(limit + 1)
        ),
    ]
    rows.sort(key=lambda r: (r.created_at, r.id), reverse=True)
    return rows[: limit + 1]


def _room_messages(db: Session, user, farm, rows: list) -> list[NewsRoomMessage]:
    from app.accounts import service as accounts

    names = accounts.get_users(db, [r.consumer_id for r in rows if isinstance(r, RoomReply)])
    mine: set[str] = set()
    broadcast_ids = [r.id for r in rows if isinstance(r, Broadcast)]
    if broadcast_ids:
        mine = set(
            db.scalars(
                select(Reaction.broadcast_id).where(
                    Reaction.user_id == user.id, Reaction.broadcast_id.in_(broadcast_ids)
                )
            )
        )
    result = []
    for r in rows:
        if isinstance(r, Broadcast):
            result.append(
                NewsRoomMessage(
                    message_id=r.id,
                    farm_id=farm.id,
                    sender_id=farm.producer_id,
                    sender_name=farm.name,
                    sender_role="PRODUCER",
                    body=r.body,
                    photos=[p for p in r.photos if not _VIDEO.search(p)],
                    videos=[*r.videos, *(p for p in r.photos if _VIDEO.search(p))],
                    created_at=r.created_at,
                    broadcast_id=r.id,
                    reaction_count=r.reaction_count,
                    my_reaction=r.id in mine,
                )
            )
        else:
            name = names[r.consumer_id].name if r.consumer_id in names else None
            result.append(
                NewsRoomMessage(
                    message_id=r.id,
                    farm_id=farm.id,
                    sender_id=r.consumer_id,
                    sender_name=masked_name(name) if user.role == "PRODUCER" else (name or ""),
                    sender_role="CONSUMER",
                    body=r.body,
                    photos=[],
                    videos=[],
                    created_at=r.created_at,
                    broadcast_id=None,
                    reaction_count=0,
                    my_reaction=False,
                )
            )
    return result


def _room_summary(db: Session, user, farm) -> NewsRoomSummary:
    last = _room_rows(db, user, farm, None, 0)
    last = last[0] if last else None
    preview = None
    if last is not None:
        preview = last.body or "사진·영상 소식"
    return NewsRoomSummary(
        farm_id=farm.id,
        farm_name=farm.name,
        farm_photo=farm.photo,
        last_message=preview,
        last_at=last.created_at if last else None,
    )


def rooms(db: Session, user, cursor: str | None, limit: int) -> Paged[NewsRoomSummary]:
    from app.farms import service as farms

    if user.role == "PRODUCER":
        farm = _room_access(db, user, getattr(farms.get_farm_of_producer(db, user.id), "id", ""))
        found = [farm]
    else:
        found = [
            f
            for f in farms.get_farms(db, farms.followed_farm_ids(db, user.id)).values()
            if f.approval_status == "APPROVED"
        ]
    summaries = [_room_summary(db, user, f) for f in found]
    summaries.sort(key=lambda s: (s.last_at is not None, s.last_at or now()), reverse=True)
    return _offset_page(summaries, cursor, limit)


def _scoped_cursor(scope: str, cursor: str | None) -> list | None:
    """cursor는 사용자·자원에 묶인다. 다른 대화의 cursor로 남의 메시지를 읽을 수 없다."""
    values = decode_cursor(cursor)
    if values is None:
        return None
    if len(values) != 3 or values[0] != scope:
        raise invalid({"cursor": "이 대화의 cursor가 아니에요"})
    return values[1:]


def room_page(db: Session, user, farm_id: str, cursor: str | None, limit: int) -> NewsRoomPage:
    farm = _room_access(db, user, farm_id)
    scope = f"{user.id}|room:{farm.id}"
    rows = _room_rows(db, user, farm, _scoped_cursor(scope, cursor), limit)
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor([scope, rows[-1].created_at.isoformat(), rows[-1].id])
    items = _room_messages(db, user, farm, list(reversed(rows)))
    return NewsRoomPage(room=_room_summary(db, user, farm), items=items, next_cursor=next_cursor)


def send_room(db: Session, user, farm_id: str, text: str) -> NewsRoomMessage:
    """생산자는 팔로워 전용 방송, 소비자는 본인과 농가만 보는 텍스트 답장. AI는 답하지 않는다."""
    farm = _room_access(db, user, farm_id)
    limit = 2000 if user.role == "PRODUCER" else 1000
    text = text.strip()
    if not text or len(text) > limit:
        raise invalid({"text": f"1~{limit:,}자로 적어 주세요."})
    body, _ = mask(text)
    if user.role == "PRODUCER":
        row = Broadcast(
            id=new_id("n"),
            farm_id=farm.id,
            body=body,
            photos=[],
            videos=[],
            visibility="FOLLOWERS",
            reaction_count=0,
            created_at=now(),
        )
    else:
        row = RoomReply(
            id=new_id("reply"), farm_id=farm.id, consumer_id=user.id, body=body, created_at=now()
        )
    db.add(row)
    db.flush()
    return _room_messages(db, user, farm, [row])[0]


# ---------------- 1:1 대화 (contracts-1.2 4장) ----------------


def _thread_view(t: Thread) -> ThreadView:
    return ThreadView(
        thread_id=t.id,
        farm_id=t.farm_id,
        consumer_id=t.consumer_id,
        ai_mode=t.ai_mode,
        version=t.version,
        consumer_last_read_message_id=t.consumer_last_read_message_id,
        producer_last_read_message_id=t.producer_last_read_message_id,
    )


def _message_view(m: ThreadMessage) -> ChatMessage:
    return ChatMessage(
        message_id=m.id,
        sender_type=m.sender_type,
        body=m.body,
        photos=m.photos,
        created_at=m.created_at,
        attachment_ids=m.attachment_ids,
        order_id=m.order_id,
        inquiry_id=m.inquiry_id,
        source_refs=m.source_refs,
        settings_version=m.settings_version,
        needs_human=m.needs_human,
        source_summary=m.source_summary,
        handoff_status=m.handoff_status,
        masked=m.masked,
    )


def _set_mode(t: Thread, mode: str) -> None:
    """실제로 바뀔 때만 version을 올린다."""
    if t.ai_mode != mode:
        t.ai_mode = mode
        t.version += 1


def _has_inquiries(db: Session, thread_id: str) -> bool:
    """결제 주문 문의가 있는 대화는 팔로우를 해제해도 이어진다(M-04)."""
    return (
        db.scalar(select(OrderInquiry.id).where(OrderInquiry.thread_id == thread_id).limit(1))
        is not None
    )


def get_thread(db: Session, farm_id: str, consumer_id: str, lock: bool = False) -> Thread | None:
    query = select(Thread).where(Thread.farm_id == farm_id, Thread.consumer_id == consumer_id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    return db.scalar(query)


def ensure_thread(db: Session, farm_id: str, consumer_id: str) -> Thread:
    thread = get_thread(db, farm_id, consumer_id)
    if thread is None:
        thread = Thread(
            id=new_id("thread"),
            farm_id=farm_id,
            consumer_id=consumer_id,
            ai_mode="AUTO",
            version=1,
            created_at=now(),
        )
        db.add(thread)
        db.flush()
    return thread


def _consumer_thread(db: Session, consumer_id: str, farm_id: str, lock: bool = False) -> Thread:
    """소비자는 팔로우한 승인 농가의 대화만. 결제 주문 문의가 있으면 팔로우 예외(1.2 2/2)."""
    from app.farms import service as farms

    if farms.get_approved_farm(db, farm_id) is None:
        raise not_found("찾을 수 없는 농가예요.")
    thread = get_thread(db, farm_id, consumer_id, lock=lock)
    if thread is None:
        raise not_found("대화를 먼저 시작해 주세요.")
    if not farms.is_following(db, consumer_id, farm_id) and not _has_inquiries(db, thread.id):
        raise forbidden("팔로우한 농가와만 채팅할 수 있어요.")
    return thread


def _producer_thread(db: Session, farm, consumer_id: str, lock: bool = False) -> Thread:
    thread = get_thread(db, farm.id, consumer_id, lock=lock)
    if thread is None:
        raise not_found("찾을 수 없는 대화예요.")
    return thread


def _messages(db: Session, thread_id: str) -> list[ThreadMessage]:
    return list(
        db.scalars(
            select(ThreadMessage)
            .where(ThreadMessage.thread_id == thread_id)
            .order_by(ThreadMessage.seq)
        )
    )


def _seq_of(db: Session, message_id: str | None) -> int:
    if not message_id:
        return 0
    return db.scalar(select(ThreadMessage.seq).where(ThreadMessage.id == message_id)) or 0


def _unread(db: Session, t: Thread, producer: bool) -> int:
    last = _seq_of(
        db, t.producer_last_read_message_id if producer else t.consumer_last_read_message_id
    )
    query = select(func.count()).where(ThreadMessage.thread_id == t.id, ThreadMessage.seq > last)
    if producer:
        query = query.where(ThreadMessage.sender_type == "CONSUMER")
    else:
        query = query.where(ThreadMessage.sender_type != "CONSUMER")
    return db.scalar(query) or 0


def _needs_reply(db: Session, t: Thread) -> bool:
    """OPEN 전달 질문, 또는 마지막 농가 답 뒤에 직접 응대 대상 소비자 메시지가 있으면 true."""
    open_escalation = db.scalar(
        select(Escalation.id)
        .where(Escalation.thread_id == t.id, Escalation.status == "OPEN")
        .limit(1)
    )
    open_inquiry = db.scalar(
        select(OrderInquiry.id)
        .where(OrderInquiry.thread_id == t.id, OrderInquiry.status == "OPEN")
        .limit(1)
    )
    if open_escalation or open_inquiry:
        return True
    last_producer = (
        db.scalar(
            select(func.max(ThreadMessage.seq)).where(
                ThreadMessage.thread_id == t.id, ThreadMessage.sender_type == "PRODUCER"
            )
        )
        or 0
    )
    waiting = db.scalar(
        select(ThreadMessage.id)
        .where(
            ThreadMessage.thread_id == t.id,
            ThreadMessage.sender_type == "CONSUMER",
            ThreadMessage.needs_human.is_(True),
            ThreadMessage.seq > last_producer,
        )
        .limit(1)
    )
    return waiting is not None


def _linked_orders(db: Session, t: Thread, messages: list[ThreadMessage]) -> list[LinkedOrder]:
    from app.orders import service as orders

    ids = sorted(
        {m.order_id for m in messages if m.order_id}
        | {i.order_id for i in _thread_inquiries(db, t.id)}
    )
    return [
        LinkedOrder(**o) for o in orders.linked_order_summaries(db, t.consumer_id, t.farm_id, ids)
    ]


def _escalation_view(db: Session, e: Escalation, t: Thread, with_thread: bool) -> EscalationView:
    from app.accounts import service as accounts

    user = accounts.get_user(db, t.consumer_id)
    return EscalationView(
        escalation_id=e.id,
        consumer_id=t.consumer_id,
        consumer_name=masked_name(user.name if user else None),
        context=e.context,
        question=e.question,
        reason=e.reason,
        created_at=e.created_at,
        status=e.status,
        answer=e.answer,
        thread=[_message_view(m) for m in _messages(db, t.id)] if with_thread else [],
    )


def _chat_page(
    db: Session, user, t: Thread, cursor: str | None, limit: int, producer: bool
) -> ChatPage:
    scope = f"{user.id}|thread:{t.id}"
    after = _scoped_cursor(scope, cursor)
    query = select(ThreadMessage).where(ThreadMessage.thread_id == t.id)
    if after:
        query = query.where(ThreadMessage.seq < int(after[0]))
    rows = list(db.scalars(query.order_by(ThreadMessage.seq.desc()).limit(limit + 1)))
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor([scope, rows[-1].seq, rows[-1].id])
    rows.reverse()
    escalations = None
    if producer:
        found = db.scalars(
            select(Escalation).where(Escalation.thread_id == t.id).order_by(Escalation.created_at)
        )
        escalations = [_escalation_view(db, e, t, False) for e in found]
    return ChatPage(
        items=[_message_view(m) for m in rows],
        next_cursor=next_cursor,
        thread=_thread_view(t),
        inquiries=[inquiry_view(db, i) for i in _thread_inquiries(db, t.id)],
        orders=_linked_orders(db, t, _messages(db, t.id)),
        escalations=escalations,
    )


def _offset_page(items: list, cursor: str | None, limit: int) -> Paged:
    values = decode_cursor(cursor)
    start = int(values[0]) if values else 0
    page = items[start : start + limit]
    more = start + limit < len(items)
    return Paged(items=page, next_cursor=encode_cursor([start + limit]) if more else None)


def consumer_chats(db: Session, consumer, cursor: str | None, limit: int) -> Paged[ChatSummary]:
    from app.farms import service as farms

    threads = list(db.scalars(select(Thread).where(Thread.consumer_id == consumer.id)))
    found = farms.get_farms(db, [t.farm_id for t in threads])
    followed = set(farms.followed_farm_ids(db, consumer.id))
    summaries = []
    for t in threads:
        farm = found.get(t.farm_id)
        if farm is None or farm.approval_status != "APPROVED":
            continue
        if t.farm_id not in followed and not _has_inquiries(db, t.id):
            continue
        last = db.scalar(
            select(ThreadMessage)
            .where(ThreadMessage.thread_id == t.id)
            .order_by(ThreadMessage.seq.desc())
            .limit(1)
        )
        summaries.append(
            ChatSummary(
                farm_id=farm.id,
                farm_name=farm.name,
                farm_photo=farm.photo,
                last_message=last.body if last else "대화를 시작해 보세요",
                last_sender_type=last.sender_type if last else "PRODUCER",
                last_at=last.created_at if last else None,
                unread_count=_unread(db, t, producer=False),
            )
        )
    summaries.sort(key=lambda s: (s.last_at is not None, s.last_at or now()), reverse=True)
    return _offset_page(summaries, cursor, limit)


def start_chat(db: Session, consumer, farm_id: str) -> StartChatResult:
    """채팅하기(AC-12-4). 팔로우하지 않았으면 팔로우하고 대화를 연다."""
    from app.farms import service as farms

    if farms.get_approved_farm(db, farm_id) is None:
        raise not_found("찾을 수 없는 농가예요.")
    auto_followed = not farms.is_following(db, consumer.id, farm_id)
    if auto_followed:
        farms.set_follow(db, consumer.id, farm_id, True)
    ensure_thread(db, farm_id, consumer.id)
    return StartChatResult(farm_id=farm_id, auto_followed=auto_followed)


def consumer_page(db: Session, consumer, farm_id: str, cursor: str | None, limit: int) -> ChatPage:
    thread = _consumer_thread(db, consumer.id, farm_id)
    return _chat_page(db, consumer, thread, cursor, limit, producer=False)


def bind_attachments(
    db: Session, uploader_id: str, ids: list[str], thread: Thread | None, order_id: str | None
) -> list[PrivateAttachment]:
    """업로더 본인의, 묶이지 않은, 같은 주문·대화로 올린 24시간 안의 사진만(contracts-1.2 6장)."""
    if len(ids) > 3 or len(set(ids)) != len(ids):
        raise invalid({"attachmentIds": "사진은 서로 다른 3장까지 첨부해 주세요"})
    found = []
    for aid in ids:
        a = db.scalar(
            select(PrivateAttachment).where(PrivateAttachment.id == aid).with_for_update()
        )
        if (
            a is None
            or a.uploader_id != uploader_id
            or a.bound
            or now() - a.created_at > ATTACHMENT_TTL
            or (
                a.order_id != order_id
                if a.order_id
                else (thread is None or a.thread_id != thread.id)
            )
        ):
            raise not_found("사용할 수 없는 첨부예요.")
        found.append(a)
    for a in found:
        a.bound = True
    return found


def build_evidence(
    db: Session,
    farm_id: str,
    order_id: str | None,
    small_order_policy: str,
    reservation_shipping_policy: str,
    faqs: list[dict],
    handoff_topics: list[str],
    product_id: str | None = None,
):
    """AI 근거(M-18: 개인정보 없음). 주문 > 지정 상품 > 판매 중 상품이 하나뿐이면 그 상품."""
    from app.ai.schemas import Evidence
    from app.catalog import service as catalog
    from app.orders import service as orders

    order = orders.get_any_order(db, order_id) if order_id else None
    published = catalog.published_products_of_farm(db, farm_id)
    product = None
    if order is not None:
        product = catalog.load_product(db, order.product_id).product
    elif product_id:
        item = catalog.load_product(db, product_id)
        product = item.product if item else None
    elif len(published) == 1:
        product = published[0]
    window = None
    if product and product.delivery_start and product.delivery_end:
        window = (product.delivery_start.isoformat(), product.delivery_end.isoformat())
    order_window = None
    if order is not None:
        order_window = (order.delivery_start.isoformat(), order.delivery_end.isoformat())
    return Evidence(
        product_id=product.id if product else None,
        product_name=product.name if product else None,
        shipping_fee_type=product.shipping_fee_type if product else None,
        shipping_fee=product.shipping_fee if product else None,
        remote_area_fee=product.remote_area_fee if product else None,
        delivery_window=window,
        measured_brix=product.measured_brix if product else None,
        expected_brix=product.expected_brix if product else None,
        order_id=order.id if order else None,
        order_status=order.status if order else None,
        order_delivery_window=order_window,
        faqs=faqs,
        small_order_policy=small_order_policy,
        reservation_shipping_policy=reservation_shipping_policy,
        handoff_topics=handoff_topics,
    )


def _evidence(db: Session, farm_id: str, order_id: str | None, settings):
    return build_evidence(
        db,
        farm_id,
        order_id,
        settings.small_order_policy,
        settings.reservation_shipping_policy,
        settings.faqs,
        settings.handoff_topics,
    )


def consumer_send(db: Session, consumer, farm_id: str, body: SendInput) -> SendResult:
    """소비자 질문(FEAT-12·13). 대화 행을 잠그고 AI 답까지 같은 트랜잭션에 저장한다(AC-13-6).

    농가 AI ON + 방 AUTO일 때만 AI가 답한다(M-05·M-20). HUMAN/OFF면 직접 응대 대상으로 남긴다.
    """
    from app.ai import service as ai
    from app.farms import service as farms
    from app.orders import service as orders

    thread = _consumer_thread(db, consumer.id, farm_id, lock=True)
    text = body.text.strip()
    if (not text and not body.attachment_ids) or len(text) > 1000:
        raise invalid({"text": "본문 또는 사진을 넣고 글은 1,000자 이내로 적어 주세요"})
    context = None
    if body.order_id:
        order = orders.get_paid_order_of(db, consumer.id, body.order_id)
        if order is None or not orders.order_belongs_to_farm(db, order, farm_id):
            raise not_found("결제한 본인 주문만 문의할 수 있어요.")
        context = orders.order_context(db, order)
    elif not farms.is_following(db, consumer.id, farm_id):
        # 팔로우 해제 뒤에는 본인 결제 주문 문맥으로만 보낼 수 있다(contracts-1.2 4장)
        raise forbidden("팔로우한 농가와만 채팅할 수 있어요. 주문 문의는 주문 상세에서 해 주세요.")
    attachments = bind_attachments(db, consumer.id, body.attachment_ids, thread, body.order_id)
    settings = farms.ai_settings(db, farm_id)
    captured = (thread.version, settings.version)
    masked_text, was_masked = mask(text)
    created = now()
    message = ThreadMessage(
        id=new_id("m"),
        thread_id=thread.id,
        sender_type="CONSUMER",
        body=masked_text,
        photos=[],
        attachment_ids=[a.id for a in attachments],
        order_id=body.order_id,
        source_refs=[],
        masked=was_masked,
        # 사진만 보낸 메시지는 AI가 판단하지 않는다(M-21)
        needs_human=thread.ai_mode == "HUMAN" or not settings.enabled or not text,
        created_at=created,
    )
    db.add(message)
    db.flush()
    reply = None
    if thread.ai_mode == "AUTO" and settings.enabled and text:
        answer = ai.answer_question(text, _evidence(db, farm_id, body.order_id, settings))
        latest = farms.ai_settings(db, farm_id, fresh=True)
        still_auto = thread.ai_mode == "AUTO" and latest.enabled
        if still_auto and (thread.version, latest.version) == captured:
            forwarded = answer.action != "ANSWER"
            reply = ThreadMessage(
                id=new_id("m"),
                thread_id=thread.id,
                sender_type="AI",
                body=FORWARDED_TEXT if forwarded else (answer.answer or ""),
                photos=[],
                attachment_ids=[],
                source_summary=answer.reason,
                source_refs=answer.source_refs,
                settings_version=latest.version,
                handoff_status="FORWARDED" if forwarded else None,
                masked=False,
                needs_human=False,
                created_at=created,
            )
            db.add(reply)
            db.flush()
            if forwarded:
                db.add(
                    Escalation(
                        id=new_id("e"),
                        thread_id=thread.id,
                        thread_message_id=message.id,
                        context=context,
                        question=masked_text,
                        reason=answer.reason,
                        status="OPEN",
                        created_at=created,
                    )
                )
        else:
            message.needs_human = True
    db.flush()
    return SendResult(message=_message_view(message), reply=_message_view(reply) if reply else None)


def mark_read(db: Session, thread: Thread, message_id: str, producer: bool) -> UnreadState:
    """읽음 위치는 그 대화에 보이는 메시지만, 뒤로 가지 않는다."""
    target = db.scalar(
        select(ThreadMessage).where(
            ThreadMessage.id == message_id, ThreadMessage.thread_id == thread.id
        )
    )
    if target is None:
        raise not_found("찾을 수 없는 메시지예요.")
    field = "producer_last_read_message_id" if producer else "consumer_last_read_message_id"
    if target.seq > _seq_of(db, getattr(thread, field)):
        setattr(thread, field, target.id)
    db.flush()
    return UnreadState(unread_count=_unread(db, thread, producer))


def consumer_read(db: Session, consumer, farm_id: str, message_id: str) -> UnreadState:
    return mark_read(db, _consumer_thread(db, consumer.id, farm_id, lock=True), message_id, False)


# ---------------- 생산자 1:1 (M-09) ----------------


def producer_chats(
    db: Session, farm, needs_reply: bool, cursor: str | None, limit: int
) -> Paged[ProducerChatSummary]:
    from app.accounts import service as accounts

    threads = list(db.scalars(select(Thread).where(Thread.farm_id == farm.id)))
    users = accounts.get_users(db, [t.consumer_id for t in threads])
    rows = []
    for t in threads:
        flagged = _needs_reply(db, t)
        if needs_reply and not flagged:
            continue
        last = db.scalar(
            select(ThreadMessage)
            .where(ThreadMessage.thread_id == t.id)
            .order_by(ThreadMessage.seq.desc())
            .limit(1)
        )
        user = users.get(t.consumer_id)
        rows.append(
            ProducerChatSummary(
                thread_id=t.id,
                consumer_id=t.consumer_id,
                consumer_name=masked_name(user.name if user else None),
                last_message=last.body if last else "대화를 시작해 보세요",
                last_at=last.created_at if last else None,
                unread_count=_unread(db, t, producer=True),
                needs_reply=flagged,
                ai_mode=t.ai_mode,
            )
        )
    rows.sort(key=lambda s: (s.last_at is not None, s.last_at or now()), reverse=True)
    return _offset_page(rows, cursor, limit)


def producer_start(db: Session, farm, consumer_id: str, room_reply_id: str | None) -> ThreadView:
    """기존 대화, 또는 자기 소식방에 답장한 현재 팔로워만 대상이다. 임의 고객 검색은 없다."""
    from app.farms import service as farms

    thread = get_thread(db, farm.id, consumer_id)
    if thread is None:
        reply = db.get(RoomReply, room_reply_id) if room_reply_id else None
        if (
            reply is None
            or reply.farm_id != farm.id
            or reply.consumer_id != consumer_id
            or not farms.is_following(db, consumer_id, farm.id)
        ):
            raise not_found("대화를 시작할 수 없는 소비자예요.")
        thread = ensure_thread(db, farm.id, consumer_id)
    return _thread_view(thread)


def producer_page(
    db: Session, user, farm, consumer_id: str, cursor: str | None, limit: int
) -> ChatPage:
    thread = _producer_thread(db, farm, consumer_id)
    return _chat_page(db, user, thread, cursor, limit, producer=True)


def _producer_reply(
    db: Session,
    thread: Thread,
    text: str,
    escalation_ids: list[str],
    attachment_ids: list[str] | None = None,
    uploader_id: str | None = None,
) -> ThreadMessage:
    """생산자 답변. 저장과 HUMAN 전환을 같은 트랜잭션에서 한다(M-09)."""
    text = text.strip()
    attachment_ids = attachment_ids or []
    if (not text and not attachment_ids) or len(text) > 1000:
        raise invalid({"text": "본문 또는 사진을 넣고 글은 1,000자 이내로 적어 주세요"})
    escalations = []
    for eid in escalation_ids:
        e = db.get(Escalation, eid)
        if e is None or e.thread_id != thread.id:
            raise not_found("찾을 수 없는 질문이에요.")
        escalations.append(e)
    attachments = bind_attachments(db, uploader_id or "", attachment_ids, thread, None)
    masked_text, was_masked = mask(text)
    message = ThreadMessage(
        id=new_id("m"),
        thread_id=thread.id,
        sender_type="PRODUCER",
        body=masked_text,
        photos=[],
        attachment_ids=[a.id for a in attachments],
        source_refs=[],
        masked=was_masked,
        needs_human=False,
        created_at=now(),
    )
    db.add(message)
    _set_mode(thread, "HUMAN")
    for e in escalations:
        e.status, e.answer, e.answered_at = "ANSWERED", masked_text, message.created_at
    db.flush()
    return message


def producer_send(
    db: Session, farm, consumer_id: str, body: ProducerSendInput
) -> ProducerSendResult:
    thread = _producer_thread(db, farm, consumer_id, lock=True)
    message = _producer_reply(
        db,
        thread,
        body.text,
        body.answer_to_escalation_ids,
        body.attachment_ids,
        farm.producer_id,
    )
    return ProducerSendResult(message=_message_view(message), thread=_thread_view(thread))


def set_ai_mode(db: Session, farm, consumer_id: str, mode: str, version: int) -> ThreadView:
    """AUTO는 이후 메시지부터 적용한다. 과거 질문은 다시 처리하지 않는다."""
    thread = _producer_thread(db, farm, consumer_id, lock=True)
    if thread.version != version:
        raise conflict(
            "STALE_VERSION", "최신 대화 상태를 다시 불러와 주세요.", version=thread.version
        )
    _set_mode(thread, mode)
    db.flush()
    return _thread_view(thread)


def producer_read(db: Session, farm, consumer_id: str, message_id: str) -> UnreadState:
    return mark_read(db, _producer_thread(db, farm, consumer_id, lock=True), message_id, True)


def questions(
    db: Session, farm, status: str | None, cursor: str | None, limit: int
) -> Paged[EscalationView]:
    """질문함(1.1 계약 유지). 전달된 질문과 그 소비자 채팅."""
    query = (
        select(Escalation, Thread)
        .join(Thread, Thread.id == Escalation.thread_id)
        .where(Thread.farm_id == farm.id)
    )
    if status:
        query = query.where(Escalation.status == status)
    rows = db.execute(query.order_by(Escalation.created_at.desc(), Escalation.id.desc())).all()
    views = [_escalation_view(db, e, t, True) for e, t in rows]
    return _offset_page(views, cursor, limit)


def answer_question(db: Session, farm, escalation_id: str, text: str) -> EscalationView:
    e = db.get(Escalation, escalation_id)
    thread = db.get(Thread, e.thread_id) if e else None
    if e is None or thread is None or thread.farm_id != farm.id:
        raise not_found("찾을 수 없는 질문이에요.")
    thread = _producer_thread(db, farm, thread.consumer_id, lock=True)
    _producer_reply(db, thread, text, [e.id])
    return _escalation_view(db, e, thread, True)


def open_question_count(db: Session, farm_id: str) -> int:
    """현황의 답할 질문 수(FEAT-14): 답변이 필요한 대화 수."""
    threads = db.scalars(select(Thread).where(Thread.farm_id == farm_id))
    return sum(1 for t in threads if _needs_reply(db, t))


# ---------------- 비공개 사진 (contracts-1.2 6장) ----------------


def _attachment_view(a: PrivateAttachment) -> AttachmentView:
    return AttachmentView(attachment_id=a.id, mime_type=a.mime_type, size=a.size)


def _check_resource(db: Session, user, order_id: str | None, thread_id: str | None) -> None:
    """주문 또는 대화 하나. 본인 결제 주문·자기 대화, 생산자는 자기 농가의 것만."""
    from app.farms import service as farms
    from app.orders import service as orders

    if bool(order_id) == bool(thread_id):
        raise invalid({"file": "주문 또는 대화를 하나 지정해 주세요"})
    if order_id:
        order = orders.get_any_order(db, order_id)
        if order is None or order.paid_at is None:
            raise not_found("결제한 본인 주문만 문의할 수 있어요.")
        if user.role == "CONSUMER":
            ok = order.consumer_id == user.id
        else:
            own = farms.get_farm_of_producer(db, user.id)
            ok = own is not None and orders.order_belongs_to_farm(db, order, own.id)
        if not ok:
            raise not_found("결제한 본인 주문만 문의할 수 있어요.")
        return
    thread = db.get(Thread, thread_id)
    if thread is None or farms.get_approved_farm(db, thread.farm_id) is None:
        raise not_found("찾을 수 없는 대화예요.")
    if user.role == "CONSUMER":
        if thread.consumer_id != user.id:
            raise not_found("찾을 수 없는 대화예요.")
        following = farms.is_following(db, user.id, thread.farm_id)
        if not following and not _has_inquiries(db, thread.id):
            raise not_found("찾을 수 없는 대화예요.")
    else:
        own = farms.get_farm_of_producer(db, user.id)
        if own is None or own.id != thread.farm_id:
            raise not_found("찾을 수 없는 대화예요.")


def upload_attachment(
    db: Session,
    user,
    data: bytes,
    declared: str | None,
    order_id: str | None,
    thread_id: str | None,
) -> AttachmentView:
    """업로드한 사람만 보는 임시 파일. 실제 형식 확인·EXIF 제거, 24시간 지난 미연결 파일 정리."""
    if user.role not in ("CONSUMER", "PRODUCER"):
        raise forbidden()
    _check_resource(db, user, order_id, thread_id)
    mime, cleaned = images.sanitize(data, declared)
    db.execute(
        delete(PrivateAttachment).where(
            PrivateAttachment.bound.is_(False),
            PrivateAttachment.created_at < now() - ATTACHMENT_TTL,
        )
    )
    row = PrivateAttachment(
        id=new_id("att"),
        uploader_id=user.id,
        order_id=order_id,
        thread_id=thread_id,
        mime_type=mime,
        size=len(cleaned),
        data=cleaned,
        bound=False,
        created_at=now(),
    )
    db.add(row)
    db.flush()
    return _attachment_view(row)


def read_attachment(db: Session, user, attachment_id: str) -> PrivateAttachment:
    """묶인 파일은 그 주문·대화 참여자, 임시 파일은 업로더만. 아니면 404."""
    a = db.get(PrivateAttachment, attachment_id)
    if a is None:
        raise not_found("찾을 수 없는 사진이에요.")
    if not a.bound:
        if a.uploader_id != user.id or now() - a.created_at > ATTACHMENT_TTL:
            raise not_found("찾을 수 없는 사진이에요.")
        return a
    try:
        _check_resource(db, user, a.order_id, None if a.order_id else a.thread_id)
    except ApiError as exc:
        raise not_found("찾을 수 없는 사진이에요.") from exc
    return a


# ---------------- 주문 문제 문의 (FEAT-33, M-21) ----------------


def _thread_inquiries(db: Session, thread_id: str) -> list[OrderInquiry]:
    return list(
        db.scalars(
            select(OrderInquiry)
            .where(OrderInquiry.thread_id == thread_id)
            .order_by(OrderInquiry.created_at, OrderInquiry.id)
        )
    )


def inquiry_view(db: Session, i: OrderInquiry) -> InquiryView:
    """첨부는 메타데이터만 돌려준다. 바이트는 GET /api/messaging/attachments/{id}."""
    attachments = []
    if i.attachment_ids:
        rows = {
            a.id: a
            for a in db.scalars(
                select(PrivateAttachment).where(PrivateAttachment.id.in_(i.attachment_ids))
            )
        }
        attachments = [_attachment_view(rows[a]) for a in i.attachment_ids if a in rows]
    return InquiryView(
        inquiry_id=i.id,
        order_id=i.order_id,
        thread_id=i.thread_id,
        type=i.type,
        text=i.text,
        attachments=attachments,
        status=i.status,
        version=i.version,
        created_at=i.created_at,
        resolved_at=i.resolved_at,
    )


def create_inquiry(db: Session, consumer, order_id: str, body: InquiryInput) -> InquiryCreated:
    """본인 결제 주문에서 접수(AC-33-1). 그 농가 대화에 주문 문맥과 함께 넣고 HUMAN으로."""
    from app.farms import service as farms
    from app.orders import service as orders

    order = orders.get_paid_order_of(db, consumer.id, order_id)
    if order is None:
        raise not_found("결제한 본인 주문만 문의할 수 있어요.")
    text = body.text.strip()
    if not text or len(text) > 1000:
        raise invalid({"text": "유형을 선택하고 설명을 1~1,000자로 적어 주세요"})
    farm_id = orders.order_farm_id(db, order)
    if farms.get_approved_farm(db, farm_id) is None:
        raise not_found("지금은 이 농가에 문의할 수 없어요.")
    ensure_thread(db, farm_id, consumer.id)
    thread = get_thread(db, farm_id, consumer.id, lock=True)
    attachments = bind_attachments(db, consumer.id, body.attachment_ids, thread, order.id)
    masked_text, was_masked = mask(text)
    created = now()
    inquiry_id = new_id("inquiry")
    message = ThreadMessage(
        id=new_id("m"),
        thread_id=thread.id,
        sender_type="CONSUMER",
        body=masked_text,
        photos=[],
        attachment_ids=[a.id for a in attachments],
        order_id=order.id,
        inquiry_id=inquiry_id,
        source_refs=[],
        masked=was_masked,
        needs_human=True,
        created_at=created,
    )
    db.add(message)
    db.flush()
    inquiry = OrderInquiry(
        id=inquiry_id,
        order_id=order.id,
        thread_id=thread.id,
        message_id=message.id,
        type=body.type,
        text=masked_text,
        attachment_ids=[a.id for a in attachments],
        status="OPEN",
        version=1,
        created_at=created,
    )
    db.add(inquiry)
    # AI는 접수 안내만 할 수 있고 사진·책임을 판단하지 않는다 → 직접 응대(M-21)
    _set_mode(thread, "HUMAN")
    db.flush()
    return InquiryCreated(
        inquiry=inquiry_view(db, inquiry), message=_message_view(message), thread_id=thread.id
    )


def list_inquiries(db: Session, user, order_id: str, cursor: str | None, limit: int) -> Paged:
    """본인 소비자 또는 그 농가 생산자만(AC-33-2)."""
    _check_resource(db, user, order_id, None)
    rows = list(
        db.scalars(
            select(OrderInquiry)
            .where(OrderInquiry.order_id == order_id)
            .order_by(OrderInquiry.created_at, OrderInquiry.id)
        )
    )
    return _offset_page([inquiry_view(db, i) for i in rows], cursor, limit)


def set_inquiry_status(
    db: Session, farm, inquiry_id: str, status: str, version: int
) -> InquiryView:
    """해결·재열기. 주문 상태·환불액은 바꾸지 않는다(AC-33-3)."""
    inquiry = db.scalar(select(OrderInquiry).where(OrderInquiry.id == inquiry_id).with_for_update())
    thread = db.get(Thread, inquiry.thread_id) if inquiry else None
    if inquiry is None or thread is None or thread.farm_id != farm.id:
        raise not_found("찾을 수 없는 문의예요.")
    if inquiry.version != version:
        raise conflict(
            "STALE_VERSION", "최신 문의 상태를 다시 불러와 주세요.", version=inquiry.version
        )
    if inquiry.status != status:
        inquiry.status = status
        inquiry.version += 1
        inquiry.resolved_at = now() if status == "RESOLVED" else None
    db.flush()
    return inquiry_view(db, inquiry)
