"""모든 응답에 서버 시각(X-Server-Time)을 붙인다(DEV-229).

앱은 입금 기한 지남·'오늘·어제'를 이 시각으로 판단한다.
표준 Date 헤더는 uvicorn이 실제 시각으로 붙여 FIXED_NOW(평가·데모 고정 시계)를
따르지 못하므로 따로 둔다. 본문·스키마는 바꾸지 않는다.
"""

from app.core import clock

HEADER = "X-Server-Time"


class ServerTimeMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def send_with_time(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((HEADER.lower().encode(), clock.now().isoformat().encode()))
                message = {**message, "headers": headers}
            await send(message)

        return await self.app(scope, receive, send_with_time)
