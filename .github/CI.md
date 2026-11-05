# `.github` — CI·배포·리뷰 워크플로

| 파일 | 하는 일 |
| --- | --- |
| `workflows/ci.yml` (이름 **CI**) | PR·머지 큐·main 검사. 필수 체크는 job `ci-ok` |
| `workflows/ci-full.yml` (**CI full**) | nightly 전체 실행, hotfix 머지 뒤 전체 실행, 실패 알림 이슈 |
| `workflows/spec-check.yml` | `figma-line`·`checker-tests`(필수), `spec-code-review`(보고만, 머지를 막지 않음 — `spec-check/README.md` 1.1절) |
| `workflows/deploy-railway.yml`, `deploy-vercel.yml` | main push의 **CI**가 성공하면 마지막 배포 태그 뒤 바뀐 대상만 배포(DEV-139) |
| `workflows/wiki-sync.yml` | `docs/wiki/` → GitHub Wiki |
| `tasks/` | `.github` 작업의 이슈 파일 |

## CI 길(lane) — DEV-234

CI의 첫 job `changes`가 이벤트와 바뀐 파일로 길을 고르고(`scripts/ci/classify.mjs`), 무엇을 돌릴지 정한다. 경로 규칙은 `scripts/ci/integration-map.json` 한 파일이다. 실행 화면의 `changes` 요약(Summary)에 고른 길, 돌린 job, 샤드별 spec이 찍힌다.

| 길 | 언제 | server·apps·admin-web | integration |
| --- | --- | --- | --- |
| `pr` | PR push | 바뀐 경로의 job만 | **영향받는 spec만**, 시간 기준 최대 3샤드 |
| `queue` | 머지 큐(`merge_group`) | 바뀐 경로의 job만 | 관련 변경이 있으면 **spec 전체**(3샤드) |
| `validated` | main push인데 같은 커밋이 큐에서 이미 통과 | 안 돎 | 안 돎 → `ci-ok` 바로 통과 → 배포 시작 |
| `push` | main push인데 큐 기록이 없음(큐를 켜기 전, 관리자 직접 머지) | 바뀐 경로의 job만 | 관련 변경이 있으면 spec 전체 |
| `hotfix` | `hotfix` 라벨 PR(PR·큐·main push) | 바뀐 경로의 job만(린트·타입·pytest·Mock) | **안 돎**. 머지 뒤 **CI full**이 전체를 돈다 |
| `full` | **CI full**(nightly 03:00 KST, hotfix 머지 뒤, 수동) | 전부 | spec 전체 |

- **문서 전용**: 바뀐 파일이 전부 `docs` 묶음(`docs/**`(검증 코퍼스 `docs/spec/validation/**` 제외), 모든 `*.md`, `.github/tasks/**`, `.github/spec-check/**`, `.agents/**`, `Makefile`, `demo/**` 등)이면 어느 길이든 server·apps·admin-web·integration을 건너뛰고 `ci-ok`만 통과한다.
- **스크립트 전용**: `scripts/admin-web/**`·`scripts/ci/**`(분류 파일 제외)만 바뀌면 admin-web job만 돈다.
- **CI 자체**(`ci.yml`, `classify.mjs`, `integration-map.json`)가 바뀌면 모든 job과 spec 전체.
- **모르는 경로**(어느 묶음에도 없는 파일)는 모든 job과 spec 전체(안전한 쪽). 새 최상위 폴더를 만들면 `integration-map.json`에 넣는다.
- integration spec 고르기(`integration.map`, 위에서부터 첫 규칙): spec 파일 자체 → 그 spec, 출처 분석(`server/app/source_analysis/**`와 관련 packages 파일) → `source-*`·`new-product-*` 등, `server/app/admin/**` → `/admin`을 쓰는 spec, `apps/consumer/**` → 소스에 `consumerUrl|loginConsumer`가 있는 spec, `apps/producer/**` → `producerUrl|loginProducer`가 있는 spec. 공용(`packages/**`, 나머지 `server/**`, e2e helpers, lock 파일)은 전체. `server/tests/**`·Mock 테스트(`scripts/test-*.mjs`)는 integration 없음.
- `changes` job이 매번 `node --test scripts/ci/test-classify.mjs`와 `classify.mjs --check`(모든 spec이 어떤 규칙에 걸리는지, 격리 목록 형식)를 돈다. 로컬: `make test-ci`.
- 분류가 놓친 영향은 nightly(**CI full**)가 잡는다. 실패하면 알림 이슈가 열린다.

### 샤드

