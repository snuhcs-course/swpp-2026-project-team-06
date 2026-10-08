"""accounts 모듈 업무 로직. 다른 모듈은 이 파일의 함수로만 부른다."""

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.accounts.models import ShippingAddress, User
from app.accounts.schemas import (
    Address,
    AddressInput,
    LoginResult,
    ProducerApplication,
    ProducerApplicationInput,
    TestAccount,
    UserView,
)
from app.core.clock import now
from app.core.config import get_settings
from app.core.errors import forbidden, invalid, not_found
from app.core.ids import new_id
from app.core.security import issue_token

PHONE = re.compile(r"^01[016789]-?\d{3,4}-?\d{4}$")

# 앱별 시드 테스트 계정 순서(ADR 0009·0010, 화면 SCR-05·SCR-19)
TEST_ACCOUNTS = {
    "consumer": ["u-minji", "u-seojun"],
    "producer": ["u-kang", "u-misook", "u-new", "u-soonja", "u-taeho"],
}
APP_ROLE = {"consumer": "CONSUMER", "producer": "PRODUCER"}


def get_user(db: Session, user_id: str) -> User | None:
    return db.get(User, user_id)


def get_users(db: Session, user_ids: list[str]) -> dict[str, User]:
    if not user_ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}


def _require_mock_login() -> None:
    if not get_settings().mock_login_enabled:
        raise not_found("지금은 테스트 로그인을 쓸 수 없어요.")


def user_view(db: Session, user: User) -> UserView:
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id) if user.role == "PRODUCER" else None
    return UserView(
        user_id=user.id,
        name=user.name,
        role=user.role,
        is_test_account=user.is_test_account,
        farm_id=farm.id if farm else None,
        farm_status=farm.approval_status if farm else "NONE",
        suspend_reason=farm.suspend_reason if farm else None,
    )


def test_accounts(db: Session, app: str) -> list[TestAccount]:
    from app.farms import service as farms

    _require_mock_login()
    users = get_users(db, TEST_ACCOUNTS[app])
    result = []
    for uid in TEST_ACCOUNTS[app]:
        user = users.get(uid)
        if user is None or not user.is_test_account:
            continue
        farm = farms.get_farm_of_producer(db, uid)
        result.append(
            TestAccount(
                user_id=uid,
                name=user.name,
                role=user.role,
                farm_status=farm.approval_status if farm else "NONE",
                farm_name=farm.name if farm else None,
            )
        )
    return result


def test_login(db: Session, user_id: str, app: str) -> LoginResult:
    """시드 테스트 계정만 로그인한다. 새 계정은 만들지 않는다(AC-01-4)."""
    _require_mock_login()
    user = get_user(db, user_id)
    if user is None or not user.is_test_account:
        raise not_found("테스트 계정이 아니에요.")
    if user.role != APP_ROLE[app]:
        raise forbidden("이 앱의 계정이 아니에요.", reason="WRONG_APP")
    return LoginResult(access_token=issue_token(user.id, user.role), user=user_view(db, user))


def _application_view(user: User, farm) -> ProducerApplication:
    return ProducerApplication(
        farm_id=farm.id,
        owner_name=user.name,
        farm_name=farm.name,
        region=farm.region,
        main_items=farm.main_items,
        phone=farm.contact_phone,
        status=farm.approval_status,
        reject_reason=farm.reject_reason,
        submitted_at=farm.applied_at,
        decided_at=farm.decided_at,
    )


def producer_application(db: Session, user: User) -> ProducerApplication:
    from app.farms import service as farms

    farm = farms.get_farm_of_producer(db, user.id)
    if farm is None:
        raise not_found("신청 내역이 없어요.")
    return _application_view(user, farm)


def submit_producer_application(
    db: Session, user: User, data: ProducerApplicationInput
) -> ProducerApplication:
    from app.farms import service as farms

    fields = {}
    if not data.owner_name.strip():
        fields["ownerName"] = "대표자 이름을 적어 주세요"
    if not data.farm_name.strip():
        fields["farmName"] = "농가 이름을 적어 주세요"
    if not data.region.strip():
        fields["region"] = "지역을 적어 주세요"
    if not data.main_items.strip():
        fields["mainItems"] = "주로 키우는 것을 적어 주세요"
    if not PHONE.fullmatch(data.phone.strip()):
        fields["phone"] = "휴대폰 번호 형식으로 입력해 주세요"
    if fields:
        raise invalid(fields)

    locked_user = db.scalar(select(User).where(User.id == user.id).with_for_update())
    if locked_user is None:
        raise not_found()
    user = locked_user
    farm = farms.submit_application(
        db,
        producer_id=user.id,
        name=data.farm_name.strip(),
        region=data.region.strip(),
        main_items=data.main_items.strip(),
        contact_phone=data.phone.strip(),
    )
    user.name = data.owner_name.strip()
    db.flush()
    return _application_view(user, farm)


def _address(a: ShippingAddress) -> Address:
    return Address(
        address_id=a.id,
        recipient_name=a.recipient_name,
        recipient_phone=a.recipient_phone,
        postal_code=a.postal_code,
        address=a.address,
        address_detail=a.address_detail,
        label=a.label,
        is_default=a.is_default,
    )


def list_addresses(db: Session, user_id: str) -> list[Address]:
    rows = db.scalars(
        select(ShippingAddress)
        .where(ShippingAddress.user_id == user_id)
        .order_by(ShippingAddress.is_default.desc(), ShippingAddress.created_at)
    )
    return [_address(a) for a in rows]


def validate_recipient(name: str, phone: str, postal_code: str, address: str) -> dict[str, str]:
    fields = {}
    if not name.strip():
        fields["recipientName"] = "받는 사람을 적어 주세요"
    if not PHONE.match(phone.strip()):
        fields["recipientPhone"] = "휴대폰 번호 형식으로 입력해 주세요"
    if not postal_code.strip() or not address.strip():
        fields["address"] = "우편번호와 주소를 입력해 주세요"
    return fields


def add_address(db: Session, user_id: str, data: AddressInput) -> Address:
    fields = validate_recipient(
        data.recipient_name, data.recipient_phone, data.postal_code, data.address
    )
    if fields:
        raise invalid(fields)
    existing = db.scalars(select(ShippingAddress).where(ShippingAddress.user_id == user_id)).all()
    is_default = data.is_default or not existing
    if is_default:
        for a in existing:
            a.is_default = False
    row = ShippingAddress(
        id=new_id("a"),
        user_id=user_id,
        label=data.label,
        recipient_name=data.recipient_name.strip(),
        recipient_phone=data.recipient_phone.strip(),
        postal_code=data.postal_code.strip(),
        address=data.address.strip(),
        address_detail=data.address_detail.strip(),
        is_default=is_default,
        created_at=now(),
    )
    db.add(row)
    db.flush()
    return _address(row)


def save_order_address(db: Session, user_id: str, data: AddressInput) -> None:
    """주문서의 '기본 배송지로 저장'(FEAT-08). 같은 주소가 있으면 기본으로만 바꾼다."""
    rows = db.scalars(select(ShippingAddress).where(ShippingAddress.user_id == user_id)).all()
    same = next(
        (
            a
            for a in rows
            if a.address == data.address.strip() and a.address_detail == data.address_detail.strip()
        ),
        None,
    )
    for a in rows:
        a.is_default = a is same
    if same is None:
        add_address(db, user_id, data.model_copy(update={"is_default": True}))
