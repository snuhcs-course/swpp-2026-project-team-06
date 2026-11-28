"""DEV-495 솔라피 클라이언트: 서명·요청 모양·응답 분류.

`httpx.MockTransport`만 쓴다(외부 연결 없음).
"""

import hashlib
import hmac
import json
import re

import httpx
import pytest

from app.notifications.sender import OutgoingMessage
from app.notifications.solapi import SEND_PATH, SolapiSender, authorization, safe_code

MESSAGE = OutgoingMessage(
    to="01000001234", template_id="TPL_ORDER", variables={"#{농가명}": "테스트 농가"}
)


def sender(handler) -> SolapiSender:
    return SolapiSender(
        api_key="KEY-NOT-REAL",
        api_secret="SECRET-NOT-REAL",
        pfid="KA01PF-NOT-REAL",
        sender_number="010-0000-9999",
        transport=httpx.MockTransport(handler),
    )


def test_authorization_header_is_hmac_sha256_of_date_and_salt():
    value = authorization(
        "KEY", "SECRET", date="2026-11-28T00:00:00+00:00", salt="abcdefghijklmnopqrstuvwxyz012345"
    )
    expected = hmac.new(
        b"SECRET", b"2026-11-28T00:00:00+00:00abcdefghijklmnopqrstuvwxyz012345", hashlib.sha256
    ).hexdigest()
    assert value == (
        "HMAC-SHA256 apiKey=KEY, date=2026-11-28T00:00:00+00:00, "
        f"salt=abcdefghijklmnopqrstuvwxyz012345, signature={expected}"
    )
    generated = authorization("KEY", "SECRET")
    salt = re.search(r"salt=([A-Za-z0-9]+),", generated).group(1)
    assert len(salt) == 32 and salt != re.search(
        r"salt=([A-Za-z0-9]+),", authorization("KEY", "SECRET")
    ).group(1)


def test_send_posts_alimtalk_with_kakao_options_and_reads_ids():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "groupInfo": {"groupId": "G4V20261128"},
                "messageList": [{"messageId": "M4V20261128", "statusCode": "2000"}],
                "failedMessageList": [],
            },
        )

    result = sender(handler).send(MESSAGE)
    assert (result.outcome, result.group_id, result.message_id) == (
        "sent",
        "G4V20261128",
        "M4V20261128",
    )
    [request] = seen
    assert request.method == "POST" and str(request.url) == f"https://api.solapi.com{SEND_PATH}"
    assert request.headers["Authorization"].startswith("HMAC-SHA256 apiKey=KEY-NOT-REAL, date=")
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == {
        "messages": [
            {
                "to": "01000001234",
                "from": "01000009999",
                "type": "ATA",
                "kakaoOptions": {
                    "pfId": "KA01PF-NOT-REAL",
                    "templateId": "TPL_ORDER",
                    "variables": {"#{농가명}": "테스트 농가"},
                    "disableSms": False,
                },
            }
        ],
        "showMessageList": True,
    }


@pytest.mark.parametrize(
    ("response", "outcome", "code"),
    [
        (httpx.Response(503, text="down"), "retry", "http_503"),
        (httpx.Response(429, json={"errorCode": "TooManyRequests"}), "retry", "http_429"),
        (
            httpx.Response(400, json={"errorCode": "ValidationError", "errorMessage": "010-0000"}),
            "failed",
            "http_400:ValidationError",
        ),
        (httpx.Response(401, text="no"), "failed", "http_401:"),
        (
            httpx.Response(
                200,
                json={
                    "groupInfo": {"groupId": "G"},
                    "failedMessageList": [
                        {"to": "01000001234", "statusCode": "3059", "statusMessage": "번호"}
                    ],
                },
            ),
            "failed",
            "failed:3059",
        ),
        (httpx.Response(200, text="not json"), "sent", "unparsed_response"),
    ],
)
def test_send_classifies_responses(response, outcome, code):
    result = sender(lambda request: response).send(MESSAGE)
    assert (result.outcome, result.code) == (outcome, code)
    # 업체 메시지(번호가 섞일 수 있음)는 코드에 들어가지 않는다
    assert "010" not in (result.code or "")


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (httpx.ReadTimeout("slow"), "ReadTimeout"),
        (httpx.ConnectError("refused"), "ConnectError"),
    ],
)
def test_transport_errors_are_retried(error, code):
    def handler(request):
        raise error

    result = sender(handler).send(MESSAGE)
    assert (result.outcome, result.code) == ("retry", code)


def test_safe_code_keeps_only_simple_characters():
    assert safe_code("3059") == "3059"
    # 번호처럼 보이는 긴 숫자는 코드에 남기지 않는다
    assert "1234" not in safe_code("3059 수신번호 010-0000-1234!")
    assert "1234" not in safe_code("01000001234")
    assert safe_code("a b<c>") == "abc"
    assert len(safe_code("x" * 300)) == 40


def test_message_repr_hides_phone_and_variables():
    assert "0100" not in repr(MESSAGE) and "농가" not in repr(MESSAGE)


def test_real_solapi_connection_is_blocked_in_tests():
    """conftest 고정 장치: 실수로 실제 transport를 쓰면 연결 전에 실패한다."""
    real = SolapiSender(
        api_key="KEY-NOT-REAL",
        api_secret="SECRET-NOT-REAL",
        pfid="KA01PF-NOT-REAL",
        sender_number="01000009999",
    )
    with pytest.raises(AssertionError, match="solapi.com"):
        real._client.post(SEND_PATH, json={})
    with pytest.raises(AssertionError, match="solapi.com"):
        import socket

        socket.getaddrinfo("api.solapi.com", 443)
