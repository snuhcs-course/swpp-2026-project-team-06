"""멱등 키 (screens.md 7.1). 같은 (사용자, 범위, 키)면 처음 결과를 돌려준다(24시간)."""

import hashlib
import json
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from fastapi.encoders import jsonable_encoder
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import now
from app.core.errors import ApiError, conflict, invalid
from app.core.models import IdempotencyRecord

TTL = timedelta(hours=24)


def _hash(body: Any) -> str:
    raw = json.dumps(jsonable_encoder(body), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


def run_idempotent(
    db: Session,
    user_id: str,
    scope: str,
    key: str | None,
    body: Any,
    run: Callable[[], Any],
) -> Any:
    """run()의 결과(성공 또는 409)를 키와 함께 저장한다. run()은 커밋하지 않는다."""
    if not key or len(key) > 128:
        raise invalid({"Idempotency-Key": "Idempotency-Key 헤더가 필요해요"})
    body_hash = _hash(body)
    db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.created_at < now() - TTL))
    found = db.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.scope == scope,
            IdempotencyRecord.key == key,
        )
    )
    if found is not None:
        if found.body_hash != body_hash:
            raise conflict("IDEMPOTENCY_MISMATCH", "같은 요청 키에 다른 내용이 왔어요.")
        if found.status_code != 200:
            body_ = found.response
            raise ApiError(found.status_code, body_["code"], body_["message"], body_["details"])
        return found.response

    try:
        result = jsonable_encoder(run(), by_alias=True)
        status, stored = 200, result
    except ApiError as exc:
        if exc.status != 409:
            db.rollback()
            raise
        db.rollback()
        status = exc.status
        stored = {"code": exc.code, "message": exc.message, "details": exc.details}
        result = exc
    db.add(
        IdempotencyRecord(
            user_id=user_id,
            scope=scope,
            key=key,
            body_hash=body_hash,
            status_code=status,
            response=stored,
            created_at=now(),
        )
    )
    try:
        db.commit()
    except IntegrityError:
        # 같은 키가 동시에 들어왔다. 먼저 저장된 결과를 돌려준다.
        db.rollback()
        return run_idempotent(db, user_id, scope, key, body, lambda: None)
    if isinstance(result, ApiError):
        raise result
    return result
