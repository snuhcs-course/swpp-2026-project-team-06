from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Header, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core import images
from app.core.db import get_db
from app.core.errors import not_found
from app.core.idempotency import run_idempotent
from app.core.pagination import page_limit
from app.core.schemas import Paged
from app.core.security import ApprovedProducer, Consumer, CurrentUser, OptionalUser
from app.farms import service as farms
from app.messaging import service
from app.messaging.schemas import (
    AiModeInput,
    AttachmentView,
    ChatPage,
    ChatSummary,
    EscalationView,
    InquiryStatusInput,
    InquiryView,
    NewsInput,
    NewsItem,
    NewsPosted,
    NewsRoomMessage,
    NewsRoomPage,
    NewsRoomSummary,
    ProducerChatSummary,
    ProducerSendInput,
    ProducerSendResult,
    ProducerStartInput,
    ReactionState,
    ReadInput,
    SendInput,
    SendResult,
    StartChatInput,
    StartChatResult,
    TextInput,
    ThreadView,
    UnreadState,
)

router = APIRouter(prefix="/messaging", tags=["messaging"])

Db = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Depends(page_limit)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


# ---------------- 소식·좋아요 (FEAT-12·15) ----------------


@router.get("/news", response_model=Paged[NewsItem])
def followed_news(db: Db, user: Consumer, limit: Limit, cursor: str | None = None):
    """팔로우한 농가의 소식(공개·팔로워 전용)."""
    return service.followed_news(db, user.id, cursor, limit)


@router.post("/news", response_model=NewsPosted)
def post_news(db: Db, producer: ApprovedProducer, body: NewsInput, key: IdempotencyKey = None):
    """소식 올리기(SCR-27). 사진 5장·영상 1개, 넘으면 413."""
    user, farm = producer
    return run_idempotent(db, user.id, "news", key, body, lambda: service.post_news(db, farm, body))


@router.get("/farms/{farm_id}/news", response_model=Paged[NewsItem])
def farm_news(db: Db, farm_id: str, user: OptionalUser, limit: Limit, cursor: str | None = None):
    """농가 공개 소식(FEAT-15). 로그인한 소비자면 내 좋아요를 표시한다."""
    farm = farms.get_approved_farm(db, farm_id)
    if farm is None:
        raise not_found("찾을 수 없는 농가예요.")
    return service.farm_public_news(db, farm, user.id if user else None, cursor, limit)


@router.put("/news/{broadcast_id}/reaction", response_model=ReactionState)
def react(db: Db, user: Consumer, broadcast_id: str):
    state = service.set_reaction(db, user.id, broadcast_id, True)
    db.commit()
    return state


@router.delete("/news/{broadcast_id}/reaction", response_model=ReactionState)
def unreact(db: Db, user: Consumer, broadcast_id: str):
    state = service.set_reaction(db, user.id, broadcast_id, False)
    db.commit()
    return state


# ---------------- 소식방 (M-19) ----------------


@router.get("/rooms", response_model=Paged[NewsRoomSummary])
def rooms(db: Db, user: CurrentUser, limit: Limit, cursor: str | None = None):
    """소비자는 팔로우한 승인 농가의 방, 생산자는 자기 농가 방 하나."""
    return service.rooms(db, user, cursor, limit)


@router.get("/rooms/{farm_id}/messages", response_model=NewsRoomPage)
def room_messages(
    db: Db, user: OptionalUser, farm_id: str, limit: Limit, cursor: str | None = None
):
    """공개 방송은 누구나, 팔로워는 팔로워 방송·본인 답장까지 볼 수 있다."""
    return service.room_page(db, user, farm_id, cursor, limit)


@router.post("/rooms/{farm_id}/messages", response_model=NewsRoomMessage)
def send_room(db: Db, user: CurrentUser, farm_id: str, body: TextInput, key: IdempotencyKey = None):
    return run_idempotent(
        db,
        user.id,
        f"room:{farm_id}",
        key,
        body,
        lambda: service.send_room(db, user, farm_id, body.text),
    )


# ---------------- 소비자 1:1 ----------------


@router.get("/chats", response_model=Paged[ChatSummary])
def chats(db: Db, user: Consumer, limit: Limit, cursor: str | None = None):
    return service.consumer_chats(db, user, cursor, limit)


@router.post("/chats", response_model=StartChatResult)
def start_chat(db: Db, user: Consumer, body: StartChatInput, key: IdempotencyKey = None):
    """채팅하기·질문하기. 팔로우하지 않았으면 자동 팔로우(AC-12-4)."""
    return run_idempotent(
        db,
        user.id,
        f"start:{body.farm_id}",
        key,
        body,
        lambda: service.start_chat(db, user, body.farm_id),
    )


@router.get("/chats/{farm_id}/messages", response_model=ChatPage)
def chat_messages(db: Db, user: Consumer, farm_id: str, limit: Limit, cursor: str | None = None):
    return service.consumer_page(db, user, farm_id, cursor, limit)


