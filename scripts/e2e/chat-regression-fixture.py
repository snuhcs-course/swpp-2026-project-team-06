"""Guarded synthetic chat setup, diagnostics and cleanup for DEV-248/249/253."""

import base64
import json
import os
import sys
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))

from app.accounts.models import User  # noqa: F401 -- registers farms' user FK metadata
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.ids import new_id
from app.farms import service as farms
from app.farms.models import FarmAiSettings, Follow
from app.messaging import service as messaging
from app.messaging.models import (
    Escalation,
    OrderInquiry,
    PrivateAttachment,
    Thread,
    ThreadMessage,
    ThreadOrderContext,
)
from app.messaging.schemas import ProducerSendInput
from app.orders.models import Order
from PIL import Image
from sqlalchemy import delete, func, or_, select
from sqlalchemy.engine import make_url

url = make_url(os.environ["DATABASE_URL"])
assert url.host in {"localhost", "127.0.0.1"}, "Local disposable database only"
assert os.environ.get("FARMCLUB_CHAT_REGRESSION") == "1", (
    "Explicit test invocation required"
)
assert (url.database or "").startswith("farmclub_dev") or os.environ.get("CI") in {
    "true",
    "1",
}
consumer_id, farm_id = "u-seojun", "f-halla"
fields = [
    "enabled",
    "version",
    "small_order_policy",
    "reservation_shipping_policy",
    "faqs",
    "handoff_topics",
    "updated_at",
]


def thread(db):
    return db.scalar(
        select(Thread).where(
            Thread.consumer_id == consumer_id, Thread.farm_id == farm_id
        )
    )


def clear_room(db):
    current = thread(db)
    if current:
        rows = list(
            db.scalars(
                select(ThreadMessage).where(ThreadMessage.thread_id == current.id)
            )
        )
        assert all(
            not m.body
            or m.body.startswith(("DEV248", "DEV249", "DEV253", "DEV153-C01-HISTORY-"))
            for m in rows
        ), "Unexpected conversation content; refusing cleanup"
        for model in (Escalation, OrderInquiry):
            db.execute(delete(model).where(model.thread_id == current.id))
        db.execute(
            delete(PrivateAttachment).where(PrivateAttachment.thread_id == current.id)
        )
        db.execute(delete(ThreadMessage).where(ThreadMessage.thread_id == current.id))
        db.execute(delete(Thread).where(Thread.id == current.id))
    test_orders = select(Order.id).where(
        Order.consumer_id == consumer_id, Order.recipient_name.like("DEV24%")
    )
    db.execute(
        delete(PrivateAttachment).where(PrivateAttachment.order_id.in_(test_orders))
    )
    farms.set_follow(db, consumer_id, farm_id, False)


def state(db):
    current = thread(db)
    messages = (
        []
        if current is None
        else list(
            db.scalars(
                select(ThreadMessage)
                .where(ThreadMessage.thread_id == current.id)
                .order_by(ThreadMessage.seq)
            )
        )
    )
    return {
        "threadId": current.id if current else None,
        "aiMode": current.ai_mode if current else None,
        "version": current.version if current else None,
        "readId": current.consumer_last_read_message_id if current else None,
        "following": db.get(Follow, (consumer_id, farm_id)) is not None,
        "attachmentCount": db.scalar(
            select(func.count())
            .select_from(PrivateAttachment)
            .where(
                or_(
                    PrivateAttachment.thread_id == current.id if current else False,
                    PrivateAttachment.order_id.in_(
                        select(Order.id).where(
                            Order.consumer_id == consumer_id,
                            Order.recipient_name.like("DEV24%"),
                        )
                    ),
                )
            )
        ),
        "messages": [
            {
                "id": m.id,
                "sequence": m.seq,
                "orderId": m.order_id,
                "senderType": m.sender_type,
                "body": m.body,
            }
            for m in messages
        ],
        "contexts": []
        if current is None
        else list(
            db.scalars(
                select(ThreadOrderContext.order_id).where(
                    ThreadOrderContext.thread_id == current.id
                )
            )
        ),
        "inquiryCount": 0
        if current is None
        else db.scalar(
            select(func.count())
            .select_from(OrderInquiry)
            .where(OrderInquiry.thread_id == current.id)
        ),
        "escalationCount": 0
        if current is None
        else db.scalar(
            select(func.count())
            .select_from(Escalation)
            .where(Escalation.thread_id == current.id)
        ),
    }


