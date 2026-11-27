"""공통 오류 형식 {code, message, details} (screens.md 7.1)."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.background import BackgroundTask
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.analytics.service import report_server_exception
from app.core.masking import redact_secret_fields

logger = logging.getLogger(__name__)

_DEFAULT_CODES = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    429: "RATE_LIMITED",
}


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}
        self.headers = headers


def invalid(fields: dict[str, str], message: str = "입력한 내용을 확인해 주세요.") -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", message, {"fields": fields})


def unauthenticated(message: str = "로그인이 필요해요.") -> ApiError:
    return ApiError(401, "UNAUTHENTICATED", message)


def forbidden(message: str = "볼 수 없는 화면이에요.", reason: str | None = None) -> ApiError:
    return ApiError(403, "FORBIDDEN", message, {"reason": reason} if reason else {})


def not_found(message: str = "찾을 수 없어요.") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def conflict(reason: str, message: str, **details: Any) -> ApiError:
    return ApiError(409, "CONFLICT", message, {"reason": reason, **details})


def too_many_requests(message: str, retry_after: int) -> ApiError:
    """429 RATE_LIMITED + Retry-After(초). 아이디별 로그인 잠금(DEV-363)."""
    return ApiError(
        429,
        "RATE_LIMITED",
        message,
        {"retryAfter": retry_after},
        headers={"Retry-After": str(retry_after)},
    )


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "message": message, "details": details or {}}


def _field_name(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header")]
    return ".".join(parts) or "body"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.code, exc.message, exc.details), exc.status, headers=exc.headers
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # 입력값(input)은 돌려주지 않고 메시지만. 비밀번호 칸은 메시지도 고정 문구로(DEV-363)
        fields = redact_secret_fields(
            {_field_name(tuple(e["loc"])): e["msg"] for e in exc.errors()}
        )
        body = error_body("VALIDATION_ERROR", "입력한 내용을 확인해 주세요.", {"fields": fields})
        return JSONResponse(body, 400)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _DEFAULT_CODES.get(exc.status_code, "INTERNAL_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "요청을 처리하지 못했어요."
        return JSONResponse(error_body(code, message), exc.status_code)

    @app.exception_handler(Exception)
    async def _internal_error(request: Request, exc: Exception) -> JSONResponse:
        route = getattr(request.scope.get("route"), "path", None) or "unmatched"
        logger.error(
            "Unhandled error on %s %s",
            request.method,
            route,
            exc_info=(type(exc), exc, exc.__traceback__),
        )
        # 응답을 보낸 뒤 백그라운드로 보낸다(DEV-498). 실패해도 500 응답은 같다
        return JSONResponse(
            error_body("INTERNAL_ERROR", "잠시 후 다시 시도해 주세요."),
            500,
            background=BackgroundTask(report_server_exception, exc, route, request.method),
        )