- `changes`가 고른 spec을 `scripts/ci/spec-durations.json`(파일별 초) 기준으로 긴 것부터 가장 가벼운 샤드에 넣는다. 샤드 수 = `ceil(합계 / 200초)`, 최대 3. 샤드마다 PostgreSQL·FastAPI·Expo 2개를 따로 띄우고(DB 공유 없음) 그 샤드의 spec만 이름 순으로 돈다. API 시나리오(`scripts/test-integration.mjs`, 6초)는 첫 샤드만.
- integration은 server·apps를 기다리지 않는다(예전 `needs: [server, apps]`가 최대 5분 직렬이었다).
- 새 spec은 `spec-durations.json`에 없으면 20초로 본다. 크게 어긋나면(한 샤드만 길면) 실행 로그 타임스탬프로 다시 적는다.
- 캐시: npm(`setup-node cache: npm`), uv(`setup-uv enable-cache`), Playwright 브라우저(`~/.cache/ms-playwright`, Playwright 버전 키). apt 의존성은 러너마다 설치한다. `node_modules`·venv 자체 캐시는 `npm ci`+`uv sync`가 합쳐 12초라 넣지 않았다.

### 간헐 실패

- Playwright는 CI에서만 1회 재시도한다(`playwright.config.ts`, `CI` 환경 변수). 재시도로 통과한 테스트는 보고서에 flaky로 남는다. 로컬은 재시도 없음.
- 재시도로도 자주 빨개지는 테스트는 **격리**: 고칠 이슈를 먼저 만들고 `scripts/ci/quarantine.json`의 `specs`(파일) 또는 `tests`(제목 일부)에 `issue`·`since`·`reason`과 함께 넣는다. `playwright.config.ts`가 CI·로컬 모두에서 빼고, `classify.mjs`가 샤드에서 뺀다. 격리한 것까지 돌리려면 `FARMCLUB_INCLUDE_QUARANTINE=1 make test-integration`. 고친 PR에서 지운다. nightly도 격리 목록을 따르므로 오래 두지 않는다.
- Mock 서버 포트 충돌(DEV-221)은 별도 이슈다.

## 머지 큐와 배포

- 머지 큐를 켜면 PR의 **Merge when ready**가 큐에 넣고, 큐가 main + PR 커밋으로 `merge_group` CI(전체 integration)를 돌린 뒤 통과한 그 커밋으로 main을 옮긴다. main push CI는 같은 커밋의 큐 실행 성공을 찾아(`actions/workflows/ci.yml/runs?head_sha=…&event=merge_group&status=success`) `validated`로 끝난다.
- 배포는 그대로다: `deploy-*.yml`은 `workflow_run: CI`(브랜치 main, 이벤트 push, 성공)에 반응한다. 큐 실행(`merge_group`, 브랜치 `gh-readonly-queue/…`)은 브랜치 필터에 걸려 배포를 시작하지 않고, 큐가 main을 옮긴 뒤의 push 실행이 배포를 시작한다. 배포 대상 판단은 DEV-139 이동 태그(`deploy/*`) 기준이라 바뀌지 않는다.
- 큐를 켜기 전에도 이 CI는 동작한다(PR은 `pr`, main push는 `push` 길 = 예전처럼 main에서 전체).

## hotfix 길

1. PR에 `hotfix` 라벨을 붙이고, 이미 돈 CI가 있으면 **Re-run all jobs**(라벨은 실행 때 API로 읽는다. 라벨만 붙여서는 CI가 다시 돌지 않는다).
2. `ci-ok`가 integration 없이 통과하면 머지한다. 큐에서도 묶음에 그 PR 하나만 있으면 같은 최소 검사다(묶음에 다른 PR이 있으면 전체).
3. main push CI도 최소 검사 → 배포가 바로 시작된다. 동시에 **CI full**이 그 커밋을 전체로 검사하고, 실패하면 이슈 `[CI] main full check failing`을 열거나 댓글을 단다(다음 통과 때 닫힘). 고칠 사람은 머지한 사람이다(AGENTS.md).
4. 운영 장애 급한 수정에만 쓴다. 고위험 경로 규칙(사람 리뷰)은 hotfix도 같다.

## 사람이 할 설정 (레포 관리자, 에이전트는 바꾸지 않는다)

2026-11-05 기준 main에는 브랜치 보호도 ruleset도 없다(`gh api repos/snuhcs-course/swpp-2026-project-team-06/branches/main/protection` → 404, `…/rulesets` → `[]`). 레포가 조직(snuhcs-course)의 공개 레포라 머지 큐를 쓸 수 있다.

