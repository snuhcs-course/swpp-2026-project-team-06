"""운영 검증에 쓴 테스트 농가를 숨긴다(DEV-93). 행은 지우지 않는다.

실행: uv run python -m app.admin.retire_test_farm <농가 ID> [--restore] [--commit]
기본은 시험 실행이다. 바꿀 내용만 보여 주고, --commit을 붙여야 바꾼다.

농가를 SUSPENDED로 바꾸면 공개 경로(농가 목록·상세·공유, 상품 목록·상세, 주문, 소식·대화)가
모두 숨긴다. 테스트 계정이 아닌 소비자 주문이 있으면 거부한다. 정지는 출하 전 주문 환불을
뜻하므로(R-24) 사람이 처리한다.
--restore는 이 명령으로 숨긴 농가만 APPROVED로 되돌린다. 숨긴 동안 만료된 주문은 되살리지 않는다.
바꿀 때마다 ManagerEvent를 하나 남긴다. 서버 셸에서 실행해 운영자 계정이 없으므로 actor는 비운다.

테스트 데이터 영구 삭제는 보관 정책(PQ-06) 결정 뒤 DEV-94에서 한다.
관리자 페이지의 숨기기·되돌리기(DEV-98)는 retire_in·restore_in을 같은 조건으로 쓰고,
감사는 운영자 이름으로 남긴다.
"""

import sys
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.admin.models import ManagerEvent
from app.catalog.models import Product
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.ids import new_id
from app.farms.models import Farm
from app.orders.models import Order

RETIRE_REASON = "운영 테스트 농가라 숨겼어요 (DEV-93)"
# 출하 전 주문. 농가를 숨기면 생산자가 처리할 수 없다.
OPEN_STATUSES = ("AWAITING_DEPOSIT", "RESERVED", "PREPARING")


class RetireRefused(Exception):
    pass


@dataclass
class Result:
    farm_id: str
    name: str
    region: str
    producer_id: str
    open_orders: dict[str, int] = field(default_factory=dict)
    # 소비자가 '입금했어요'를 누른 입금 대기. 자동 취소되지 않고 기한 뒤 deposit-overdue에 남는다.
    reported_deposits: int = 0


def _result(session: Session, farm: Farm) -> Result:
    orders = (
        select(Order.status, Order.deposit_reported_at)
        .join(Product, Product.id == Order.product_id)
        .where(Product.farm_id == farm.id, Order.status.in_(OPEN_STATUSES))
        .subquery()
    )
    open_orders = session.execute(
        select(orders.c.status, func.count()).group_by(orders.c.status)
    ).all()
    reported = session.scalar(
        select(func.count())
        .select_from(orders)
        .where(
            orders.c.status == "AWAITING_DEPOSIT",
            orders.c.deposit_reported_at.is_not(None),
        )
    )
    return Result(
        farm.id,
        farm.name,
        farm.region,
        farm.producer_id,
        {status: count for status, count in sorted(open_orders)},
        reported,
    )


def _audit(session: Session, farm: Farm, event_type: str, previous: str) -> None:
    timestamp = now()
    session.add(
        ManagerEvent(
            id=new_id("manager-event"),
            event_type=event_type,
            actor_id=None,
            target_type="farm",
            target_id=farm.id,
            scope=None,
            idempotency_key=None,
            original_body=None,
            request_summary={"via": "cli", "previousStatus": previous},
            status="SUCCEEDED",
            retryable=False,
            attempts=1,
            result={"status": farm.approval_status},
            error_code=None,
            error_message=None,
            message_id=None,
            last_retried_by=None,
            created_at=timestamp,
            updated_at=timestamp,
            resolved_at=None,
            resolved_by=None,
        )
    )


def check_retire(session: Session, farm: Farm | None, farm_id: str) -> None:
    """숨길 수 없으면 RetireRefused. 관리자 API(DEV-98)도 같은 조건을 쓴다."""
    if farm is None:
        raise RetireRefused(f"{farm_id} 농가가 없어요.")
    if farm.approval_status == "SUSPENDED":
        raise RetireRefused(f"이미 숨겨진(정지된) 농가예요: {farm.suspend_reason}")
    if farm.approval_status != "APPROVED":
        raise RetireRefused(f"승인된 농가가 아니라 공개되지 않아요: {farm.approval_status}")
    real = session.scalars(
        select(Order.consumer_id)
        .join(Product, Product.id == Order.product_id)
        .join(User, User.id == Order.consumer_id)
        .where(
            Product.farm_id == farm_id,
            User.is_test_account.is_(False),
            User.ops_tester.is_(False),  # 운영 검증 계정(DEV-107)도 테스트로 센다
        )
        .distinct()
    ).all()
    if real:
        shown = ", ".join(sorted(real)[:3]) + (" 외" if len(real) > 3 else "")
        raise RetireRefused(f"실사용자 주문이 있어 숨기지 않아요: 소비자 {len(real)}명({shown})")


