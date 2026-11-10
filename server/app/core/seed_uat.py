"""UAT 데이터(DEV-305). 운영 데이터 정리(DEV-304) 뒤 UAT용 테스트 계정·농가·상품을 넣는다.

실행: uv run python -m app.core.seed_uat [--commit]
기본은 미리보기다. 한 트랜잭션에서 넣어 제약을 확인하고 넣을 목록을 보여 준 뒤 롤백한다.
--commit을 붙여야 남긴다. 표지 계정 u-uat-c1(또는 UAT ID 하나라도)이 이미 있으면 거부한다.

넣는 것: UAT 소비자 3명(닉네임·연락처·기본 배송지), UAT 생산자 3명(승인 농가 2곳 — 판매 중 상품과
옵션·기간·가격·물량·승인 물량 / 확인 중 농가 1곳). 모두 is_test_account=True라 테스트 로그인
목록(TEST_ACCOUNTS)에 오르지만, MOCK_LOGIN_ENABLED가 꺼져 있으면 아무도 들어오지 못한다.
문의방은 실제 가입·승인과 같은 함수(ensure_support_thread·ensure_consumer_support)로 연다.
주문·메시지는 넣지 않는다.

기간·받는 시기는 앱 기준일(clock.today(), KST. FIXED_NOW가 있으면 그 날) 기준 상대 날짜다.
넣는 날을 미리 알 수 없어서다.
UAT가 끝나면 DEV-304 정리 명령(계획 이름 app.admin.purge_except, 머지 뒤 재확인)을
실제 생산자만 --keep으로 다시 돌려 지운다.
"""

import sys
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.accounts.models import User
from app.catalog.models import Product
from app.core.clock import now, today
from app.core.db import get_sessionmaker
from app.core.seed import (
    OPT3,
    OPT5,
    OPT10,
    photo,
    seed_addresses,
    seed_options_and_stages,
    seed_product,
)
from app.farms.models import Farm
from app.messaging.support import (
    SUPPORT_USER_ID,
    ensure_consumer_support,
    ensure_support_thread,
)

UAT_MARKER = "u-uat-c1"
NOTE = "UAT(사용자 수용 테스트)용 가짜 데이터예요. 실제로 거래·배송하지 않아요."

# (ID, 이름, 닉네임, 연락처). 이름·연락처는 실제 사람처럼 보이지 않게 만든다
CONSUMERS = [
    ("u-uat-c1", "UAT 소비자 1", "UAT소비자1", "010-0000-0001"),
    ("u-uat-c2", "UAT 소비자 2", "UAT소비자2", "010-0000-0002"),
    ("u-uat-c3", "UAT 소비자 3", "UAT소비자3", "010-0000-0003"),
]
PRODUCERS = [
    ("u-uat-p1", "UAT 생산자 1", "010-0000-0101"),
    ("u-uat-p2", "UAT 생산자 2", "010-0000-0102"),
    ("u-uat-p3", "UAT 생산자 3", "010-0000-0103"),
]
# seed.ADDRESSES 꼴: (ID, 사용자, 이름표, 받는 사람, 연락처, 우편번호, 주소, 상세, 기본)
ADDRESSES = [
    (
        f"a-uat-{n}",
        uid,
        None,
        name,
        phone,
        "00000",
        "UAT 테스트 주소 (실제 주소 아님)",
        f"{n}호",
        True,
    )
    for n, (uid, name, _, phone) in enumerate(CONSUMERS, start=1)
]


def _farms(applied) -> list[dict]:
    def farm(n: int, status: str, region: str, items: str) -> dict:
        uid, name, phone = PRODUCERS[n - 1]
        approved = status == "APPROVED"
        return dict(
            id=f"f-uat-{n}",
            producer_id=uid,
            name=f"UAT 농가 {n}",
            region=region,
            photo=photo("farmer.jpg" if n == 1 else "greenhouse.jpg") if approved else None,
            follower_count=0,
            approval_status=status,
            intro=NOTE if approved else "",
            main_items=items,
            contact_phone=phone,
            bank_name="테스트은행" if approved else None,
            account_number=f"000-00-00000{n}" if approved else None,
            account_holder=name if approved else None,
            account_updated_at=applied if approved else None,
            applied_at=applied,
            decided_at=applied if approved else None,
        )

    return [
        farm(1, "APPROVED", "제주 서귀포", "하우스 감귤, 레드향"),
        farm(2, "APPROVED", "제주 제주시", "노지 감귤"),
        farm(3, "PENDING", "제주 남원", "노지 감귤"),
    ]


