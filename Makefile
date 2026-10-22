# Farmclub local entry point (DEV-117). Run `make` to list targets.
#
# Rules
# - Keep logic in npm scripts, scripts/*.mjs and server commands. This file only calls them.
# - Check targets run the same commands as CI (.github/workflows/ci.yml).
# - When you add a new test suite, add one line to the matching test-* target (each person owns their area).
# - No production commands (Railway, production deploys or databases). Targets that touch a database run on a local one only.
# - Past ~150 lines, split targets into make/*.mk and `include make/*.mk`. No Makefiles in subfolders.
# - Works with macOS's default make 3.81. Avoid GNU make 4-only syntax (.ONESHELL, != and so on).

.DEFAULT_GOAL := help
SHELL := /bin/bash

SERVER  := cd server &&
COMPOSE := docker compose -f server/docker-compose.yml

# Stop unless DATABASE_URL (environment > server/.env > default localhost) is local. Never prints the password.
LOCAL_DB_ONLY = url="$${DATABASE_URL:-$$(sed -n 's/^DATABASE_URL=//p' server/.env 2>/dev/null)}"; \
	case "$$url" in \
		""|*@localhost[:/]*|*@127.0.0.1[:/]*) ;; \
		*) echo "Stopped: not a local database ($${url\#*@})"; exit 1 ;; \
	esac

.PHONY: help
help: ## List targets
	@grep -hE '^##@|^[a-zA-Z0-9_-]+:.*## ' $(MAKEFILE_LIST) | awk ' \
		/^##@/ { printf "\n%s\n", substr($$0, 5); next } \
		{ split($$0, part, ":.*## "); printf "  \033[36m%-20s\033[0m %s\n", part[1], part[2] }'


##@ Setup
.PHONY: setup db db-down migrate seed

# npm ci runs only when package-lock.json changed (its hash is kept in node_modules/.farmclub-lock.sha).
LOCK_STAMP := node_modules/.farmclub-lock.sha

setup: ## Install dependencies (npm ci + uv sync --frozen)
	@if [ "$$(shasum package-lock.json)" = "$$(cat $(LOCK_STAMP) 2>/dev/null)" ]; then \
		echo "Skipping npm ci: package-lock.json unchanged (to reinstall: rm $(LOCK_STAMP))"; \
	else \
		npm ci && shasum package-lock.json > $(LOCK_STAMP); \
	fi
	$(SERVER) uv sync --frozen

db: ## Start local PostgreSQL and wait until ready
	$(COMPOSE) up -d --wait db

db-down: ## Stop local PostgreSQL (keeps data)
	$(COMPOSE) down

migrate: ## Migrate the local database (alembic upgrade head)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run alembic upgrade head

seed: ## Seed demo data into the local database (RESET=1 to start over)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run python -m app.core.seed $(if $(filter 1,$(RESET)),--reset)


##@ Run
.PHONY: dev dev-api

dev: ## Consumer and producer apps + Mock API (npm run dev)
	npm run dev

dev-api: ## FastAPI server on the local database with Mock login
	@$(LOCAL_DB_ONLY)
	$(SERVER) APP_ENV=local MOCK_LOGIN_ENABLED=true uv run uvicorn app.main:app --reload


##@ Check (same commands as CI; add new test suites to the matching test-*)
.PHONY: check lint test test-server test-apps test-admin test-integration test-e2e coverage-producer coverage-producer-ui

check: lint test ## Run once before a PR: lint + test

lint: ## ruff check (CI server job)
	$(SERVER) uv run ruff check .

test: test-server test-apps test-admin ## Server + apps + admin page (no integration or e2e)

test-server: ## pytest + alembic check (CI server job; run make db first)
	@$(LOCAL_DB_ONLY)
	$(SERVER) uv run pytest
	$(SERVER) uv run alembic upgrade head && uv run alembic check

test-apps: ## Mock contract tests + typecheck (CI apps job)
	npm run test:mock
	npm run typecheck

test-admin: ## Admin page tests (CI admin-web job)
	node --test scripts/admin-web/admin.test.mjs

test-integration: ## Real-stack API + Chromium (CI integration job, heavy)
	npm run test:integration:full

test-e2e: ## Chromium only, against an already-running real stack
	npm run test:e2e

# Coverage (Testing Documentation 3.6): local measurement only, not run in CI.
# The UI report needs the coverage run first and clears its cache after one report.
coverage-producer: ## Producer logic line/branch coverage (Node test runner)
	npm run coverage:producer

coverage-producer-ui: ## Producer screens coverage over the real-stack suite (heavy, reseeds the local DB)
	@$(LOCAL_DB_ONLY)
	rm -rf .artifacts/coverage
	FARMCLUB_COVERAGE=1 npm run test:integration:full
	npm run coverage:producer-ui


##@ Clean up
.PHONY: clean-worktrees

# Removes only .claude/worktrees/* whose branch has a merged PR (squash merges included) and no changes.
# Keeps the current worktree and all branches. Removes nothing if gh cannot be read.
clean-worktrees: ## Remove merged .claude/worktrees/* (lists only; CONFIRM=1 removes)
	@merged="$$(gh pr list --state merged --limit 1000 --json headRefName -q '.[].headRefName')" \
		|| { echo "Stopped: could not read merged PRs with gh (check gh auth status)"; exit 1; }; \
	root="$$(dirname "$$(git rev-parse --path-format=absolute --git-common-dir)")"; \
	here="$$(git rev-parse --show-toplevel)"; \
	for dir in "$$root"/.claude/worktrees/*/; do \
		dir="$${dir%/}"; \
		branch="$$(git -C "$$dir" branch --show-current 2>/dev/null)"; \
		[ -n "$$branch" ] && [ "$$dir" != "$$here" ] && grep -qxF "$$branch" <<< "$$merged" || continue; \
		if [ -n "$$(git -C "$$dir" status --porcelain)" ]; then echo "Skipped (has changes): $$dir"; \
		elif [ "$(CONFIRM)" = 1 ]; then git worktree remove "$$dir" && echo "Removed: $$dir"; \
		else echo "Would remove: $$dir [$$branch]"; fi; \
	done; \
	[ "$(CONFIRM)" = 1 ] || echo "To remove: make clean-worktrees CONFIRM=1"
