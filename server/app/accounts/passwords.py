"""아이디·비밀번호 규칙과 argon2id 해시(DEV-363). 평문은 이 모듈 밖으로 저장·기록하지 않는다.

- 해시: argon2id, OWASP 권장 최소값(m=19MiB, t=2, p=1). 동시 해시는 4개까지(세마포어)라
  로그인이 몰려도 메모리가 약 80MiB를 넘지 않는다(기본값 64MiB × 스레드 40이면 서버가 죽을 수 있다).
  검증은 argon2 안의
  상수 시간 비교. 없는 아이디도 `dummy_verify`로 같은 비용을 써서 응답 시간으로 존재를 알 수 없다.
- 정책: 8~128자, 공백만 안 됨, 아이디와 같으면 안 됨, 흔한 비밀번호 안 됨
  (NIST SP 800-63B, 조합 규칙 없음).
"""

import re
import secrets
import threading
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

PASSWORD_MIN = 8
PASSWORD_MAX = 128
# 128자 × UTF-8 최대 4바이트. 해시 전에 한 번 더 막는다(긴 입력으로 CPU를 쓰게 하지 않게)
PASSWORD_MAX_BYTES = 512
USERNAME_RE = re.compile(r"^[a-z][a-z0-9]{3,19}$")
USERNAME_RULE = "아이디는 영문 소문자로 시작하는 영문 소문자·숫자 4~20자예요"
PASSWORD_RULE = "비밀번호는 8~128자로, 아이디와 같거나 흔한 비밀번호는 쓸 수 없어요"

# 운영·시스템처럼 보일 수 있는 아이디
RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "administrator",
        "farmclub",
        "support",
        "root",
        "system",
        "operator",
        "manager",
        "kakao",
        "test",
        "tester",
        "null",
        "undefined",
        "official",
        "help",
        "staff",
    }
)

# 흔한 비밀번호(8자 이상만 의미가 있다). 소문자로 비교한다
COMMON_PASSWORDS = frozenset(
    {
        "password",
        "password1",
        "password12",
        "password123",
        "passw0rd",
        "p@ssw0rd",
        "12345678",
        "123456789",
        "1234567890",
        "0123456789",
        "11111111",
        "00000000",
        "88888888",
        "87654321",
        "12341234",
        "11223344",
        "qwerty12",
        "qwerty123",
        "qwertyuiop",
        "qwer1234",
        "1234qwer",
        "q1w2e3r4",
        "1q2w3e4r",
        "1q2w3e4r5t",
        "1qaz2wsx",
        "zaq12wsx",
        "asdf1234",
        "asdfghjk",
        "asdfasdf",
        "zxcvbnm1",
        "zxcvbnm123",
        "abcd1234",
        "abc12345",
        "abcdefgh",
        "a1234567",
        "aa123456",
        "iloveyou",
        "iloveyou1",
        "sunshine",
        "princess",
        "football",
        "baseball",
        "superman",
        "dragon12",
        "monkey12",
        "master12",
        "letmein1",
        "welcome1",
        "welcome123",
        "admin123",
        "admin1234",
        "administrator",
        "farmclub",
        "farmclub1",
        "farmclub12",
        "farmclub123",
        "farmclub1234",
        "gamgyul1",
        "mandarin",
        "tangerine",
    }
)


# OWASP Password Storage Cheat Sheet의 argon2id 최소 권장값. 바꾸면 `check_needs_rehash`가
# 로그인 때 옛 해시를 새 값으로 다시 해시한다(실제 검증과 더미 검증이 같은 값을 쓴다)
ARGON2_MEMORY_COST = 19456  # KiB = 19 MiB
ARGON2_TIME_COST = 2
ARGON2_PARALLELISM = 1
# 한꺼번에 도는 해시·검증 수. 넘으면 차례를 기다린다(진짜 아이디·없는 아이디 모두 같은 줄)
HASH_CONCURRENCY = 4
_slots = threading.BoundedSemaphore(HASH_CONCURRENCY)


@lru_cache
def _hasher() -> PasswordHasher:
    return PasswordHasher(
        time_cost=ARGON2_TIME_COST,
        memory_cost=ARGON2_MEMORY_COST,
        parallelism=ARGON2_PARALLELISM,
    )


def normalize_username(raw: str) -> str:
    """앞뒤 공백을 지우고 소문자로. 같은 아이디는 대소문자와 상관없이 하나다.

    ASCII일 때만 소문자로 바꾼다(켈빈 기호 K 같은 글자가 k로 바뀌어 다른 아이디로 들어오지 않게).
    """
    value = raw.strip()
    return value.lower() if value.isascii() else value


def username_error(username: str) -> str | None:
    """정규화한 아이디가 규칙에 맞지 않으면 사용자 문구, 맞으면 None."""
    if not USERNAME_RE.fullmatch(username):
        return USERNAME_RULE
    if username in RESERVED_USERNAMES:
        return "쓸 수 없는 아이디예요"
    return None


def password_error(password: str, username: str | None = None) -> str | None:
    """비밀번호 정책. 어긴 규칙의 문구를 돌려준다. 입력값은 문구에 넣지 않는다."""
    if len(password) < PASSWORD_MIN or len(password) > PASSWORD_MAX:
        return f"비밀번호는 {PASSWORD_MIN}~{PASSWORD_MAX}자로 적어 주세요"
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        return f"비밀번호는 {PASSWORD_MIN}~{PASSWORD_MAX}자로 적어 주세요"
    if not password.strip():
        return "공백만으로는 비밀번호를 만들 수 없어요"
    if username and password.lower() == username.lower():
        return "아이디와 다른 비밀번호를 써 주세요"
    if password.lower() in COMMON_PASSWORDS:
        return "너무 흔한 비밀번호예요. 다른 비밀번호를 써 주세요"
    return None


def _checked(password: str) -> str:
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("password too long")
    return password


def hash_password(password: str) -> str:
    value = _checked(password)
    with _slots:
        return _hasher().hash(value)


def verify_password(password_hash: str, password: str) -> bool:
    """상수 시간 검증. 해시가 깨졌거나 입력이 너무 길면 False(예외를 밖으로 내지 않는다)."""
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        dummy_verify(password[:PASSWORD_MAX])
        return False
    try:
        with _slots:
            return _hasher().verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher().check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


@lru_cache
def _dummy_hash() -> str:
    # 프로세스마다 한 번. 값은 의미 없고 비용(같은 매개변수)만 같게 한다
    return hash_password(secrets.token_urlsafe(16))


def dummy_verify(password: str) -> None:
    """없는 아이디·비밀번호 없는 계정에서도 같은 비용으로 검증해 시간 차이를 없앤다."""
    dummy = _dummy_hash()
    try:
        value = _checked(password[:PASSWORD_MAX])
        with _slots:
            _hasher().verify(dummy, value)
    except (VerifyMismatchError, VerificationError, InvalidHashError, ValueError):
        pass


# 임시 비밀번호: 헷갈리는 글자(0 O o 1 l I)를 뺀 영문 대소문자·숫자
_TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
TEMP_PASSWORD_LENGTH = 12


def temporary_password() -> str:
    """운영자가 사용자에게 알려 줄 임시 비밀번호(약 70비트). 숫자·글자를 하나 이상 넣는다."""
    while True:
        value = "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(TEMP_PASSWORD_LENGTH))
        if any(c.isdigit() for c in value) and any(c.isalpha() for c in value):
            if password_error(value) is None:
                return value
