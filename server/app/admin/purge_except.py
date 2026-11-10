"""고른 생산자와 운영자 계정만 남기고 운영 데이터를 지운다(DEV-304, UAT 준비).

실행: uv run python -m app.admin.purge_except --keep <user id> [--keep <user id> …]
      [--expect-farm <farm id> …] [--backup-done --commit]
기본은 미리보기다. 한 트랜잭션에서 지운 뒤 되돌리고, 표별 삭제·유지 건수와 남는 사용자·농가·
상품, 지울 저장소 키 수를 보여 주고, 마지막 줄에 그대로 복사할 커밋 명령을 출력한다.
--commit을 붙여야 남긴다.

--commit에는 두 가지가 더 필요하다(DEV-310, 11/11 --keep 오타로 남길 농가가 지워진 사고).
- --expect-farm <farm id>: 남을 농가를 직접 한 번 더 적는다. --keep 생산자의 농가 집합과
  정확히 같아야 한다. 다르거나 없으면 두 집합을 보여 주고 아무것도 지우지 않는다.
  미리보기에서도 받는다(같은 검사, 필수 아님).
- --backup-done: Railway Postgres 수동 백업 스냅샷을 만들어 끝까지 기다렸다는 사람의 확인.

남기는 것:
- role=ADMIN 사용자 전부(u-admin = 관리자 웹 토큰 주인, u-farmclub = 문의 상대).
- --keep 생산자와 그 농가, 농가의 상품·초안·옵션·기간·가격·배정·공급 요청, AI 설정·이력, 소식,
  생산자 문의방(thread-support-<farmId>)과 메시지·그 메시지의 첨부,
  농가 공개 미디어와 source_* 자료.
- 남는 사용자의 운영자 문의 대화(support_threads·support_messages).
- 남는 농가·사용자·상품을 대상으로 한 manager_events와 producer_decisions(정지·승인 이력 = 로그).
  이벤트 결과 JSON에 지운 주문 ID가 남을 수 있다(예: orders.harvest_started의 orderIds).
  로그라 그대로 둔다.
- ai_usage·source_spend(사용자 ID 없는 비용 장부).
그 밖의 행은 모두 지운다. 주문·결제·환불·주문 문의는 전부 지운다(실거래 없음, DEV-302).

표마다 남기는 조건을 RULES에 적는다. 규칙 없는 표가 생기면 실행을 거부한다.
--keep 대상이 PRODUCER가 아니거나 탈퇴했거나 농가가 없으면 아무것도 지우지 않는다.
남는 행이 지우는 사용자를 NOT NULL FK로 가리키거나 다른 농가의 미디어 URL을 쓰면 거부한다.

DEV-93에서 되돌린 FK 따라가기 삭제(커밋 929225b)는 지울 집합을 모았다. 이 명령은 반대로
남길 집합을 정하고 나머지를 지운다. 실사용자 생산자만 고르게 해 그때 문제(실사용자 행 삭제,
첨부·R2 누락)를 피한다.
"""

import json
import re
import shlex
import sys
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy import (
    ColumnElement,
    Table,
    Text,
    case,
    cast,
    delete,
    false,
    func,
    select,
    text,
    true,
    update,
)
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

# 모든 모듈의 모델을 Base.metadata에 올린다(migrations/env.py와 같은 목록).
# 빠지면 RULES 검사가 그 표를 못 본다
from app.accounts import models as _accounts_models  # noqa: F401
from app.admin import models as _admin_models  # noqa: F401
from app.ai import models as _ai_models  # noqa: F401
from app.analytics import models as _analytics_models  # noqa: F401
from app.catalog import models as _catalog_models  # noqa: F401
from app.core import models as _core_models  # noqa: F401
from app.core.clock import now
from app.core.config import get_settings
from app.core.db import Base, get_sessionmaker
from app.core.ids import new_id
from app.farms import models as _farms_models  # noqa: F401
from app.media import models as _media_models  # noqa: F401
from app.messaging import models as _messaging_models  # noqa: F401
from app.orders import models as _orders_models  # noqa: F401
from app.source_analysis import models as _source_models  # noqa: F401