def _products(base: date, updated) -> tuple[list[tuple], dict[str, int]]:
    """seed.PRODUCTS 꼴의 UAT 상품과 승인 물량(g). 기간은 base(실행한 날)부터 이어진다."""

    def day(offset: int) -> str:
        return (base + timedelta(days=offset)).isoformat()

    def info(farm: str, size: str) -> dict:
        return {
            "origin": "제주",
            "producer": f"{farm} (UAT)",
            "size": size,
            "packedAt": "출하 당일",
            "storage": "서늘하고 통풍되는 곳",
            "contact": "farmclub 고객센터",
        }

    def product(pid: str, farm_id: str, name: str, variety: str, pic: str, **extra) -> dict:
        return dict(
            id=pid,
            farm_id=farm_id,
            name=name,
            variety=variety,
            photos=[photo(pic)],
            grade="특",
            expected_brix=12,
            status="PUBLISHED",
            description=NOTE,
            farmer_note="UAT용 상품이에요.",
            delivery_start=date.fromisoformat(day(40)),
            delivery_end=date.fromisoformat(day(50)),
            max_delay_until=date.fromisoformat(day(60)),
            updated_at=updated,
            **extra,
        )

    products = [
        (
            product(
                "p-uat-1a",
                "f-uat-1",
                "UAT 하우스 감귤 5kg / 10kg",
                "궁천조생",
                "basket.jpg",
                info=info("UAT 농가 1", "5kg(약 35~45과) / 10kg(약 70~90과)"),
            ),
            [OPT5, OPT10],
            [
                ("1단계", day(0), day(13), {"opt-5": (29000, 50, 0), "opt-10": (55000, 20, 0)}),
                ("2단계", day(14), day(34), {"opt-5": (33000, 40, 0), "opt-10": (62000, 15, 0)}),
            ],
        ),
        (
            product(
                "p-uat-1b",
                "f-uat-1",
                "UAT 레드향 3kg",
                "레드향",
                "tangerine-box.jpg",
                info=info("UAT 농가 1", "3kg"),
            ),
            [OPT3],
            [
                ("1단계", day(0), day(13), {"opt-3": (32000, 30, 0)}),
                ("2단계", day(14), day(34), {"opt-3": (36000, 20, 0)}),
            ],
        ),
        (
            product(
                "p-uat-2a",
                "f-uat-2",
                "UAT 노지 감귤 5kg / 10kg",
                "온주밀감",
                "tangerine-sky.jpg",
                info=info("UAT 농가 2", "5kg(약 35~45과) / 10kg(약 70~90과)"),
            ),
            [OPT5, OPT10],
            [
                ("1단계", day(0), day(13), {"opt-5": (21000, 40, 0), "opt-10": (39000, 15, 0)}),
                ("2단계", day(14), day(34), {"opt-5": (24000, 30, 0), "opt-10": (45000, 10, 0)}),
            ],
        ),
    ]
    # 승인 물량은 모든 기간 물량(박스 × 무게)보다 넉넉하게
    capacity = {"p-uat-1a": 1_000_000, "p-uat-1b": 200_000, "p-uat-2a": 800_000}
    return products, capacity


def _all_ids(products: list[tuple]) -> tuple[list[str], list[str], list[str]]:
    users = [c[0] for c in CONSUMERS] + [p[0] for p in PRODUCERS]
    farms = [f"f-uat-{n}" for n in range(1, len(PRODUCERS) + 1)]
    return users, farms, [fields["id"] for fields, _, _ in products]


class UatRefused(Exception):
    pass


@dataclass
class Summary:
    base: date
    users: list[str] = field(default_factory=list)
    farms: list[str] = field(default_factory=list)
    products: list[str] = field(default_factory=list)
    support_threads: int = 0
    # 문의 상대 운영팀 계정(u-farmclub)이 없어서 새로 만들었는가
    created_support_user: bool = False


