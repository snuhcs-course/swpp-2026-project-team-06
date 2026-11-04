## DEV-6 [I1-P26] Integration test

- 이슈: [DEV-6 / GitHub #7](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/7)
- 브랜치: `zahra/dev-6-i1-p26-integration-test`
- 기능·인수 조건: I1 P0 핵심 흐름, 스펙 1.1~1.5 AC / `docs/wiki/Testing-Documentation.md`
- 상태: 진행 중

### 목표
두 Expo 웹 앱을 Mock이 아닌 FastAPI·PostgreSQL에 연결해 소비자·생산자 핵심 흐름이 끝까지 이어지는지 검증한다. 반복 가능한 실제 서버 API smoke와 브라우저 결과를 남기고, 발견한 제품 결함은 #8 후속 Bug 이슈로 분리한다.

### 범위 (수정 허용 경로)
- `scripts/**`
- `package.json`
- `docs/wiki/Testing-Documentation.md`
- `packages/tasks.md`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/api/**`, `packages/ui/**`, `server/**` 제품 코드
- 통합 테스트에서 발견한 제품 결함 수정(별도 Bug 이슈·브랜치, 관련 #8)
- 배포 환경 검증(P28/DEV-8)

### 결정 사항
- 10/09 GitHub #7은 P23→DEV-3, P24→DEV-4 순서에 따라 DEV-6으로 기록한다
- 10/09 실제 서버 smoke는 새 의존성 없이 Node `fetch`로 만들고 localhost만 허용한다. 실행 전 DB를 0005로 올리고 시드를 reset한다
- 10/09 브라우저는 `EXPO_PUBLIC_API_MOCK=0`, `EXPO_PUBLIC_API_URL=http://localhost:8000`으로 두 앱을 띄우며 `/__mock` 요청이 없어야 한다
- 10/09 동시성·세부 권한은 기존 pytest/Mock 계약 테스트를 유지하고, 브라우저는 실제 client↔server 연결·교차 앱 상태·오류 복구·레이아웃을 검증한다
- 10/09 실패는 재현 정보·예상/실제·증거를 담은 별도 Bug 이슈로 등록하고 DEV-6에는 수정하지 않는다. blocker 수정 후 전체 matrix를 다시 실행한다
- 10/09 #54 수정 후 smoke의 계정 gate 흐름에 승인 대기·반려 신청 내용 조회와 농가 없는 계정의 404를 추가해 같은 client↔server 계약 회귀를 자동 검출한다

### 작업
- [x] `npm run test:integration` 실제 FastAPI smoke harness
- [x] 인증·상품 승인·주문·용량·소식/채팅·상세 콘텐츠 API 흐름
- [x] 소비자·생산자 브라우저 핵심 흐름과 계정 gate
- [x] privacy·오류 복구·390/1440px·Mock 미사용 확인
- [x] 전체 자동 검사와 browser 결과를 영어 Testing Documentation에 기록
- [x] 실패별 Bug 이슈 등록·수정 후 전체 재실행 (#54 → PR #55 머지, 자동 전체·영향 browser 재실행)

### 완료 조건
- [x] 실제 FastAPI smoke 전체 통과
- [x] 브라우저 시나리오 전체 expected=actual, 예상하지 않은 5xx·console error·Mock 요청 없음
- [x] ruff·pytest·alembic, typecheck·Mock tests·web export 통과
- [x] 모든 실패가 별도 Bug 이슈로 추적되고 blocker 해결 후 재검증
- [ ] AI 1차 리뷰 후 사람 1명 승인, CI 통과, main 머지

### 기록
- 10/09 PR #52(스펙 1.5) 머지·CI 통과 후 최신 main에서 브랜치 생성. GitHub #7 완료 조건과 기존 pytest·Mock·browser 검증 기록, 실제 API 실행 방법 확인
- 10/09 draft PR #53 생성. `scripts/test-integration.mjs`는 localhost만 허용하고 새 의존성 없이 7개 실제 서버 흐름을 순차 검증한다
- 10/09 DB reset 뒤 실제 API smoke 7/7 통과. ruff 통과, pytest 128개 통과, Alembic upgrade/check 통과. frontend typecheck 4개 workspace, Mock 11개, 두 Expo web export 통과
- 10/09 브라우저에서 익명 탐색·로그인 복귀, 소비자 결제, 생산자 수확/송장/출하, 소비자 배송 상태, 상품 상세 초안/재정렬/미리보기/저장, 공개 소식방 privacy, AI 답변/전달, reload·API 중단/재시도, 390/1440px를 실제 port 8000으로 확인. 예상하지 않은 5xx·browser error·Mock 요청 없음
- 10/09 승인 대기·반려 생산자에서 `/api/auth/producer-application` 404로 `/pending`이 `Not Found`를 표시하는 blocker 발견. 제품 수정은 섞지 않고 Bug #54로 등록해 #7·#8에 연결. 정지·신규 gate는 정상
- 10/09 #54 수정 머지 후 최신 main 병합, DB reset, 전체 API/브라우저 matrix 재실행 전까지 draft 유지하고 완료 처리하지 않는다
- 10/09 PR #55 머지 commit `297b27a`를 병합하고 DB를 reset. smoke에 PENDING·REJECTED 신청 조회와 NONE 404를 추가해 7/7 재통과. Ruff, pytest 133개, Alembic upgrade/check, typecheck, Mock 11개, 두 web export 재통과
- 10/09 실제 생산자 앱에서 오미숙은 신청 일정·읽기 전용 신청 내용, 박순자는 반려 사유·이전 값이 채워진 재신청 폼을 확인. `/api/auth/producer-application` 200, browser error 없음. #54 blocker 해소
- 10/09 AI 1차 diff 점검에서 integration scenario 이름의 AC 추적 ID 누락을 발견해 7개 흐름 모두 관련 AC ID를 붙임