EVENT_TYPE = "data.purge_except"
LOCK_TIMEOUT = "5s"
MEDIA_URL = re.compile(r"/api/media/([A-Za-z0-9_-]+)\.")
SOURCE_MEDIA_URL = re.compile(r"/api/source-media/([A-Za-z0-9_-]+)")
USAGE = (
    "사용법: python -m app.admin.purge_except --keep <user id> [--keep <user id> …] "
    "[--expect-farm <farm id> …] [--backup-done --commit]"
)
# 운영 runbook이 실행하는 형태. 미리보기 마지막 줄의 커밋 명령이 이것으로 시작한다
COMMAND = "railway ssh --service farmclub-api -- .venv/bin/python -m app.admin.purge_except"
BACKUP_STEP = (
    "Railway 대시보드 → Postgres 서비스 → Backups → 수동 스냅샷을 만들고 완료될 때까지 기다리세요."
)
BACKUP_HINT = f"--commit 전에 백업이 필요해요. {BACKUP_STEP} 그 뒤 --backup-done을 붙이세요."
# 터미널·메모 앱의 자동 고침이 --를 바꾼 문자(em dash, en dash)
AUTOCORRECTED_DASHES = ("\u2014", "\u2013")


class PurgeRefused(Exception):
    pass


@dataclass
class Keep:
    """남길 ID 집합. 값은 지우기 전에 한 번 정한다."""

    users: set[str]
    farms: set[str]
    products: set[str]
    threads: set[str]
    broadcasts: set[str]
    replies: set[str]
    messages: set[str]
    attachments: set[str]
    support_threads: set[str]
    batches: set[str]
    events: set[str]


@dataclass
class Args:
    keep: list[str]
    commit: bool = False
    expect_farms: list[str] = field(default_factory=list)
    backup_done: bool = False


@dataclass
class Report:
    keep: list[str]
    expect_farms: list[str] = field(default_factory=list)
    # 지우기 전에 정한 남는 농가: (농가 ID, 이름, 생산자 ID)
    kept_farms: list[tuple[str, str, str]] = field(default_factory=list)
    # 지워질 농가: (농가 ID, 이름, 생산자 ID). 남아야 할 농가가 여기 있으면 --keep이 틀린 것이다
    deleted_farms: list[tuple[str, str, str]] = field(default_factory=list)
    users: list[tuple[str, str, str]] = field(default_factory=list)
    farms: list[tuple[str, str, str]] = field(default_factory=list)
    products: list[tuple[str, str, str, str]] = field(default_factory=list)
    # 표 이름 → (지운 수, 남은 수)
    tables: dict[str, tuple[int, int]] = field(default_factory=dict)
    nulled: dict[str, int] = field(default_factory=dict)
    storage_keys: list[str] = field(default_factory=list)
    committed: bool = False


def _t(name: str) -> Table:
    return Base.metadata.tables[name]


def _in(column, values: set[str]) -> ColumnElement[bool]:
    return column.in_(sorted(values))


