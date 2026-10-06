# AGENTS.md — Farmclub 공용 AI 규칙

이 파일은 팀 공용 규칙의 **단일 원천**이다. Codex는 이 파일을 바로 읽고, Claude Code는 `CLAUDE.md`가 이 파일을 import한다.
규칙을 바꾸려면 이 파일을 PR로 수정한다. 개인 취향은 여기 넣지 말고 아래 "개인 규칙"의 local 파일에 덧붙인다.

## 프로젝트
- **Farmclub**: 생산자(농가)와 소비자를 잇는 산지 직거래·선주문 서비스. I1 타깃은 당도 중심 고품질 감귤.
- 팀 4명, 이터레이션 단위(I1, I2 …) 진행. 이슈는 Linear(DEV 팀 = GitHub 이슈와 양방향 동기화).
- 기술 스택: Expo + Expo Router 웹 출력으로 소비자 앱·생산자 앱 2개(Vercel), FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic(Railway, PostgreSQL), 운영자는 관리 API + Swagger UI(화면은 I2). 카카오 로그인 → 서버 JWT. AI는 Claude Haiku 4.5를 `server/app/ai` 어댑터에서만 호출. PostHog·Sentry·Langfuse, 파일은 Cloudflare R2. 상세는 `docs/spec/tech-design/stack.md`.
- 평가 문서는 `docs/wiki/`에 쓰고, main에 머지되면 GitHub Wiki로 자동 동기화된다. 평가 문서(`docs/wiki/`)는 영어, 팀 내부 규칙·spec은 한국어.

## 제품 스펙 (`docs/spec/`)
- 제품 스펙 원본은 `docs/spec/`(한국어)이고, `docs/wiki/`는 영문 요약이다. 안내(문서 위치, 읽는 순서, 문서끼리 다를 때 규칙)는 `docs/spec/README.md`.
- 기능 작업 전 `docs/spec/README.md`의 순서대로 읽는다: `prd.md` → `functional/FEAT-xx-*.md` → `functional/rules.md` → `ia.md` → 작업 폴더 `spec.md`·`tasks.md`.
- 동작·규칙을 바꾸는 PR은 같은 PR에서 `docs/spec/`과 `docs/wiki/` 영문 요약을 함께 고친다.
- 문서끼리 다르거나 스펙에 없으면 추측해 구현하지 않는다. PR·이슈에 질문으로 남긴다.
- 커밋·PR에 FEAT·규칙 ID를 적고, 테스트 이름에 AC ID를 넣는다(예: `test_AC_09_1_...`).

## 작업 순서 (Spec-Anchored)
1. **Linear 이슈** = 작업 지시서. 개발 템플릿(왜 / 완료 조건 / 기록 / 결과)을 채우고 In Progress로 바꾼 뒤 관련자에게 알린다.
2. **브랜치**: Linear의 "Copy git branch name"으로 `main`에서 만든다.
3. **spec**: 작업 폴더에 `spec.md`가 없으면 만들고, `tasks.md`에 이 이슈 섹션을 추가해(`spec` 스킬) 첫 커밋으로 push한다.
4. **draft PR**: branch → `main` draft PR을 연다(`pr-context` 스킬). 관련자에게 알린다.
5. **구현**: `tasks.md`를 기준으로 작업하고, 체크리스트·결정 사항을 계속 갱신한다.
6. **리뷰 요청**: AI 1차 리뷰(`pr-review` 스킬) 반영 → draft 해제 → 사람 리뷰어 1명 지정.
7. **리뷰 반영**: 코멘트마다 수정 커밋 또는 답글로 닫는다.
8. **머지**: `main` → branch 병합으로 최신화하고 확인 → branch → `main` 머지 → GitHub Actions가 배포.

## Spec-Anchored 원칙 (에이전트 필수)
- 작업 시작 전 관련 제품 스펙(FEAT·규칙) → 작업 폴더 `spec.md` → `tasks.md`의 이 이슈 섹션 순으로 읽는다. 없으면 코드를 고치기 전에 `spec` 스킬로 만든다.
- `tasks.md`의 **범위(수정 허용 경로)** 밖 파일은 수정하지 않는다. 필요하면 멈추고 사람에게 묻거나, 범위를 먼저 `tasks.md`에 추가한다.
- 계획에 없던 결정·변경은 코드보다 `tasks.md`의 "결정 사항"에 먼저 적는다. 오래 남을 구현 결정은 머지 때 `spec.md`로 옮긴다.
- 작업을 마칠 때 `git diff main...HEAD`를 `tasks.md`와 대조해 누락·범위 이탈이 없는지 확인한다.
- 같은 문제로 오래 막히면(시도 3회 이상 실패) 계속 헤매지 말고 원인 가설과 선택지를 정리해 사람에게 방향을 묻는다. 사람은 1시간 이상 막히면 PM에게 알린다.
- 컨텍스트가 길어지거나 세션을 넘길 때는 진행 상황을 `tasks.md`의 "기록"에 남긴다(handoff 대신).

## 파일 구조
- 스펙은 두 층이다. 무엇을 만드나(동작·규칙·인수 조건)는 `docs/spec/`, 어떻게 만드나는 기능을 구현하는 코드 폴더의 `spec.md`·`tasks.md`에 둔다.
  - `spec.md`: 이 폴더의 구현 결정. 계속 유지한다. 동작·규칙은 다시 쓰지 않고 FEAT·규칙 ID로 가리킨다.
  - `tasks.md`: Linear 이슈별 작업 기록. 덮어쓰지 않는다. 이슈마다 `## <이슈 키> <제목>` 섹션을 맨 아래에 추가하고, 머지 후에도 지우지 않는다.
  - 동시에 같은 폴더를 두 작업이 쓰면 안 되므로 이슈를 나누거나 순서를 정한다.
