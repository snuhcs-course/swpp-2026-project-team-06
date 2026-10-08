# packages tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 규칙: N-02
- 상태: 리뷰 중

### 목표
두 앱이 함께 쓰는 `@farmclub/ui`(N-02 크기 토큰·기본 버튼·Placeholder)와 `@farmclub/api`(API 클라이언트 자리), npm workspaces를 만든다.

### 범위 (수정 허용 경로)
- `packages/**`
- 레포 루트 공통 파일: `package.json`, `package-lock.json`(npm workspaces), `.gitignore`, `README.md`("로컬 실행" 절)

### 비범위 (건드리지 않음)
- OpenAPI 클라이언트 생성 도구 도입, 인증 헤더·토큰 갱신(DEV-3·DEV-4)
- 디자인 토큰 세부 수치(화면 명세 P21)
- `docs/**`, `.agents/**`, `AGENTS.md`

### 결정 사항
- 10/07 루트 공통 파일(`package.json`·`package-lock.json`·`.gitignore`·`README.md`)은 이 섹션 범위에 둔다. 레포 루트에는 tasks.md를 두지 않는다
- 10/07 두 패키지 모두 빌드 없이 TS 소스를 `main`으로 둔다
- 10/07 Expo 57 앱 tsconfig에는 Node 타입이 없어 `process.env`가 타입 오류 → `packages/api/src/client.ts` 안에서만 `process`를 선언(@types/node를 추가하지 않음)
- 10/07 PR 리뷰 반영: `request()`가 `Headers` 객체로 받은 헤더를 잃던 문제와, `EXPO_PUBLIC_API_URL`이 빈 문자열이면 상대 경로가 되던 문제 수정
- 10/07 루트 `.gitignore`에 node_modules·.expo·dist·.venv 등 추가(앱 커밋 전에 필요)

### 작업
- [x] `packages/ui/spec.md`, `packages/api/spec.md` 작성
- [x] 루트 `package.json`: private, workspaces `["apps/*", "packages/*"]`
- [x] `@farmclub/ui`: `tokens.ts`(본문 16px, 누르는 영역 48px), `Button`, `Placeholder`
- [x] `@farmclub/api`: `EXPO_PUBLIC_API_URL` fetch 래퍼, `health()`
- [x] 루트 `.gitignore` 확인(node_modules, .venv, .env, dist, .expo 등)
- [x] 루트 `README.md` "로컬 실행" 절

### 완료 조건
- [x] `packages/ui`(N-02 크기 토큰·기본 버튼), `packages/api`(API 클라이언트 자리)
- [x] 실행 방법 README
- [x] 두 앱에서 import해 `npx tsc --noEmit` 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 루트 README "로컬 실행" 절 추가. `git diff main...HEAD`를 네 tasks.md 범위와 대조: 범위 밖 파일 없음, docs/·.agents/ 변경 없음
- 10/07 앱 tsconfig로 packages/ui·api `tsc --noEmit` 통과

## DEV-3 [I1-P23] Implement frontend (prototype)