# 표 이름 → 남길 행 조건. 조건이 NULL이면 지운다(_run의 CASE가 NULL을 거짓으로 본다).
Rule = Callable[[Keep], ColumnElement[bool]]
RULES: dict[str, Rule] = {
    # 비용 장부. 사용자 ID가 없다
    "ai_usage": lambda k: true(),
    "source_spend": lambda k: true(),
    "users": lambda k: _in(_t("users").c.id, k.users),
    # 저장한 응답(JSON)에 지울 소비자 정보가 들어 있을 수 있다. 재시도 재생용이라 전부 지운다
    "idempotency_records": lambda k: false(),
    "notice_reads": lambda k: _in(_t("notice_reads").c.user_id, k.users),
    "shipping_addresses": lambda k: _in(_t("shipping_addresses").c.user_id, k.users),
    "user_consents": lambda k: _in(_t("user_consents").c.user_id, k.users),
    "support_threads": lambda k: _in(_t("support_threads").c.id, k.support_threads),
    "support_messages": lambda k: _in(_t("support_messages").c.thread_id, k.support_threads),
    "manager_events": lambda k: _in(_t("manager_events").c.id, k.events),
    "farms": lambda k: _in(_t("farms").c.id, k.farms),
    "farm_ai_settings": lambda k: _in(_t("farm_ai_settings").c.farm_id, k.farms),
    "farm_ai_settings_history": lambda k: _in(_t("farm_ai_settings_history").c.farm_id, k.farms),
    "producer_decisions": lambda k: _in(_t("producer_decisions").c.farm_id, k.farms),
    "follows": lambda k: (
        _in(_t("follows").c.farm_id, k.farms) & _in(_t("follows").c.consumer_id, k.users)
    ),
    "public_media": lambda k: (
        _in(_t("public_media").c.farm_id, k.farms) & _in(_t("public_media").c.uploader_id, k.users)
    ),
    "broadcasts": lambda k: _in(_t("broadcasts").c.id, k.broadcasts),
    "reactions": lambda k: (
        _in(_t("reactions").c.broadcast_id, k.broadcasts) & _in(_t("reactions").c.user_id, k.users)
    ),
    "room_replies": lambda k: _in(_t("room_replies").c.id, k.replies),
    "room_reads": lambda k: (
        _in(_t("room_reads").c.farm_id, k.farms) & _in(_t("room_reads").c.consumer_id, k.users)
    ),
    "threads": lambda k: _in(_t("threads").c.id, k.threads),
    "thread_messages": lambda k: _in(_t("thread_messages").c.id, k.messages),
    "escalations": lambda k: _in(_t("escalations").c.thread_id, k.threads),
    "private_attachments": lambda k: _in(_t("private_attachments").c.id, k.attachments),
    "products": lambda k: _in(_t("products").c.id, k.products),
    "product_drafts": lambda k: _in(_t("product_drafts").c.farm_id, k.farms),
    "product_options": lambda k: _in(_t("product_options").c.product_id, k.products),
    "capacity_requests": lambda k: _in(_t("capacity_requests").c.product_id, k.products),
    "stages": lambda k: _in(_t("stages").c.product_id, k.products),
    "stage_prices": lambda k: _in(_t("stage_prices").c.product_id, k.products),
    "stage_allocations": lambda k: _in(_t("stage_allocations").c.product_id, k.products),
    # 주문 쪽은 전부 지운다(실거래 없음). 남는 사용자는 생산자·운영자뿐이다
    "orders": lambda k: false(),
    "payments": lambda k: false(),
    "refunds": lambda k: false(),
    "order_inquiries": lambda k: false(),
    "thread_order_contexts": lambda k: false(),
    "source_batches": lambda k: _in(_t("source_batches").c.id, k.batches),
    "source_requests": lambda k: _in(_t("source_requests").c.farm_id, k.farms),
    "source_assets": lambda k: _in(_t("source_assets").c.batch_id, k.batches),
    "source_runs": lambda k: _in(_t("source_runs").c.batch_id, k.batches),
    "source_drafts": lambda k: _in(_t("source_drafts").c.batch_id, k.batches),
    "source_reviewed_fields": lambda k: _in(_t("source_reviewed_fields").c.batch_id, k.batches),
    "source_candidates": lambda k: _in(_t("source_candidates").c.batch_id, k.batches),
    "source_items": lambda k: _t("source_items").c.run_id.in_(
        select(_t("source_runs").c.id).where(_in(_t("source_runs").c.batch_id, k.batches))
    ),
    "source_pages": lambda k: _t("source_pages").c.asset_id.in_(
        select(_t("source_assets").c.id).where(_in(_t("source_assets").c.batch_id, k.batches))
    ),
    "source_public_photos": lambda k: _in(_t("source_public_photos").c.product_id, k.products),
    "source_product_workspaces": lambda k: (
        _in(_t("source_product_workspaces").c.product_id, k.products)
        & _in(_t("source_product_workspaces").c.batch_id, k.batches)
    ),
}

# 지운 행의 저장소 파일 키. 같은 키를 남은 행이 쓰면 지우지 않는다
STORAGE_COLUMNS = (
    ("public_media", ("storage_key",)),
    ("source_assets", ("storage_key",)),
    ("source_pages", ("image_key", "sanitized_key")),
    ("source_public_photos", ("storage_key",)),
)
# 남는 행이 공개 미디어 URL을 담을 수 있는 표
# (농가 사진·상세, 상품 사진·상세, 초안, 소식, 답장, 문의방 메시지, AI 설정 FAQ와 이력,
#  운영자 문의 대화, 자료 분석 초안·검토 값·상품 작업 스냅샷)
MEDIA_REFERENCING = (
    "farms",
    "farm_ai_settings",
    "farm_ai_settings_history",
    "support_messages",
    "products",
    "product_drafts",
    "broadcasts",
    "room_replies",
    "thread_messages",
    "source_drafts",
    "source_reviewed_fields",
    "source_product_workspaces",
)


def _ids(session: Session, statement) -> set[str]:
    return set(session.scalars(statement))


def check_keep(session: Session, keep_ids: list[str]) -> None:
    """--keep 대상을 검사한다. 하나라도 어기면 PurgeRefused."""
    if not keep_ids:
        raise PurgeRefused("--keep으로 남길 생산자를 한 명 이상 고르세요.")
    users, farms = _t("users"), _t("farms")
    for user_id in keep_ids:
        user = session.execute(select(users).where(users.c.id == user_id)).mappings().first()
        if user is None:
            raise PurgeRefused(f"{user_id} 사용자가 없어요.")
        if user["role"] != "PRODUCER":
            raise PurgeRefused(f"{user_id}는 생산자가 아니에요: {user['role']}")
        if user["deleted_at"] is not None:
            raise PurgeRefused(f"{user_id}는 탈퇴한 계정이에요.")
        if session.scalar(select(farms.c.id).where(farms.c.producer_id == user_id)) is None:
            raise PurgeRefused(f"{user_id}는 농가가 없어요.")
    missing = set(Base.metadata.tables) - set(RULES)
    if missing:
        raise PurgeRefused(f"남길 조건이 없는 표가 있어요(RULES에 추가): {sorted(missing)}")


