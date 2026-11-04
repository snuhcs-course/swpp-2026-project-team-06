## DEV-94 회원 탈퇴 구현 (10/23 사용자 지시로 착수)

- 이슈: [DEV-94](https://linear.app/sswp6/issue/DEV-94) · 브랜치 `nemodleo/dev-94-account-withdrawal`(위 초안 섹션과 PR #210을 대체)
- 기능·규칙: FEAT-01 새 AC-01-20, R-15, R-24, policy.md 5장, 처리방침 제3·7·8조, 약관 제5조, 개인정보보호법 제21조(파기)·제38조 ④(수집보다 어렵지 않게)
- 상태: 리뷰 중

### 목표
소비자 앱 ‘내 정보’, 생산자 앱 ‘환경설정’에서 회원 탈퇴를 할 수 있게 한다. 탈퇴하면 개인정보를 지체 없이 파기하고, 법정 보존 거래 기록은 회원과 분리해 남긴다.

### 범위 (수정 허용 경로)
- `server/app/accounts/{models,schemas,service,router}.py`, `server/app/core/security.py`(탈퇴 회원 토큰 거부), `server/migrations/versions/0020_user_deleted_at.py`, `server/tests/test_account_withdrawal.py`, `server/tasks.md`
- `packages/api/src/{types.ts,endpoints.ts,mock/db.ts,mock/auth.ts}`, `scripts/test-onboarding.mjs` 또는 새 `scripts/test-withdrawal.mjs`, `package.json`(test:mock)
- `apps/consumer/src/app/(tabs)/me/index.tsx`, `apps/producer/src/app/{(tabs)/settings,pending}.tsx`, `packages/ui/src/{WithdrawSheet.tsx,index.ts}`, `apps/{consumer,producer}/tasks.md`, `scripts/e2e/account-withdrawal.spec.ts`
- `packages/ui/src/legalContent.ts`, `scripts/test-legal.mjs`
- `docs/spec/functional/FEAT-01-login.md`, `docs/spec/{screens,ia,policy}.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
- 운영자 대리 탈퇴·테스트 농가 영구 삭제(초안 계획의 admin API), 카카오 연결 끊기(unlink, DEV-75), R2 원본 파일 삭제 배치, `CONSENT_VERSION`(올리면 전원 재동의, DEV-124)

### 결정 사항 (PQ-06 미정 — 현재 처리방침 제3조 기준, 법률 확인 필요 SWPP-124)
- 10/23 D1 익명화: `users` 행은 남기고 이름·닉네임·휴대폰·이메일·카카오 회원번호를 지우고 `deleted_at`을 기록한다. 주문·대화가 다른 사람(농가) 데이터와 묶여 있어 행 삭제 대신 익명화(초안 권고). 탈퇴한 회원의 토큰은 401.
- 10/23 D2 거래 기록: 주문·입금·환불 행은 그대로 둔다(전자상거래법 5년/3년). 받는 사람 이름·연락처·주소는 보존 기간 동안 주문에 남는다(처리방침 제3조). 보존 기간이 지난 뒤 파기하는 배치는 후속.
- 10/23 D3 대화·소식: 회원이 쓴 1:1 채팅·소식 답장 본문과 사진은 지운다(‘탈퇴한 회원의 메시지예요’로 바꿈). 단 주문에 묶인 문의(주문 문제 문의)는 불만·분쟁 기록(3년)으로 남긴다. 좋아요·팔로우·저장 배송지는 삭제(팔로워 수도 줄인다). 농가에는 이름 대신 ‘탈퇴한 회원’으로 보인다.
- 10/23 D4 첨부 파일: 지운 메시지의 첨부 참조와 그 회원이 올린 비공개 첨부 행을 지운다. 저장소(R2) 원본 정리는 후속(비범위).
- 10/23 D5 진행 중 주문: 소비자는 입금 대기·예약·출하 준비·배송 중(`PENDING_PAYMENT`·`AWAITING_DEPOSIT`·`RESERVED`·`PREPARING`·`SHIPPED`) 주문이 있으면 409 `WITHDRAW_BLOCKED`(주문 번호 목록). 생산자는 자기 농가에 그런 주문이 있으면 막는다.
- 10/23 D6 생산자: 계정 익명화 + 농가 숨김(`SUSPENDED`, 사유 ‘농가가 탈퇴했어요’, 소비자 화면에서 사라짐) + 입금 계좌·농가 연락처 삭제. 농가명·상품·지난 주문 기록은 남긴다.
- 10/23 D7 재가입: 카카오 회원번호를 지우므로 같은 카카오로 다시 오면 새 사용자다(지난 기록과 연결 안 함).
- 10/23 D8 동의 기록(`user_consents`)·운영자 감사 기록은 증빙으로 남긴다.
- 10/23 시드 테스트 계정(`is_test_account`)은 탈퇴할 수 없다(403 `TEST_ACCOUNT`). 여럿이 같이 쓰는 데모 계정이라서다. 관리자 페이지에서 ‘테스트로 표시’한 팀원 카카오 계정(`ops_tester`)은 실제 계정이라 탈퇴할 수 있다. Mock은 데모 데이터 초기화를 쓴다.

- 10/23 파기 시점(사용자 질문): 개인정보는 탈퇴 요청과 같은 트랜잭션에서 바로 파기한다(처리방침 제7조 ‘지체 없이, 늦어도 5일’ 안). 남기는 기록(주문·입금·환불 5년, 주문 문의 3년, 동의 기록)은 기간이 지나면 지워야 하지만 자동 파기 배치는 아직 없다(후속 이슈). Railway DB 백업의 보관·삭제 주기도 확인이 필요하다.
- 10/23 생산자 환경설정은 승인 뒤에만 열려서, 확인 중·반려 상태의 생산자도 탈퇴할 수 있게 승인 대기 화면(SCR-21)에 같은 시트를 둔다. 공용 시트는 `packages/ui` `WithdrawSheet`.

### 작업
- [x] 서버: `deleted_at` 마이그레이션, `POST /api/auth/me/withdraw`, 토큰 거부, 표시 이름
- [x] Mock·클라이언트 같은 규칙
- [x] 두 앱 탈퇴 화면(확인 시트 2단계, 막힘 안내)
- [x] 처리방침·약관 문구, 스펙
- [x] pytest, typecheck, test:mock, Playwright, 실서버 integration

### 완료 조건
- [x] 탈퇴하면 개인정보가 지워지고 다시 로그인하면 새 사용자다
- [x] 진행 중 주문이 있으면 막힌다
- [ ] 테스트 통과, CI 통과 후 main 머지(사용자 지시 10/23 "머지 진행")

### 기록
- 10/23 origin/main 9436171에서 시작. DEV-132(PR #264) 미머지.
- 10/23 검증: `uv run pytest` 434 passed(새 `test_account_withdrawal.py` 5개), `uv run ruff check` 통과, `npm run typecheck` 통과, `npm run test:mock` 41 passed / 0 failed(새 `test-withdrawal.mjs`), Mock 스택 `account-withdrawal.spec.ts` 3 passed, 실서버 `test:integration:full` 67 passed / 7 skipped / 0 failed. 임시 DB 삭제.
- 10/23 origin/main(DEV-132 머지 뒤) 병합: Mock 상수, FEAT-01·wiki·tasks 충돌을 양쪽 유지로 풀고, 생산자 탈퇴 테스트·Mock 테스트·E2E를 가입 동의(가입 토큰) 흐름에 맞췄다. 병합 뒤 pytest 436 passed, test:mock 41/0, Mock E2E(탈퇴 3 + 약관 5) 8 passed.

