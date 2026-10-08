"""I1 데모 시드. tech-design/README.md '시드 데이터'와 데모 프로토타입 Mock(db.ts)을 따른다.

실행: uv run python -m app.core.seed  (이미 있으면 건너뛴다. --reset이면 지우고 다시 넣는다)
"""

import sys
from datetime import UTC, date, datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.accounts.models import ShippingAddress, User
from app.catalog.models import (
    CapacityRequest,
    Product,
    ProductOption,
    Stage,
    StageAllocation,
    StagePrice,
)
from app.core.db import Base, get_sessionmaker
from app.farms.models import Farm, Follow
from app.messaging.models import (
    Broadcast,
    Escalation,
    Reaction,
    RoomReply,
    Thread,
    ThreadMessage,
)
from app.orders.models import Order, Payment

KST = timezone(timedelta(hours=9))
SEED_MARKER = "u-minji"


def at(day: str, time: str = "10:00") -> datetime:
    return datetime.fromisoformat(f"{day}T{time}:00").replace(tzinfo=KST).astimezone(UTC)


def d(day: str) -> date:
    return date.fromisoformat(day)


def photo(name: str) -> str:
    return f"/photos/{name}"


# 앱별 테스트 계정(ADR 0009·0010). 운영자 계정은 테스트 계정이 아니다(Mock 로그인 대상 아님).
TEST_USERS = [
    ("u-minji", "김민지", "CONSUMER"),
    ("u-seojun", "이서준", "CONSUMER"),
    ("u-kang", "강영수", "PRODUCER"),
    ("u-misook", "오미숙", "PRODUCER"),
    ("u-soonja", "박순자", "PRODUCER"),
    ("u-taeho", "최태호", "PRODUCER"),
    ("u-new", "신규 생산자", "PRODUCER"),
]
OTHER_PRODUCERS = [("u-halla", "한○○"), ("u-hyodon", "고○○"), ("u-namwon", "남○○")]
ADMIN = ("u-admin", "farmclub 운영자")

FARMS = [
    dict(
        id="f-kang",
        producer_id="u-kang",
        name="강씨네 귤밭",
        region="제주 서귀포",
        photo=photo("farmer.jpg"),
        follower_count=128,
        approval_status="APPROVED",
        intro="3대째 효돈 하우스 감귤. 밭 소식은 일주일에 두 번, 당도는 잴 때마다 올려요.",
        main_items="하우스 감귤, 레드향",
        contact_phone="010-2222-3333",
        applied_at=at("2026-09-01"),
        decided_at=at("2026-09-03"),
    ),
    dict(
        id="f-halla",
        producer_id="u-halla",
        name="한라네 과수원",
        region="제주 제주시",
        photo=photo("harvest-hand.jpg"),
        follower_count=86,
        approval_status="APPROVED",
        intro="노지에서 햇볕 듬뿍 받고 자란 귤을 보내요.",
        main_items="노지 감귤",
        contact_phone="010-4444-5555",
        applied_at=at("2026-09-02"),
        decided_at=at("2026-09-04"),
    ),
    dict(
        id="f-hyodon",
        producer_id="u-hyodon",
        name="효돈 하우스농원",
        region="제주 서귀포",
        photo=photo("greenhouse-aisle.jpg"),
        follower_count=41,
        approval_status="APPROVED",
        intro="작은 하우스에서 한 그루씩 돌봐요.",
        main_items="하우스 감귤",
        contact_phone="010-6666-7777",
        applied_at=at("2026-09-05"),
        decided_at=at("2026-09-07"),
    ),
    dict(
        id="f-namwon",
        producer_id="u-namwon",
        name="남원 귤빛농원",
        region="제주 남원",
        photo=photo("branch.jpg"),
        follower_count=19,
        approval_status="APPROVED",
        intro="11월에 첫 상품을 올릴 예정이에요.",
        main_items="노지 감귤",
        contact_phone="010-8888-9999",
        applied_at=at("2026-09-10"),
        decided_at=at("2026-09-12"),
    ),
    dict(
        id="f-wimi",
        producer_id="u-misook",
        name="위미 감귤농장",
        region="제주 서귀포시 남원읍",
        photo=None,
        follower_count=0,
        approval_status="PENDING",
        intro="",
        main_items="노지 감귤, 레드향",
        contact_phone="010-4321-8765",
        applied_at=at("2026-10-07"),
        decided_at=None,
    ),
    dict(
        id="f-reject",
        producer_id="u-soonja",
        name="하례 귤밭",
        region="제주 서귀포",
        photo=None,
        follower_count=0,
        approval_status="REJECTED",
        intro="",
        main_items="노지 감귤",
        contact_phone="010-1111-0000",
        reject_reason="적어 주신 번호로 세 번 연락했지만 닿지 않았어요. "
        "받을 수 있는 번호로 다시 신청해 주세요.",
        applied_at=at("2026-10-05"),
        decided_at=at("2026-10-06"),
    ),
    dict(
        id="f-stop",
        producer_id="u-taeho",
        name="신례 감귤원",
        region="제주 서귀포",
        photo=None,
        follower_count=12,
        approval_status="SUSPENDED",
        intro="",
        main_items="하우스 감귤",
        contact_phone="010-2020-3030",
        suspend_reason="메시지에 연락처를 적어 직거래를 유도했어요 (10월 6일)",
        applied_at=at("2026-09-01"),
        decided_at=at("2026-09-02"),
    ),
]