def kept_farms(session: Session, keep_ids: list[str]) -> list[tuple[str, str, str]]:
    """--keep 생산자가 가진 농가 (ID, 이름, 생산자 ID). 남는 농가는 정확히 이것이다."""
    farms = _t("farms")
    return [
        tuple(r)
        for r in session.execute(
            select(farms.c.id, farms.c.name, farms.c.producer_id)
            .where(_in(farms.c.producer_id, set(keep_ids)))
            .order_by(farms.c.id)
        )
    ]


def check_guards(
    farms: list[tuple[str, str, str]],
    expect_farms: list[str],
    commit: bool,
    backup_done: bool,
) -> None:
    """--expect-farm 집합과 --backup-done을 검사한다. 문제를 모두 모아 PurgeRefused 하나로."""
    problems: list[str] = []
    actual = {farm_id for farm_id, _, _ in farms}
    expected = set(expect_farms)
    if commit and not expected:
        problems.append(
            "--commit에는 남을 농가를 --expect-farm <farmId>로 모두 적어야 해요"
            "(--keep 오타를 막아요). 미리보기 마지막 줄을 그대로 복사해 실행하세요."
        )
    elif expected and expected != actual:
        problems.append("--expect-farm 농가와 --keep 생산자의 농가가 달라요.")
        if expected - actual:
            gone = sorted(expected - actual)
            problems.append(f"  지워질 농가(--expect-farm에만 있음): {gone}")
        if actual - expected:
            extra = sorted(actual - expected)
            problems.append(f"  더 남을 농가(--keep 생산자 것): {extra}")
    if problems:
        problems.append(f"  --expect-farm: {sorted(expected) or '(없음)'}")
        problems.append("  --keep 생산자의 농가:")
        problems.extend(f"    {fid} {name} (생산자 {pid})" for fid, name, pid in farms)
    if commit and not backup_done:
        problems.append(BACKUP_HINT)
    if problems:
        raise PurgeRefused("\n".join(problems))


def _keep_events(session: Session, keep: Keep, stages: set[str]) -> set[str]:
    """manager_events.target_id는 FK가 없는 문자열이라 대상 종류별로 본다."""
    events = _t("manager_events")
    kept = set()
    for event_id, target_type, target_id in session.execute(
        select(events.c.id, events.c.target_type, events.c.target_id)
    ):
        if target_type == "capacity_request":
            # target_id = "<productId>:<requestId>"
            target_id = target_id.split(":", 1)[0]
            target_type = "product"
        targets = {
            "farm": keep.farms,
            "user": keep.users,
            "product": keep.products,
            "stage": stages,
            "thread": keep.threads,
            # system 대상 이벤트는 이 명령 것뿐이다. 새 system 이벤트를 만들면 여기에 더한다
            "system": {"purge_except"},
        }.get(target_type, set())
        if target_id in targets:
            kept.add(event_id)
    return kept


def _collect(session: Session, keep_ids: list[str]) -> Keep:
    t = Base.metadata.tables
    producers = set(keep_ids)
    admins = _ids(session, select(t["users"].c.id).where(t["users"].c.role == "ADMIN"))
    users = admins | producers
    farms = _ids(session, select(t["farms"].c.id).where(_in(t["farms"].c.producer_id, producers)))
    products = _ids(session, select(t["products"].c.id).where(_in(t["products"].c.farm_id, farms)))
    stages = _ids(session, select(t["stages"].c.id).where(_in(t["stages"].c.product_id, products)))
    threads = _ids(
        session,
        select(t["threads"].c.id).where(
            # 생산자 문의방만 남긴다(상대가 운영팀 계정). 남는 생산자끼리의 대화도 지운다
            _in(t["threads"].c.farm_id, farms),
            _in(t["threads"].c.consumer_id, admins),
        ),
    )
    messages = _ids(
        session,
        select(t["thread_messages"].c.id).where(_in(t["thread_messages"].c.thread_id, threads)),
    )
    referenced: set[str] = set()
    for ids in session.scalars(
        select(t["thread_messages"].c.attachment_ids).where(
            _in(t["thread_messages"].c.thread_id, threads)
        )
    ):
        referenced.update(ids or [])
    attachments = t["private_attachments"]
    kept_attachments = _ids(
        session,
        select(attachments.c.id).where(
            _in(attachments.c.uploader_id, users),
            _in(attachments.c.id, referenced) | _in(attachments.c.thread_id, threads),
        ),
    )
    replies = t["room_replies"]
    keep = Keep(
        users=users,
        farms=farms,
        products=products,
        threads=threads,
        broadcasts=_ids(
            session, select(t["broadcasts"].c.id).where(_in(t["broadcasts"].c.farm_id, farms))
        ),
        replies=_ids(
            session,
            select(replies.c.id).where(
                _in(replies.c.farm_id, farms), _in(replies.c.consumer_id, users)
            ),
        ),
        messages=messages,
        attachments=kept_attachments,
        support_threads=_ids(
            session,
            select(t["support_threads"].c.id).where(_in(t["support_threads"].c.user_id, users)),
        ),
        batches=_ids(
            session,
            select(t["source_batches"].c.id).where(_in(t["source_batches"].c.farm_id, farms)),
        ),
        events=set(),
    )
    keep.events = _keep_events(session, keep, stages)
    return keep


