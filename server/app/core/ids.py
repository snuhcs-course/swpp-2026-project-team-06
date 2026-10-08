"""문자열 ID. 시드는 Mock과 같은 ID(u-minji, f-kang, p-house)를 쓰고 새 행은 접두어 + 랜덤."""

import secrets


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(5)}"