1. **라벨**: `gh label create hotfix --color B60205 --description "운영 장애 급한 수정: integration은 머지 뒤 CI full (DEV-234)"`
2. **Settings → Rules → Rulesets → New branch ruleset**
   - 이름 `main`, Enforcement **Active**, Target **Default branch**
   - Bypass list: 비워 둔다(관리자 우회 머지를 허용하려면 Repository admin만, 그 머지는 `push` 길로 main에서 전체 검사)
   - **Restrict deletions**, **Block force pushes** 켬
   - **Require a pull request before merging** 켬. Required approvals는 팀 합의대로(고위험 PR의 사람 리뷰는 AGENTS.md 규칙으로 지킨다). Allowed merge methods: **Squash**
   - **Require status checks to pass** 켬, 체크 추가(Source: GitHub Actions): `ci-ok`, `figma-line`, `checker-tests`. **Require branches to be up to date before merging은 끔**(큐가 최신 main 위에서 검사한다). `spec-code-review`·`server`·`apps`·`integration (…)`는 넣지 않는다
   - **Require merge queue** 켬: Merge method **Squash and merge**, Build concurrency **5**, Minimum group size **1**, Maximum group size **3**, Wait time to meet minimum group size **0분**, Status check timeout **30분**, **Only merge non-failing pull requests** 켬(Grouping strategy는 "Allgreen")
3. 켠 뒤 확인: 문서만 바꾼 PR 하나를 큐로 머지해 (a) `merge_group` CI가 `ci-ok`만 돌고 통과, (b) main push CI 요약에 `lane: validated`, (c) 배포 워크플로가 시작되고 대상이 없으면 건너뜀을 본다.

## 측정

- `python3 scripts/ci/ci_timings.py`(기본: ci·spec-check·deploy-* 최근 성공 10개) — 벽시계·큐 대기·job별 p50/p90. `-w ci.yml -b <브랜치>`, `--run <ID>`로 고른다. `gh` 로그인 필요.

적용 전은 11/04 최근 성공 10개(`ci_timings.py`), 적용 후는 이 PR(#444)의 CI 실행 5번(41966060490·41967347095·41968086082·41969011566·41970053401, 모두 CI 파일 변경이라 spec 전체 = 가장 무거운 경우)과 문서 전용 확인용 임시 PR(#445, 41968212936).

| 대상 | 적용 전 | 적용 후 |
| --- | --- | --- |
| PR CI 벽시계, spec 전체 | 21.2분 p50 / 31.9분 p90 | **7.0분 p50 / 7.7분 p90** |
| integration | job 1개 12.9분 p50 / 16.5분 p90, server·apps 뒤 직렬(+최대 5분) | 샤드 3개 병렬, 샤드 job 5.9~6.0분 p50 / 6.1~6.8분 p90(Playwright 4~5.5분 + 설치·기동 1.2분), 바로 시작 |
| PR CI 벽시계, 문서 전용 | 1분 안팎, job 4개가 러너를 잡음 | **16초**, `changes`·`ci-ok`만 |
| PR CI, 앱 하나·spec 하나만 바뀐 PR | 전체(위와 같음) | 영향 spec만(Playwright 시간 기준: 소비자 앱 44%·2샤드, 생산자 앱 92%, 출처 분석 서버 68%, 관리 API 6%·1샤드, spec 파일 하나 → 그 파일만) |
| server job | 5.2분 p50 | 5.8분 p50 / 6.4분 p90(pytest 1495개, 바뀐 것 없음 — 이제 integration과 함께 임계 경로) |
| 머지 → 배포 시작 | main CI 7~14분(전체 재실행) | 큐를 켜면 main CI `validated` ~0.5분. 큐 전 main push는 예전처럼 전체(~7분) |

- 남은 차이: 이슈의 integration 5분 목표는 샤드 3개로 아직 못 맞췄다(가장 긴 샤드 5.7~6.8분). 같은 spec이 샤드마다 서버를 새로 띄우면 단일 실행보다 30% 안팎 느리다(Metro 개발 서버가 샤드마다 처음부터 번들, 러너 편차 922초 ↔ 679초). 후속 후보: (1) integration이 `expo start` 대신 `expo export` 정적 빌드를 띄우기, (2) 샤드 4개(러너 동시 사용 PR당 8개), (3) pytest 병렬(server job이 이제 5.8분으로 integration과 같은 길이).
- flaky가 배포를 막는 구조: main push CI가 실패하면 `deploy-*.yml`이 건너뛴다(`workflow_run` 성공 조건). 11/05 main 41962666285(c28d325)는 169개 중 1개 — `producer-and-privacy.spec.ts:35`가 외부 리소스 `net::ERR_TIMED_OUT` 콘솔 오류 하나로 `monitor()`에 걸려 실패했고, 그동안 그 커밋은 배포되지 않았다(PR CI에서는 통과). 이 PR에서 (1) CI 재시도 1회, (2) `monitor()`가 localhost 밖 리소스 실패를 경고 주석으로만 남김, (3) 머지 큐를 켜면 main push가 `validated`로 integration을 다시 돌지 않아 같은 flaky가 배포를 막을 기회 자체가 줄어든다.
