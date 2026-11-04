## DEV-25 [I1-P26-1] Comprehensive Integration Test Automation

- 이슈: [DEV-25 / GitHub #56](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/56)
- 브랜치: `zahra/dev-25-i1-p26-1-comprehensive-integration-test-automation`
- 기능·인수 조건: I1 P0 FEAT-01~15·17·19, 스펙 1.1~1.5 AC / `docs/wiki/Testing-Documentation.md`
- 상태: 진행 중

### 목표
DEV-6의 실제 API smoke와 수동 브라우저 결과를 반복 가능한 실제 스택 자동화로 확장한다. 두 Expo 웹 앱과 FastAPI·PostgreSQL의 연결을 Chromium에서 검증하고, DEV-6에서 빠진 계약과 privacy·격리 흐름을 보완한다.

### 범위 (수정 허용 경로)
- `scripts/**`
- 루트 `package.json`, `package-lock.json`, `playwright.config.ts`, `.gitignore`, `README.md`
- `docs/wiki/Testing-Documentation.md`
- `packages/tasks.md` (이 절)

### 비범위 (건드리지 않음)
- `apps/**`, `packages/api/**`, `packages/ui/**`, `server/**` 제품 코드
- Railway·Vercel 배포 환경 검증(P28/DEV-8)
- native iOS·Android, 다중 브라우저, 부하·성능·침투 테스트, 외부 관측 서비스·R2·실제 Anthropic 호출
- 발견한 제품 결함 수정(별도 Bug 이슈·브랜치에서 처리 후 전체 matrix 재실행)

### 결정 사항
- 10/09 DEV-6·DEV-7과 GitHub #7·#8을 재사용하지 않고 후속 작업을 `[I1-P26-1]` DEV-25 / GitHub #56으로 분리한다
- 10/09 기존 `npm run test:integration`은 API smoke로 유지하고 `test:e2e`와 전체 orchestration인 `test:integration:full`을 추가한다
- 10/09 Chromium 하나를 직렬 실행하며, 사용자 행동은 UI로 검증하고 운영자 승인·결정적 준비와 UI에서 볼 수 없는 검증만 API를 사용한다
- 10/09 로컬 실제 스택만 다루고 Mock 요청·예상하지 않은 5xx·page error·설명되지 않은 console error를 실패로 처리한다
- 10/09 CI 변경 결정과 검증은 `.github/tasks.md`의 같은 DEV-25 절에도 기록한다

### 작업
- [x] 실제 스택을 reset·실행·종료하는 `test:integration:full`
- [x] DEV-6 API smoke 누락 계약과 clean-seed preflight
- [x] Chromium Playwright 교차 앱·privacy·resilience·responsive 시나리오
- [x] 실패 screenshot·trace·report·HTTP/process log
- [x] README 실행 방법과 영문 Testing Documentation 결과
- [x] 제품 결함 발견 여부 확인(새 제품 결함 없음; 테스트 locator·lifecycle 기대만 수정)

### 완료 조건
- [x] 실제 스택을 한 명령으로 초기화·실행·종료
- [x] API smoke와 Chromium suite가 DEV-6 누락 범위를 자동 검증
- [x] Mock traffic·예상하지 않은 5xx·browser error가 없음
- [x] 자동·수동·미검증 범위와 실제 결과가 Testing Documentation에 기록됨
- [x] 전체 기존 검사와 DEV-25 integration CI 통과
- [ ] AI 1차 리뷰 후 사람 1명 승인, main에 squash merge

### 기록
- 10/09 DEV-25를 Linear에서 In Progress로 만들고 GitHub #56 동기화 확인. PR #53·#55가 포함된 최신 main에서 Linear branch를 생성
- 10/09 draft PR #57 생성. 기존 API-only `test:integration`을 유지하고 Playwright Chromium·전체 runner를 추가
- 10/09 clean-seed 검사, 물량 증가/철회/반려/이력, 상세 제약, 주문 pagination/filter/window, 생산자 이름 가림 계약을 API smoke에 추가해 7/7 통과
- 10/09 Chromium 8/8 통과: 익명 탐색·로그인 복귀, 실제 결제, 생산자 UI 수확/송장/출하, 소비자 배송 확인, 실패 문의 입력 보존, 생산자 5개 gate, 상품 초안·판매 중지/재개, 소식방 session, farm editor, 360/390/430/1440px
- 10/09 최종 로컬 검증: Ruff 통과, pytest 133개, Alembic upgrade/check, 4개 workspace typecheck, Mock 11개, consumer/producer web export, full integration 7 API + 8 Chromium 통과. Mock 첫 실행 실패는 sandbox loopback EPERM이었고 권한 있는 동일 명령에서 통과
- 10/09 자동화/기존 수동/미검증 범위를 영어 Testing Documentation에 분리 기록. 새 제품 Bug는 발견되지 않음
- 10/09 AI 1차 검토에서 stateful browser suite의 CI retry가 dirty DB를 재사용하는 문제와 실패 문의의 실제 retry 누락을 찾아 retry를 끄고 두 번째 전송·채팅 표시까지 검증
- 10/09 첫 integration CI는 Linux 접근성 이름에 `소식방`이 없는 농가 보기 버튼을 과도하게 한정해 7/8 실패. 제품 결함이 아니며 semantic name을 `/농가 보기/`로 맞춘 뒤 전체 CI 재실행
- 10/09 Actions run 37819337425에서 server(133 pytest 포함), apps(typecheck·Mock 11·두 export), integration(API 7 + Chromium 8) 모두 통과. `origin/main` 병합 확인 결과 Already up to date
- 10/09 인계: spec 커밋(987c752)만 push, draft PR #57의 server·apps CI는 그 커밋 기준. 로컬에 push 안 한 커밋 4개(runner `scripts/run-integration.mjs`, API smoke 확장 `scripts/test-integration.mjs`, Playwright `scripts/e2e/*`, CI `integration` job). 미커밋 변경 1개: `checkout-and-fulfillment.spec.ts`의 수확 시작·출하를 API 호출에서 생산자 화면 조작으로 바꾸는 중. `test:integration:full` 실행 결과·Testing Documentation·README는 아직 기록 없음
- 10/09 위 인계 기록 뒤 구현·문서·AI 리뷰·CI를 모두 완료했다. 브랜치 prefix를 팀 규칙에 맞춰 `zahra/`로 수정하면서 GitHub가 PR #57을 자동 종료해 동일 작업의 replacement PR #61로 리뷰를 이어간다

