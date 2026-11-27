"""발송자 인터페이스와 no-op 발송자(DEV-495).

발송자는 예외를 밖으로 던지지 않고 결과 종류로 돌려준다:
- sent: 업체가 접수함(실제 도착은 업체 콘솔에서 본다, 결정 6)
- retry: 연결 오류·시간 초과·5xx·429. 발송 루프가 1분 → 5분 → 30분 뒤 다시 보낸다(결정 7)
- failed: 4xx·접수 실패(번호·템플릿·변수 오류). 바로 FAILED
- skipped: 보내지 않음(NOTIFY_PROVIDER=none)
`code`는 업체 상태 코드·예외 종류만 담는다. 번호·변수·본문은 넣지 않는다.
"""

from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import Settings

Outcome = Literal["sent", "retry", "failed", "skipped"]


@dataclass(frozen=True)
class OutgoingMessage:
    to: str  # 숫자만
    template_id: str
    variables: dict[str, str]

    def __repr__(self) -> str:  # 로그·예외에 번호·변수가 찍히지 않게
        return "OutgoingMessage(<redacted>)"


@dataclass(frozen=True)
class SendResult:
    outcome: Outcome
    code: str | None = None
    group_id: str | None = None
    message_id: str | None = None


class Sender(Protocol):
    def send(self, message: OutgoingMessage) -> SendResult: ...

    def close(self) -> None: ...


class NoopSender:
    """NOTIFY_PROVIDER=none. 아무 데도 보내지 않는다."""

    def send(self, message: OutgoingMessage) -> SendResult:
        return SendResult("skipped", "provider_disabled")

    def close(self) -> None:
        return None


def build_sender(settings: Settings, transport=None) -> Sender:
    if settings.notify_provider == "solapi":
        from app.notifications.solapi import SolapiSender

        return SolapiSender(
            api_key=settings.solapi_api_key.get_secret_value(),
            api_secret=settings.solapi_api_secret.get_secret_value(),
            pfid=settings.solapi_pfid,
            sender_number=settings.solapi_sender_number,
            transport=transport,
        )
    return NoopSender()


def template_id(settings: Settings, event: str) -> str:
    return {
        "ORDER_AWAITING_DEPOSIT": settings.solapi_template_order_awaiting_deposit,
        "DEPOSIT_REPORTED": settings.solapi_template_deposit_reported,
    }.get(event, "")
