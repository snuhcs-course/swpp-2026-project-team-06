## DEV-74 생산자 앱 카카오 로그인 — 서버 테스트

- 이슈: [DEV-74](https://linear.app/sswp6/issue/DEV-74) · 기준 절: `apps/producer/tasks.md#dev-74`
- 범위: `server/tests/test_accounts.py`만. 서버 로직은 DEV-32에서 `app: producer`를 이미 지원(생산자 자리 이름 ‘카카오 사용자’, 온보딩 대상 아님).
- [x] `test_AC_01_16_kakao_producer_signs_up_through_application`: 카카오 생산자 → 농가 없음·온보딩 없음 → 가입 신청 → PENDING, 대표자 이름 반영, 재로그인 시 같은 계정