KANG_INFO = {
    "origin": "제주 서귀포",
    "producer": "강씨네 귤밭 강○○",
    "size": "5kg(약 35~45과) / 10kg",
    "packedAt": "출하 당일",
    "storage": "서늘하고 통풍되는 곳",
    "contact": "farmclub 고객센터",
}
OPT5 = ("opt-5", "5kg", 5, "약 35~45과")
OPT10 = ("opt-10", "10kg", 10, "약 70~90과")
OPT3 = ("opt-3", "3kg", 3, None)
CAPACITY = {
    "p-house": 2_400_000,
    "p-redhyang": 300_000,
    "p-josaeng": 300_000,
    "p-noji": 800_000,
    "p-hyodon": 180_000,
}

# (상품 필드, 옵션, 단계[(이름, 시작, 끝, {옵션: (가격, 물량, 예약 박스)})])
PRODUCTS = [
    (
        dict(
            id="p-house",
            farm_id="f-kang",
            name="하우스 감귤 5kg / 10kg",
            variety="궁천조생",
            photos=[photo("basket.jpg"), photo("greenhouse.jpg")],
            grade="특",
            expected_brix=12,
            measured_brix=11.8,
            measured_brix_at=at("2026-10-05", "09:40"),
            brix_record_count=5,
            status="PUBLISHED",
            description=(
                "효돈 하우스에서 물을 아껴 키운 감귤이에요. 10월 말부터 당도 측정값을 "
                "소식으로 올리고, 수확이 시작되면 실측 당도를 표시해요. "
                "원물 그대로 선별해 보내드려요."
            ),
            farmer_note=(
                "물을 아껴 키워서 단맛이 꽉 찹니다. 수확하는 날 원물 그대로 선별해 보내드려요."
            ),
            delivery_start=d("2026-11-10"),
            delivery_end=d("2026-11-20"),
            max_delay_until=d("2026-11-30"),
        ),
        [OPT5, OPT10],
        [
            (
                "1단계",
                "2026-10-01",
                "2026-10-12",
                {"opt-5": (29000, 80, 38), "opt-10": (55000, 20, 6)},
            ),
            (
                "2단계",
                "2026-10-13",
                "2026-11-05",
                {"opt-5": (33000, 60, 0), "opt-10": (62000, 25, 0)},
            ),
            (
                "3단계",
                "2026-11-06",
                "2026-11-09",
                {"opt-5": (36000, 40, 0), "opt-10": (68000, 15, 0)},
            ),
        ],
    ),
    (
        dict(
            id="p-redhyang",
            farm_id="f-kang",
            name="레드향 3kg",
            variety="레드향",
            photos=[photo("tangerine-box.jpg")],
            grade="상",
            expected_brix=13,
            brix_record_count=2,
            status="PUBLISHED",
            description="두툼한 껍질 속 진한 레드향이에요.",
            farmer_note="올해 레드향은 알이 굵어요.",
            delivery_start=d("2026-12-20"),
            delivery_end=d("2026-12-30"),
            max_delay_until=d("2027-01-10"),
        ),
        [OPT3],
        [
            ("1단계", "2026-10-01", "2026-10-31", {"opt-3": (32000, 60, 60)}),
            ("2단계", "2026-11-01", "2026-11-30", {"opt-3": (36000, 40, 0)}),
        ],
    ),
    (
        dict(
            id="p-cheonhye",
            farm_id="f-kang",
            name="천혜향 3kg",
            variety="천혜향",
            photos=[photo("tangerine-sky.jpg")],
            status="REJECTED",
            reject_reason="받는 시기가 비어 있어요",
        ),
        [OPT3],
        [],
    ),
    (
        dict(
            id="p-cheonggyeon",
            farm_id="f-kang",
            name="청견 5kg",
            variety="청견",
            photos=[photo("branch.jpg")],
            status="PENDING_APPROVAL",
            delivery_start=d("2027-01-10"),
            delivery_end=d("2027-01-20"),
            max_delay_until=d("2027-01-31"),
        ),
        [OPT5],
        [("1단계", "2026-10-15", "2026-11-15", {"opt-5": (27000, 50, 0)})],
    ),
    (
        dict(
            id="p-hallabong",
            farm_id="f-kang",
            name="한라봉 5kg",
            variety="한라봉",
            photos=[photo("basket-floor.jpg")],
            status="DRAFT",
            description="꼭지가 볼록한 한라봉이에요.",
        ),
        [OPT5],
        [],
    ),
    (
        dict(
            id="p-josaeng",
            farm_id="f-kang",
            name="조생 감귤 5kg",
            variety="조생",
            photos=[photo("orchard-crate.jpg")],
            status="CLOSED",
            delivery_start=d("2026-09-25"),
            delivery_end=d("2026-10-05"),
            max_delay_until=d("2026-10-15"),
        ),
        [OPT5],
        [("1단계", "2026-08-20", "2026-09-30", {"opt-5": (21000, 60, 52)})],
    ),
    (
        dict(
            id="p-noji",
            farm_id="f-halla",
            name="노지 감귤 10kg",
            variety="온주밀감",
            photos=[photo("tangerine-sky.jpg")],
            grade="상",
            expected_brix=11,
            brix_record_count=1,
            status="PUBLISHED",
            description="노지에서 자란 새콤달콤한 귤이에요.",
            farmer_note="아침 이슬 마르면 바로 땁니다.",
            delivery_start=d("2026-12-01"),
            delivery_end=d("2026-12-15"),
            max_delay_until=d("2026-12-31"),
            info={
                **KANG_INFO,
                "origin": "제주 제주시",
                "producer": "한라네 과수원 한○○",
                "size": "10kg(약 70~90과)",
            },
        ),
        [OPT10],
        [
            ("1단계", "2026-10-01", "2026-10-25", {"opt-10": (24000, 40, 12)}),
            ("2단계", "2026-10-26", "2026-11-20", {"opt-10": (27000, 40, 0)}),
        ],
    ),
    (
        dict(
            id="p-hyodon",
            farm_id="f-hyodon",
            name="하우스 감귤 3kg",
            variety="궁천조생",
            photos=[photo("greenhouse-aisle.jpg")],
            grade="특",
            expected_brix=12,
            brix_record_count=3,
            status="PUBLISHED",
            description="작은 하우스에서 한 그루씩 돌본 감귤이에요.",
            farmer_note="작지만 달아요.",
            delivery_start=d("2026-11-15"),
            delivery_end=d("2026-11-25"),
            max_delay_until=d("2026-12-05"),
            info={**KANG_INFO, "producer": "효돈 하우스농원 고○○", "size": "3kg(약 20~25과)"},
        ),
        [OPT3],
        [
            ("1단계", "2026-10-01", "2026-10-16", {"opt-3": (19000, 30, 7)}),
            ("2단계", "2026-10-17", "2026-11-10", {"opt-3": (22000, 30, 0)}),
        ],
    ),
]

