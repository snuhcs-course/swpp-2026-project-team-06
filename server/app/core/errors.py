"""공통 오류 형식 {code, message, details} (screens.md 7.1)."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

_DEFAULT_CODES = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


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


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"code": code, "message": message, "details": details or {}}


def _field_name(loc: tuple[Any, ...]) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path", "header")]
    return ".".join(parts) or "body"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message, exc.details), exc.status)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = {_field_name(tuple(e["loc"])): e["msg"] for e in exc.errors()}
        body = error_body("VALIDATION_ERROR", "입력한 내용을 확인해 주세요.", {"fields": fields})
        return JSONResponse(body, 400)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _DEFAULT_CODES.get(exc.status_code, "INTERNAL_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else "요청을 처리하지 못했어요."
        return JSONResponse(error_body(code, message), exc.status_code)

    @app.exception_handler(Exception)
    async def _internal_error(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(error_body("INTERNAL_ERROR", "잠시 후 다시 시도해 주세요."), 500)
