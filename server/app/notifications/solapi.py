"""솔라피 알림톡 클라이언트(DEV-495).

근거(2026-11-28 확인, 솔라피 공식 문서 solapi.com/developers/api/... 와 공식 SDK 소스
github.com/solapi/solapi-nodejs·solapi-python·solactl):
- 인증(authentication-api-key): `Authorization: HMAC-SHA256 apiKey=<키>, date=<ISO 8601>,
  salt=<12~64바이트, 요청마다 다름>, signature=<hex(HMAC-SHA256(secret, date + salt))>`.
  서버 시각과 ±15분 안, 같은 서명은 15분 안에 다시 못 쓴다. 인증 오류는 HTTP 403
  (InvalidAPIKey·SignatureDoesNotMatch·RequestTimeTooSkewed·DuplicatedSignature)
  → 다시 보내지 않는다.
- 발송(messages): `POST /messages/v4/send-many/detail`, 본문 `messages[]`, `showMessageList`,
  `allowDuplicates`(기본 false). `send-many/fast`도 같은 형식(최신 SDK는 fast를 쓴다).
- 알림톡(messages-ata): `kakaoOptions.pfId`·`templateId` 필수, `variables`는 `{"#{변수명}": "값"}`,
  `disableSms` 기본 false면 알림톡 실패 때 SMS/LMS 대체 발송. `from`이 없거나 등록 안 된 번호면
  대체 없이 실패. 번호는 문서 예시·SDK 모두 숫자만. `type: "ATA"`는 SDK 메시지 종류 값.
- 응답: `groupInfo.groupId`, `messageList[].messageId`(showMessageList일 때, 접수 성공 `2000`),
  접수 실패는 `failedMessageList[].statusCode`·`statusMessage`(예: `3040` 미등록 발신번호).
- 미확인: 접수 실패 상태 코드 전체 목록(그래서 접수 실패는 모두 다시 보내지 않고 FAILED),
  템플릿에 버튼이 있을 때 요청에 `buttons`를 다시 보내야 하는지(안 보냄, 템플릿 버튼을 쓴다고 봄),
  대체 문자 문구를 요청 `text`로 줘야 하는지(안 줌), 5xx·429 때 업체가 접수했는지, 테스트 모드 유무.

테스트는 `httpx.MockTransport`만 쓴다. 실제 api.solapi.com 연결은 conftest가 막는다.
"""

import hashlib
import hmac
import re
import secrets
import string
from datetime import UTC, datetime

import httpx

from app.notifications.sender import OutgoingMessage, SendResult

BASE_URL = "https://api.solapi.com"
SEND_PATH = "/messages/v4/send-many/detail"
TIMEOUT_SECONDS = 10.0
_SALT_ALPHABET = string.ascii_letters + string.digits
_CODE = re.compile(r"[^A-Za-z0-9_.:-]")
_LONG_DIGITS = re.compile(r"\d[\d-]{6,}\d")


def signature(api_secret: str, date: str, salt: str) -> str:
    return hmac.new(api_secret.encode(), (date + salt).encode(), hashlib.sha256).hexdigest()


def authorization(
    api_key: str, api_secret: str, *, date: str | None = None, salt: str | None = None
) -> str:
    # 서명 시각은 FIXED_NOW가 아니라 실제 시각이어야 한다(업체가 시각 차이를 검사할 수 있음)
    date = date or datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")  # 문서 예시와 같은 꼴
    salt = salt or "".join(secrets.choice(_SALT_ALPHABET) for _ in range(32))
    return (
        f"HMAC-SHA256 apiKey={api_key}, date={date}, salt={salt}, "
        f"signature={signature(api_secret, date, salt)}"
    )


def _safe_id(value) -> str:
    """업체 그룹·메시지 id. 영숫자·기호 몇 개만 남긴다."""
    return _CODE.sub("", str(value))[:100]


def safe_code(value, limit: int = 40) -> str:
    """업체가 준 코드에서 영숫자·기호 몇 개만 남긴다(본문·번호가 섞여 들어오지 않게).

    하이픈을 뺀 숫자가 7자리 이상 이어지면(번호일 수 있음) 통째로 지운다.
    """
    cleaned = _CODE.sub("", str(value))
    return _LONG_DIGITS.sub("", cleaned)[:limit]


class SolapiSender:
    def __init__(
        self,
        *,
        api_key: str,
        api_secret: str,
        pfid: str,
        sender_number: str,
        transport: httpx.BaseTransport | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = api_key
        self._api_secret = api_secret
        self._pfid = pfid
        self._from = "".join(ch for ch in sender_number if ch.isdigit())
        self._client = httpx.Client(base_url=BASE_URL, transport=transport, timeout=timeout)

    def __repr__(self) -> str:
        return "SolapiSender(<redacted>)"

    def body(self, message: OutgoingMessage) -> dict:
        return {
            "messages": [
                {
                    "to": message.to,
                    "from": self._from,
                    "type": "ATA",
                    "kakaoOptions": {
                        "pfId": self._pfid,
                        "templateId": message.template_id,
                        "variables": message.variables,
                        # 알림톡이 카카오 쪽에서 실패하면 업체가 대체 문자로 보낸다(발신번호 필요)
                        "disableSms": False,
                    },
                }
            ],
            "showMessageList": True,
        }

    def send(self, message: OutgoingMessage) -> SendResult:
        try:
            response = self._client.post(
                SEND_PATH,
                json=self.body(message),
                headers={"Authorization": authorization(self._api_key, self._api_secret)},
            )
        except httpx.TimeoutException as exc:
            # 업체가 받았을 수도 있지만 놓치는 것보다 두 번 가는 쪽을 고른다(결정 7)
            return SendResult("retry", type(exc).__name__)
        except httpx.HTTPError as exc:
            return SendResult("retry", type(exc).__name__)
        status = response.status_code
        if status == 429 or status >= 500:
            return SendResult("retry", f"http_{status}")
        if status >= 400:
            return SendResult("failed", f"http_{status}:{safe_code(_error_code(response))}")
        try:
            data = response.json()
        except ValueError:
            # 2xx라 접수됐을 가능성이 높다. 다시 보내지 않고 id 없이 접수로 남긴다
            return SendResult("sent", "unparsed_response")
        failed = data.get("failedMessageList") or []
        if failed:
            return SendResult("failed", f"failed:{safe_code(failed[0].get('statusCode', ''))}")
        group = data.get("groupInfo") or {}
        messages = data.get("messageList") or []
        message_id = messages[0].get("messageId") if messages else None
        group_id = group.get("groupId") or group.get("_id")
        return SendResult(
            "sent",
            None,
            _safe_id(group_id) if group_id else None,
            _safe_id(message_id) if message_id else None,
        )

    def close(self) -> None:
        self._client.close()


def _error_code(response: httpx.Response) -> str:
    try:
        return str(response.json().get("errorCode", ""))
    except ValueError:
        return ""
