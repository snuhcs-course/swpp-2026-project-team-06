"""Preview UAT closure. Add --commit to hide farms and close the listed accounts."""

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.admin.retire_test_farm import RetireRefused, check_customer_orders, retire_in
from app.core.clock import now
from app.core.db import get_sessionmaker
from app.core.seed_uat import CONSUMERS, PRODUCERS
from app.farms.models import Farm
from app.messaging.models import RoomReply, Thread


def has_customer_conversation(db: Session, farm_id: str) -> bool:
    for model in (Thread, RoomReply):
        contact = select(model.id).join(User, User.id == model.consumer_id).where(
            model.farm_id == farm_id, User.role == "CONSUMER",
            User.is_test_account.is_(False), User.ops_tester.is_(False),
        ).limit(1)
        if db.scalar(contact) is not None:
            return True
    return False


def close_accounts(db: Session, extra_ids: list[str], commit: bool) -> list[str]:
    fixture_ids = {row[0] for row in [*CONSUMERS, *PRODUCERS]}
    users = db.scalars(
        select(User).where(User.id.in_(fixture_ids.union(extra_ids))).order_by(User.id)
        .with_for_update()
    ).all()
    missing = set(extra_ids) - {user.id for user in users}
    if missing:
        raise ValueError(f"찾을 수 없는 계정: {', '.join(sorted(missing))}")
    report = []
    for user in users:
        is_tester = user.is_test_account or (user.id in extra_ids and user.ops_tester)
        if user.role not in ("CONSUMER", "PRODUCER") or not is_tester:
            raise ValueError(f"테스트 계정 분류를 먼저 확인하세요: {user.id}")
        farm = db.scalar(select(Farm).where(Farm.producer_id == user.id).with_for_update())
        if farm:
            if has_customer_conversation(db, farm.id):
                report.append(f"{user.id} / {farm.id} 보류: 실사용자 대화가 있어요")
                continue
            try:
                if farm.approval_status == "APPROVED":
                    retire_in(db, farm.id, commit)
                else:
                    check_customer_orders(db, farm.id)
            except RetireRefused as exc:
                report.append(f"{user.id} / {farm.id} 보류: {exc}")
                continue
        farm_info = f" / {farm.id} ({farm.approval_status})" if farm else ""
        if user.uat_closed_at is not None:
            report.append(f"{user.id}{farm_info} 이미 접속 종료")
            continue
        report.append(f"{user.id}{farm_info} 접속 종료 대상")
        if commit:
            user.uat_closed_at = now()
            user.token_version += 1
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", action="append", default=[], help="확인된 추가 UAT 계정 ID")
    parser.add_argument("--commit", action="store_true")
    args = parser.parse_args()
    with get_sessionmaker()() as session, session.begin():
        report = close_accounts(session, args.user_id, args.commit)
    print("적용 결과" if args.commit else "미리 보기")
    print("\n".join(report) or "대상 없음")


if __name__ == "__main__":
    main()
