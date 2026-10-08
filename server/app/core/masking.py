"""연락처·계좌번호 가림(M-16, M-18). 날짜(2026-11-10)처럼 짧은 숫자 묶음은 가리지 않는다."""

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