def seed_uat_in(session: Session) -> Summary:
    """UAT 데이터를 넣는다. 호출한 쪽이 트랜잭션을 열고 커밋·롤백을 정한다."""
    created = now()
    base = today()
    products, capacity = _products(base, created)
    user_ids, farm_ids, product_ids = _all_ids(products)
    existing = (
        list(session.scalars(select(User.id).where(User.id.in_(user_ids))))
        + list(session.scalars(select(Farm.id).where(Farm.id.in_(farm_ids))))
        + list(session.scalars(select(Product.id).where(Product.id.in_(product_ids))))
    )
    if existing:
        marker = " (표지 계정)" if UAT_MARKER in existing else ""
        raise UatRefused(f"UAT 데이터가 이미 있어요{marker}: {', '.join(sorted(existing))}")

    summary = Summary(base=base)
    for uid, name, nickname, phone in CONSUMERS:
        session.add(
            User(
                id=uid,
                name=name,
                nickname=nickname,
                phone=phone,
                role="CONSUMER",
                is_test_account=True,
                created_at=created,
            )
        )
        summary.users.append(f"{uid} {name} (소비자, 닉네임 {nickname})")
    for uid, name, phone in PRODUCERS:
        session.add(
            User(
                id=uid,
                name=name,
                phone=phone,
                role="PRODUCER",
                is_test_account=True,
                created_at=created,
            )
        )
    session.flush()
    farms = _farms(created)
    for f in farms:
        session.add(Farm(**f))
        summary.users.append(f"{f['producer_id']} (생산자) → {f['id']} {f['name']}")
        summary.farms.append(f"{f['id']} {f['name']} {f['region']} {f['approval_status']}")
    session.flush()

    for fields, options, stages in products:
        p = seed_product(session, fields["id"], products=products, capacity=capacity)
        seed_options_and_stages(session, p.id, options, stages)
        summary.products.append(
            f"{p.id} {p.name} ({p.farm_id}, {p.status}, 승인 {p.approved_supply_grams // 1000}kg, "
            f"받는 시기 {p.delivery_start}~{p.delivery_end})"
        )
        for name, start, end, values in stages:
            prices = " / ".join(
                f"{label} {values[oid][0]:,}원 · {values[oid][1]}박스"
                for oid, label, _, _ in options
            )
            summary.products.append(f"    {name} {start}~{end}: {prices}")
    session.flush()

    seed_addresses(session, ADDRESSES, created)
    summary.created_support_user = session.get(User, SUPPORT_USER_ID) is None
    for f in farms:
        if f["approval_status"] == "APPROVED":
            ensure_support_thread(session, f["id"])
            summary.support_threads += 1
    for uid, *_ in CONSUMERS:
        ensure_consumer_support(session, uid)
        summary.support_threads += 1
    session.flush()
    return summary


def run(commit: bool = False) -> Summary:
    """UAT 데이터를 넣는다. commit이 아니면 넣어 본 뒤 롤백한다."""
    with get_sessionmaker()() as session:
        try:
            summary = seed_uat_in(session)
            if commit:
                session.commit()
            else:
                session.rollback()
        except BaseException:
            session.rollback()
            raise
    return summary


def main(argv: list[str]) -> None:
    # 오타(--comit 등)가 다른 동작으로 이어지지 않게 모르는 인자는 거부한다
    if set(argv) - {"--commit"}:
        sys.exit("사용법: python -m app.core.seed_uat [--commit]")
    commit = "--commit" in argv
    try:
        summary = run(commit)
    except UatRefused as exc:
        sys.exit(f"넣지 않았어요: {exc}")
    except IntegrityError as exc:
        # 보통 확인과 넣기 사이에 다른 실행이 먼저 넣은 경우. 롤백됐고 원인을 함께 보인다
        sys.exit(
            "넣지 않았어요: 제약을 어겼어요(다른 실행이 먼저 넣었는지 확인하세요). "
            f"{type(exc.orig).__name__}: {exc.orig}"
        )
    print(f"기준일(KST) {summary.base}")
    print(f"계정 {len(CONSUMERS) + len(PRODUCERS)}명 (모두 테스트 계정):")
    for line in summary.users:
        print(f"  {line}")
    print(f"농가 {len(summary.farms)}곳:")
    for line in summary.farms:
        print(f"  {line}")
    print("상품:")
    for line in summary.products:
        print(f"  {line}")
    print(f"배송지 {len(ADDRESSES)}개, farmclub 문의방 {summary.support_threads}개")
    if summary.created_support_user:
        print(f"문의 상대 운영팀 계정 {SUPPORT_USER_ID}가 없어서 함께 만들어요.")
    if commit:
        print("넣었어요. 테스트 로그인은 MOCK_LOGIN_ENABLED=true일 때만 열려요.")
    else:
        print("미리보기라 넣지 않았어요. 넣으려면 --commit을 붙이세요.")


if __name__ == "__main__":
    main(sys.argv[1:])
