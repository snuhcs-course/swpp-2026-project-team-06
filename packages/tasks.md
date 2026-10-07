# packages tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 규칙: N-02
- 상태: 진행 중

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