def _check_kept_rows(session: Session, keep: Keep) -> None:
    """지우면 깨지는 남는 행이 있으면 거부한다. 추측해 고치지 않는다."""
    t = Base.metadata.tables
    for table, column in (
        ("producer_decisions", "manager_id"),
        ("farm_ai_settings_history", "saved_by"),
    ):
        tbl = t[table]
        bad = _ids(
            session,
            select(tbl.c[column]).where(
                _in(tbl.c.farm_id, keep.farms), ~_in(tbl.c[column], keep.users)
            ),
        )
        if bad:
            raise PurgeRefused(f"남는 {table}.{column}가 지울 사용자를 가리켜요: {sorted(bad)}")
    media = t["public_media"]
    kept_media = _ids(
        session,
        select(media.c.id).where(
            _in(media.c.farm_id, keep.farms), _in(media.c.uploader_id, keep.users)
        ),
    )
    referenced: set[str] = set()
    referenced_photos: set[str] = set()
    for table in MEDIA_REFERENCING:
        for row in session.execute(select(t[table]).where(RULES[table](keep))).mappings():
            dumped = json.dumps(dict(row), default=str)
            referenced.update(MEDIA_URL.findall(dumped))
            referenced_photos.update(SOURCE_MEDIA_URL.findall(dumped))
    lost = _ids(session, select(media.c.id).where(_in(media.c.id, referenced - kept_media)))
    # 자료 분석 상품 사진(/api/source-media/<id>)은 상품 단위로 남는다
    photos = t["source_public_photos"]
    lost |= _ids(
        session,
        select(photos.c.id).where(
            _in(photos.c.id, referenced_photos), ~RULES["source_public_photos"](keep)
        ),
    )
    if lost:
        raise PurgeRefused(f"남는 농가·상품·소식이 지울 공개 미디어를 써요: {sorted(lost)}")


def _null_dangling(session: Session, keep: Keep) -> dict[str, int]:
    """남는 행에서 지울 행을 가리키는 nullable 열을 비운다. 열 이름 → 바뀐 행 수."""
    t = Base.metadata.tables
    counts: dict[str, int] = {}

    def null(table: str, column: str, kept: set[str] | None, *also: str) -> None:
        # 남는 행만 고친다(지울 행까지 세면 미리보기 숫자가 부풀려진다)
        tbl = t[table]
        col = tbl.c[column]
        where = RULES[table](keep) & col.is_not(None)
        if kept is not None:
            where = where & ~_in(col, kept)
        values = {column: None} | {name: None for name in also}
        result = session.execute(update(tbl).where(where).values(values))
        if result.rowcount:
            counts[f"{table}.{column}"] = result.rowcount

    for column in ("actor_id", "last_retried_by", "resolved_by"):
        null("manager_events", column, keep.users)
    null("capacity_requests", "decided_by", keep.users)
    null("escalations", "resolved_by", keep.users)
    # 지운 답장을 인용한 소식은 인용 ID와 답장 본문 스냅샷(reply_to)을 함께 비운다
    null("broadcasts", "quoted_reply_id", keep.replies, "reply_to")
    # 0030~0031 사이 인용 소식은 quoted_reply_id 없이 스냅샷만 있다. 인용 대상은 늘 소비자 답장이고
    # 소비자는 남지 않으므로 그 스냅샷도 비운다
    broadcasts = t["broadcasts"]
    legacy = session.execute(
        update(broadcasts)
        .where(
            RULES["broadcasts"](keep),
            broadcasts.c.quoted_reply_id.is_(None),
            func.coalesce(cast(broadcasts.c.reply_to, Text), "null") != "null",
        )
        .values(reply_to=None)
    )
    if legacy.rowcount:
        counts["broadcasts.reply_to"] = legacy.rowcount
    null("thread_messages", "reply_to_message_id", keep.messages)
    # 주문·주문 문의는 전부 지운다
    null("thread_messages", "order_id", None)
    null("thread_messages", "inquiry_id", None)
    null("private_attachments", "order_id", None)
    # 남는 메시지가 지울 방의 첨부를 가리키면 첨부는 남기고 방 ID만 비운다(FK 없음)
    null("private_attachments", "thread_id", keep.threads)

    messages = t["thread_messages"]
    changed = 0
    for message_id, ids in session.execute(
        select(messages.c.id, messages.c.attachment_ids).where(_in(messages.c.id, keep.messages))
    ):
        left = [i for i in ids or [] if i in keep.attachments]
        if left != list(ids or []):
            session.execute(
                update(messages).where(messages.c.id == message_id).values(attachment_ids=left)
            )
            changed += 1
    if changed:
        counts["thread_messages.attachment_ids"] = changed
    return counts


