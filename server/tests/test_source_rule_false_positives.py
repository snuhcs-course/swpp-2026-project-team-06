"""DEV-452: two rejections from the 11/25 benchmark, fixed without weakening the rules."""

import pytest

from app.source_analysis import worker
from app.source_analysis.preprocess import scrub
from app.source_analysis.schemas import Extraction
from app.source_analysis.worker import ExtractionError

DELIVERY = (
    "당일 오전에 포장하여 신선한 상태로 보내드리면 보통 다음날 도착합니다. "
    "(단 기상 악조건이나 택배사의 사정으로 1~2일 정도 배송이 지연될 수도 있습니다)"
)


@pytest.mark.parametrize(
    "text",
    [
        DELIVERY,
        "이 정도면 3일 안에 도착해요",
        "노형동 3일 배송",
        "당도는 높은 편으로 12브릭스",
        "산지에서 2-3일",
    ],
)
def test_AC_SRC_3_quantities_after_a_particle_are_not_addresses(text):
    assert scrub(text) == text


@pytest.mark.parametrize(
    "text",
    [
        "제주시 중앙로 12",
        "제주시 중앙로 12-3 2층",
        "애월읍 하귀리 123",
        "연동 1234-5",
        "테헤란로 152",
    ],
)
def test_AC_SRC_3_real_addresses_still_hidden(text):
    assert "[가림]" in scrub(text)


def extraction(value, quote):
    return Extraction(
        candidates=[
            {
                "targetId": None,
                "fieldKey": "productionProcess",
                "value": value,
                "historical": False,
                "evidence": [
                    {
                        "sourceId": "s",
                        "sourceRevision": 1,
                        "page": 1,
                        "spanIds": ["s0"],
                        "quote": quote,
                    }
                ],
            }
        ],
        photo_requests=[],
    )


def chunk(quote):
    return {
        "sourceId": "s",
        "sourceRevision": 1,
        "pages": [{"number": 1, "spans": [{"id": "s0", "text": quote}]}],
    }


def test_AC_SRC_3_english_unit_is_put_back_into_the_source_unit():
    quote = "카라향은 1년 내내 나무에 열매가 달려 있어 성장 기간이 깁니다."
    data = extraction("카라향은 1 year 내내 나무에 열매가 달려 있어 성장 기간이 깁니다.", quote)
    worker.validate(data, chunk(quote), set())
    assert data.candidates[0].value == quote


@pytest.mark.parametrize(
    ("value", "quote"),
    [
        ("2 years 동안 키웠어요", "1년 동안 키웠어요"),
        ("30개", "5kg"),
        ("3 months 숙성", "3월 수확"),
    ],
)
def test_AC_SRC_3_unsupported_numbers_still_rejected(value, quote):
    with pytest.raises(ExtractionError, match="UNSUPPORTED_NUMBER"):
        worker.validate(extraction(value, quote), chunk(quote), set())