BROADCASTS = [
    (
        "n-1",
        "f-kang",
        at("2026-10-07", "08:30"),
        "첫 바구니 따봤어요. 아직 신맛이 조금 남아서 일주일 더 기다립니다.",
        [photo("basket.jpg")],
        "FOLLOWERS",
        42,
    ),
    (
        "n-2",
        "f-kang",
        at("2026-10-05", "09:40"),
        "하우스 안 온도가 잘 유지돼서 실측 11.8Brix 나왔어요. 10일 전후로 첫 수확 시작합니다.",
        [photo("greenhouse.jpg")],
        "PUBLIC",
        128,
    ),
    (
        "n-3",
        "f-halla",
        at("2026-10-04", "18:10"),
        "태풍 지나가고 밭 둘러봤는데 낙과가 거의 없어요. 걱정해 주셔서 감사합니다.",
        [],
        "PUBLIC",
        54,
    ),
    (
        "n-4",
        "f-hyodon",
        at("2026-10-02", "11:00"),
        "하우스 통로 정리 끝. 이제 한 그루씩 열매 솎기 들어가요.",
        [photo("greenhouse-aisle.jpg")],
        "PUBLIC",
        23,
    ),
]

ADDRESSES = [
    (
        "a-1",
        "u-minji",
        None,
        "김민지",
        "010-2345-6789",
        "04001",
        "서울 마포구 월드컵북로 12",
        "302호",
        True,
    ),
    (
        "a-2",
        "u-minji",
        "회사",
        "김민지",
        "010-2345-6789",
        "04524",
        "서울 중구 세종대로 110",
        "7층",
        False,
    ),
]

