# AGENTS.md — Farmclub 공용 AI 규칙

이 파일은 팀 공용 규칙의 **단일 원천**이다. Codex는 이 파일을 바로 읽고, Claude Code는 `CLAUDE.md`가 이 파일을 import한다.
규칙을 바꾸려면 이 파일을 PR로 수정한다. 개인 취향은 여기 넣지 말고 아래 "개인 규칙"의 local 파일에 덧붙인다.

## 프로젝트
- **Farmclub**: 생산자(농가)와 소비자를 잇는 산지 직거래·선주문 서비스. I1 타깃은 당도 중심 고품질 감귤.
- 팀 4명, 이터레이션 단위(I1, I2 …) 진행. 이슈는 Linear(DEV 팀 = GitHub 이슈와 양방향 동기화).
- 기술 스택: Expo + Expo Router 웹 출력으로 소비자 앱·생산자 앱 2개(Vercel), FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic(Railway, PostgreSQL), 운영자는 관리 API + Swagger UI(화면은 I2). 로그인은 I1 Mock(시드 테스트 계정), I2 카카오 → 서버 JWT. AI는 Claude Haiku 4.5를 `server/app/ai` 어댑터에서만 호출. PostHog·Sentry·Langfuse, 파일은 Cloudflare R2. 상세는 `docs/spec/tech-design/stack.md`.
- 평가 문서는 `docs/wiki/`에 쓰고, main에 머지되면 GitHub Wiki로 자동 동기화된다. 평가 문서(`docs/wiki/`)는 영어, 팀 내부 규칙·spec은 한국어.

## 제품 스펙 (`docs/spec/`)
- 제품 스펙 원본은 `docs/spec/`(한국어)이고, `docs/wiki/`는 영문 요약이다. 안내(문서 위치, 읽는 순서, 문서끼리 다를 때 규칙)는 `docs/spec/README.md`.
- 기능 작업 전 `docs/spec/README.md`의 순서대로 읽는다: `prd.md` → `functional/FEAT-xx-*.md` → `functional/rules.md` → `ia.md` → 작업 폴더 `spec.md`·이슈 파일 `tasks/<이슈 키>.md`.
- 동작·규칙을 바꾸는 PR은 같은 PR에서 `docs/spec/`과 `docs/wiki/` 영문 요약을 함께 고친다.
- 화면 모양·문구가 바뀌면 같은 PR에서 Figma v6도 고친다. 못 하면 PR에 후속 이슈를 적는다(PR 본문 `Figma:` 줄, CI `figma-line`이 검사). 관리자 웹(`scripts/admin-web`)도 Figma v6 '현재 시안 · 관리자' 페이지가 기준이다.
- 문서끼리 다르거나 스펙에 없으면 추측해 구현하지 않는다. PR·이슈에 질문으로 남긴다.
- 커밋·PR에 FEAT·규칙 ID를 적고, 테스트 이름에 AC ID를 넣는다(예: `test_AC_09_1_...`).

## 작업 순서 (Spec-Anchored)
1. **Linear 이슈** = 작업 지시서. 개발 템플릿(왜 / 완료 조건 / 기록 / 결과)을 채우고 In Progress로 바꾼 뒤 관련자에게 알린다.
2. **브랜치**: `origin/main`에서 직접 만든다. 이름은 아래 "브랜치·커밋·PR"의 영어 슬러그 규칙을 따른다(Linear "Copy git branch name"은 쓰지 않는다).
3. **spec**: 작업 폴더에 `spec.md`가 없으면 만들고, 이슈 파일 `tasks/<이슈 키>.md`를 새로 만들어(`spec` 스킬) 첫 커밋으로 push한다.
4. **draft PR**: branch → `main` draft PR을 연다(`pr-context` 스킬). 관련자에게 알린다.
5. **구현**: 이슈 파일을 기준으로 작업하고, 체크리스트·결정 사항을 계속 갱신한다.
6. **리뷰 요청**: AI 1차 리뷰(`pr-review` 스킬) 반영 → draft 해제 → 사람 리뷰어 1명 지정.
7. **리뷰 반영**: 코멘트마다 수정 커밋 또는 답글로 닫는다.
8. **머지**: base(보통 `main`) → branch 병합으로 최신화하고 확인 → branch → `main` 머지 → GitHub Actions가 배포 → 배포 확인.

