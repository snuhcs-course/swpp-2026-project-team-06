# .github tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다. CI/CD 워크플로 작업은 이 파일에 기록한다.

## DEV-9 [I1] GitHub Actions CI/CD 배포 파이프라인 구성 — CI

- 이슈: [DEV-9](https://linear.app/sswp6/issue/DEV-9) (GitHub #10)
- 브랜치: `nemodleo/dev-9-i1-github-actions-cicd-배포-파이프라인-구성`
- 기능·인수 조건: 없음(인프라). 관련: server/spec.md "테스트 방법", stack.md 2장 CI/CD
- 상태: 진행 중

### 목표
PR마다 서버 린트·테스트·마이그레이션 검사와 두 앱의 타입 검사·웹 빌드를 자동으로 돌려, 깨진 변경이 main에 들어가지 않게 한다. 이번에는 CI만 만든다. CD(배포)는 브랜치 전략(SWPP-58)이 정해진 뒤 DEV-8과 함께 한다.

### 범위 (수정 허용 경로)
- `.github/workflows/ci.yml` (새 파일)
- `.github/tasks.md` (이 절)
- 실패 확인용 임시 커밋: `server/` 안 한 파일(같은 PR에서 revert)

### 비범위 (건드리지 않음)
- 배포 워크플로, Vercel·Railway 설정, 비밀값(DEV-8)
- 저장소 설정(branch protection, secrets) — 사람이 직접
- `.github/workflows/wiki-sync.yml`, 앱·서버 코드

### 결정 사항
- 10/07 CI는 `ci.yml` 하나, job `server`·`apps`. paths-filter로 변경이 없으면 단계만 건너뛰고 job은 항상 성공(필수 체크로 지정해도 막히지 않게)
- 10/07 paths-filter는 `token: ""`로 git diff 방식을 쓴다. 기본(API) 방식은 PR에서 `pull-requests: read` 권한이 필요해 `contents: read`만으로는 안 됨
- 10/07 액션은 메이저 태그로 고정한다(checkout@v7, setup-node@v7, paths-filter@v4). 단 `astral-sh/setup-uv`는 v8부터 메이저 태그를 내지 않으므로 upstream 권장대로 불변 전체 태그 `@v10.2.0`(현재 최신 v10)으로 고정한다. 첫 CI 실행은 없는 `@v10`을 찾다 실패했다
- 10/07 레포에 Node 버전 설정(.nvmrc, engines)이 없어 현재 LTS인 Node 24로 한다(로컬 v24와 같음)

### 작업
- [x] `.github/workflows/ci.yml`: 트리거(main 대상 PR, main push), concurrency, `contents: read`
- [x] job `server`: paths-filter, setup-uv, Python 3.12, `uv sync --frozen`, ruff, postgres:16 서비스, pytest, `alembic upgrade head` → `alembic check`
- [x] job `apps`: paths-filter, setup-node(npm 캐시), `npm ci`, consumer·producer `tsc --noEmit`·`expo export -p web`, `EXPO_NO_TELEMETRY=1`
- [x] 로컬에서 같은 명령 통과, actionlint 통과
- [ ] draft PR에서 Actions 통과
- [ ] ruff 위반 커밋으로 server job 실패 확인 → revert로 다시 통과

### 완료 조건
- [ ] PR에서 `server`·`apps` job이 실행되고 통과
- [ ] 일부러 넣은 실패를 CI가 잡음
- [ ] AI 1차 리뷰 반영
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 tasks.md 작성
- 10/07 로컬 통과: actionlint(ci.yml), `uv sync --frozen`·ruff·pytest(3)·docker Postgres 16에서 `alembic upgrade head`·`alembic check`, `npm ci`·두 앱 tsc·expo export
