"""messaging 모듈 Pydantic 입출력 스키마 (screens.md 7.2 messaging, contracts-1.2 4장)."""

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.core.schemas import CamelModel

SenderType = Literal["CONSUMER", "PRODUCER", "AI"]


class NewsItem(CamelModel):
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
    photos: list[str] = Field(default_factory=list)
    videos: list[str] = Field(default_factory=list)
    visibility: Literal["PUBLIC", "FOLLOWERS"] = "FOLLOWERS"


class NewsPosted(CamelModel):
    broadcast_id: str
    created_at: datetime
    recipient_count: int


class ReactionState(CamelModel):
    reaction_count: int
    my_reaction: bool


class NewsRoomSummary(CamelModel):
    farm_id: str
    farm_name: str
    farm_photo: str | None
    last_message: str | None
    last_at: datetime | None


class NewsRoomMessage(CamelModel):
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


class NewsRoomPage(CamelModel):
    room: NewsRoomSummary
    items: list[NewsRoomMessage]
    next_cursor: str | None


class TextInput(CamelModel):
    text: str = ""


class ChatMessage(CamelModel):
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


class ThreadView(CamelModel):
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


class ChatPage(CamelModel):
    items: list[ChatMessage]
    next_cursor: str | None
    thread: ThreadView
    inquiries: list[InquiryView]
    orders: list[LinkedOrder]
    escalations: list[EscalationView] | None = None


class ChatSummary(CamelModel):
    farm_id: str
    farm_name: str
    farm_photo: str | None
    last_message: str
    last_sender_type: SenderType
    last_at: datetime | None
    unread_count: int


class ProducerChatSummary(CamelModel):
    thread_id: str
    consumer_id: str
    consumer_name: str
    last_message: str
    last_at: datetime | None
    unread_count: int
    needs_reply: bool
    ai_mode: Literal["AUTO", "HUMAN"]


class StartChatInput(CamelModel):
    farm_id: str


class StartChatResult(CamelModel):
    farm_id: str
    auto_followed: bool


class ProducerStartInput(CamelModel):
    consumer_id: str
    room_reply_id: str | None = None


class SendInput(CamelModel):
    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    order_id: str | None = None


class SendResult(CamelModel):
    message: ChatMessage
    reply: ChatMessage | None


class ProducerSendInput(CamelModel):
    text: str = ""
    attachment_ids: list[str] = Field(default_factory=list)
    answer_to_escalation_ids: list[str] = Field(default_factory=list)


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
