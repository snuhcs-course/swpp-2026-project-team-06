"""운영 검증에 쓴 테스트 농가를 숨긴다(DEV-93). 행은 지우지 않는다.

실행: uv run python -m app.admin.retire_test_farm <농가 ID> [--restore] [--commit]
기본은 시험 실행이다. 바꿀 내용만 보여 주고, --commit을 붙여야 바꾼다.

농가를 SUSPENDED로 바꾸면 공개 경로(농가 목록·상세·공유, 상품 목록·상세, 주문, 소식·대화)가
모두 숨긴다. 테스트 계정이 아닌 소비자 주문이 있으면 거부한다. 정지는 출하 전 주문 환불을
뜻하므로(R-24) 사람이 처리한다.
--restore는 이 명령으로 숨긴 농가만 APPROVED로 되돌린다.

테스트 데이터 영구 삭제는 보관 정책(PQ-06) 결정 뒤 DEV-94에서 한다.
"""

import sys

from sqlalchemy import select

from app.accounts.models import User
from app.catalog.models import Product
from app.core.db import get_sessionmaker
from app.farms.models import Farm
from app.orders.models import Order

RETIRE_REASON = "운영 테스트 농가라 숨겼어요 (DEV-93)"


class RetireRefused(Exception):
    pass


def retire(farm_id: str, commit: bool = False) -> Farm:
    """테스트 농가를 숨긴다. commit이 아니면 바꾸지 않는다."""
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, farm_id, with_for_update=True)
        if farm is None:
            raise RetireRefused(f"{farm_id} 농가가 없어요.")
        if farm.approval_status != "APPROVED":
            raise RetireRefused(f"승인된 농가가 아니라 공개되지 않아요: {farm.approval_status}")
        real = session.scalars(
            select(Order.consumer_id)
            .join(Product, Product.id == Order.product_id)
            .join(User, User.id == Order.consumer_id)
            .where(Product.farm_id == farm_id, User.is_test_account.is_(False))
            .distinct()
        ).all()
        if real:
            raise RetireRefused(f"실사용자 주문이 있어 숨기지 않아요: {sorted(real)}")
        if commit:
            farm.approval_status = "SUSPENDED"
            farm.suspend_reason = RETIRE_REASON
        session.flush()
        session.expunge(farm)
    return farm


def restore(farm_id: str, commit: bool = False) -> Farm:
    """이 명령으로 숨긴 농가를 다시 공개한다."""
    with get_sessionmaker()() as session, session.begin():
        farm = session.get(Farm, farm_id, with_for_update=True)
        if farm is None:
            raise RetireRefused(f"{farm_id} 농가가 없어요.")
        if farm.approval_status != "SUSPENDED" or farm.suspend_reason != RETIRE_REASON:
            raise RetireRefused(f"이 명령으로 숨긴 농가가 아니에요: {farm.approval_status}")
        if commit:
            farm.approval_status = "APPROVED"
            farm.suspend_reason = None
        session.flush()
        session.expunge(farm)
    return farm


def main(argv: list[str]) -> None:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        sys.exit("사용법: python -m app.admin.retire_test_farm <농가 ID> [--restore] [--commit]")
    commit = "--commit" in argv
    undo = "--restore" in argv
    try:
        farm = restore(args[0], commit) if undo else retire(args[0], commit)
    except RetireRefused as exc:
        sys.exit(f"바꾸지 않았어요: {exc}")
    target = "APPROVED(공개)" if undo else "SUSPENDED(숨김)"
    print(f"{farm.id} {farm.name} ({farm.region}) 생산자 {farm.producer_id}")
    if commit:
        print(f"{target}로 바꿨어요.")
    else:
        print(f"시험 실행이라 바꾸지 않았어요. {target}로 바꾸려면 --commit을 붙이세요.")


if __name__ == "__main__":
    main(sys.argv[1:])