def check_restore(farm: Farm | None, farm_id: str) -> None:
    if farm is None:
        raise RetireRefused(f"{farm_id} 농가가 없어요.")
    if not is_retired(farm):
        raise RetireRefused(f"이 명령으로 숨긴 농가가 아니에요: {farm.approval_status}")


def is_retired(farm: Farm) -> bool:
    return farm.approval_status == "SUSPENDED" and farm.suspend_reason == RETIRE_REASON


def retire_in(session: Session, farm_id: str, commit: bool, audit: bool = True) -> Result:
    """테스트 농가를 숨긴다. 호출한 쪽이 트랜잭션을 연다.

    audit=False면 감사는 호출한 쪽(관리자 API)이 남긴다.
    """
    farm = session.get(Farm, farm_id, with_for_update=True)
    check_retire(session, farm, farm_id)
    if commit:
        farm.approval_status = "SUSPENDED"
        farm.suspend_reason = RETIRE_REASON
        if audit:
            _audit(session, farm, "test_farm_retired", "APPROVED")
    return _result(session, farm)


def restore_in(session: Session, farm_id: str, commit: bool, audit: bool = True) -> Result:
    """이 명령으로 숨긴 농가를 다시 공개한다. 호출한 쪽이 트랜잭션을 연다."""
    farm = session.get(Farm, farm_id, with_for_update=True)
    check_restore(farm, farm_id)
    if commit:
        farm.approval_status = "APPROVED"
        farm.suspend_reason = None
        if audit:
            _audit(session, farm, "test_farm_restored", "SUSPENDED")
    return _result(session, farm)


def retire(farm_id: str, commit: bool = False) -> Result:
    """테스트 농가를 숨긴다. commit이 아니면 바꾸지 않는다."""
    with get_sessionmaker()() as session, session.begin():
        return retire_in(session, farm_id, commit)


def restore(farm_id: str, commit: bool = False) -> Result:
    """이 명령으로 숨긴 농가를 다시 공개한다."""
    with get_sessionmaker()() as session, session.begin():
        return restore_in(session, farm_id, commit)


def main(argv: list[str]) -> None:
    args = [a for a in argv if not a.startswith("--")]
    # 오타(--restor 등)가 다른 동작으로 이어지지 않게 모르는 옵션은 거부한다.
    if len(args) != 1 or set(argv) - set(args) - {"--commit", "--restore"}:
        sys.exit("사용법: python -m app.admin.retire_test_farm <농가 ID> [--restore] [--commit]")
    commit = "--commit" in argv
    undo = "--restore" in argv
    try:
        result = restore(args[0], commit) if undo else retire(args[0], commit)
    except RetireRefused as exc:
        sys.exit(f"바꾸지 않았어요: {exc}")
    print(f"{result.farm_id} {result.name} ({result.region}) 생산자 {result.producer_id}")
    if result.open_orders:
        counts = ", ".join(f"{s} {n}" for s, n in result.open_orders.items())
        if undo:
            print(f"출하 전 테스트 주문: {counts}. 숨긴 동안 만료된 주문은 되살리지 않아요.")
        else:
            print(f"출하 전 테스트 주문: {counts}. 숨긴 동안 열린 채로 남을 수 있어요.")
    if result.reported_deposits and not undo:
        print(
            f"입금했다고 알린 주문 {result.reported_deposits}개는 자동 취소되지 않고 기한 뒤 "
            "deposit-overdue 목록에 남아요. 목록을 깨끗이 두려면 먼저 취소하세요."
        )
    target = "APPROVED(공개)" if undo else "SUSPENDED(숨김)"
    if commit:
        print(f"{target}로 바꿨어요.")
    else:
        print(f"시험 실행이라 바꾸지 않았어요. {target}로 바꾸려면 --commit을 붙이세요.")


if __name__ == "__main__":
    main(sys.argv[1:])