- 이슈: [DEV-3](https://linear.app/sswp6/issue/DEV-3)
- 상태: 시작 전 — 아래는 SWPP-26(P22 스펙 확정)에서 넘어온 할 일만 미리 적었다. 시작할 때 `spec` 스킬로 목표·범위·완료 조건을 채운다
- 기준 문서: `docs/spec/screens.md`(화면·API), Must 범위는 screens.md 4장

### SWPP-26에서 넘어온 할 일
- [ ] `@farmclub/api`: `ApiError`가 오류 본문 `{code, message, details}`를 꺼내 주게 바꾸기(screens.md 7.1)
- [ ] `@farmclub/api`: 토큰 보관과 `Authorization` 헤더, 테스트 로그인 함수(`GET /api/auth/test-accounts`, `POST /api/auth/test-login`)
- [ ] `@farmclub/api`: 목록 함수 `{ items, nextCursor }`, 주문·결제에 `Idempotency-Key`(재시도 때 같은 키)

## DEV-14 README 영문 완성

- 이슈: [DEV-14](https://linear.app/sswp6/issue/DEV-14)
- 브랜치: `nemodleo/dev-14-readme-영문-완성`
- 기능·인수 조건: 없음(문서)
- 상태: 진행 중

### 목표
루트 `README.md`의 SWPP 템플릿 문구를 걷어내고, 레포를 처음 보는 사람이 서비스, 실행 방법, 문서 위치를 바로 알 수 있게 영어로 완성한다.

### 범위 (수정 허용 경로)
- `README.md`
- `packages/tasks.md` (이 섹션)

### 비범위 (건드리지 않음)
- `docs/**`, `AGENTS.md`, 코드
- 스크린샷(디자인 확정 후)

### 결정 사항
- 10/07 루트 공통 파일은 DEV-12 결정대로 이 파일 범위에 기록한다(루트에 tasks.md를 두지 않음)
- 10/07 README는 영어로 쓴다. 스펙 원본(`docs/spec/`)은 한국어로 유지하고 README에서 위치만 안내한다
- 10/07 공개 레포 규칙에 따라 가격·운영 수치, 개인정보, 내부 도구 링크는 넣지 않는다. 팀은 이름만 적는다(wiki Home과 같음)

### 작업
- [x] 소개, I1 범위의 핵심 기능, 기술 스택, 레포 구조
- [x] 로컬 실행(서버, 두 앱), 테스트·CI
- [x] 문서 안내, 작업 방식 요약, 팀

### 완료 조건
- [x] README에 템플릿 문구가 남아 있지 않다
- [x] 적힌 실행 명령이 레포의 실제 스크립트·설정과 같다
- [ ] CI 통과 후 main 머지

## DEV-3 로컬 프로토타입 통합 작업 (2026-10-07)

- 이슈: https://linear.app/sswp6/issue/DEV-3
- 브랜치: `jinwoo/dev-3-frontend`
- 상태: 로컬 실행 완료, 사용자 수정 대기
- 기준: screens.md 1.1, docs/design, ADR 0009·0010, 사용자 승인 계획

### 목표
Hyun Park 작성 farmclub-proto-ref.zip을 기준으로 두 앱을 Mock 모드로 실행하고 사용자 피드백을 반영한다.

### 범위
- packages/**, package.json, package-lock.json, scripts/**, README.md

### 결정 사항
- 기존 두 작업 폴더를 보존하고 최신 main의 별도 clone에서 작업한다.
- ZIP의 소스·자산을 이식하되 main의 spec.md·tasks.md는 보존한다.
- 하나의 DEV-3 브랜치를 사용한다. 사용자 지시로 push·PR·배포는 보류한다.
- scripts/local.mjs가 Windows에서도 Mock 환경과 두 앱의 로컬 URL을 설정한다.
- 이전 DEV-12·DEV-14의 진행 중 표시는 main에 반영된 과거 기록으로 보존한다.
- Mock 상태는 ZIP과 같이 앱별 브라우저 저장소이며 두 앱 사이에 동기화되지 않는다.

### 작업 및 로컬 완료 조건
- [x] ZIP 이식, 옛 중복 라우트 제거, 의존성 설치
- [x] 소비자·생산자·API·UI 타입 검사 통과
- [x] 두 앱 웹 export 통과, git diff --check 통과
- [x] 소비자 8081·생산자 8082 로컬 개발 서버 실행
- [x] 소비자 로그인 복귀·동의 전 결제 비활성·Mock 결제·예약 완료·주문 내역 확인
- [x] 생산자 로그인·현황·상품 편집 입력값·질문함·출하 목록 표시 확인
- [x] 모바일 390px 화면과 PC 1440px 중앙 정렬 육안 확인
- [ ] 사용자 요청 수정 반영 (후속 작업)

### 기록 및 검증 한계
- 2026-10-07: Linear DEV-3 목표·완료 조건 확인. 이 기록은 DEV-3 전체 완료·리뷰 승인·main 머지를 뜻하지 않는다.
- 브라우저에서 확인한 화면의 콘솔 오류 0건. 상품 저장 테스트는 자동 승인 검토 거절로 미실행; 출하 상태 변경·모든 생산자 계정 상태·전체 인수 조건은 미검증.
- npm install 보고: 의존성 취약점 28건(중간 10, 높음 18). ZIP 버전 유지; 임의 major upgrade·audit fix 미실행.
- Git 작성자 이메일은 기존 설정 유지. GitHub 이메일 조회 권한이 없어 등록 일치 여부는 미확인.
- 서버 로그/PID는 루트 .expo/local-dev.*에 저장. 사용자에게 로컬 주소 안내 후 화면 수정부터 이어간다.


## DEV-3 소식방 및 공유 로컬 Mock (2026-10-07)

- 상태: 로컬 구현·검증 완료 (커밋·push·PR 없음)
- 목표: 농가별 소식방, 소비자 본인 답장만 노출, 생산자 전체 수신, 기존 1:1 채팅 유지.
- 승인: 사용자가 계획 승인 후 구현 요청. push·PR·배포 없음.
- 범위: apps/consumer/**, apps/producer/**, packages/api/**, packages/ui/**, scripts/**, package.json, package-lock.json, README.md, docs/spec/**, docs/design/README.md, docs/wiki/Requirements-and-Specifications.md, docs/wiki/Design-Documentation.md, docs/wiki/Testing-Documentation.md.
- 결정: 서버 응답에서 역할·농가·팔로우별 필터링. 2초 foreground polling. 소식방 AI 답변 없음. 생산자 답변은 방 전체 공개.
- 결정: 기존 Mock를 로컬 Node 서버에서 공유하고 .expo에 지속 저장. 기존 브라우저 데이터 보존·인증 키 분리. 신규 데모는 공유 시드로 시작.
- 검증: A/B 소비자·생산자 격리, 목록·페이지네이션 누출 방지, 동기화·재시작·첨부·실패 및 중복 전송, 타입 검사·웹 빌드·UI.

### 구현·검증 기록
- 농가별 목록/소식방, 생산자 전체 방송과 소비자 본인 답장, 기존 1:1 채팅 이름 분리 완료.
- 공유 Mock 상태·미디어 영속 저장, 앱별 인증 키 분리, 멱등 재전송, 승인·소유·팔로우 검사 완료.
- API 격리 테스트 통과: 두 소비자/생산자, 요약·cursor 누출 차단, 연락처 가림, 중복 키·본문 충돌, 방송·좋아요·첨부, 재시작·초기화·Origin 검사.
- 브라우저: 두 소비자 세션에서 상대 답장 미노출, 생산자에서 모두 표시, 2초 동기화 확인. 네트워크 실패 시 글 보존·재시도 1회 저장 확인.
- 브라우저: 과거 읽기 위치 0 → 신규 메시지 후 0 유지, 새 소식 버튼으로 하단 이동. PC 1440px·모바일 390px 육안 확인.
- 타입 검사 4개 workspace 및 소비자/생산자 웹 export 통과. 의도적 네트워크 차단 테스트 외 새 UI 콘솔 오류 없음.
- 제품·디자인 원본 및 영어 wiki에 소식방 계약/검증을 함께 기록.
- 범위 한계: 새 API는 로컬 Mock 구현이다. FastAPI 서버·실서비스 저장소 반영 및 PR은 이번 작업에 포함하지 않았다. 기존 전체 주문/생산자 기능의 검증 범위는 이전 기록 참조.


## DEV-3 전체 프론트 및 스펙 1.4
- 공용 UI·API/Mock과 두 앱을 단일 프론트 PR로 통합한다. 상세 범위·결정·검증은 각 패키지 tasks.md의 스펙 1.4 절을 따른다.
- 스펙 PR #40 선행 머지. 데모 프로토타입(Hyun Park 작성)을 참고.

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