BUYERS = [
    "최지우",
    "정하늘",
    "윤서연",
    "장민호",
    "임수아",
    "한도윤",
    "오지민",
    "서예린",
    "신우진",
    "권나연",
    "황보람",
    "안태민",
    "송하은",
    "류지환",
    "전소율",
]
CITIES = [
    "서울 송파구 올림픽로 300",
    "경기 성남시 분당구 판교역로 166",
    "인천 연수구 송도과학로 32",
    "대구 수성구 동대구로 100",
    "광주 서구 상무중앙로 61",
    "울산 남구 삼산로 200",
]

# 1:1 대화(Mock db.ts). (농가, 소비자) → [(id, 보낸 쪽, 본문, 시각, 추가 필드)]
THREADS = {
    ("f-kang", "u-minji"): [
        (
            "m-1",
            "CONSUMER",
            "지금 당도 얼마예요? 10kg도 같은 귤인가요?",
            ("2026-10-06", "15:12"),
            {},
        ),
        (
            "m-2",
            "AI",
            "10월 5일 실측 당도는 11.8Brix예요. 5kg과 10kg은 같은 하우스 감귤이고, "
            "10kg은 55,000원이에요.",
            ("2026-10-06", "15:12"),
            {"source_summary": "10월 5일 소식 · 상품 정보", "source_refs": ["product:p-house"]},
        ),
        (
            "m-3",
            "CONSUMER",
            "12일 이후에 받을 수 있게 맞춰주실 수 있나요?",
            ("2026-10-06", "15:15"),
            {},
        ),
        (
            "m-4",
            "AI",
            "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
            ("2026-10-06", "15:15"),
            {
                "handoff_status": "FORWARDED",
                "source_summary": "배송 날짜 약속은 농가만 할 수 있어요",
            },
        ),
        (
            "m-5",
            "PRODUCER",
            "네, 12일 이후 출하로 맞춰드릴게요. 급하면 ●●●-●●●●-●●●●로 연락 주세요.",
            ("2026-10-07", "08:05"),
            {"masked": True},
        ),
    ],
    ("f-halla", "u-minji"): [
        ("m-6", "CONSUMER", "10kg은 몇 개쯤 들어있어요?", ("2026-10-06", "20:01"), {}),
        (
            "m-7",
            "AI",
            "10kg은 약 70~90과예요.",
            ("2026-10-06", "20:01"),
            {"source_summary": "상품 정보", "source_refs": ["product:p-noji"]},
        ),
    ],
    ("f-hyodon", "u-minji"): [
        ("m-8", "CONSUMER", "택배사는 어디로 보내세요?", ("2026-10-02", "13:20"), {}),
    ],
    ("f-kang", "u-seojun"): [
        ("m-9", "CONSUMER", "농약은 언제 마지막으로 치셨어요?", ("2026-10-06", "10:02"), {}),
        (
            "m-10",
            "AI",
            "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
            ("2026-10-06", "10:02"),
            {
                "handoff_status": "FORWARDED",
                "source_summary": "재배 방식은 농가가 직접 답해야 해요",
            },
        ),
    ],
    ("f-kang", "u-buyer-park"): [
        ("m-11", "CONSUMER", "10박스 사면 좀 깎아주실 수 있나요?", ("2026-10-05", "16:40"), {}),
        (
            "m-12",
            "AI",
            "농가에 전달했어요. 농가가 답하면 여기서 볼 수 있어요.",
            ("2026-10-05", "16:40"),
            {"handoff_status": "FORWARDED", "source_summary": "가격 흥정은 AI가 답하지 않아요"},
        ),
    ],
}
# 전달 질문(질문함). (id, 농가, 소비자, 질문 메시지, 관련 예약, 질문, 넘긴 이유, 시각)
ESCALATIONS = [
    (
        "e-1",
        "f-kang",
        "u-minji",
        "m-3",
        "하우스 감귤 5kg 예약",
        "12일 이후에 받을 수 있게 맞춰주실 수 있나요?",
        "배송 날짜 약속은 농가만 할 수 있어요",
        ("2026-10-06", "15:15"),
    ),
    (
        "e-2",
        "f-kang",
        "u-seojun",
        "m-9",
        None,
        "농약은 언제 마지막으로 치셨어요?",
        "재배 방식은 농가가 직접 답해야 해요",
        ("2026-10-06", "10:02"),
    ),
    (
        "e-3",
        "f-kang",
        "u-buyer-park",
        "m-11",
        None,
        "10박스 사면 좀 깎아주실 수 있나요?",
        "가격 흥정은 AI가 답하지 않아요",
        ("2026-10-05", "16:40"),
    ),
]
# 소식방 비공개 답장(M-19): 두 소비자가 같은 방에 답해 서로 안 보이는지 확인할 수 있게
ROOM_REPLIES = [
    (
        "reply-1",
        "f-kang",
        "u-minji",
        "첫 바구니 사진 반가워요! 일주일 뒤에 꼭 맛볼게요.",
        ("2026-10-07", "09:00"),
    ),
    ("reply-2", "f-kang", "u-seojun", "신맛 빠지면 소식 또 올려 주세요.", ("2026-10-07", "09:20")),
]


