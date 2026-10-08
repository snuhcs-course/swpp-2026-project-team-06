"""messaging 모듈 모델: 소식·좋아요, 소식방 답장, 1:1 대화, 전달 질문 (contracts-1.2 4장)."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Identity,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Broadcast(Base):
    """화면 이름은 '소식'. visibility는 PUBLIC · FOLLOWERS(M-14)."""

    __tablename__ = "broadcasts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    videos: Mapped[list[str]] = mapped_column(JSON, default=list, server_default=text("'[]'"))
    visibility: Mapped[str] = mapped_column(String(16))
    # 좋아요 수. 좋아요 켬·끔 때 같은 트랜잭션에서 바꾼다.
    reaction_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Reaction(Base):
    """좋아요. 한 사람이 한 소식에 한 번(FEAT-15)."""

    __tablename__ = "reactions"

    broadcast_id: Mapped[str] = mapped_column(ForeignKey("broadcasts.id"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class RoomReply(Base):
    """소식방의 소비자 비공개 답장. 본인과 그 농가만 본다(M-19). AI는 답하지 않는다."""

    __tablename__ = "room_replies"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Thread(Base):
    """1:1 대화. (농가, 소비자)당 하나. version은 AI 모드가 실제로 바뀔 때만 올린다."""

    __tablename__ = "threads"
    __table_args__ = (UniqueConstraint("farm_id", "consumer_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    farm_id: Mapped[str] = mapped_column(ForeignKey("farms.id"), index=True)
    consumer_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    # AUTO · HUMAN
    ai_mode: Mapped[str] = mapped_column(String(8), default="AUTO")
    version: Mapped[int] = mapped_column(Integer, default=1)
    consumer_last_read_message_id: Mapped[str | None] = mapped_column(String(64))
    producer_last_read_message_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ThreadMessage(Base):
    """1:1 대화의 메시지. senderType은 CONSUMER · PRODUCER · AI(M-08)."""

    __tablename__ = "thread_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # 같은 시각에 저장된 질문과 AI 답의 순서를 지키는 일련번호
    seq: Mapped[int] = mapped_column(BigInteger, Identity(), unique=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id"), index=True)
    sender_type: Mapped[str] = mapped_column(String(16))
    body: Mapped[str] = mapped_column(Text, default="")
    photos: Mapped[list[str]] = mapped_column(JSON, default=list)
    attachment_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    order_id: Mapped[str | None] = mapped_column(String(64))
    inquiry_id: Mapped[str | None] = mapped_column(String(64))
    source_summary: Mapped[str | None] = mapped_column(Text)
    source_refs: Mapped[list[str]] = mapped_column(JSON, default=list)
    settings_version: Mapped[int | None] = mapped_column(Integer)
    handoff_status: Mapped[str | None] = mapped_column(String(16))
    masked: Mapped[bool] = mapped_column(Boolean, default=False)
    # 받을 때 HUMAN 또는 농가 AI OFF였으면 직접 응대 대상(contracts-1.2 4장)
    needs_human: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Escalation(Base):
    """AI가 답하지 않고 농가에 넘긴 질문(전달, M-06·M-07)."""

    __tablename__ = "escalations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id"), index=True)
    thread_message_id: Mapped[str | None] = mapped_column(ForeignKey("thread_messages.id"))
    context: Mapped[str | None] = mapped_column(String(200))
    question: Mapped[str] = mapped_column(Text)
    reason: Mapped[str] = mapped_column(String(200))
    # OPEN · ANSWERED
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    answer: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PrivateAttachment(Base):
    """주문 문의·1:1 대화의 비공개 사진(contracts-1.2 6장). 공개 소식 미디어와 분리한다.

    I1은 바이트를 DB에 둔다. 업로더만 보는 임시 파일은 접수·전송에 성공하면 자원에 묶인다.
    """

    __tablename__ = "private_attachments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    uploader_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    order_id: Mapped[str | None] = mapped_column(String(64))
    thread_id: Mapped[str | None] = mapped_column(String(64))
    mime_type: Mapped[str] = mapped_column(String(32))
    size: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(LargeBinary)
    bound: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class OrderInquiry(Base):
    """주문 문제 문의(FEAT-33). RESOLVED는 대화 처리 표시일 뿐 환불·보상 승인이 아니다(M-21)."""

    __tablename__ = "order_inquiries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"), index=True)
    thread_id: Mapped[str] = mapped_column(ForeignKey("threads.id"), index=True)
    message_id: Mapped[str] = mapped_column(ForeignKey("thread_messages.id"))
    # DAMAGE · CONDITION · TASTE · OTHER
    type: Mapped[str] = mapped_column(String(16))
    text: Mapped[str] = mapped_column(Text)
    attachment_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    # OPEN · RESOLVED
    status: Mapped[str] = mapped_column(String(16), default="OPEN")
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
