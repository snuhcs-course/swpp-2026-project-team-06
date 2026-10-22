# Farmclub 로컬 작업 입구 (DEV-117). `make` 또는 `make help`로 목록을 본다.
# - 로직은 npm 스크립트(package.json)·scripts/*.mjs·server 명령에 두고, 여기서는 부르기만 한다.
# - 검사 타깃은 CI(.github/workflows/ci.yml)와 같은 명령을 부른다.
# - 운영 명령(railway, 운영 배포, 운영 DB)은 넣지 않는다. migrate·seed·dev-api는 로컬 DB에서만 돈다.
# - 새 테스트 묶음을 만들면 해당 test-* 타깃에 한 줄 추가한다(각자 자기 영역).
# - 150줄을 넘으면 make/*.mk로 나누고 여기서 `include make/*.mk` 한다(README "로컬 실행").
# - macOS 기본 make(3.81)에서 돈다. GNU make 4 전용 문법(.ONESHELL, !=, $(file) 등)은 쓰지 않는다.

.DEFAULT_GOAL := help
SHELL := /bin/bash

COMPOSE := docker compose -f server/docker-compose.yml

# DATABASE_URL(환경 변수 > server/.env > 기본값 localhost)이 로컬이 아니면 멈춘다.
LOCAL_DB_ONLY = url="$${DATABASE_URL:-$$(sed -n 's/^DATABASE_URL=//p' server/.env 2>/dev/null)}"; \
	case "$$url" in ""|*@localhost[:/]*|*@127.0.0.1[:/]*) ;; \
	*) echo "로컬 DB가 아니라서 멈춥니다: DATABASE_URL 호스트 $${url\#*@}"; exit 1;; esac

.PHONY: help setup db db-down migrate seed dev dev-api \
	test test-server test-apps test-admin test-integration test-e2e \
	lint check clean-worktrees

help: ## 타깃 목록 (기본)
	@grep -hE '^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*## "} {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ---- 준비 -------------------------------------------------------------------

setup: ## 의존성 설치: npm ci(package-lock.json이 바뀐 때만) + server uv sync --frozen
	@if [ "$$(shasum package-lock.json)" = "$$(cat node_modules/.farmclub-lock.sha 2>/dev/null)" ]; then \
		echo "node_modules가 package-lock.json과 같음. npm ci 건너뜀 (다시 설치: rm node_modules/.farmclub-lock.sha)"; \
	else \
		npm ci && shasum package-lock.json > node_modules/.farmclub-lock.sha; \
	fi
	cd server && uv sync --frozen

db: ## 로컬 PostgreSQL 16 시작 (server/docker-compose.yml, 준비될 때까지 대기)
	$(COMPOSE) up -d --wait db

db-down: ## 로컬 PostgreSQL 중지 (데이터 볼륨은 남김)
	$(COMPOSE) down

migrate: ## 로컬 DB에 alembic upgrade head
	@$(LOCAL_DB_ONLY)
	cd server && uv run alembic upgrade head

seed: ## 로컬 DB에 데모 시드 (RESET=1이면 지우고 다시)
	@$(LOCAL_DB_ONLY)
	cd server && uv run python -m app.core.seed $(if $(RESET),--reset)

# ---- 실행 -------------------------------------------------------------------

dev: ## 소비자·생산자 앱 + Mock API 로컬 실행 (npm run dev → scripts/local.mjs)
	npm run dev

dev-api: ## FastAPI 서버 로컬 실행 (실제 DB, Mock 로그인 켬. make db migrate seed 먼저)
	@$(LOCAL_DB_ONLY)
	cd server && APP_ENV=local MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --reload

# ---- 검사 (CI와 같은 명령) ---------------------------------------------------
# 새 테스트 묶음은 아래 test-* 중 해당 타깃에 한 줄 추가한다.

test: test-server test-apps test-admin ## 서버·앱·관리자 페이지 테스트 (통합·e2e 제외)

test-server: ## pytest + alembic 마이그레이션 검사 (CI server 잡, make db 먼저)
	@$(LOCAL_DB_ONLY)
	cd server && uv run pytest
	cd server && uv run alembic upgrade head && uv run alembic check

test-apps: ## Mock 계약 테스트 + 전체 workspace 타입 검사 (CI apps 잡, 웹 export 제외)
	npm run test:mock
	npm run typecheck

test-admin: ## 관리자 페이지 테스트 (CI admin-web 잡)
	node --test scripts/admin-web/admin.test.mjs

test-integration: ## 실제 스택 API + Chromium 통합 테스트 (CI integration 잡, 무거움)
	npm run test:integration:full

test-e2e: ## Chromium e2e만 (이미 띄운 실제 스택 대상)
	npm run test:e2e

lint: ## ruff check (CI server 잡과 같은 범위)
	cd server && uv run ruff check .

check: lint test ## PR 전 한 번에: lint + test

# ---- 정리 -------------------------------------------------------------------

clean-worktrees: ## 머지된 .claude/worktrees/* 정리 (기본 시험 실행, CONFIRM=1이면 삭제)
	node scripts/clean-worktrees.mjs $(if $(CONFIRM),--confirm)