def _storage_keys(session: Session) -> set[str]:
    """아직 저장소에 있는 파일 키. status=DELETED 자료는 워커 cleanup()이 이미 파일을 지웠다."""
    keys: set[str] = set()
    for table, columns in STORAGE_COLUMNS:
        tbl = _t(table)
        for column in columns:
            query = select(tbl.c[column])
            if table == "source_assets":
                query = query.where(tbl.c.status != "DELETED")
            keys.update(k for k in session.scalars(query) if k)
    return keys


def _recount(session: Session) -> None:
    t = Base.metadata.tables
    farms, follows = t["farms"], t["follows"]
    session.execute(
        update(farms).values(
            follower_count=select(func.count())
            .where(follows.c.farm_id == farms.c.id)
            .scalar_subquery()
        )
    )
    broadcasts, reactions = t["broadcasts"], t["reactions"]
    session.execute(
        update(broadcasts).values(
            reaction_count=select(func.count())
            .where(reactions.c.broadcast_id == broadcasts.c.id)
            .scalar_subquery()
        )
    )
    # 시드와 같은 식: 배정마다 남은 주문의 quantity - released_quantity 합
    allocations, orders = t["stage_allocations"], t["orders"]
    session.execute(
        update(allocations).values(
            reserved_count=select(
                func.coalesce(func.sum(orders.c.quantity - orders.c.released_quantity), 0)
            )
            .where(
                orders.c.stage_id == allocations.c.stage_id,
                orders.c.option_id == allocations.c.option_id,
            )
            .scalar_subquery()
        )
    )


def _summary(session: Session, report: Report) -> None:
    t = Base.metadata.tables
    users, farms, products = t["users"], t["farms"], t["products"]
    report.users = [
        tuple(r)
        for r in session.execute(
            select(users.c.id, users.c.name, users.c.role).order_by(users.c.role, users.c.id)
        )
    ]
    report.farms = [
        tuple(r)
        for r in session.execute(
            select(farms.c.id, farms.c.name, farms.c.approval_status).order_by(farms.c.id)
        )
    ]
    report.products = [
        tuple(r)
        for r in session.execute(
            select(products.c.id, products.c.farm_id, products.c.name, products.c.status).order_by(
                products.c.farm_id, products.c.id
            )
        )
    ]


def _audit(session: Session, report: Report) -> None:
    timestamp = now()
    session.execute(
        _t("manager_events")
        .insert()
        .values(
            id=new_id("manager-event"),
            event_type=EVENT_TYPE,
            actor_id=None,
            target_type="system",
            target_id="purge_except",
            request_summary={
                "via": "cli",
                "keep": report.keep,
                "expectFarms": report.expect_farms,
            },
            status="SUCCEEDED",
            retryable=False,
            attempts=1,
            result={
                "deleted": {name: d for name, (d, _) in report.tables.items() if d},
                "storageKeys": len(report.storage_keys),
            },
            created_at=timestamp,
            updated_at=timestamp,
        )
    )


def _run(session: Session, keep_ids: list[str], report: Report) -> None:
    keep = _collect(session, keep_ids)
    _check_kept_rows(session, keep)
    before_keys = _storage_keys(session)
    before = {
        table.name: session.scalar(select(func.count()).select_from(table))
        for table in Base.metadata.sorted_tables
    }
    report.nulled = _null_dangling(session, keep)
    for table in reversed(Base.metadata.sorted_tables):
        # 조건이 NULL인 행(예: NULL 열)도 지우도록 CASE로 참·거짓만 남긴다
        kept = case((RULES[table.name](keep), True), else_=False)
        deleted = session.execute(delete(table).where(kept.is_(False))).rowcount
        report.tables[table.name] = (deleted, before[table.name] - deleted)
    _recount(session)
    report.storage_keys = sorted(before_keys - _storage_keys(session))
    _summary(session, report)


