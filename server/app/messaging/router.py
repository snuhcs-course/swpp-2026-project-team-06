import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Header, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app.core import images
from app.core.db import get_db
from app.core.errors import forbidden, not_found
from app.core.idempotency import run_idempotent
from app.core.pagination import page_limit
from app.core.schemas import Paged
from app.core.security import (
    ApprovedProducer,
    Consumer,
    CurrentUser,
    OnboardedConsumer,
    OptionalUser,
    Producer,
)
from app.farms import service as farms
from app.messaging import service, support
from app.messaging.schemas import (
    AiModeInput,
    AttachmentView,
    ChatMessage,
    ChatPage,
    ChatSummary,
    EscalationView,
    FanReplyPage,
    InquiryStatusInput,
    InquiryView,
    MessageEditInput,
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
    RoomSendInput,
    SendInput,
    SendResult,
    StartChatInput,
    StartChatResult,
    SupportPage,
    SupportProducerSendInput,
    SupportSendInput,
    TextInput,
    ThreadView,
    UnreadState,
)

router = APIRouter(prefix="/messaging", tags=["messaging"])
_safety_logger = logging.getLogger("farmclub.ai.safety")

Db = Annotated[Session, Depends(get_db)]
Limit = Annotated[int, Depends(page_limit)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


def require_support_producer(db: Db, user: Producer):
    """약관 동의한 생산자 + 농가 상태가 승인·정지·반려(DEV-209, AC-34-9). 값은 (User, Farm).

    정지·반려 농가는 다른 생산자 API를 못 쓰고 farmclub 대화방만 쓴다.
    """
    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None or farm.approval_status not in support.SUPPORT_STATUSES:
        raise forbidden("승인·정지·반려된 농가만 farmclub 대화방을 쓸 수 있어요.")
    return user, farm


SupportProducer = Annotated[tuple, Depends(require_support_producer)]


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


@router.delete("/news/{broadcast_id}", status_code=204, response_class=Response)
def delete_news(db: Db, producer: ApprovedProducer, broadcast_id: str):
    """내 농가 소식 삭제(M-23). 다른 농가·없는 소식 404, 이미 지운 내 소식도 204."""
    _, farm = producer
    service.delete_news(db, farm, broadcast_id)
    db.commit()
    return Response(status_code=204)


@router.put("/news/{broadcast_id}/reaction", response_model=ReactionState)
def react(db: Db, user: OnboardedConsumer, broadcast_id: str):
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
def send_room(
    db: Db, user: CurrentUser, farm_id: str, body: RoomSendInput, key: IdempotencyKey = None
):
    return run_idempotent(
        db,
        user.id,
        f"room:{farm_id}",
        key,
        body,
        lambda: service.send_room(
            db, user, farm_id, body.text, body.reply_to_message_id, body.reply_to_version
        ),
    )


@router.put("/rooms/{farm_id}/read", status_code=204, response_class=Response)
def read_room(db: Db, user: Consumer, farm_id: str, body: ReadInput):
    """팔로워가 소식방에서 이 소식이 보이는 위치까지 읽었다(DEV-297). 소식별 읽음 수에 1회 센다."""
    service.read_room(db, user, farm_id, body.last_read_message_id)
    db.commit()
    return Response(status_code=204)


@router.get("/rooms/{farm_id}/broadcasts/{broadcast_id}/replies", response_model=FanReplyPage)
def fan_replies(
    db: Db,
    producer: ApprovedProducer,
    farm_id: str,
    broadcast_id: str,
    limit: Limit,
    filter: Literal["all", "unread"] = "all",
    cursor: str | None = None,
):
    """소식 하나에 연결된 소비자 답장(팬 답장 시트, DEV-297). 자기 농가 생산자만."""
    user, farm = producer
    return service.fan_replies(
        db, user, farm, farm_id, broadcast_id, filter == "unread", cursor, limit
    )


@router.put("/rooms/{farm_id}/broadcasts/{broadcast_id}/replies/read", response_model=UnreadState)
def read_fan_replies(
    db: Db, producer: ApprovedProducer, farm_id: str, broadcast_id: str, body: ReadInput
):
    """시트에서 본 답장을 생산자 읽음으로 바꾼다(DEV-297). 남은 안 읽음 수를 준다."""
    _, farm = producer
    state = service.read_fan_replies(db, farm, farm_id, broadcast_id, body.last_read_message_id)
    db.commit()
    return state


# ---------------- 소비자 1:1 ----------------


@router.get("/chats", response_model=Paged[ChatSummary])
def chats(db: Db, user: Consumer, limit: Limit, cursor: str | None = None):
    return service.consumer_chats(db, user, cursor, limit)


@router.post("/chats", response_model=StartChatResult)
def start_chat(db: Db, user: OnboardedConsumer, body: StartChatInput, key: IdempotencyKey = None):
    """An explicit order uses the verified paid-order exception (M-04)."""
    service.authorize_chat_start(db, user, body.farm_id, body.order_id)
    return run_idempotent(
        db,
        user.id,
        f"start:{body.farm_id}",
        key,
        body.model_dump(by_alias=True, exclude_none=True),
        lambda: service.start_chat(db, user, body.farm_id, body.order_id),
    )


@router.get("/chats/{farm_id}/messages", response_model=ChatPage)
def chat_messages(db: Db, user: Consumer, farm_id: str, limit: Limit, cursor: str | None = None):
    return service.consumer_page(db, user, farm_id, cursor, limit)


@router.post("/chats/{farm_id}/messages/{message_id}/report", response_model=EscalationView)
def report_ai_answer(
    db: Db,
    user: Consumer,
    farm_id: str,
    message_id: str,
    key: IdempotencyKey = None,
):
    # The unique reported_message_id constraint is the idempotency guarantee;
    # the optional key is accepted consistently with other messaging POSTs.
    result = service.report_ai_answer(db, user, farm_id, message_id)
    db.commit()
    return result


@router.post("/chats/{farm_id}/messages", response_model=SendResult)
def send_chat(
    db: Db, user: OnboardedConsumer, farm_id: str, body: SendInput, key: IdempotencyKey = None
):
    """질문 → AI 안내 또는 '농가에 전달'. HUMAN·AI OFF면 reply=null."""
    service.authorize_chat_send(db, user, farm_id, body)
    alert: service.ManagerRefundAlert | None = None

    def send():
        nonlocal alert
        outcome = service.consumer_send(db, user, farm_id, body)
        alert = outcome.alert
        return outcome.result

    result = run_idempotent(
        db,
        user.id,
        f"send:{farm_id}",
        key,
        body,
        send,
    )
    committed_message_id = result.get("message", {}).get("messageId")
    if alert is not None and alert.message_id == committed_message_id:
        _safety_logger.info(
            "manager_refund_request",
            extra={
                "event": "manager_refund_request",
                "farmId": alert.farm_id,
                "threadId": alert.thread_id,
                "messageId": alert.message_id,
                "category": "refund_or_compensation",
            },
        )
    return result


@router.put("/chats/{farm_id}/read", response_model=UnreadState)
def read_chat(db: Db, user: Consumer, farm_id: str, body: ReadInput):
    state = service.consumer_read(db, user, farm_id, body.last_read_message_id)
    db.commit()
    return state


# ---------------- 소비자 farmclub 문의 대화방(DEV-150, FEAT-34) ----------------


@router.get("/support/messages", response_model=SupportPage)
def support_messages(db: Db, user: Consumer):
    return support.consumer_support_page(db, user.id)


@router.post("/support/messages", response_model=SendResult)
def support_send(
    db: Db, user: OnboardedConsumer, body: SupportSendInput, key: IdempotencyKey = None
):
    """운영팀에 문의. AI는 답하지 않아 reply는 항상 null.

    처리방침의 이 목적(DEV-150)에 다시 동의해야 보낼 수 있다(농가 채팅과 같은 관문).
    """
    return run_idempotent(
        db,
        user.id,
        "support-send",
        key,
        body,
        lambda: support.consumer_support_send(db, user.id, body.text),
    )


@router.put("/support/read", response_model=UnreadState)
def support_read(db: Db, user: Consumer, body: ReadInput):
    unread = support.consumer_support_read(db, user.id, body.last_read_message_id)
    db.commit()
    return UnreadState(unread_count=unread)


# ---------------- 생산자 farmclub 문의 대화방 (DEV-209, AC-34-9) ----------------


@router.get("/producer/support/messages", response_model=ChatPage)
def producer_support_messages(
    db: Db, producer: SupportProducer, limit: Limit, cursor: str | None = None
):
    """자기 농가의 farmclub 방. 정지·반려 농가도 열고, 방이 없으면 처음 열 때 만든다."""
    user, farm = producer
    page = support.producer_support_page(db, user, farm, cursor, limit)
    db.commit()
    return page


@router.post("/producer/support/messages", response_model=ProducerSendResult)
def producer_support_send(
    db: Db, producer: SupportProducer, body: SupportProducerSendInput, key: IdempotencyKey = None
):
    user, farm = producer
    return run_idempotent(
        db,
        user.id,
        "producer-support-send",
        key,
        body,
        lambda: support.producer_support_send(db, farm, body.text, body.attachment_ids),
    )


@router.put("/producer/support/read", response_model=UnreadState)
def producer_support_read(db: Db, producer: SupportProducer, body: ReadInput):
    _, farm = producer
    state = support.producer_support_read(db, farm, body.last_read_message_id)
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


@router.patch("/messages/{message_id}", response_model=ChatMessage)
def edit_chat_message(
    db: Db, user: CurrentUser, message_id: str, body: MessageEditInput, key: IdempotencyKey = None
):
    return run_idempotent(
        db,
        user.id,
        f"edit-chat:{message_id}",
        key,
        body,
        lambda: service.edit_chat_message(db, user, message_id, body),
    )


@router.patch("/rooms/{farm_id}/messages/{message_id}", response_model=NewsRoomMessage)
def edit_room_message(
    db: Db,
    user: CurrentUser,
    farm_id: str,
    message_id: str,
    body: MessageEditInput,
    key: IdempotencyKey = None,
):
    return run_idempotent(
        db,
        user.id,
        f"edit-room:{farm_id}:{message_id}",
        key,
        body,
        lambda: service.edit_room_message(db, user, farm_id, message_id, body),
    )