def _thread_id(farm_id: str, consumer_id: str) -> str:
    return f"thread-{farm_id.removeprefix('f-')}-{consumer_id.removeprefix('u-')}"


def _stage_id(product_id: str, seq: int) -> str:
    return f"st-{product_id.removeprefix('p-')}-{seq}"


def _example_orders() -> list[dict]:
    """김민지 주문 4건과 예시 주문 3건(Mock db.ts)."""
    minji = dict(
        recipient_name="김민지",
        recipient_phone="010-2345-6789",
        postal_code="04001",
        address="서울 마포구 월드컵북로 12",
        address_detail="302호",
    )
    return [
        dict(
            id="o-42",
            order_no="FC-1007-0042",
            consumer_id="u-minji",
            product_id="p-house",
            option_id="opt-5",
            quantity=2,
            unit_price=29000,
            status="RESERVED",
            created_at=at("2026-10-07", "09:12"),
            delivery_note="문 앞에 두고 벨 눌러 주세요",
            **minji,
        ),
        dict(
            id="o-11",
            order_no="FC-0921-0011",
            consumer_id="u-minji",
            product_id="p-noji",
            option_id="opt-10",
            quantity=1,
            unit_price=24000,
            status="RESERVED",
            created_at=at("2026-09-21"),
            proposed_delivery_start=d("2026-12-08"),
            proposed_delivery_end=d("2026-12-22"),
            **minji,
        ),
        dict(
            id="o-07",
            order_no="FC-0918-0007",
            consumer_id="u-minji",
            product_id="p-josaeng",
            option_id="opt-5",
            quantity=1,
            unit_price=21000,
            status="DELIVERED",
            created_at=at("2026-09-18"),
            shipped_at=at("2026-10-02"),
            delivered_at=at("2026-10-04"),
            carrier="CJ",
            tracking_number="6012-3456-7001",
            **minji,
        ),
        dict(
            id="o-03",
            order_no="FC-0915-0003",
            consumer_id="u-minji",
            product_id="p-redhyang",
            option_id="opt-3",
            quantity=1,
            unit_price=32000,
            status="REFUNDED",
            created_at=at("2026-09-15"),
            refunded_at=at("2026-09-28"),
            refund_reason="직접 취소(출하 전)",
            **minji,
        ),
        dict(
            id="o-40",
            order_no="FC-1006-0040",
            consumer_id="u-buyer-choi",
            product_id="p-house",
            option_id="opt-5",
            quantity=2,
            unit_price=29000,
            status="PREPARING",
            created_at=at("2026-10-06", "18:20"),
            recipient_name="최유진",
            recipient_phone="010-6789-2345",
            postal_code="06236",
            address="서울 강남구 테헤란로 152",
            address_detail="15층",
        ),
        dict(
            id="o-38",
            order_no="FC-1006-0038",
            consumer_id="u-seojun",
            product_id="p-house",
            option_id="opt-10",
            quantity=1,
            unit_price=55000,
            status="PREPARING",
            created_at=at("2026-10-06", "14:05"),
            recipient_name="이서준",
            recipient_phone="010-3456-7890",
            postal_code="48094",
            address="부산 해운대구 해운대로 570",
            address_detail="1203호",
        ),
        dict(
            id="o-35",
            order_no="FC-1006-0035",
            consumer_id="u-buyer-park",
            product_id="p-house",
            option_id="opt-5",
            quantity=1,
            unit_price=29000,
            status="PREPARING",
            created_at=at("2026-10-06", "10:30"),
            recipient_name="박지윤",
            recipient_phone="010-5678-1234",
            postal_code="34141",
            address="대전 유성구 대학로 99",
            address_detail="",
        ),
    ]