command = sys.argv[1]
payload = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
with get_sessionmaker()() as db, db.begin():
    if command == "begin":
        clear_room(db)
        settings = db.get(FarmAiSettings, farm_id)
        original = (
            None
            if settings is None
            else {field: getattr(settings, field) for field in fields}
        )
        if original is not None:
            original["updated_at"] = original["updated_at"].isoformat()
        db.merge(
            FarmAiSettings(farm_id=farm_id, enabled=False, version=1, updated_at=now())
        )
        db.flush()
        result = {
            "originalSettings": original,
            "originalFarmStatus": farms.get_farm(db, farm_id).approval_status,
            "state": state(db),
        }
    elif command == "finish":
        from datetime import datetime

        clear_room(db)
        original = payload.get("originalSettings")
        settings = db.get(FarmAiSettings, farm_id)
        if original is None:
            if settings is not None:
                db.delete(settings)
        else:
            original["updated_at"] = datetime.fromisoformat(original["updated_at"])
            db.merge(FarmAiSettings(farm_id=farm_id, **original))
        if payload.get("originalFarmStatus"):
            farms.get_farm(db, farm_id).approval_status = payload["originalFarmStatus"]
        result = {"cleaned": True}
    elif command == "history":
        current = thread(db)
        assert current is not None
        count = int(payload["count"])
        prefix = payload.get("prefix", "DEV253-HISTORY")
        assert 0 < count <= 200 and (
            prefix.startswith("DEV253") or prefix == "DEV153-C01-HISTORY"
        )
        for index in range(1, count + 1):
            db.add(
                ThreadMessage(
                    id=new_id("m"),
                    thread_id=current.id,
                    sender_type="CONSUMER",
                    body=f"{prefix}-{index:02}",
                    photos=[],
                    attachment_ids=[],
                    source_refs=[],
                    masked=False,
                    needs_human=True,
                    created_at=now(),
                )
            )
        db.flush()
        result = state(db)
    elif command == "append":
        current = thread(db)
        assert current is not None and payload["text"].startswith("DEV253")
        farm = farms.get_farm(db, farm_id)
        outcome = messaging.producer_send(
            db, farm, consumer_id, ProducerSendInput(text=payload["text"])
        )
        result = {"messageId": outcome.message.message_id}
    elif command == "inspect":
        result = state(db)
    elif command == "clear_history":
        current = thread(db)
        assert current is not None
        messages = list(
            db.scalars(
                select(ThreadMessage).where(ThreadMessage.thread_id == current.id)
            )
        )
        assert all(
            m.body.startswith("DEV253") and not m.attachment_ids and not m.inquiry_id
            for m in messages
        )
        db.execute(delete(ThreadMessage).where(ThreadMessage.thread_id == current.id))
        current.consumer_last_read_message_id = None
        current.producer_last_read_message_id = None
        db.flush()
        result = state(db)
    elif command == "approval":
        assert payload["status"] in {"APPROVED", "SUSPENDED"}
        farms.get_farm(db, farm_id).approval_status = payload["status"]
        result = {"status": payload["status"]}
    elif command == "remove_message":
        current = thread(db)
        message = db.get(ThreadMessage, payload["messageId"])
        assert current is not None and message is not None
        assert message.thread_id == current.id and message.body.startswith("DEV253")
        assert not message.attachment_ids and not message.inquiry_id
        db.delete(message)
        db.flush()
        result = state(db)
    elif command in {"image", "photo"}:
        output = BytesIO()
        Image.new("RGB", (2, 2), "orange").save(output, format="PNG")
        data = output.getvalue()
        result = {"base64": base64.b64encode(data).decode()}
        if command == "photo":
            current = thread(db)
            message = db.get(ThreadMessage, payload["messageId"])
            assert current is not None and message is not None
            assert message.thread_id == current.id and message.body.startswith("DEV253")
            attachment = PrivateAttachment(
                id=new_id("att"),
                uploader_id=consumer_id,
                thread_id=current.id,
                mime_type="image/png",
                size=len(data),
                data=data,
                bound=True,
                created_at=now(),
            )
            db.add(attachment)
            message.attachment_ids = [*message.attachment_ids, attachment.id]
            db.flush()
            result = {"attachmentId": attachment.id, "messageId": message.id}
    else:
        raise ValueError("Unknown fixture command")
print(json.dumps(result, ensure_ascii=False))
