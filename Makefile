# Farmclub 로컬 작업 입구 (DEV-117). `make`로 타깃 목록을 본다.
#
# 규칙
# - 로직은 npm 스크립트·scripts/*.mjs·server 명령에 두고, 여기서는 부르기만 한다.
# - 검사 타깃은 CI(.github/workflows/ci.yml)와 같은 명령을 부른다.
# - 새 테스트 묶음을 만들면 해당 test-* 타깃에 한 줄 추가한다(각자 자기 영역).
# - 운영 명령(railway, 운영 배포, 운영 DB)은 넣지 않는다. DB를 쓰는 타깃은 로컬 DB에서만 돈다.
# - 150줄을 넘으면 make/*.mk로 나누고 `include make/*.mk` 한다. 하위 폴더 Makefile은 만들지 않는다.
# - macOS 기본 make 3.81에서 돈다. GNU make 4 전용 문법(.ONESHELL, != 등)은 쓰지 않는다.

.DEFAULT_GOAL := help
SHELL := /bin/bash

SERVER  := cd server &&
COMPOSE := docker compose -f server/docker-compose.yml

# DATABASE_URL(환경 변수 > server/.env > 기본값 localhost)이 로컬이 아니면 멈춘다. 비밀번호는 출력하지 않는다.
LOCAL_DB_ONLY = url="$${DATABASE_URL:-$$(sed -n 's/^DATABASE_URL=//p' server/.env 2>/dev/null)}"; \
	case "$$url" in \
		""|*@localhost[:/]*|*@127.0.0.1[:/]*) ;; \
		*) echo "로컬 DB가 아니라서 멈춥니다: $${url\#*@}"; exit 1 ;; \
	esac

.PHONY: help
help: ## 타깃 목록
	@grep -hE '^##@|^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk ' \
		/^##@/ { printf "\n%s\n", substr($$0, 5); next } \
		{ split($$0, part, ":.*## "); printf "  \033[36m%-17s\033[0m %s\n", part[1], part[2] }'


##@ 준비
.PHONY: setup db db-down migrate seed

# npm ci는 package-lock.json이 바뀐 때만 돈다(해시를 node_modules/.farmclub-lock.sha에 남긴다).
LOCK_STAMP := node_modules/.farmclub-lock.sha

setup: ## 의존성 설치 (npm ci + uv sync --frozen)
	@if [ "$$(shasum package-lock.json)" = "$$(cat $(LOCK_STAMP) 2>/dev/null)" ]; then \
		echo "npm ci 건너뜀: package-lock.json 그대로 (다시 설치: rm $(LOCK_STAMP))"; \
	else \
		npm ci && shasum package-lock.json > $(LOCK_STAMP); \
	fi
	$(SERVER) uv sync --frozen

db: ## 로컬 PostgreSQL 시작 (준비될 때까지 대기)
	$(COMPOSE) up -d --wait db

db-down: ## 로컬 PostgreSQL 중지 (데이터는 남김)
	$(COMPOSE) down

migrate: ## 로컬 DB 마이그레이션 (alembic upgrade head)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run alembic upgrade head

seed: ## 로컬 DB 데모 시드 (RESET=1이면 지우고 다시)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run python -m app.core.seed $(if $(filter 1,$(RESET)),--reset)


##@ 실행
.PHONY: dev dev-api

dev: ## 소비자·생산자 앱 + Mock API (npm run dev)
	npm run dev

dev-api: ## FastAPI 서버, 실제 로컬 DB + Mock 로그인
	@$(LOCAL_DB_ONLY)
	$(SERVER) APP_ENV=local MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --reload


##@ 검사 (CI와 같은 명령, 새 테스트 묶음은 해당 test-*에 한 줄 추가)
.PHONY: check lint test test-server test-apps test-admin test-integration test-e2e

check: lint test ## PR 전에 한 번: lint + test

lint: ## ruff check (CI server 잡)
	$(SERVER) uv run ruff check .

test: test-server test-apps test-admin ## 서버 + 앱 + 관리자 페이지 (통합·e2e 제외)

test-server: ## pytest + alembic check (CI server 잡, make db 먼저)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run pytest
	$(SERVER) uv run alembic upgrade head && uv run alembic check

test-apps: ## Mock 계약 테스트 + 타입 검사 (CI apps 잡)
	npm run test:mock
	npm run typecheck

test-admin: ## 관리자 페이지 테스트 (CI admin-web 잡)
	node --test scripts/admin-web/admin.test.mjs

test-integration: ## 실제 스택 API + Chromium (CI integration 잡, 무거움)
	npm run test:integration:full

test-e2e: ## Chromium만, 이미 띄운 실제 스택 대상
	npm run test:e2e


##@ 정리
.PHONY: clean-worktrees

# 머지된 PR(squash merge 포함)의 브랜치이고 변경이 없는 .claude/worktrees/*만 지운다.
# 지금 쓰는 worktree와 브랜치는 그대로 둔다. gh를 못 읽으면 아무것도 지우지 않는다.
clean-worktrees: ## 머지된 .claude/worktrees/* 정리 (기본은 목록만, CONFIRM=1이면 삭제)
	@merged="$$(gh pr list --state merged --limit 1000 --json headRefName -q '.[].headRefName')" \
		|| { echo "gh로 머지된 PR을 읽지 못해 멈춥니다 (gh auth status 확인)"; exit 1; }; \
	root="$$(dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")"; \
	here="$$(git rev-parse --show-toplevel)"; \
	for dir in "$$root"/.claude/worktrees/*/; do \
		dir="$${dir%/}"; \
		branch="$$(git -C "$$dir" branch --show-current 2>/dev/null)"; \
		[ -n "$$branch" ] && [ "$$dir" != "$$here" ] && grep -qxF "$$branch" <<< "$$merged" || continue; \
		if [ -n "$$(git -C "$$dir" status --porcelain)" ]; then echo "건너뜀 (변경 있음): $$dir"; \
		elif [ "$(CONFIRM)" = 1 ]; then git worktree remove "$$dir" && echo "삭제: $$dir"; \
		else echo "삭제 대상: $$dir [$$branch]"; fi; \
	done; \
	[ "$(CONFIRM)" = 1 ] || echo "지우려면: make clean-worktrees CONFIRM=1"
