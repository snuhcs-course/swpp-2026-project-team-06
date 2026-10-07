# SNU-SWPP-Template

You can use the README file to showcase and promote your mobile app. The template provided below is just a starting point. Feel free to craft your README as you see fit. 

Please note that the README doesn't affect your grade and is not included in documentation(Wiki).

# [Your Application Name]

[Short application description here]

![Application Screenshot](path_to_screenshot.png)

## Features

- Feature 1: Brief description
- Feature 2: Brief description
- ...

## Getting Started

### Prerequisites

- Android Studio [version, e.g., 4.2.1]
- Minimum Android SDK Version [e.g., 21]

### Installation

[Installation link here]

## 로컬 실행

필요한 것: Docker, [uv](https://docs.astral.sh/uv/), Node.js(npm). 레포 구조와 폴더별 구현 결정은 `docs/spec/tech-design/stack.md` 3장과 각 폴더의 `spec.md`.

### 서버 (`server/`)

```bash
cd server
docker compose up -d          # 로컬 PostgreSQL 16
cp .env.example .env          # 필요한 값만 채운다. 빈 값은 app/core/config.py 기본값
uv sync
uv run uvicorn app.main:app --reload
```

- http://localhost:8000/health → `{"status": "ok"}`, API 문서는 http://localhost:8000/docs
- 테스트·린트: `uv run pytest`, `uv run ruff check .`
- 마이그레이션: `uv run alembic upgrade head`

### 앱 (`apps/consumer`, `apps/producer`)

```bash
npm install                                   # 레포 루트에서 (npm workspaces)
npm run web -w apps/consumer                  # 소비자 앱 http://localhost:8081
npm run web -w apps/producer -- --port 8082   # 생산자 앱
```

- 서버 주소는 `EXPO_PUBLIC_API_URL`(기본 `http://localhost:8000`).
- 타입 검사: `npm run typecheck -w apps/consumer`, 웹 빌드: `npx expo export -p web`(각 앱 폴더에서)
