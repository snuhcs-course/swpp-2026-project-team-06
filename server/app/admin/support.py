"""관리자 페이지 문의함(DEV-111·DEV-150, FEAT-34): farmclub 대화방을 보고 운영팀으로 답한다.

생산자 방은 /admin/support/{farmId}, 소비자 방은 /admin/support/consumers/{userId} 아래에 있다.

답장은 run_manager_action으로 운영자 감사 기록과 멱등 키를 남긴다. 읽음 표시는 기록하지 않는다.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.admin.schemas import (
    SupportReadInput,
    SupportReadResult,
    SupportSendInput,
    SupportThreadPage,
    SupportThreadView,
)
from app.admin.service import run_manager_action
from app.core.db import get_db
from app.core.security import Admin
from app.messaging import support
from app.messaging.schemas import ChatMessage

router = APIRouter(prefix="/admin/support", tags=["admin"])
Db = Annotated[Session, Depends(get_db)]
IdempotencyKey = Annotated[str | None, Header(alias="Idempotency-Key")]


@router.get("", response_model=list[SupportThreadView])
def list_threads(db: Db, _: Admin):
    return support.inbox(db)


@router.get("/{farm_id}/messages", response_model=SupportThreadPage)
def thread_messages(db: Db, _: Admin, farm_id: str):
    return support.thread_page(db, farm_id)


@router.post("/{farm_id}/messages", response_model=ChatMessage)
def reply(db: Db, admin: Admin, farm_id: str, body: SupportSendInput, key: IdempotencyKey = None):
    return run_manager_action(
        db,
        actor_id=admin.id,
        action="support.reply",
        target_type="farm",
        target_id=farm_id,
        scope=f"support-reply:{farm_id}",
        key=key,
        body={"text": body.text},
        run=lambda _: support.operator_send(db, farm_id, body.text),
    )


@router.post("/{farm_id}/read", response_model=SupportReadResult)
def read(db: Db, _: Admin, farm_id: str, body: SupportReadInput):
    unread = support.operator_read(db, farm_id, body.message_id)
    db.commit()
    return SupportReadResult(unread_count=unread)


# ---------------- 소비자 문의 대화방(DEV-150) ----------------


@router.get("/consumers/{user_id}/messages", response_model=SupportThreadPage)
def consumer_messages(db: Db, _: Admin, user_id: str):
    return support.consumer_thread_page(db, user_id)


@router.post("/consumers/{user_id}/messages", response_model=ChatMessage)
def consumer_reply(
    db: Db, admin: Admin, user_id: str, body: SupportSendInput, key: IdempotencyKey = None
):
    return run_manager_action(
        db,
        actor_id=admin.id,
        action="support.reply",
        target_type="user",
        target_id=user_id,
        scope=f"support-reply-user:{user_id}",
        key=key,
        body={"text": body.text},
        run=lambda _: support.operator_send_consumer(db, user_id, body.text),
    )


@router.post("/consumers/{user_id}/read", response_model=SupportReadResult)
def consumer_read(db: Db, _: Admin, user_id: str, body: SupportReadInput):
    unread = support.operator_read_consumer(db, user_id, body.message_id)
    db.commit()
    return SupportReadResult(unread_count=unread)