## Spec-Anchored 원칙 (에이전트 필수)
- 작업 시작 전 관련 제품 스펙(FEAT·규칙) → 작업 폴더 `spec.md` → 이슈 파일 `tasks/<이슈 키>.md` 순으로 읽는다. 없으면 코드를 고치기 전에 `spec` 스킬로 만든다.
- 이슈 파일의 **범위(수정 허용 경로)** 밖 파일은 수정하지 않는다. 필요하면 멈추고 사람에게 묻거나, 범위를 먼저 이슈 파일에 추가한다.
- 계획에 없던 결정·변경은 코드보다 이슈 파일의 "결정 사항"에 먼저 적는다. 오래 남을 구현 결정은 머지 때 `spec.md`로 옮긴다.
- 작업을 마칠 때 `git diff main...HEAD`를 이슈 파일과 대조해 누락·범위 이탈이 없는지 확인한다.
- 테스트를 작성했지만 실행하지 못했으면 **미완료**다. 의존성·네트워크 문제로 실행이 막히면 거기서 멈추고, 실행하지 못한 명령과 이유를 그대로 보고한다. "테스트 케이스 추가됨"처럼 통과로 읽히는 표현을 쓰지 않는다.
- 완료 보고는 실제로 실행한 명령과 결과(통과·실패 개수)를 적는다. 문법 검사·경로 감사는 테스트 통과를 대신하지 않는다.
- 머지 뒤 완료 보고(Linear 결과)에는 배포 확인을 넣는다. 대상은 바뀐 경로마다 다르다: `server/**` → Railway, 앱 → Vercel 앱, `scripts/admin-web/` → Vercel 관리자 페이지(`docs/spec/tech-design/stack.md` CI/CD 줄). 사람이 해야 할 단계(운영 변수 등)는 담당자와 함께 적는다.
- 운영 화면을 브라우저로 확인·테스트·캡처할 때는 공식 도메인(`farmclub.kr`, `farm.farmclub.kr`)이 아니라 Vercel 기본 주소(`farmclub-consumer.vercel.app`, `farmclub-producer.vercel.app`)를 쓴다. PostHog는 공식 도메인에서만 켜져서(DEV-125) 통계 오염과 세션 녹화 무료 한도 소모를 막는다(DEV-236). 공유 링크·상대 앱 링크는 공식 도메인으로 나가므로 따라가지 않는다.
- Vercel 기본 주소도 같은 운영 서버·DB를 쓴다. 주문·계정처럼 데이터를 만드는 테스트는 운영 데이터에 남으므로 가능하면 로컬 스택(`make dev` 등)에서 한다. 배포 확인은 curl·API 요청이 먼저다.
- 작업 완료(체크박스 체크, AC 체크, draft 해제, Linear Done)는 의존성이 설치된 환경에서 관련 테스트 묶음(pytest, `npm run test:mock`, `npm run typecheck`, 해당 Playwright spec)이 통과한 것을 누군가 확인한 뒤에만 한다. 실행할 테스트가 없는 문서만의 변경은 예외다.
- 같은 문제로 오래 막히면(시도 3회 이상 실패) 계속 헤매지 말고 원인 가설과 선택지를 정리해 사람에게 방향을 묻는다. 사람은 1시간 이상 막히면 PM에게 알린다.
- 컨텍스트가 길어지거나 세션을 넘길 때는 진행 상황을 이슈 파일의 "기록"에 남긴다(handoff 대신).

