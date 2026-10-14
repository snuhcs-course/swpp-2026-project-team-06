"""Bound multipart reads before spooling; keep all private responses out of caches."""

from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse


class SourceRequestMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/source-analysis"):
            return await self.app(scope, receive, send)
        limit = 21 * 1024 * 1024
        length = dict(scope.get("headers", [])).get(b"content-length")
        if length:
            try:
                too_large = int(length) > limit
            except ValueError:
                too_large = True
            if too_large:
                response = JSONResponse(
                    {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": "업로드 요청이 너무 커요.",
                        "details": {},
                    },
                    413,
                )
                return await response(scope, receive, send)
        consumed = 0

        async def bounded_receive():
            nonlocal consumed
            message = await receive()
            if message["type"] == "http.request":
                consumed += len(message.get("body", b""))
                if consumed > limit:
                    raise HTTPException(413, "업로드 요청이 너무 커요.")
            return message

        async def private_send(message):
            if message["type"] == "http.response.start":
                headers = [
                    (k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"
                ]
                message["headers"] = headers + [
                    (b"cache-control", b"no-store"),
                    (b"x-content-type-options", b"nosniff"),
                ]
            await send(message)

        await self.app(scope, bounded_receive, private_send)
