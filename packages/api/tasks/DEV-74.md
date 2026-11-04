## DEV-74 생산자 앱 카카오 로그인 — Mock

- 이슈: [DEV-74](https://linear.app/sswp6/issue/DEV-74) · 기준 절: `apps/producer/tasks.md#dev-74`
- 범위: `packages/api/src/mock/auth.ts`(Mock 생산자 카카오 계정 `u-kakao-farm`), `scripts/test-onboarding.mjs`(생산자 카카오 → 가입 신청 확인)
- 10/18 결정: Mock 생산자 카카오 로그인은 강영수(승인) 대신 농가 없는 `u-kakao-farm`(이름 ‘카카오 사용자’)으로 들어가 가입 신청 흐름을 보여 준다. 상태별 시연은 테스트 계정 목록으로 계속 한다.
- [x] Mock 계정과 계약 테스트, `npm run test:mock` 15/15

