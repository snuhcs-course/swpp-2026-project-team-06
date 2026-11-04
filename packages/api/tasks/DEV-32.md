## DEV-32 카카오 로그인 클라이언트

- 이슈: [DEV-32](https://linear.app/sswp6/issue/DEV-32) · GitHub #77
- 브랜치: `nemodleo/dev-32-i2-t14-implement-real-user-login-and-return-users-to-their`
- 기능·인수 조건: FEAT-01 / AC-01-8, AC-01-9, AC-01-12~15 · ADR 0003·0010
- 상태: 리뷰 중

### 범위 (수정 허용 경로)
- `packages/api/src/types.ts`(`KakaoConfig`, 10/18 `User` 온보딩 필드·`MeUpdateInput`·`Consent*`·`ONBOARDING_REQUIRED`·`ADDRESS_LIMIT`), `packages/api/src/endpoints.ts`(`auth.kakaoConfig`, `auth.kakaoLogin`, 10/18 `auth.updateMe`·`consents`·`saveConsents`), `packages/api/src/mock/{auth,db,router,conversations,rooms}.ts`, `packages/api/spec.md`, `packages/api/tasks.md`

### 결정 사항
- 10/17 Mock 모드의 `POST /api/auth/kakao`는 인가 코드와 무관하게 그 앱의 첫 테스트 계정(소비자 김민지)으로 로그인한다. 카카오 리다이렉트 없이 화면 흐름만 확인하기 위함.
- 10/18 위 결정을 바꿈: 소비자 앱 Mock 카카오 로그인은 카카오 계정 `u-kakao`(처음엔 이메일만, 온보딩 남음)를 만들어 들어간다. 온보딩 화면을 Mock에서도 확인하기 위함. 생산자 앱은 그대로 강영수. 테스트 계정(`kakao` 없음)은 온보딩 대상이 아니다.
- 10/18 Mock도 서버와 같은 규칙: `needsOnboarding`(db.ts), 관문 경로 403 `ONBOARDING_REQUIRED`(라우터 표의 `gated`), 동의 저장, 배송지 50개 409·수정 검증·기본 삭제 시 최근 것이 기본, 농가에 보이는 이름은 `publicName`(닉네임 우선). 저장소 `DB_VERSION`은 올리지 않음(새 필드는 모두 선택이라 기존 Mock 데이터와 호환).

### 작업
- [x] 타입·엔드포인트·Mock 추가, `npm run typecheck` 통과
- [x] 10/18 온보딩·동의·배송지 50개 타입·엔드포인트·Mock, `npm run typecheck` 4개 통과, `npm run test:mock` 13/13
- [x] 10/18 AI 리뷰 반영: 클라이언트가 403 `ONBOARDING_REQUIRED`를 받으면 `onOnboardingRequired` 구독자에게 알림(토큰은 유지). Mock 관문 표의 좋아요를 실제 경로대로 `PUT`으로 고침, Mock 주문 ‘기본 배송지로 저장’도 50개면 건너뜀. Mock 계약 테스트 `scripts/test-onboarding.mjs` 추가(범위에 `scripts/test-onboarding.mjs`, 루트 `package.json`의 `test:mock` 한 줄 추가). `npm run test:mock` 14/14

