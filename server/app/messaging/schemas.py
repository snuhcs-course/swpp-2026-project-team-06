"""messaging 모듈 Pydantic 입출력 스키마 (screens.md 7.2 messaging, contracts-1.2 4장)."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.detail import MediaUri
from app.core.schemas import CamelModel

# OPERATOR는 farmclub 문의 대화방의 운영팀 메시지(DEV-111, M-22)
SenderType = Literal["CONSUMER", "PRODUCER", "AI", "OPERATOR"]


class NewsItem(CamelModel):
    reply_to: dict | None = None
    edited_at: datetime | None = None
    edit_version: int = 0
    broadcast_id: str
    farm_id: str
    farm_name: str
    farm_photo: str | None
    created_at: datetime
    body: str
    photos: list[str]
    visibility: Literal["PUBLIC", "FOLLOWERS"]
    reaction_count: int
    my_reaction: bool


class NewsInput(CamelModel):
    body: str = ""
    photos: list[MediaUri] = Field(default_factory=list)
    videos: list[MediaUri] = Field(default_factory=list)
    visibility: Literal["PUBLIC", "FOLLOWERS"] = "FOLLOWERS"


class NewsPosted(CamelModel):
    broadcast_id: str
    created_at: datetime
    recipient_count: int


class ReactionState(CamelModel):
    reaction_count: int
    my_reaction: bool


class NewsRoomSummary(CamelModel):
    can_reply: bool
    farm_id: str
    farm_name: str
    farm_photo: str | None
    last_message: str | None
    last_at: datetime | None


class NewsRoomMessage(CamelModel):
    reply_to: dict | None = None
    edited_at: datetime | None = None
    edit_version: int = 0
    message_id: str
    farm_id: str
    sender_id: str
    sender_name: str
    sender_role: Literal["CONSUMER", "PRODUCER"]
    body: str
    photos: list[str]
    videos: list[str]
    created_at: datetime
    broadcast_id: str | None
    reaction_count: int
    my_reaction: bool
    # 방송의 공개 범위(M-14). 소비자 답장은 None. 생산자 삭제 시트 안내에 쓴다(DEV-210)
    visibility: Literal["PUBLIC", "FOLLOWERS"] | None = None
    # 소유 생산자의 방송에만 숫자(DEV-297). 소비자·비로그인과 답장 행은 None
    read_count: int | None = None
    reply_count: int | None = None


class NewsRoomPage(CamelModel):
    room: NewsRoomSummary
    items: list[NewsRoomMessage]
    next_cursor: str | None


class FanReplyBroadcast(CamelModel):
    """팬 답장 시트 머리의 소식 인용(DEV-297)."""

    broadcast_id: str
    body: str
    media_count: int
    created_at: datetime


class FanReply(CamelModel):
    """소식 하나에 연결된 소비자 답장 한 줄(DEV-297). 이름은 생산자 방과 같은 가린 이름."""

    message_id: str
    consumer_id: str
    sender_name: str
    body: str
    created_at: datetime
    edit_version: int
    # 생산자가 아직 읽지 않음
    unread: bool
    # 그 농가에 결제된 주문이 있는 소비자
    reserved_customer: bool
    # 이 답장을 인용한 소식(모두에게 답장)이 있음
    quoted: bool


class FanReplyPage(CamelModel):
    broadcast: FanReplyBroadcast
    total: int
    unread_count: int
    # 이 소식의 가장 최근 답장(필터·페이지와 무관). 시트를 닫을 때 여기까지 읽음 처리
    last_reply_id: str | None
    items: list[FanReply]
    next_cursor: str | None


class RoomSendInput(CamelModel):
    text: str = ""
    reply_to_message_id: str | None = None
    reply_to_version: int | None = Field(default=None, ge=0)


class TextInput(CamelModel):
    text: str = ""


class ChatMessage(CamelModel):
    edited_at: datetime | None = None
    edit_version: int = 0
    reply_to: dict | None = None
    reply_to_message_id: str | None = None
    sequence: int
    message_id: str
    sender_type: SenderType
    body: str
    photos: list[str]
    created_at: datetime
    attachment_ids: list[str]
    order_id: str | None
    inquiry_id: str | None
    source_refs: list[str]
    settings_version: int | None
    needs_human: bool
    source_summary: str | None
    handoff_status: Literal["FORWARDED"] | None
    masked: bool
    reported: bool = False


class ThreadView(CamelModel):
    human_reply_until: datetime | None = None
    server_now: datetime | None = None
    thread_id: str
    farm_id: str
    consumer_id: str
    ai_mode: Literal["AUTO", "HUMAN"]
    version: int
    consumer_last_read_message_id: str | None
    producer_last_read_message_id: str | None


class LinkedOrder(CamelModel):
    order_id: str
    product_name: str
    option_label: str
    quantity: int
    status: str


class EscalationView(CamelModel):
    escalation_id: str
    consumer_id: str
    consumer_name: str
    context: str | None
    question: str
    reason: str
    created_at: datetime
    status: Literal["OPEN", "ANSWERED"]
    answer: str | None
    reported_message_id: str | None = None
    thread: list[ChatMessage]


class AttachmentView(CamelModel):
    attachment_id: str
    mime_type: str
    size: int


class InquiryView(CamelModel):
    inquiry_id: str
    order_id: str
    thread_id: str
    type: Literal["DAMAGE", "CONDITION", "TASTE", "OTHER"]
    text: str
    attachments: list[AttachmentView]
    status: Literal["OPEN", "RESOLVED"]
    version: int
    created_at: datetime
    resolved_at: datetime | None


class InquiryInput(CamelModel):
    type: Literal["DAMAGE", "CONDITION", "TASTE", "OTHER"]
    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)


class InquiryCreated(CamelModel):
    inquiry: InquiryView
    message: "ChatMessage"
    thread_id: str


class InquiryStatusInput(CamelModel):
    status: Literal["OPEN", "RESOLVED"]
    version: int


class FarmReply(CamelModel):
    """소비자에게 보이는 응답 주체와 예상 답 시간(DEV-208, AC-13-9·13-10).

    mode는 방 AUTO + 농가 AI ON일 때만 AI. typical_reply_hours는 근거가 부족하면 None.
    """

    mode: Literal["AI", "FARM"]
    typical_reply_hours: int | None


class ChatPage(CamelModel):
    items: list[ChatMessage]
    next_cursor: str | None
    thread: ThreadView
    inquiries: list[InquiryView]
    orders: list[LinkedOrder]
    escalations: list[EscalationView] | None = None
    # 소비자 조회에만 채운다. 생산자 조회는 None(DEV-208)
    farm_reply: FarmReply | None = None
    # 생산자 조회에만 채운다. 목록과 같은 가림 이름(김○○), 문의 방은 'farmclub'.
    # 새로고침·직접 링크에도 머리 이름이 보이게 한다(DEV-232). 소비자 조회는 None
    consumer_name: str | None = None


class ChatSummary(CamelModel):
    farm_id: str
    farm_name: str
    farm_photo: str | None
    last_message: str
    last_sender_type: SenderType
    last_at: datetime | None
    unread_count: int
    # farmclub 문의 대화방(DEV-150). farm_id는 u-farmclub(SUPPORT_USER_ID),
    # 대화는 /api/messaging/support로 연다
    is_support: bool = False


class ProducerChatSummary(CamelModel):
    thread_id: str
    consumer_id: str
    consumer_name: str
    last_message: str
    last_at: datetime | None
    unread_count: int
    needs_reply: bool
    ai_mode: Literal["AUTO", "HUMAN"]
    # farmclub 문의 대화방(DEV-111). 다른 대화와 같이 최근 순으로 섞이고, 로고로 구분한다
    is_support: bool = False


class StartChatInput(CamelModel):
    farm_id: str
    order_id: str | None = None


class StartChatResult(CamelModel):
    farm_id: str
    auto_followed: bool


class ProducerStartInput(CamelModel):
    consumer_id: str
    room_reply_id: str | None = None


class SendInput(CamelModel):
    reply_to_message_id: str | None = None
    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    order_id: str | None = None
    # 상품 페이지에서 연 채팅의 상품. AI 근거로만 쓰고 저장하지 않는다(DEV-97)
    product_id: str | None = None


class SendResult(CamelModel):
    message: ChatMessage
    reply: ChatMessage | None


class ProducerSendInput(CamelModel):
    reply_to_message_id: str | None = None
    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    answer_to_escalation_ids: list[str] = Field(default_factory=list)


class SupportProducerSendInput(CamelModel):
    """생산자 farmclub 문의(DEV-209). 질문함 답변 연결이 없어 글·사진만 받는다."""

    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)


class ProducerSendResult(CamelModel):
    message: ChatMessage
    thread: ThreadView


class AiModeInput(CamelModel):
    mode: Literal["AUTO", "HUMAN"]
    version: int


class ReadInput(CamelModel):
    last_read_message_id: str


class UnreadState(CamelModel):
    unread_count: int


class SupportPage(CamelModel):
    """소비자 farmclub 문의 대화방 메시지(DEV-150). 짧아서 한 번에 내려 준다."""

    items: list[ChatMessage]
    next_cursor: str | None = None


class SupportSendInput(CamelModel):
    text: str


class MessageEditInput(CamelModel):
    text: str
    version: int = Field(ge=0)
