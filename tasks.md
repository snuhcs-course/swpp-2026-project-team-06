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
- `Makefile` (새 파일), `scripts/clean-worktrees.mjs` (새 파일), `tasks.md` (이 파일)
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
- 10/22 `clean-worktrees`는 셸 대신 `scripts/clean-worktrees.mjs`(다른 scripts와 같은 node)로 둔다. squash merge를 쓰므로 `gh`로 본 머지된 PR head에 worktree HEAD가 포함될 때만 머지로 본다(main에서 막 만든 빈 브랜치 오인 방지). gh를 못 읽으면 아무것도 지우지 않는다.
- 10/22 로컬 PostgreSQL 컨테이너(compose 프로젝트 `server`)는 모든 worktree가 같이 쓴다. 공용 `farmclub` DB에는 다른 브랜치 마이그레이션이 섞여 `alembic check`가 실패하므로, README에 브랜치별 DB(`DATABASE_URL=…/farmclub_devNN make test`) 안내를 넣었다.
- 10/22 루트에 `spec.md`는 만들지 않는다. 오래 남을 내용은 Makefile 상단 주석과 README "Local run" 절에 있다.

### 작업
- [x] CI·package.json·docker-compose·server 명령 확인
- [x] `Makefile` (help·setup·db·db-down·migrate·seed·dev·dev-api·test·test-*·lint·check·clean-worktrees)
- [x] `scripts/clean-worktrees.mjs`
- [x] README "Local run (`make`)", AGENTS.md 두 줄
- [x] macOS make 3.81로 `make help`·`setup`·`db`·`lint`·`test`·`clean-worktrees` 실행

### 완료 조건
- [x] 타깃이 CI와 같은 명령을 부르고 운영 명령은 없음
- [x] 테스트 추가 규칙을 Makefile 주석·README·AGENTS.md에 적음
- [ ] 테스트 통과 (`make lint`, `make test`)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/22 이슈·브랜치 생성, Makefile·문서 작성. AGENTS.md는 #231과 worktree 준비 줄 한 곳이 겹친다(#231이 바로 아래에 줄을 추가) — 뒤에 머지하는 쪽이 두 변경을 모두 남기면 된다.