def _house_orders() -> tuple[list[dict], dict[str, str]]:
    """하우스 감귤 40건(o-40·38·35·42 포함): 예약 완료 30 · 출하 준비 7 · 출하 3, 소비자 37명."""
    g: list[dict] = [
        dict(
            id="o-g0",
            consumer="u-g0",
            name="최지우",
            opt="opt-5",
            qty=2,
            status="PREPARING",
            day="2026-10-05",
        ),
        dict(
            id="o-g1",
            consumer="u-g1",
            name="정하늘",
            opt="opt-10",
            qty=1,
            status="PREPARING",
            day="2026-10-05",
        ),
        dict(
            id="o-g2",
            consumer="u-g2",
            name="윤서연",
            opt="opt-5",
            qty=1,
            status="PREPARING",
            day="2026-10-04",
        ),
        dict(
            id="o-g3",
            consumer="u-g3",
            name="장민호",
            opt="opt-5",
            qty=1,
            status="PREPARING",
            day="2026-10-03",
        ),
        dict(
            id="o-g4",
            consumer="u-g4",
            name="임수아",
            opt="opt-5",
            qty=1,
            status="SHIPPED",
            day="2026-10-01",
            carrier="CJ",
        ),
        dict(
            id="o-g5",
            consumer="u-g5",
            name="한도윤",
            opt="opt-10",
            qty=1,
            status="SHIPPED",
            day="2026-10-01",
            carrier="EPOST",
        ),
        dict(
            id="o-g6",
            consumer="u-g6",
            name="오지민",
            opt="opt-5",
            qty=1,
            status="SHIPPED",
            day="2026-10-02",
            carrier="HANJIN",
        ),
    ]
    for k, name in enumerate(BUYERS[7:]):
        i = k + 7
        g.append(
            dict(
                id=f"o-g{i}",
                consumer=f"u-g{i}",
                name=name,
                opt="opt-10" if i % 2 == 1 and i < 12 else "opt-5",
                qty=2 if i == 8 else 1,
                status="RESERVED",
                day=f"2026-10-0{2 + k % 5}",
            )
        )
    for i in range(21):
        repeat = g[7 + (i - 18) * 2] if i >= 18 else None
        g.append(
            dict(
                id=f"o-r{i}",
                consumer=repeat["consumer"] if repeat else f"u-r{i}",
                name=repeat["name"] if repeat else f"예약자{i + 1}",
                opt="opt-5",
                qty=1,
                status="RESERVED",
                day=f"2026-10-0{1 + i % 7}",
            )
        )
    g.sort(key=lambda o: (o["day"], o["id"]))
    orders, buyers = [], {}
    n = 0
    for k, o in enumerate(g):
        n += 1
        while n in (35, 38, 40, 42):
            n += 1
        shipped = o["status"] == "SHIPPED"
        buyers[o["consumer"]] = o["name"]
        orders.append(
            dict(
                id=o["id"],
                order_no=f"FC-{o['day'][5:7]}{o['day'][8:10]}-{n:04d}",
                consumer_id=o["consumer"],
                product_id="p-house",
                option_id=o["opt"],
                quantity=o["qty"],
                unit_price=55000 if o["opt"] == "opt-10" else 29000,
                status=o["status"],
                created_at=at(o["day"], f"{9 + k % 10:02d}:{k * 7 % 60:02d}"),
                postal_code="06000",
                address=CITIES[k % len(CITIES)],
                address_detail=f"{100 + k}호",
                recipient_name=o["name"],
                recipient_phone=f"010-{1000 + k * 37}-{2000 + k * 53}",
                carrier=o.get("carrier", "CJ") if shipped else None,
                tracking_number=f"6012-3456-{7100 + k}" if shipped else None,
                shipped_at=at("2026-10-06", "17:00") if shipped else None,
            )
        )
    return orders, buyers


