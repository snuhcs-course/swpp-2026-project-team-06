"""Reason-specific owner questions. Detection and publication rules live elsewhere."""

import re

_EXPERIENCE = re.compile(r"\d+\s*년\s*(?:차|전)")
_RELATIVE = re.compile(r"내년|올해|작년|조만간|이번\s*주|현재|최근|곧|지금")
_YEAR = re.compile(r"\d{4}\s*년")
_MONEY = re.compile(r"\d[\d,.]*\s*원")


def prompts_for(value, reasons):
    codes = list(dict.fromkeys(code for values in reasons.values() for code in values))
    prompts, seen = [], set()

    def add(code, question, detail, severity="check", confirmation="내용을 확인했어요.", key=None):
        if (key or code) in seen:
            return
        seen.add(key or code)
        prompts.append(
            {
                "code": code,
                "question": question,
                "detail": detail,
                "severity": severity,
                "confirmation": confirmation,
            }
        )

    for code in codes:
        if code in {"RELATIVE_TIME", "DATED_OR_HISTORICAL"}:
            experience = _EXPERIENCE.search(value)
            if experience:
                phrase = experience.group()
                add(
                    code,
                    f"‘{phrase}’는 어느 해 기준인가요? 지금도 맞는 표현인가요?",
                    (
                        "자료를 작성한 때의 표현일 수 있어요. 실제 귀촌·시작 "
                        "연도로 바꾸면 시간이 지나도 명확해요."
                    ),
                    confirmation="기간 표현의 기준 시점을 확인했고 현재 문구가 맞아요.",
                    key="REFERENCE_YEAR",
                )
            else:
                match = _RELATIVE.search(value) or _YEAR.search(value)
                phrase = match.group() if match else "이 시점 표현"
                add(
                    code,
                    f"‘{phrase}’는 언제를 뜻하나요? 현재 설명으로 사용해도 괜찮나요?",
                    (
                        "원문을 작성한 시점과 지금은 다를 수 있어요. 과거 이야기인지 "
                        "구분하거나 정확한 연도·날짜로 고쳐 주세요."
                    ),
                    confirmation="시점과 과거 이력을 확인했고 현재 설명으로 사용해도 맞아요.",
                    key="REFERENCE_YEAR",
                )
        elif code in {"PRICE_OR_FEE", "MONEY_AMOUNT"}:
            amounts = list(dict.fromkeys(_MONEY.findall(value)))
            amount = " · ".join(f"‘{value}’" for value in amounts) if amounts else "이 금액"
            add(
                code,
                f"{amount}이 지금 판매하는 금액과 일치하나요?",
                (
                    "자료에 적힌 금액과 실제 판매 설정을 함께 확인해 주세요. "
                    "이 확인으로 판매 설정이 바뀌지는 않아요."
                ),
                severity="warning",
                confirmation="자료의 금액과 현재 판매 설정이 일치하는지 확인했어요.",
                key="PRICE",
            )
        elif code == "SEASON_OR_AVAILABILITY":
            add(
                code,
                "이 판매·수확 시기가 지금 상품에도 맞나요?",
                (
                    "제철·예약·재고 안내는 시기에 따라 달라질 수 있어요. "
                    "현재 판매분에 해당하는지 확인해 주세요."
                ),
                confirmation="판매·수확 시기와 현재 상품의 상태를 확인했어요.",
            )
        elif code == "DISPATCH_OR_DELIVERY":
            add(
                code,
                "이 출고·배송 안내를 지금도 지킬 수 있나요?",
                "출고일과 도착 예상일, 추가 배송 조건이 현재 가능한 내용인지 확인해 주세요.",
                confirmation="현재 출고·배송 조건으로 가능한 안내임을 확인했어요.",
            )
        elif code in {
            "PAYMENT_OR_RETURN_TERMS",
            "TIMING_OR_SALES_TERMS",
            "POLICY_TEXT",
            "PLATFORM_TEXT",
        }:
            add(
                code,
                "이 거래 안내가 지금 우리 농가에 적용되는 내용인가요?",
                (
                    "예전 판매처의 안내가 섞였거나 운영 방식이 바뀌었을 "
                    "수 있어요. 지금 적용하는 조건인지 확인해 주세요."
                ),
                confirmation="현재 우리 농가에 적용되는 거래 안내인지 확인했어요.",
                key="TERMS",
            )
        elif code == "POSSIBLE_FRAGMENT":
            tail = value.strip()[-25:]
            add(
                code,
                f"‘{tail}’ 뒤에 이어지는 내용이 빠졌나요?",
                "문장이 끊겼을 수 있어요. 없는 뒷문장은 만들지 않았으니 원자료를 확인해 주세요.",
                severity="warning",
                confirmation="원문의 앞뒤 문맥을 확인했고 이 표현으로 사용해도 괜찮아요.",
            )
        elif code == "CONTINUATION_CONTEXT":
            add(
                code,
                "아래처럼 이어 읽는 문맥이 자연스러운가요?",
                (
                    "서로 다른 추출 항목의 인접 원문을 연결했어요. 현재 "
                    "페이지에 들어갈 문장 전체를 확인해 주세요."
                ),
                confirmation="연결된 문장 전체의 문맥과 배치를 확인했어요.",
            )
        elif code in {"OCR_SPLIT", "POSSIBLE_SPACING"}:
            add(
                code,
                "단어나 띄어쓰기가 어색한 곳이 있나요?",
                (
                    "자료를 읽는 과정에서 단어가 나뉘었을 수 있어요. "
                    "원문과 비교하고 필요하면 수정해 주세요."
                ),
                confirmation="원문과 단어·띄어쓰기를 비교해 확인했어요.",
                key="SPACING",
            )
        elif code == "EXACT_REPETITION":
            add(
                code,
                "이 문장을 반복해서 보여 주려는 의도인가요?",
                (
                    "같은 문장이 다른 곳에도 있어요. 필요한 반복인지 "
                    "확인하거나 한곳으로 정리해 주세요."
                ),
                confirmation="반복되는 문장이 필요한 내용인지 확인했어요.",
            )
        elif code in {"COMMON_SCOPE_UNCONFIRMED", "AMBIGUOUS_MODULE_ROUTING", "FIELD_LIMIT"}:
            add(
                code,
                "이 내용을 어느 항목에 넣으면 좋을까요?",
                (
                    "대상 상품이나 배치가 분명하지 않거나 한 항목에 담기에는 "
                    "길어요. 사용할 위치와 문구를 직접 정해 주세요."
                ),
                severity="warning",
                confirmation="대상 상품과 사용할 위치를 확인했어요.",
                key="PLACEMENT",
            )
        elif code == "PRIVATE_VALUE":
            add(
                code,
                "개인정보가 포함됐을 수 있어요. 공개해도 되는 문구로 바꿔 주시겠어요?",
                (
                    "전화번호·이메일 등 비공개 정보가 남아 있는지 "
                    "확인하고 수정하거나 본문에서 제외해 주세요."
                ),
                severity="critical",
            )
        elif code == "HEALTH_CLAIM":
            add(
                code,
                "질병 효능을 보장하는 표현으로 읽힐 수 있어요. 수정해 주시겠어요?",
                (
                    "질병 예방·치료 주장을 빼고 확인 가능한 상품 "
                    "특징으로 고치거나 본문에서 제외해 주세요."
                ),
                severity="critical",
            )
        elif code == "OTHER_PRODUCT":
            add(
                code,
                "다른 상품의 설명이 섞였을 수 있어요. 이 상품 내용만 남겨 주시겠어요?",
                "품종·구성·조건이 현재 상품에 해당하는지 확인하고 수정하거나 제외해 주세요.",
                severity="critical",
            )
        elif code == "EXAGGERATION":
            add(
                code,
                "이 단정적인 표현을 뒷받침할 수 있나요?",
                (
                    "강한 보장이나 과장이 포함됐을 수 있어요. 근거를 "
                    "확인하거나 표현을 부드럽게 고쳐 주세요."
                ),
                severity="warning",
                confirmation="이 표현을 뒷받침할 근거와 문맥을 확인했어요.",
            )
        else:
            add(
                code,
                "이 문구를 그대로 사용해도 괜찮나요?",
                "원문의 뜻과 지금 사용할 위치를 함께 확인해 주세요.",
            )
    return prompts
