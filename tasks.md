# 루트 tasks

레포 루트 파일(`Makefile` 등 여러 폴더에 걸친 개발 도구)의 이슈별 작업 기록.

## DEV-117 루트 Makefile로 로컬 작업 입구 통일

- 이슈: [DEV-117](https://linear.app/sswp6/issue/DEV-117) (GitHub #235)
- 브랜치: `nemodleo/dev-117-root-makefile`
- 기능·인수 조건: 해당 없음 (개발 도구)
- 상태: 리뷰 중

### 목표
흩어진 로컬 준비·실행·검사 명령(npm 스크립트, `server/` uv 명령, admin-web node 테스트, docker compose)을 루트 Makefile 하나로 부른다. 로직은 기존 스크립트에 두고 Makefile은 얇게 부르기만 한다.

### 범위 (수정 허용 경로)
- `Makefile` (새 파일), `tasks.md` (이 파일)
- `README.md` "Local run (`make`)" 절, `AGENTS.md` 두 줄(파일 구조 끝 한 줄 추가, 새 worktree 준비 문구)

### 비범위 (건드리지 않음)
- `.github/workflows/**` (CI는 그대로, paths-filter 구조 유지. CI가 make 타깃을 부를지는 후속)
- 운영 명령(railway, 운영 배포, 운영 DB), 하위 폴더 Makefile
- 기존 npm 스크립트·`scripts/*.mjs`·server 코드

### 결정 사항
- 10/22 `lint`는 CI와 같은 `ruff check .`만 한다. `ruff format --check`는 CI에 없고 main에서 15개 파일이 걸려 넣지 않았다(포맷 일괄 변경 금지).
- 10/22 `setup`은 `package-lock.json` 해시를 `node_modules/.farmclub-lock.sha`에 남겨 바뀐 때만 `npm ci`한다(디스크·시간 절약). git checkout이 mtime을 바꿔 파일 시각 비교는 쓰지 않는다.
- 10/22 `test-server`는 CI server 잡처럼 pytest 뒤 `alembic upgrade head && alembic check`까지 돈다. `test-apps`는 `test:mock` + 루트 `typecheck`(모든 workspace), 웹 export(빌드)는 넣지 않는다.
- 10/22 `test-integration`은 CI와 같은 `npm run test:integration:full`(스택을 직접 띄움), `test-e2e`는 `npm run test:e2e`.
- 10/22 `migrate`·`seed`·`dev-api`·`test-server`는 `DATABASE_URL`(환경 변수 > `server/.env` > 기본값)이 localhost가 아니면 멈춘다.
- 10/22 `dev`는 기존 `npm run dev`(앱 2개 + Mock API, `scripts/local.mjs`). 실제 FastAPI는 `dev-api`로 따로 둔다.
- 10/22 `clean-worktrees`는 Makefile 안 셸로 둔다(처음엔 `scripts/clean-worktrees.mjs`였으나 PR을 Makefile에 집중하려고 사용자 요청으로 옮김). squash merge를 쓰므로 `gh`로 본 머지된 PR의 head 브랜치 이름으로 판단하고, 변경 있는 worktree·현재 worktree는 건너뛴다. 브랜치는 지우지 않으므로 머지 뒤 커밋이 있어도 잃지 않는다. gh를 못 읽으면 아무것도 지우지 않는다.
- 10/22 가독성: help에 `##@` 절 제목(준비·실행·검사·정리), 절마다 `.PHONY`, `SERVER`·`LOCK_STAMP` 변수, 설명은 한 줄로 짧게. 118줄.
- 10/22 로컬 PostgreSQL 컨테이너(compose 프로젝트 `server`)는 모든 worktree가 같이 쓴다. 공용 `farmclub` DB에는 다른 브랜치 마이그레이션이 섞여 `alembic check`가 실패하므로, README에 브랜치별 DB(`DATABASE_URL=…/farmclub_devNN make test`) 안내를 넣었다.
- 10/22 루트에 `spec.md`는 만들지 않는다. 오래 남을 내용은 Makefile 상단 주석과 README "Local run" 절에 있다.

### 작업
- [x] CI·package.json·docker-compose·server 명령 확인
- [x] `Makefile` (help·setup·db·db-down·migrate·seed·dev·dev-api·test·test-*·lint·check·clean-worktrees)
- [x] `clean-worktrees` (Makefile 셸, 스크립트 삭제), Makefile 가독성 정리
- [x] README "Local run (`make`)", AGENTS.md 두 줄
- [x] macOS make 3.81로 `make help`·`setup`·`db`·`lint`·`test`·`clean-worktrees` 실행

### 완료 조건
- [x] 타깃이 CI와 같은 명령을 부르고 운영 명령은 없음
- [x] 테스트 추가 규칙을 Makefile 주석·README·AGENTS.md에 적음
- [x] 테스트 통과 (`make lint`, `make test` — 브랜치 전용 DB에서)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/22 이슈·브랜치 생성, Makefile·문서 작성. AGENTS.md는 #231과 worktree 준비 줄 한 곳이 겹친다(#231이 바로 아래에 줄을 추가) — 뒤에 머지하는 쪽이 두 변경을 모두 남기면 된다.
- 10/22 검증: lint 통과, pytest 422 passed, alembic check 통과(farmclub_dev117), test:mock 22/22, typecheck 5 workspace, admin-web 18/18. PR #236 AI 1차 리뷰 반영(RESET·CONFIRM=1만) 후 ready.
- 10/22 리뷰 중 변경: clean-worktrees를 Makefile 셸로 옮기고 Makefile 가독성 정리. 재검증 `make check`(farmclub_dev117) 통과 — ruff 통과, pytest 422 passed, alembic check 통과, test:mock 22/22, admin-web 18/18. clean-worktrees 시험 실행 결과 동일(대상 3), gh 없을 때 멈춤 확인.
- 10/22 Makefile 주석·help 설명·출력 메시지를 영어로(사용자 요청). 명령은 그대로, help·가드·seed·setup·lint·test-admin 재확인.

## DEV-118 생산자 앱 코드 커버리지 목표 선언·측정

- 이슈: [DEV-118](https://linear.app/sswp6/issue/DEV-118)
- 브랜치: `jinumeral/dev-118-producer-coverage`
- 기능·인수 조건: 해당 없음 (테스트 측정·평가 문서). 테스트 이름에는 기존 AC ID를 쓴다
- 상태: 리뷰 요청 전

### 목표
Testing Documentation(I2) 2.2 표의 Producer client 행을 채운다. 목표를 측정 전에 커밋하고, 생산자 로직(Node)·화면(Playwright) 커버리지를 재현 가능한 명령으로 잰다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md` 생산자 행·2.2 생산자 목표 문단·3.6(새 절), `docs/wiki/images/i2-producer-coverage-*.png`
- `scripts/test-producer-*.mjs`(새 테스트), `scripts/producer-ui-coverage.mjs`(새 보고서 스크립트)
- `scripts/e2e/fixtures.ts`(새 픽스처)와 `scripts/e2e/*.spec.ts`의 `test` import 한 줄(17개 파일)
- `package.json` scripts·devDependencies(`monocart-coverage-reports`), `package-lock.json`
- 별도 Makefile PR: `Makefile` coverage 타깃 2개·help 이름 칸 폭, `README.md` make 절 한 줄, `tasks.md`

### 비범위
- 소비자·서버·공용 `packages/*` 커버리지(각 담당자), 생산자 앱 동작 변경, CI 워크플로

### 결정 사항
- 10/23 목표: 로직 lines ≥ 90%·branches ≥ 80%, 화면/UI lines ≥ 60%. 첫 측정 전에 커밋한다(가이드라인: 목표 사후 설정 금지).
- 10/23 로직 커버리지는 Node 내장 `--experimental-test-coverage`(새 의존성 없음).
- 10/23 화면 커버리지는 Playwright V8 JS 커버리지 + `monocart-coverage-reports`(devDependency, Metro 소스맵으로 원본 파일에 매핑). `scripts/e2e/fixtures.ts`가 `FARMCLUB_COVERAGE=1`일 때만 수집하고, 스펙은 import 한 줄만 `./fixtures`로 바꿨다. 꺼져 있으면 동작이 같다.
- 10/23 monocart는 보고서를 만든 뒤 캐시를 지운다. 그래서 순서는 통합 테스트(커버리지 켬) → `npm run coverage:producer-ui` 1회.
- 10/23 첫 측정 때 범위 필터 정규식이 `pick.ts`·`sourceFiles.ts`를 빠뜨렸다(슬래시 하나 더 요구). 고친 뒤 다시 돌린 결과만 기록한다.
- 10/23 통합 테스트는 공용 로컬 DB를 리셋하지 않게 브랜치 전용 DB `farmclub_dev118`에서 돌렸다.
- 10/23 의존성 추가(`monocart-coverage-reports`, devDependency)는 진우가 요청한 생산자 커버리지 측정에 필요해 추가했다(AGENTS.md "요청하지 않은 의존성 추가 금지"에 해당하지 않음). 제품 번들에는 들어가지 않는다.
- 10/23 AI 1차 리뷰 반영: 커버리지를 끄면 `scripts/e2e/fixtures.ts`가 `@playwright/test`의 `test`를 그대로 내보내도록 바꿨다(전에는 끈 상태에서도 auto 픽스처가 기본 컨텍스트를 만들었다). 소스맵 fetch·보고서 저장 실패는 테스트 실패가 아닌 경고로. 측정 커밋 `0637847` 뒤의 픽스처 변경이라 3.6 수치는 다시 재지 않았다(켠 상태의 수집 경로는 같음).
- 10/23 Makefile 타깃은 별도 PR(브랜치 `jinumeral/dev-118-make-coverage`)로 분리했다. 테스팅 PR에서 Makefile은 main과 같다.
- 10/23 Makefile PR: `coverage-producer`, `coverage-producer-ui`(`LOCAL_DB_ONLY` 검사 뒤 캐시 삭제 → 커버리지 켠 통합 → 보고서), help 이름 칸 17 → 20자(새 이름이 20자), README make 절 한 줄.
- 10/23 Makefile PR AI 1차 리뷰 반영: coverage 두 타깃은 CI에 없는 로컬 측정용이라고 주석에 밝혔다. 가드가 `server/.env` 원격 주소에도 멈추는 점(안전한 쪽 오탐)과 기존 `test-integration`에 같은 가드가 없는 점은 범위 밖으로 두었다.

### 작업
- [x] 목표·범위·제외 규칙 문서화 (측정 전 커밋)
- [x] 로직 커버리지 명령 + 기준선 측정 (84.13% lines, kakao.ts 0% → 테스트 2개 추가 후 100/100)
- [x] 화면 커버리지(Playwright V8) 측정 (lines 66.03%, 65 passed / 2 skipped)
- [x] 3.6 결과·스크린샷 (`docs/wiki/images/i2-producer-coverage-*.png`)
