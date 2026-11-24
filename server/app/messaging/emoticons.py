"""Fixed sticker IDs and readable captions; no free-form payload encoding."""

from typing import Literal

from app.core.errors import invalid

EmoticonId = Literal[
    "farmclub-reserved",
    "farmclub-paid",
    "farmclub-packing",
    "farmclub-shipping",
    "farmclub-arrived",
    "farmclub-delicious",
    "farmclub-wait",
    "farmclub-check",
    "farmclub-thanks",
    "farmclub-sorry",
]

EMOTICONS = dict(
    zip(
        EmoticonId.__args__,
        [
            "예약했어요",
            "입금했어요",
            "포장 중이에요",
            "오늘 출하해요",
            "잘 도착했어요",
            "맛있어요",
            "잠시만요",
            "확인 부탁해요",
            "고마워요",
            "미안해요",
        ],
        strict=True,
    )
)


def message_text(text: str, media: list, emoticon_id: str | None) -> str:
    if emoticon_id is None:
        return text
    if emoticon_id not in EMOTICONS:
        raise invalid({"emoticonId": "사용할 수 없는 이모티콘이에요."})
    if text.strip() or media:
        raise invalid({"emoticonId": "이모티콘은 글·사진과 따로 보내 주세요."})
    # Existing deployed clients, summaries and quote snapshots retain meaningful text.
    return EMOTICONS[emoticon_id]