def is_seeded(session: Session) -> bool:
    return session.get(User, SEED_MARKER) is not None


def clear(session: Session) -> None:
    for table in reversed(Base.metadata.sorted_tables):
        session.execute(delete(table))


def seed(session: Session) -> None:
    created = at("2026-09-01")
    for uid, name, role in TEST_USERS:
        session.add(User(id=uid, name=name, role=role, is_test_account=True, created_at=created))
    for uid, name in OTHER_PRODUCERS:
        session.add(User(id=uid, name=name, role="PRODUCER", created_at=created))
    session.add(User(id=ADMIN[0], name=ADMIN[1], role="ADMIN", created_at=created))
    session.flush()

    for f in FARMS:
        session.add(Farm(**f))
    session.flush()

    products = {}
    weights: dict[tuple[str, str], int] = {}
    for fields, options, stages in PRODUCTS:
        product_id = fields["id"]
        if fields.get("status") in ("PUBLISHED", "CLOSED"):
            fields = {
                **fields,
                "approved_supply_grams": CAPACITY[product_id],
                "sales_limit_grams": CAPACITY[product_id],
            }
        p = Product(**{"info": KANG_INFO, "updated_at": at("2026-10-06"), **fields})
        session.add(p)
        products[p.id] = p
        session.flush()
        for i, (oid, label, kg, note) in enumerate(options):
            weights[(p.id, oid)] = round(kg * 1000)
            session.add(
                ProductOption(
                    product_id=p.id, id=oid, label=label, weight_kg=kg, note=note, sort_order=i
                )
            )
        session.flush()
        for seq, (name, start, end, values) in enumerate(stages, start=1):
            sid = _stage_id(p.id, seq)
            session.add(
                Stage(
                    id=sid, product_id=p.id, seq=seq, name=name, starts_at=d(start), ends_at=d(end)
                )
            )
            session.flush()
            for oid, (price, qty, reserved) in values.items():
                session.add(StagePrice(stage_id=sid, option_id=oid, product_id=p.id, price=price))
                session.add(
                    StageAllocation(
                        stage_id=sid,
                        option_id=oid,
                        product_id=p.id,
                        quantity=qty,
                        reserved_count=reserved,
                    )
                )
    session.flush()
    session.add(
        CapacityRequest(
            id="capacity-p-cheonggyeon",
            product_id="p-cheonggyeon",
            kind="INITIAL",
            requested_total_grams=250_000,
            status="PENDING",
            created_at=at("2026-10-06"),
            version=1,
        )
    )

    house_orders, buyers = _house_orders()
    examples = _example_orders()
    buyers |= {"u-buyer-choi": "최유진", "u-buyer-park": "박지윤"}
    for uid, name in buyers.items():
        session.add(User(id=uid, name=name, role="CONSUMER", created_at=created))
    session.flush()

    for o in examples + house_orders:
        p = products[o["product_id"]]
        o.setdefault("delivery_note", None)
        released = o["quantity"] if o["status"] == "REFUNDED" and not o.get("shipped_at") else 0
        session.add(
            Order(
                stage_id=_stage_id(p.id, 1),
                unit_weight_grams=weights[(p.id, o["option_id"])],
                released_quantity=released,
                shipping_fee=0,
                remote_area_fee=0,
                total_amount=o["unit_price"] * o["quantity"],
                delivery_start=p.delivery_start,
                delivery_end=p.delivery_end,
                consent_at=o["created_at"],
                consent_version="2026-10-06",
                paid_at=o["created_at"],
                **o,
            )
        )
    session.flush()
    for allocation in session.scalars(select(StageAllocation)):
        allocation.reserved_count = 0
    for order in session.scalars(select(Order)):
        allocation = session.get(StageAllocation, (order.stage_id, order.option_id))
        allocation.reserved_count += order.quantity - order.released_quantity
    session.get(StageAllocation, ("st-redhyang-1", "opt-3")).quantity = 0
    for o in session.scalars(select(Order)):
        session.add(
            Payment(
                id=f"pay-{o.id}",
                order_id=o.id,
                amount=o.total_amount,
                status="APPROVED",
                approved_at=o.paid_at,
            )
        )

    # 팔로워 수(follower_count)는 시드 표시 값이고, 아래는 테스트 계정의 팔로우다.
    follows = (
        ("u-minji", "f-kang"),
        ("u-minji", "f-halla"),
        ("u-minji", "f-hyodon"),
        ("u-seojun", "f-kang"),
        ("u-buyer-park", "f-kang"),
    )
    for consumer, farm in follows:
        session.add(Follow(consumer_id=consumer, farm_id=farm, created_at=created))
    for bid, farm, when, body, photos, visibility, count in BROADCASTS:
        session.add(
            Broadcast(
                id=bid,
                farm_id=farm,
                created_at=when,
                body=body,
                photos=photos,
                visibility=visibility,
                reaction_count=count,
            )
        )
    session.flush()
    session.add(
        Reaction(broadcast_id="n-2", user_id="u-minji", created_at=at("2026-10-05", "12:00"))
    )
    for rid, farm, consumer, body, when in ROOM_REPLIES:
        session.add(
            RoomReply(id=rid, farm_id=farm, consumer_id=consumer, body=body, created_at=at(*when))
        )
    for (farm, consumer), messages in THREADS.items():
        tid = _thread_id(farm, consumer)
        human = any(sender == "PRODUCER" for _, sender, *_ in messages)
        session.add(
            Thread(
                id=tid,
                farm_id=farm,
                consumer_id=consumer,
                ai_mode="HUMAN" if human else "AUTO",
                version=2 if human else 1,
                created_at=at(*messages[0][3]),
            )
        )
        session.flush()
        for mid, sender, body, when, extra in messages:
            session.add(
                ThreadMessage(
                    id=mid,
                    thread_id=tid,
                    sender_type=sender,
                    body=body,
                    photos=[],
                    attachment_ids=[],
                    source_refs=extra.get("source_refs", []),
                    source_summary=extra.get("source_summary"),
                    handoff_status=extra.get("handoff_status"),
                    masked=extra.get("masked", False),
                    settings_version=1 if sender == "AI" else None,
                    needs_human=False,
                    created_at=at(*when),
                )
            )
            session.flush()
    for eid, farm, consumer, mid, context, question, reason, when in ESCALATIONS:
        session.add(
            Escalation(
                id=eid,
                thread_id=_thread_id(farm, consumer),
                thread_message_id=mid,
                context=context,
                question=question,
                reason=reason,
                status="OPEN",
                created_at=at(*when),
            )
        )
    for aid, uid, label, name, phone, postal, address, detail, default in ADDRESSES:
        session.add(
            ShippingAddress(
                id=aid,
                user_id=uid,
                label=label,
                recipient_name=name,
                recipient_phone=phone,
                postal_code=postal,
                address=address,
                address_detail=detail,
                is_default=default,
                created_at=created,
            )
        )
    session.flush()


def main(argv: list[str]) -> None:
    with get_sessionmaker()() as session, session.begin():
        if "--reset" in argv:
            clear(session)
        elif is_seeded(session):
            print("시드가 이미 있어요. 다시 넣으려면 --reset")
            return
        seed(session)
    print("시드를 넣었어요.")


if __name__ == "__main__":
    main(sys.argv[1:])
