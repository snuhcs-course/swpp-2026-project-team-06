## DEV-74 생산자 앱 카카오 로그인(SCR-19)과 가입 신청 연결

- 이슈: [DEV-74](https://linear.app/sswp6/issue/DEV-74)
- 브랜치: `nemodleo/dev-74-dev-생산자-앱-카카오-로그인scr-19과-가입-신청-연결`
- 기능·인수 조건: FEAT-01 I2 / AC-01-10(서버 계약은 DEV-32), AC-01-16(신규) · ADR 0003·0010
- 상태: 진행 중

### 목표
실제 농가가 카카오로 생산자 앱에 가입·로그인한다. 처음이면 생산자 계정이 생기고(농가 없음) 기존 관문이 가입 신청(SCR-20)으로 보낸다.

### 범위 (수정 허용 경로)
- `apps/producer/src/app/login.tsx`, `apps/producer/src/app/auth/kakao.tsx`(새 화면), `apps/producer/src/lib/kakao.ts`(새 파일), `apps/producer/src/lib/session.tsx`(관문에 `/auth/kakao` 허용만)
- `packages/api/src/mock/auth.ts`(Mock 생산자 카카오 계정), `server/tests/test_accounts.py`(생산자 카카오 → 가입 신청 테스트)
- `apps/producer/spec.md`, `apps/producer/tasks.md`, `packages/api/tasks.md`, `server/tasks.md`
- 문서: `docs/spec/functional/FEAT-01-login.md`, `docs/spec/screens.md`(SCR-19), `docs/spec/ia.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
- 서버 카카오 로그인 로직(DEV-32에서 `app: producer` 이미 지원), 소비자 온보딩(생산자는 SCR-20이 대표자 이름·연락처를 받음), 탈퇴·리프레시 토큰(DEV-75·76), Figma

### 결정 사항
- 10/18 실서버에서 카카오가 켜져 있으면 테스트 계정 목록과 ‘처음이세요? 농가로 가입 신청’을 숨기고 ‘카카오로 시작하기’만 둔다(소비자 앱과 같은 규칙). 처음 온 농가도 카카오로 시작하면 관문이 SCR-20으로 보낸다.
- 10/18 Mock 모드는 카카오와 테스트 계정 목록을 함께 둔다. 승인·확인 중·반려·정지 계정을 시연·디자인 검토에 계속 써야 하기 때문. Mock 카카오 로그인은 농가 없는 새 생산자 `u-kakao-farm`으로 들어가 가입 신청 흐름을 보여 준다.
- 10/18 복귀 정보는 sessionStorage `farmclub-producer:kakao-return`에 `state` 일회용 값만 둔다. 생산자 앱은 이어서 할 행동(resume)이 없고, 갈 곳은 세션 관문이 농가 상태로 정한다.

### 작업
- [x] `lib/kakao.ts`, `auth/kakao.tsx`, `login.tsx`, 관문
- [x] Mock 생산자 카카오 계정
- [x] pytest(생산자 카카오 → 농가 없음 → 가입 신청 → PENDING, 대표자 이름 반영)
- [x] 스펙·wiki
- [x] typecheck, test:mock, Mock 화면 확인, 통합 테스트

### 완료 조건
- [x] 카카오로 생산자 앱 로그인 → 농가 상태별 화면(가입 신청·대기·대시보드·정지)
- [x] 테스트 통과
- [x] 카카오 콘솔에 생산자 앱 `<PRODUCER_APP_URL>/auth/kakao` 등록(사용자, 10/18)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 main 56ac959에서 시작.
- 10/18 구현·검증: Ruff·pytest 364/364(신규 1), `npm run typecheck` 4개, `npm run test:mock` 15/15, 통합(카카오 꺼짐, 별도 DB) 실서버 7/7 + Playwright 43/43. Mock 화면: 카카오와 테스트 목록 함께 → 카카오로 시작 → `/apply`, 잘못된 state → 만료 안내, 콘솔 오류 0. 로컬 실서버(카카오 켜짐): 테스트 계정 0개·‘농가로 시작하세요’·카카오 버튼만, 누르면 카카오 로그인 화면(redirect_uri `http://localhost:8082/auth/kakao`). 실제 카카오 계정 생산자 로그인은 카카오 콘솔에 생산자 복귀 주소 등록 뒤 확인(아래).
- 10/18 실제 카카오 계정(로컬 실서버 + 생산자 앱, 별도 DB): 카카오로 시작하기 → 새 생산자 계정(자리 이름 ‘카카오 사용자’, 이메일 저장) → `/apply` → 테스트 값으로 신청 → `/pending`(확인 중), 계정 이름이 대표자 이름으로 바뀜. 로그아웃 뒤 다시 카카오 → 같은 계정으로 `/pending`. 카카오 계정 1개만 생성.
- 10/19 Figma P02 반영(DEV-74 수정 프레임). 비범위로 넘긴 Figma를 사후에 맞춤. 같은 일이 반복되지 않게 DEV-88에서 PR 본문 `Figma:` 줄과 CI 검사를 추가.