def _lock(session: Session) -> None:
    """남길 집합을 정한 뒤 지우기 전에 새 행이 들어오면 잘못 지운다. 끝날 때까지 쓰기를 막는다.

    읽기는 막지 않는다. 미리보기도 트랜잭션이 끝날 때까지 쓰기를 막는다.
    """
    names = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    # 오래 열린 쓰기 트랜잭션이 있으면 무기한 기다리며 뒤의 쓰기까지 막지 않게 짧게 포기한다
    session.execute(text(f"SET LOCAL lock_timeout = '{LOCK_TIMEOUT}'"))
    try:
        session.execute(text(f"LOCK TABLE {names} IN SHARE ROW EXCLUSIVE MODE"))
    except OperationalError as exc:
        raise PurgeRefused(
            f"다른 쓰기 작업이 끝나지 않아 잠그지 못했어요({LOCK_TIMEOUT}). "
            "아무것도 바꾸지 않았어요. 잠시 뒤 다시 실행하세요."
        ) from exc


def purge_in(
    session: Session,
    keep_ids: list[str],
    commit: bool,
    expect_farms: list[str] | None = None,
    backup_done: bool = False,
) -> Report:
    """남길 생산자만 두고 지운다. 호출한 쪽이 트랜잭션을 연다.

    미리보기(commit=False)는 savepoint 안에서 지운 뒤 되돌린다. commit이면 감사 이벤트를 남긴다.
    commit에는 남는 농가 집합과 같은 expect_farms와 backup_done이 필요하다(DEV-310).
    """
    keep_ids = sorted(set(keep_ids))
    expect = sorted(set(expect_farms or []))
    check_keep(session, keep_ids)
    _lock(session)
    # 검사와 잠금 사이에 탈퇴·농가 삭제가 있었을 수 있어 잠근 뒤 한 번 더 본다
    check_keep(session, keep_ids)
    # 잠근 뒤라 농가 주인이 바뀌지 않는다. 지우기 전에 남을 농가를 사람이 적은 것과 맞춘다
    farms = kept_farms(session, keep_ids)
    check_guards(farms, expect, commit, backup_done)
    report = Report(keep=keep_ids, expect_farms=expect, kept_farms=farms)
    t_farms = _t("farms")
    report.deleted_farms = [
        tuple(r)
        for r in session.execute(
            select(t_farms.c.id, t_farms.c.name, t_farms.c.producer_id)
            .where(~_in(t_farms.c.id, {f for f, _, _ in farms}))
            .order_by(t_farms.c.id)
        )
    ]
    savepoint = session.begin_nested()
    try:
        _run(session, keep_ids, report)
    except IntegrityError as exc:
        savepoint.rollback()
        raise PurgeRefused(f"남는 행이 지울 행을 가리켜 되돌렸어요: {exc.orig}") from exc
    except OperationalError as exc:
        # lock_timeout(다른 연결의 행 잠금 대기)·교착
        savepoint.rollback()
        raise PurgeRefused(
            f"잠금을 기다리다 멈춰 되돌렸어요. 잠시 뒤 다시 실행하세요: {exc.orig}"
        ) from exc
    except BaseException:
        savepoint.rollback()
        raise
    if commit:
        savepoint.commit()
        _audit(session, report)
        report.committed = True
    else:
        savepoint.rollback()
    return report


def delete_storage(keys: list[str]) -> tuple[int, list[str]]:
    """R2일 때만 지운다. (지운 수, 실패한 키)."""
    from app.source_analysis.storage import KEY, Storage

    store = Storage()
    done, failed = 0, []
    for key in keys:
        if not KEY.fullmatch(key):
            failed.append(key)
            continue
        try:
            store.delete(key)
            done += 1
        except Exception:  # noqa: BLE001  하나가 실패해도 나머지는 지운다
            failed.append(key)
    return done, failed


def purge(
    keep_ids: list[str],
    commit: bool = False,
    expect_farms: list[str] | None = None,
    backup_done: bool = False,
) -> Report:
    with get_sessionmaker()() as session, session.begin():
        return purge_in(session, keep_ids, commit, expect_farms, backup_done)