@router.post("/chats/{farm_id}/messages", response_model=SendResult)
def send_chat(db: Db, user: Consumer, farm_id: str, body: SendInput, key: IdempotencyKey = None):
    """질문 → AI 안내 또는 '농가에 전달'. HUMAN·AI OFF면 reply=null."""
    return run_idempotent(
        db,
        user.id,
        f"send:{farm_id}",
        key,
        body,
        lambda: service.consumer_send(db, user, farm_id, body),
    )


@router.put("/chats/{farm_id}/read", response_model=UnreadState)
def read_chat(db: Db, user: Consumer, farm_id: str, body: ReadInput):
    state = service.consumer_read(db, user, farm_id, body.last_read_message_id)
    db.commit()
    return state


# ---------------- 생산자 1:1 (M-09) ----------------


@router.get("/producer/chats", response_model=Paged[ProducerChatSummary])
def producer_chats(
    db: Db,
    producer: ApprovedProducer,
    limit: Limit,
    needs_reply: Annotated[bool, Query(alias="needsReply")] = False,
    cursor: str | None = None,
):
    _, farm = producer
    return service.producer_chats(db, farm, needs_reply, cursor, limit)


@router.post("/producer/chats", response_model=ThreadView)
def producer_start(
    db: Db, producer: ApprovedProducer, body: ProducerStartInput, key: IdempotencyKey = None
):
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        f"producer-start:{body.consumer_id}",
        key,
        body,
        lambda: service.producer_start(db, farm, body.consumer_id, body.room_reply_id),
    )


@router.get("/producer/chats/{consumer_id}/messages", response_model=ChatPage)
def producer_messages(
    db: Db, producer: ApprovedProducer, consumer_id: str, limit: Limit, cursor: str | None = None
):
    user, farm = producer
    return service.producer_page(db, user, farm, consumer_id, cursor, limit)


@router.post("/producer/chats/{consumer_id}/messages", response_model=ProducerSendResult)
def producer_send(
    db: Db,
    producer: ApprovedProducer,
    consumer_id: str,
    body: ProducerSendInput,
    key: IdempotencyKey = None,
):
    """생산자 답변. 성공하면 그 대화는 HUMAN(직접 응대)으로 바뀐다."""
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        f"producer-send:{consumer_id}",
        key,
        body,
        lambda: service.producer_send(db, farm, consumer_id, body),
    )


@router.put("/producer/chats/{consumer_id}/ai-mode", response_model=ThreadView)
def ai_mode(
    db: Db,
    producer: ApprovedProducer,
    consumer_id: str,
    body: AiModeInput,
    key: IdempotencyKey = None,
):
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        f"ai-mode:{consumer_id}",
        key,
        body,
        lambda: service.set_ai_mode(db, farm, consumer_id, body.mode, body.version),
    )


@router.put("/producer/chats/{consumer_id}/read", response_model=UnreadState)
def producer_read(db: Db, producer: ApprovedProducer, consumer_id: str, body: ReadInput):
    _, farm = producer
    state = service.producer_read(db, farm, consumer_id, body.last_read_message_id)
    db.commit()
    return state


# ---------------- 질문함 (1.1 계약, 새 화면은 producer/chats를 쓴다) ----------------


@router.get("/questions", response_model=Paged[EscalationView])
def questions(
    db: Db,
    producer: ApprovedProducer,
    limit: Limit,
    status: str | None = None,
    cursor: str | None = None,
):
    _, farm = producer
    return service.questions(db, farm, status, cursor, limit)


@router.post("/questions/{escalation_id}/answer", response_model=EscalationView)
def answer(db: Db, producer: ApprovedProducer, escalation_id: str, body: TextInput):
    _, farm = producer
    view = service.answer_question(db, farm, escalation_id, body.text)
    db.commit()
    return view


# ---------------- 비공개 사진·문의 상태 (contracts-1.2 6장) ----------------


@router.post("/attachments", response_model=AttachmentView)
async def upload_attachment(
    db: Db,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    order_id: Annotated[str | None, Form(alias="orderId")] = None,
    thread_id: Annotated[str | None, Form(alias="threadId")] = None,
):
    """multipart(file, orderId 또는 threadId). JPEG·PNG·WebP 10MB, EXIF는 지워서 저장한다."""
    data = await file.read(images.MAX_BYTES + 1)
    view = service.upload_attachment(db, user, data, file.content_type, order_id, thread_id)
    db.commit()
    return view


@router.get("/attachments/{attachment_id}", response_class=Response)
def read_attachment(db: Db, user: CurrentUser, attachment_id: str):
    a = service.read_attachment(db, user, attachment_id)
    return Response(
        content=a.data,
        media_type=a.mime_type,
        headers={"Cache-Control": "private, no-store"},
    )


@router.put("/producer/inquiries/{inquiry_id}/status", response_model=InquiryView)
def inquiry_status(
    db: Db,
    producer: ApprovedProducer,
    inquiry_id: str,
    body: InquiryStatusInput,
    key: IdempotencyKey = None,
):
    """해결·재열기. 주문 상태·환불액은 바꾸지 않는다."""
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        f"inquiry-status:{inquiry_id}",
        key,
        body,
        lambda: service.set_inquiry_status(db, farm, inquiry_id, body.status, body.version),
    )
