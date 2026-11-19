"""연락처·계좌번호 가림(M-16, M-18). 날짜(2026-11-10)처럼 짧은 숫자 묶음은 가리지 않는다.

비밀번호 칸 가림(DEV-363): 오류 응답·감사 요약에 비밀번호 입력이 남지 않게 한다.
"""

import re

_PHONE = re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}")
# 계좌번호: 하이픈으로 나뉜 숫자 묶음 중 숫자가 10자리 이상인 것
_ACCOUNT = re.compile(r"\d{2,6}(?:-\d{2,8}){2,3}")


def _is_account(value: str) -> bool:
    return sum(ch.isdigit() for ch in value) >= 10


def find_contacts(text: str) -> list[str]:
    found = [m.group(0) for m in _PHONE.finditer(text)]
    found += [m.group(0) for m in _ACCOUNT.finditer(text) if _is_account(m.group(0))]
    return found


def mask(text: str) -> tuple[str, bool]:
    """숫자를 ●로 바꾼다(예: 010-●●●●-●●●●가 아니라 전체 ●). 가린 것이 있으면 True."""
    masked = text
    contacts = find_contacts(text)
    for value in contacts:
        masked = masked.replace(value, re.sub(r"\d", "●", value))
    return masked, bool(contacts)


def strip(text: str, placeholder: str = "[연락처]") -> str:
    """AI로 보내기 전에 연락처를 지운다(M-18)."""
    for value in find_contacts(text):
        text = text.replace(value, placeholder)
    return text


# 비밀번호처럼 응답·기록에 절대 남기면 안 되는 입력 칸(카멜·스네이크 모두)
SECRET_FIELDS = frozenset(
    {
        "password",
        "currentPassword",
        "current_password",
        "newPassword",
        "new_password",
        "temporaryPassword",
        "temporary_password",
    }
)
SECRET_FIELD_MESSAGE = "비밀번호를 확인해 주세요"


def is_secret_field(name: str) -> bool:
    """`password`, `body.newPassword`처럼 마지막 조각이 비밀 칸이면 True."""
    return name.split(".")[-1] in SECRET_FIELDS


def redact_secret_fields(fields: dict[str, str]) -> dict[str, str]:
    """검증 오류 {칸: 메시지}에서 비밀 칸의 메시지를 고정 문구로 바꾼다.

    입력값이 메시지에 섞여 나가지 않게 한다.
    """
    return {k: SECRET_FIELD_MESSAGE if is_secret_field(k) else v for k, v in fields.items()}