def commit_command(report: Report) -> str:
    """미리보기 결과로 만든, 그대로 복사해 실행할 커밋 명령 한 줄."""
    args: list[str] = []
    for user_id in report.keep:
        args += ["--keep", user_id]
    for farm_id, _, _ in report.kept_farms:
        args += ["--expect-farm", farm_id]
    args += ["--backup-done", "--commit"]
    return f"{COMMAND} {shlex.join(args)}"


def _reject_autocorrected(token: str) -> None:
    # 11/11 실행 중 자동 고침이 --를 —로 바꿨다. ID에는 이 문자가 없다
    if any(dash in token for dash in AUTOCORRECTED_DASHES):
        raise PurgeRefused(
            f"{token!r}에 하이픈이 아닌 대시(— 또는 –)가 있어요. "
            "자동 고침이 --를 바꾼 것 같아요. 하이픈 두 개(--)로 다시 입력하거나 "
            f"미리보기 마지막 줄을 그대로 복사하세요.\n{USAGE}"
        )


def parse(argv: list[str]) -> Args:
    parsed = Args(keep=[])
    args = iter(argv)
    for arg in args:
        _reject_autocorrected(arg)
        if arg == "--commit":
            parsed.commit = True
        elif arg == "--backup-done":
            parsed.backup_done = True
        elif arg in ("--keep", "--expect-farm"):
            value = next(args, None)
            if value is None or value.startswith("--"):
                raise PurgeRefused(USAGE)
            _reject_autocorrected(value)
            (parsed.keep if arg == "--keep" else parsed.expect_farms).append(value)
        elif arg.startswith("--keep="):
            parsed.keep.append(arg.removeprefix("--keep="))
        elif arg.startswith("--expect-farm="):
            parsed.expect_farms.append(arg.removeprefix("--expect-farm="))
        else:
            # 오타(--comit 등)나 위치 인자가 다른 동작으로 이어지지 않게 모두 거부한다
            raise PurgeRefused(USAGE)
    if not parsed.keep or not all(parsed.keep) or not all(parsed.expect_farms):
        raise PurgeRefused(USAGE)
    return parsed


def main(argv: list[str]) -> None:
    try:
        args = parse(argv)
        report = purge(args.keep, args.commit, args.expect_farms, args.backup_done)
    except PurgeRefused as exc:
        sys.exit(f"지우지 않았어요: {exc}")
    commit = args.commit
    print("남는 사용자:")
    for uid, name, role in report.users:
        print(f"  {uid} {name} ({role})")
    print("남는 농가:")
    for fid, name, status in report.farms:
        print(f"  {fid} {name} ({status})")
    print("남는 상품:")
    for pid, fid, name, status in report.products:
        print(f"  {pid} [{fid}] {name or '(이름 없음)'} ({status})")
    print("표별 삭제 / 유지:")
    for name, (deleted, kept) in sorted(report.tables.items()):
        print(f"  {name}: 삭제 {deleted} / 유지 {kept}")
    total = sum(d for d, _ in report.tables.values())
    print(f"합계 삭제 {total}")
    for column, count in sorted(report.nulled.items()):
        print(f"비운 열 {column}: {count}")
    print(f"지울 저장소 파일 {len(report.storage_keys)}개:")
    for key in report.storage_keys:
        print(f"  {key}")
    if not commit:
        print("미리보기라 되돌렸어요.")
        print("지워질 농가(남아야 할 농가가 여기 있으면 --keep이 틀렸어요. 멈추세요):")
        for fid, name, producer in report.deleted_farms:
            print(f"  {fid} {name} (생산자 {producer})")
        print("남을 농가(이름이 맞는지 확인하세요. 하나라도 다르면 멈추세요):")
        for fid, name, producer in report.kept_farms:
            print(f"  {fid} {name} (생산자 {producer})")
        print(f"지우기 전에 백업: {BACKUP_STEP}")
        print("그다음 아래 줄을 고치지 말고 그대로 복사해 실행하세요:")
        print(commit_command(report))
        return
    print("지웠어요. 감사 이벤트 1건(data.purge_except, via=cli)을 남겼어요.")
    if not report.storage_keys:
        return
    if get_settings().source_storage == "r2":
        done, failed = delete_storage(report.storage_keys)
        print(f"R2 파일 {done}개를 지웠어요.")
        if failed:
            print(f"못 지운 파일 {len(failed)}개(워커 cleanup이 24시간 뒤 다시 지워요):")
            for key in failed:
                print(f"  {key}")
    else:
        print(
            "R2가 아니라 파일은 그대로 뒀어요. "
            "source_analysis 워커 cleanup()이 24시간 지난 미사용 키를 지워요."
        )


if __name__ == "__main__":
    main(sys.argv[1:])
