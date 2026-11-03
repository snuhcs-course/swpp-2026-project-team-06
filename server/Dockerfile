# Farmclub API 서버 (Railway 배포, DEV-64). 로컬 개발은 README의 uv 방식을 그대로 쓴다.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.10.12 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

# 의존성 층을 먼저 만들어 코드만 바뀔 때 다시 설치하지 않는다. dev(pytest·ruff)·ocr 제외.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .

# 시작할 때마다 마이그레이션을 최신으로 맞춘 뒤 Railway가 주는 $PORT로 띄운다.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
