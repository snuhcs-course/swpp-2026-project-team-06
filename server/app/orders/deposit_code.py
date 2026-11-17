"""입금자명(짧은 입금 코드, DEV-342, R-28). 순수 함수만 둔다.

은행 '받는 분 통장 표시' 칸은 대개 7자 안팎이라 주문 번호(`FC-MMDD-NNNN`, 12자)가 잘린다.
그래서 닉네임 앞 3글자 + 숫자 2자리(예: `귤사랑76`)를 입금자명으로 쓴다. 주문 번호는 그대로 둔다.

- 이름(PM 11/17): 농가에 이미 보이는 가림 이름(`accounts.public_name`: 닉네임, 없으면
  이름 앞 글자 + ○○)에서 한글 음절·로마자만 남긴 앞 3글자. 공백·숫자·이모지·특수문자는 뺀다
  (은행이 특수문자를 지우고, 이름 속 숫자는 뒤 숫자와 헷갈린다). 남는 글자가 없으면 '주문'.
  계정 실명·받는 사람 이름은 쓰지 않는다.
- 길이: 이름 3글자 + 숫자 2자리 = 5자. 같은 이름의 00~99가 다 쓰였으면 숫자 3자리(6자).
- 숫자는 같은 농가의 입금 대기 주문, 그리고 입금 기한이 끝난 지 3일이 안 된 돈 없이 취소된 주문과
  겹치지 않는 값 중에서 무작위로 고른다(늦게 보낸 돈이 새 주문과 헷갈리지 않게).

Mock(`packages/api/src/depositCode.ts`)과 백필 마이그레이션(0033)이 같은 규칙을 따른다.
"""

import re
import secrets

NAME_LENGTH = 3
FALLBACK_NAME = "주문"
# 숫자 자릿수. 앞 칸(2자리)이 다 차면 다음 칸(3자리)
DIGITS = (2, 3)
_NOT_NAME = re.compile(r"[^가-힣A-Za-z]")


def code_name(name: str | None) -> str:
    """한글 음절·로마자만 남긴 앞 3글자. 남는 글자가 없으면 '주문'."""
    cleaned = _NOT_NAME.sub("", name or "")
    return cleaned[:NAME_LENGTH] or FALLBACK_NAME


def pick_code(name: str, taken: set[str]) -> str | None:
    """`taken`(같은 농가에서 쓰는 중인 입금자명)과 겹치지 않는 입금자명.

    대소문자를 가리지 않고 비교한다(`Kim00`과 `KIM00`은 같다: 은행이 대문자로 바꾸기도 하고
    운영자 찾기도 대소문자를 무시한다). 남은 값이 없으면 None."""
    used = {code.upper() for code in taken}
    for digits in DIGITS:
        free = [
            code
            for n in range(10**digits)
            if (code := f"{name}{n:0{digits}d}").upper() not in used
        ]
        if free:
            return secrets.choice(free)
    return None