## 파일 구조
- 스펙은 두 층이다. 무엇을 만드나(동작·규칙·인수 조건)는 `docs/spec/`, 어떻게 만드나는 기능을 구현하는 코드 폴더의 `spec.md`·`tasks/`에 둔다.
  - `spec.md`: 이 폴더의 구현 결정. 계속 유지한다. 동작·규칙은 다시 쓰지 않고 FEAT·규칙 ID로 가리킨다.
  - `tasks/<이슈 키>.md`(이슈 파일): Linear 이슈 하나에 파일 하나인 작업 기록(예: `server/tasks/DEV-216.md`, 첫 줄 `## DEV-216 <제목>`). 머지 후에도 지우지 않는다. 한 이슈가 여러 폴더를 쓰면 폴더마다 둔다(ADR 0014, DEV-219).
  - `tasks.md`: 2026-11-04 분리 전 기록의 색인. 고치지 않고 새 절을 덧붙이지 않는다.
  - 같은 폴더를 두 작업이 동시에 써도 되지만, 범위(수정 허용 경로)가 겹치면 이슈를 나누거나 순서를 정한다.
- 폴더가 무엇을 하는지 설명이 필요하면 그 폴더에 `README.md`를 둔다(에이전트 컨텍스트로도 쓰임).
- 현재 레포 구조 (상세는 `docs/spec/tech-design/stack.md` 3장):
  - `apps/consumer/`, `apps/producer/` — 소비자 앱, 생산자 앱 (Expo Router 웹)
  - `packages/ui/`, `packages/api/` — 앱 공용 패키지
  - `server/` — FastAPI 서버. `app/` 안에 도메인 모듈(`core`, `accounts`, `farms`, `catalog`, `orders`, `messaging`, `ai`, `analytics`, 모듈마다 `router`·`models`·`schemas`·`service`), `migrations/`(Alembic)
  - `docs/spec/` — 제품 스펙 원본 (한국어)
  - `docs/design/` — 화면 디자인(HTML 보드, board.json·comments.json). 로컬 캔버스는 npm 패키지 [easel-canvas](https://www.npmjs.com/package/easel-canvas)(소스 [nemodleo/easel](https://github.com/nemodleo/easel))이고 `npm run design`으로 실행한다(따로 설치할 것 없음). AI 에이전트 연결은 루트 `.mcp.json`. 도구 자체를 고치려면 그 레포에 PR을 보낸다
  - `docs/wiki/` — 평가용 wiki 원본 (`meetings/YYYY-MM-DD-*.md`는 Meeting-Logs로 합쳐짐)
  - `docs/*.html` — 랜딩 페이지
  - `.agents/skills/` — 공용 스킬 원본 (`.claude/skills`는 이 폴더로의 심링크)
  - `.github/` — 워크플로, PR 템플릿
- 로컬 작업 입구는 루트 `Makefile` 하나다(`make help`). 새 테스트 묶음을 만들면 해당 `test-*` 타깃에 한 줄 추가한다.

## 브랜치·커밋·PR
- 브랜치 이름과 커밋 메시지, PR 제목에 **이슈 키(`DEV-12`, `SWPP-34`)를 반드시 넣는다** — PR이 Linear 이슈에 자동 연결된다. 개발은 `DEV-xx`, 기획·문서는 `SWPP-xx`.
- 브랜치 이름은 `<github 아이디>/<이슈 키 소문자>-<영어 요약 2~5단어>`(소문자·숫자·하이픈만, 예: `nemodleo/swpp-119-ascii-branch-names`). **한글을 쓰지 않는다** — Linear "Copy git branch name"은 한글 제목을 넣으므로 쓰지 않는다. 이슈 키만 있으면 Linear가 PR을 연결한다.
- PR을 연 뒤에는 브랜치 이름을 바꾸지 않는다(GitHub가 PR을 닫는다).
- PR은 기본적으로 `origin/main`에서 따고 base를 `main`으로 둔다. 선행 작업의 일부만 필요하면 그 부분을 작은 PR로 먼저 머지한다. 쌓기(base = 다른 작업 브랜치)는 한 단계까지만 하고 `pr-context` 스킬 "PR 쌓기" 절차를 따른다. **DEV-126(CI·spec-check 트리거 수정) 전까지는 쌓지 않는다.**
- 마이그레이션을 추가한 PR은 머지 직전 `main`을 병합하고 `alembic heads`가 1개인지 확인한다. 리비전 번호가 겹치면 뒤에 머지하는 쪽이 번호를 올린다.
- 커밋: `type(scope): 요약 (DEV-12)` — type은 `feat` `fix` `docs` `refactor` `test` `chore`. 한 커밋은 한 가지 변경.
- PR 제목: `[DEV-12] <English summary>` — 요약은 **영어로** 쓴다(squash merge 때 main 커밋 제목이 된다). 본문은 `.github/pull_request_template.md`를 채운다.
  - Dependabot 등 봇이 만든 PR은 이슈 키 예외.
- `main`에 직접 push하지 않는다. force push는 자기 브랜치에서만.
- 에이전트는 커밋·push 직전에 `git branch --show-current`로 작업 브랜치인지 확인하고, push는 `git push origin HEAD`처럼 브랜치를 명시한다.
- 여러 작업(세션)을 동시에 돌릴 때는 같은 폴더에서 브랜치를 바꾸지 말고 `git worktree`로 폴더를 나눈다.
- 작업 기록은 이슈 파일이라 병렬 PR끼리 충돌하지 않는다(DEV-219). 분리 전에 연 PR은 main 병합 전에 `git show origin/main:scripts/split-tasks.py > /tmp/split-tasks.py && python3 /tmp/split-tasks.py --only <이슈 키> --apply`로 자기 절을 이슈 파일로 꺼내 커밋한다. Mock 테스트 파일(`scripts/test-*.mjs`)은 `test:mock`이 글롭으로 모으므로 `package.json`을 고치지 않는다.
- 새 worktree에는 의존성이 없다(`node_modules`, `server/.venv`는 git이 복사하지 않음). 에이전트에게 넘기기 전에 루트에서 `make setup`(= 루트 `npm ci` + `server/`에서 `uv sync --frozen`)을 실행하고, pytest용 PostgreSQL(`DATABASE_URL`, `make db`)이 연결되는지 확인한다. 준비할 수 없으면 에이전트를 main 체크아웃에서 실행한다.
- 로컬 DB는 브랜치마다 따로 쓴다: `DATABASE_URL`의 DB 이름을 바꾼다(예: `farmclub_dev12`, pytest는 `_test`를 붙인 DB를 따로 만든다). 공용 `farmclub`에는 다른 브랜치의 마이그레이션이 섞여 `alembic upgrade`·테스트가 깨진다.
- 머지는 사람 리뷰 후에만 한다(아래 "사람·에이전트 역할"). 에이전트는 사람의 지시 없이 머지하지 않는다.
- 작업 브랜치를 `main`에 머지할 때는 가능한 한 **Squash merge**를 사용한다.
- 머지 큐를 켠 뒤에는 **Merge when ready**(머지 큐)로 머지한다: 큐가 최신 main 위에서 전체 integration을 돌리고 통과한 커밋을 main에 넣는다(필수 체크 `ci-ok`·`figma-line`·`checker-tests`). 운영 장애 급한 수정만 `hotfix` 라벨(integration은 머지 뒤 `CI full`이 돌고 실패하면 이슈가 열린다). 길·설정은 `.github/CI.md`(DEV-234).
- 머지 전에 PR 체크(CI·spec-check)가 통과했는지 확인한다. main CI가 깨지면 머지한 사람이 바로 고치거나 revert한다(깨진 동안 다른 사람의 배포와 CI가 막힌다).
- spec-check(`spec-code-review`)는 ready PR에서 자동으로 돌고, fail이어도 머지를 막지 않는다. 대신 작성자가 보고서를 읽고 처리 결정(고침·스펙 변경·오탐·사람 리뷰 대체)을 PR 코멘트에 적는다. 리뷰어는 그 코멘트가 없으면 Approve를 미룬다(`.github/spec-check/README.md` 1.1절, DEV-196).

## 사람·에이전트 역할 (SWPP-126)
- 작성자는 에이전트가 쓴 줄도 자기 코드로 책임진다. 에이전트 없이 diff를 설명할 수 있어야 한다.
- 사람 리뷰 = 다른 팀원의 GitHub Approve, 또는 작성자 본인이 diff를 직접 읽고 PR 본문 `사람이 한 일:`에 적은 것.
- 고위험 경로: `server/migrations/**`, `server/app/*/models.py`, `server/app/accounts/**`, `server/app/admin/**`, `server/app/core/security.py`, `server/app/core/config.py`, `server/app/core/masking.py`, `server/app/orders/**`, `server/app/ai/**`, `.github/workflows/**`, `server/railway.json`, `server/Dockerfile*`, `**/vercel.json`, `**/eas.json`, `AGENTS.md`, `.agents/skills/**`. 하나라도 바꾸면 PR 본문 `위험 등급: 고위험`.
- 고위험 PR은 사람 리뷰 없이 머지하지 않는다. 승인 생략을 합의한 기간에도 같고, 에이전트는 사람이 지시해도 사람 리뷰가 없으면 머지하지 않는다.

## 리뷰
- CI 전용 Spec ↔ Code 보고 클라이언트는 `.github/spec-check/`에 둔다(DEV-40). 위의 `server/app/ai` 제한은 제품 AI 호출에 적용하며, CI는 별도 키·보호 환경을 사용하고 제품 어댑터/키를 재사용하지 않는다.

- **AI 1차 리뷰**: 작성자가 draft 해제 전에 `pr-review` 스킬로 돌리고, 결과를 PR 코멘트로 남긴 뒤 must 항목을 해결한다.
- **사람 리뷰**: 1명 필수(위 "사람·에이전트 역할"의 정의). 리뷰어는 spec(이슈 파일)과 diff가 맞는지, 범위 밖 변경이 없는지를 우선 본다.
- 상세 규칙은 `.agents/skills/pr-review/SKILL.md`.

## 금지
- 비밀값(API 키, 토큰, `.env`)과 사업자 정보 실제 값은 커밋·이슈·PR 본문·코멘트에 쓰지 않는다.
- 운영 DB·운영 셸(`railway ssh` 등)·운영 변수는 사람이 실행한다. 에이전트는 실행할 명령과 확인 방법만 준비한다.
- 개인정보·법인/세무·개인 신상은 DEV 이슈와 레포에 쓰지 않는다(GitHub에 공개 동기화됨).
- 사람이 요청하지 않은 대규모 리팩터링·의존성 추가·포맷 일괄 변경을 하지 않는다.
- 테스트를 통과시키려고 테스트를 지우거나 약하게 만들지 않는다.

## AI 사용 기록
- AI를 쓴 작업은 Linear 결과와 PR 본문에 `Agent 시간 / Tokens / Human 시간`을 적는다(시트 기록용, 시간은 0.5시간 단위).
- 에이전트는 Agent 시간을 작업 시작·끝 시각이나 에이전트 실행 기록으로 재서 `약 1.5h`처럼 0.5시간 단위 앞에 '약'을 붙여 적는다(값이 없으면 그 기록으로 어림한다). "미계측"·"계측 미제공" 같은 빈 값으로 두지 않는다. Tokens는 하네스·세션 사용량이 준 값만 적고, 주지 않으면 비워 둔다. Human 시간은 PR 본문·Linear 결과를 마무리하기 전에 작성자에게 물어 받은 값만 적는다. 묻지 못했으면 `Human 미확인`으로 두고 완료 보고에 그 사실을 적는다(SWPP-130).
- 대표 프롬프트·AI가 틀린 사례는 iteration별 `docs/wiki/AI-Collaboration-Report-–-Iteration-N.md`(I1: `AI-Collaboration-Report-–-Iteration-1.md`와 Prompt Log) 작성 때 쓰이므로 PR 본문 "AI 사용"에 한 줄 남긴다.

## 공용 스킬 (`.agents/skills/`)
| 스킬 | 언제 |
| -- | -- |
| `spec` | 작업 시작 시 Linear 이슈 → 작업 폴더 `spec.md`·이슈 파일 `tasks/<이슈 키>.md` 생성·갱신 |
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