- 폴더가 무엇을 하는지 설명이 필요하면 그 폴더에 `README.md`를 둔다(에이전트 컨텍스트로도 쓰임).
- 현재 레포 구조 (상세는 `docs/spec/tech-design/stack.md` 3장):
  - `apps/consumer/`, `apps/producer/` — 소비자 앱, 생산자 앱 (Expo Router 웹)
  - `packages/ui/`, `packages/api/` — 앱 공용 패키지
  - `server/` — FastAPI 서버. `app/` 안에 도메인 모듈(`core`, `accounts`, `farms`, `catalog`, `orders`, `messaging`, `ai`, `analytics`, 모듈마다 `router`·`models`·`schemas`·`service`), `migrations/`(Alembic)
  - `docs/spec/` — 제품 스펙 원본 (한국어)
  - `docs/wiki/` — 평가용 wiki 원본 (`meetings/YYYY-MM-DD-*.md`는 Meeting-Logs로 합쳐짐)
  - `docs/*.html` — 랜딩 페이지
  - `.agents/skills/` — 공용 스킬 원본 (`.claude/skills`는 이 폴더로의 심링크)
  - `.github/` — 워크플로, PR 템플릿

## 브랜치·커밋·PR
- 브랜치 이름과 커밋 메시지, PR 제목에 **이슈 키(`DEV-12`, `SWPP-34`)를 반드시 넣는다** — PR이 Linear 이슈에 자동 연결된다. 개발은 `DEV-xx`, 기획·문서는 `SWPP-xx`.
- 커밋: `type(scope): 요약 (DEV-12)` — type은 `feat` `fix` `docs` `refactor` `test` `chore`. 한 커밋은 한 가지 변경.
- PR 제목: `[DEV-12] 요약`. 본문은 `.github/pull_request_template.md`를 채운다.
- `main`에 직접 push하지 않는다. force push는 자기 브랜치에서만.
- 에이전트는 커밋·push 직전에 `git branch --show-current`로 작업 브랜치인지 확인하고, push는 `git push origin HEAD`처럼 브랜치를 명시한다.
- 여러 작업(세션)을 동시에 돌릴 때는 같은 폴더에서 브랜치를 바꾸지 말고 `git worktree`로 폴더를 나눈다.
- 머지는 사람 1명 Approve 후에만 한다. 에이전트는 사람의 지시 없이 머지하지 않는다.

## 리뷰
- **AI 1차 리뷰**: 작성자가 draft 해제 전에 `pr-review` 스킬로 돌리고, 결과를 PR 코멘트로 남긴 뒤 must 항목을 해결한다.
- **사람 리뷰**: 1명 Approve 필수. 리뷰어는 spec(`tasks.md`)과 diff가 맞는지, 범위 밖 변경이 없는지를 우선 본다.
- 상세 규칙은 `.agents/skills/pr-review/SKILL.md`.

## 금지
- 비밀값(API 키, 토큰, `.env`)을 커밋하지 않는다.
- 개인정보·법인/세무·개인 신상은 DEV 이슈와 레포에 쓰지 않는다(GitHub에 공개 동기화됨).
- 사람이 요청하지 않은 대규모 리팩터링·의존성 추가·포맷 일괄 변경을 하지 않는다.
- 테스트를 통과시키려고 테스트를 지우거나 약하게 만들지 않는다.

## AI 사용 기록
- AI를 쓴 작업은 Linear 결과와 PR 본문에 `Agent 시간 / Tokens`를 적는다(시트 기록용).
- 대표 프롬프트·AI가 틀린 사례는 `docs/wiki/AI-Collaboration-Report.md` 작성 때 쓰이므로 PR 본문 "AI 사용"에 한 줄 남긴다.

## 공용 스킬 (`.agents/skills/`)
| 스킬 | 언제 |
| -- | -- |
| `spec` | 작업 시작 시 Linear 이슈 → 작업 폴더 `spec.md`·`tasks.md` 생성·갱신 |
| `pr-context` | draft PR 생성, PR 본문 작성·갱신 |
| `pr-review` | AI 1차 리뷰, 사람 리뷰 체크리스트, 리뷰 반영 |

## 개인 규칙 (덧붙이기)
공용 규칙을 덮어쓰지 말고 **추가**만 한다. 아래 파일은 gitignore되어 있다.
- Claude Code: 레포 루트 `CLAUDE.local.md` (또는 전역 `~/.claude/CLAUDE.md`)
- Codex: 전역 `~/.codex/AGENTS.md`. 레포의 `AGENTS.override.md`는 공용 규칙을 대체하므로 쓰지 않는다.
- 예시 파일은 `.agents/examples/`에 있다. 복사해서 고쳐 쓴다.
  | 예시 | 복사 위치 |
  | -- | -- |
  | `CLAUDE.local.example.md` | 레포 루트 `CLAUDE.local.md` |
  | `codex-AGENTS.example.md` | `~/.codex/AGENTS.md` |
  | `claude-settings.local.example.json` | `.claude/settings.local.json` (Claude Code 개인 권한) |
- 개인 규칙과 공용 규칙이 충돌하면 공용 규칙이 우선이다. 공용으로 올릴 만한 규칙은 PR로 제안한다.
