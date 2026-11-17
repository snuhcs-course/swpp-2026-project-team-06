## DEV-78 카카오 전화번호 동의 항목(비즈 앱 심사) — 2단계

- 이슈: [DEV-78](https://linear.app/sswp6/issue/DEV-78)
- 브랜치: `nemodleo/dev-78-kakao-phone-scope`
- 기능·인수 조건: FEAT-01 I2 FQ-01 / AC-01-8, AC-01-16 · policy.md 5장
- 상태: 진행 중
- 이 파일이 기준 기록이다. 폴더별 메모: `apps/consumer/tasks/DEV-78.md`, `apps/producer/tasks/DEV-78.md`, `server/tasks/DEV-78.md`

### 목표
카카오계정(전화번호) 동의 항목 심사가 통과했으니 인가 요청에 `phone_number`를 넣어, 가입·주문서·생산자 가입 신청의 휴대폰 칸 입력을 줄인다. 서버는 DEV-32 때부터 받을 준비가 돼 있다.

### 범위 (수정 허용 경로)
- 인가 요청 scope: `apps/consumer/src/lib/kakao.ts`, `apps/consumer/src/lib/kakao.native.ts`, `apps/producer/src/lib/kakao.ts`, `apps/producer/src/lib/kakao.native.ts`
- 생산자 가입 신청 연락처 미리 채움: `apps/producer/src/app/apply.tsx`, `apps/producer/spec.md`
- 테스트: `scripts/test-kakao-scope.mjs`(새 파일), `scripts/test-producer-kakao.mjs`, `scripts/e2e/producer-kakao.spec.ts`
- 문서: `docs/spec/functional/FEAT-01-login.md`, `docs/spec/functional/README.md`(FQ-01), `docs/spec/policy.md`(5장·변경 이력), `docs/spec/screens.md`(SCR-20), `server/app/accounts/spec.md`(결정 행), `docs/wiki/Requirements-and-Specifications.md`
- 이슈 파일: `tasks/DEV-78.md`, `apps/consumer/tasks/DEV-78.md`, `apps/producer/tasks/DEV-78.md`, `server/tasks/DEV-78.md`

### 비범위 (건드리지 않음)
- 서버 코드(`server/app/**/*.py`). `KakaoProfile.phone`, `_kakao_phone`, `kakao_login`·`kakao_signup`이 이미 받는다.
- 이름(`name`) 동의 항목. 신청하지 않았으므로 scope에 넣지 않는다(넣으면 로그인 실패).
- 처리방침 문구·시행일·동의 버전. DEV-140(2026-10-24)에서 이미 전화번호 필수 동의를 적었고 세 미리 채움 지점도 적혀 있다.
- Figma. 우리 화면은 그대로다. 기존 회원에게 한 번 뜨는 추가 동의 화면은 카카오 화면이다.

### 결정 사항
- 11/17 scope 값은 `account_email,phone_number`. 카카오 인가 요청 문서가 scope를 "동의항목 ID 목록, 쉼표(,)로 구분해 여러 개 전달 가능"으로 적는다(https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api, 인가 코드 받기). 공백 구분은 토큰 응답 `scope` 필드 이야기라 인가 요청과 다르다. 웹·네이티브 모두 `URLSearchParams`로 만들어 쉼표가 `%2C`로 나가고, 카카오는 쿼리 값을 디코딩해 읽는다.
- 11/17 값은 파일마다 `KAKAO_SCOPE` 상수로 둔다. 네이티브 파일은 런타임 import가 없어야 Node 테스트가 그대로 읽으므로 공용 모듈로 빼지 않았다(네 곳이 같은지는 `scripts/test-kakao-scope.mjs`가 본다).
- 11/17 생산자 SCR-20은 서버가 이미 `user.phone`을 주는데 화면이 쓰지 않았다(서버 변경 불필요). 처음 신청일 때만, 연락처 칸이 비어 있을 때만 계정 번호로 채운다. 반려 뒤 재신청은 이전 신청 값을 그대로 쓴다. 대표자 이름은 채우지 않는다(카카오에서 이름을 받지 않고, 계정 이름은 자리 이름 ‘카카오 사용자’).
- 11/17 `server/app/accounts/spec.md`는 문서지만 AGENTS.md 고위험 경로 `server/app/accounts/**`에 들어간다. 결정 행을 고쳤으므로 PR 위험 등급은 고위험(로그인 경로이기도 함).

### 작업
- [x] scope에 `phone_number` 추가(4곳)와 주석 정리
- [x] `_kakao_phone` 동작·테스트 확인(서버 수정 없음)
- [x] 미리 채움 세 지점 확인, 생산자 SCR-20 구현
- [x] 스펙·wiki 갱신
- [x] 테스트 추가·갱신, typecheck·test:mock·pytest(accounts)·관련 e2e
- [ ] 배포 뒤 실제 카카오 계정으로 확인(사람)

### 완료 조건
- [x] 두 앱의 웹·네이티브 인가 요청에 `account_email,phone_number`
- [x] 온보딩·첫 주문서·생산자 가입 신청 휴대폰 칸이 카카오 번호로 미리 채워진다(고친 값은 유지)
- [x] 테스트 통과
- [ ] 배포 뒤 확인(아래 기록, 사람)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 11/17 origin/main eb06ef48에서 시작. 사용자가 카카오 콘솔에서 `카카오계정(전화번호) / phone_number`를 필수 동의로 저장(동의 목적은 처리방침 제1조와 같음).
- 11/17 `_kakao_phone`: 숫자만 남기고 `82`로 시작하면 `0`을 붙여 11자리 `01x`면 `010-1234-5678`, 10자리면 `01x-xxx-xxxx`, 그 밖(해외 번호 등)은 빈 값. 결과는 앱·서버 `PHONE`(`^01[016789]-?\d{3,4}-?\d{4}$`)을 통과한다. 테스트: `server/tests/test_accounts.py::test_kakao_name_phone_prefill_only_empty_fields`가 `+82 10-2345-6789` → `010-2345-6789`와 빈 칸에만 채움을 본다. 해외 번호·10자리 같은 경계값만 보는 단위 테스트는 없다(서버 범위 밖이라 보고만).
- 11/17 미리 채움: 소비자 온보딩(`apps/consumer/src/app/onboarding/index.tsx`, `user.phone`으로 처음 한 번), 첫 주문서 받는 곳(`checkout/[productId]/address.tsx` → `AddressForm` `defaultPhone`, 빈 칸만)은 이미 됨. 생산자 SCR-20(`apps/producer/src/app/apply.tsx`)은 빠져 있어 구현.
- 11/17 검증(로컬, 별도 DB `farmclub_dev78`): `npm run typecheck` 5개 워크스페이스 통과, `npm run test:mock` 344/344(새 4개 포함), `uv run pytest tests/test_accounts.py` 41/41, `node scripts/run-integration.mjs scripts/e2e/producer-kakao.spec.ts scripts/e2e/consumer-kakao.spec.ts` 실서버 7/7 + Playwright 7/7(새 1개 포함). 새 e2e는 `apply.tsx` 변경을 빼면 실패하는 것도 확인(연락처 칸 `""`).
- 배포 뒤 확인(사람, 에이전트는 카카오 로그인 불가): 새 동의 화면에 전화번호 항목, 로그인 성공, 소비자 가입·첫 주문서·생산자 가입 신청 휴대폰 칸 미리 채움. 실패하면 scope 커밋 하나를 revert해 `account_email`로 되돌린다.
