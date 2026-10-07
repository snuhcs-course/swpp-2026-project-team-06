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
- 10/07 루트 `.gitignore`에 node_modules·.expo·dist·.venv 등 추가(앱 커밋 전에 필요)

### 작업
- [x] `packages/ui/spec.md`, `packages/api/spec.md` 작성
- [x] 루트 `package.json`: private, workspaces `["apps/*", "packages/*"]`
- [x] `@farmclub/ui`: `tokens.ts`(본문 16px, 누르는 영역 48px), `Button`, `Placeholder`
- [x] `@farmclub/api`: `EXPO_PUBLIC_API_URL` fetch 래퍼, `health()`
- [x] 루트 `.gitignore` 확인(node_modules, .venv, .env, dist, .expo 등)
- [ ] 루트 `README.md` "로컬 실행" 절

### 완료 조건
- [x] `packages/ui`(N-02 크기 토큰·기본 버튼), `packages/api`(API 클라이언트 자리)
- [ ] 실행 방법 README
- [x] 두 앱에서 import해 `npx tsc --noEmit` 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 앱 tsconfig로 packages/ui·api `tsc --noEmit` 통과
