## DEV-32 카카오 로그인과 원래 행동으로 복귀

- 이슈: [DEV-32](https://linear.app/sswp6/issue/DEV-32) · GitHub #77
- 브랜치: `nemodleo/dev-32-i2-t14-implement-real-user-login-and-return-users-to-their`
- 기능·인수 조건: FEAT-01 / AC-01-1, AC-01-8, AC-01-9, AC-01-11, AC-01-12~15 · ADR 0003·0009·0010
- 상태: 리뷰 중

### 목표
테스트 참가자가 자기 카카오 계정으로 소비자 앱에 로그인하고, 로그인 전에 누른 화면·행동(예약·팔로우·채팅·좋아요)으로 그대로 돌아간다. 테스트 계정 로그인은 Mock 플래그가 켜진 동안 함께 둔다.

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/login.tsx`, `apps/consumer/src/app/auth/kakao.tsx`(새 화면), `apps/consumer/src/lib/kakao.ts`(새 파일), `apps/consumer/src/lib/session.tsx`(`restoreResume`, 10/18 온보딩 관문·`resume` 숨김)
- 10/18 온보딩 승인으로 추가: `apps/consumer/src/app/onboarding/{index,address}.tsx`(새 화면 SCR-06), `apps/consumer/src/lib/onboarding.ts`(새 파일), `apps/consumer/src/lib/AddressForm.tsx`(온보딩·연락처 기본값·50개 옵션), `apps/consumer/src/app/(tabs)/me/{index,profile}.tsx`, `apps/consumer/src/app/(tabs)/me/addresses/{index,edit}.tsx`, `apps/consumer/src/app/checkout/[productId]/{index,address}.tsx`
- `apps/consumer/spec.md`, `apps/consumer/tasks.md`
- 서버·API 패키지·문서는 `server/tasks.md`, `packages/api/tasks.md`의 DEV-32 절 참조

### 비범위 (건드리지 않음)
- 생산자 앱 로그인 화면(SCR-19). 서버 계약은 `app: producer`로 동작하지만 화면은 별도 이슈.
- 리프레시 토큰, 로그아웃 시 카카오 연결 끊기, 이름·전화번호 동의 항목(비즈 앱 심사 필요, 2단계).
- 우편번호 찾기(결정 27, I1처럼 직접 입력), 약관·처리방침 전문 페이지(‘보기’는 요지 시트), 탈퇴.
- Figma 시안 반영(머지 뒤 별도). 기존 `@farmclub/ui` 부품만 쓴다.

### 결정 사항
- 10/17 복귀 경로는 `/auth/kakao`(stack.md 5장). 카카오 리다이렉트로 페이지가 새로 뜨므로 돌아갈 화면(`next`)과 이어서 할 행동(`resume`)을 sessionStorage에 두고 `state`(일회용 값)로 대조한 뒤 한 번만 꺼내 쓴다. 세션에 `restoreResume`를 추가해 복귀 화면이 행동을 되살린다.
- 10/17 카카오에서는 카카오계정 이메일만 받는다(scope `account_email`, 콘솔에서 필수 동의로 설정, 사용자 결정 10/17). 처음엔 닉네임이었으나 동의 항목이 꺼져 있어 바꿈. 연락처는 주문서 배송지 입력으로 받는다. 내 정보 라벨은 `isTestAccount`에 따라 ‘테스트 계정’/‘카카오 계정’.
- 10/17 Mock 모드에서는 리다이렉트 없이 `POST /api/auth/kakao`를 바로 불러 김민지로 로그인한다(화면 흐름 확인용).
- 10/17 카카오 설정(`enabled`, `clientId`)은 서버 `GET /api/auth/kakao/config`에서 받는다. 앱 env에 키를 두지 않는다.
- 10/17 버튼 문구는 카카오 공식 변형 중 ‘카카오로 시작하기’. ‘…로그인’으로 끝나면 기존 e2e 도우미(`/로그인$/`)와 테스트 계정 버튼이 겹쳐 strict mode 위반이 나서 e2e를 건드리지 않고 문구로 피했다.

### 작업
- [x] `lib/kakao.ts`: 인가 주소 만들기·복귀 정보 저장/꺼내기
- [x] `login.tsx`: ‘카카오로 시작하기’ 버튼(설정 꺼짐이면 숨김), 테스트 계정 목록 유지
- [x] `auth/kakao.tsx`: 코드 교환·세션 갱신·행동 복원·복귀, 취소/만료/실패 안내
- [x] `session.tsx`: `restoreResume`
- [x] `npm run typecheck`, Mock 모드 화면 확인(버튼 → 로그인 → 복귀), 서버 pytest

### 완료 조건
- [ ] 로그인이 테스트 기기에서 되고 권한·복귀 경로가 통과하며 스펙과 코드가 맞는다(이슈 완료 조건). 실기기 확인은 카카오 키 등록 뒤.
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/17 main 34c9009에서 시작. 카카오 개발자 앱·REST API 키는 사용자가 발급해 `server/.env`에 넣는다(KAKAO_REST_API_KEY, 선택 KAKAO_CLIENT_SECRET). 콘솔 리다이렉트 URI: `<소비자 앱 주소>/auth/kakao`.
- 10/17 구현·문서 동기화 완료. `npm run typecheck` 4개 통과, Mock 화면 4장(관문 → 카카오 → 주문서 복귀, 만료·취소 안내) 콘솔 오류 0, 서버 pytest 217/217, `node scripts/run-integration.mjs` 실서버 7/7 + Playwright 19/19. 실제 카카오 계정 로그인은 콘솔에 `<소비자 앱 주소>/auth/kakao` 등록 뒤 사용자가 확인(미완). 완료 조건의 "테스트 기기에서 로그인"은 그때 체크.
- 10/17 실제 카카오 계정으로 로컬(실서버 + 소비자 앱) 로그인 확인: `POST /api/auth/kakao` 200, 소비자 계정 생성(`isTestAccount=false`), 홈 복귀, 복귀 정보 소거. 이름이 ‘카카오 사용자’로 저장됨 → 콘솔 동의 항목에 닉네임이 꺼져 있어 `kakao_account.profile`이 안 내려옴. 인가 요청에 `scope=profile_nickname`을 넣었고, 콘솔에서 ‘닉네임’ 동의 항목(필수)을 켜야 이름이 들어온다. 기존 버그 발견: 내 정보가 부르는 `GET /api/farms/following`이 서버에 없어 404(별도 이슈).
- 10/17 사용자 피드백: 로그인 화면에서 카카오와 테스트 계정 로그인이 같이 보여 충돌 → 카카오가 켜져 있으면 카카오만 기본으로 보이고 테스트 계정은 ‘테스트 계정으로 로그인’을 눌러야 펼쳐진다(하단 ‘○○로 로그인’ 버튼도 그때만). 카카오가 꺼진 CI·Mock 플래그 환경은 기존대로 바로 펼침이라 e2e 영향 없음. 로컬 실서버는 카카오 키가 있어 e2e `loginConsumer`가 접힌 목록을 못 찾으므로 통합 테스트는 `.env`를 치우고 돌린다.
- 10/17 사용자 결정: 카카오가 켜져 있으면 테스트 계정 로그인을 아예 없앤다(접기 아님). 꺼진 환경(CI e2e, Mock)에서는 테스트 계정 목록 유지. 로컬에서 테스트 계정이 필요하면 KAKAO_REST_API_KEY를 비우거나 Mock 모드.
- 10/18 사용자 승인(제안 아티팩트 v4 https://claude.ai/artifact/WfH3HbEMwhAmvLq5f57xEp): 카카오에서는 이메일만, 식별은 회원번호. 첫 가입 온보딩 2장(① 닉네임·이름·휴대폰·동의 4개 ② 기본 배송지, 건너뛰기 가능). 빠진 정보는 직접 입력. 배송지 관리 50개·수정·삭제, 주문서는 저장 목록에서 고른다.
- 10/18 결정: 온보딩 중 `resume`을 숨긴다. 숨기지 않으면 스택 아래의 상품 화면이 1장 저장 직후 예약을 이어 실행해 2장을 건너뛰거나 온보딩이 두 겹 쌓였다(Mock 실측). 끝나면 관문에서 왔을 때 `router.back()`으로 원래 화면에 돌아가 그 화면이 행동을 잇는다(로그인 화면과 같은 방식).
- 10/18 결정: 온보딩 닫기는 계정을 남기고 행동은 실행하지 않는다. 다음 관문(`requireLogin`)·주문서·내 정보 ‘가입 마치기’에서 다시 연다. 탭 열기(소식·채팅·내 정보)는 막지 않는다.
- 10/18 결정: ‘보기’는 정책 5장 요지를 담은 시트(전문 페이지는 정식 오픈 전). 동의 문구 버전 `2026-10-18`(`lib/onboarding.ts`).
- 10/18 결정: 로그인 하단 문구는 카카오가 켜져 있으면 ‘동의는 처음 가입할 때 받아요’, 꺼져 있으면(테스트 계정) 기존 안내.
- 작업(10/18): [x] 온보딩 1·2장 [x] 카카오 복귀·Mock 로그인 분기 [x] 세션 관문·`resume` 숨김 [x] 주문서 온보딩 분기·연락처 기본값·50개 안내 [x] 배송지 관리 50개 [x] 내 정보 닉네임·가입 마치기·`/me/profile`
- 검증(10/18): `npm run typecheck` 4개 통과, `npm run test:mock` 13/13. Mock 화면 흐름(관문 → 카카오 → 온보딩 1(다음 비활성 → 입력·모두 동의 → 다음) → 2(주소 저장) → 주문서 복귀(기본 배송지 채워짐) → 내 정보·고치기·배송지 → 로그아웃 뒤 다시 카카오 → 온보딩 없이 복귀) 콘솔 오류 0. 실서버 통합은 아래 기록.
- 10/18 AI 1차 리뷰 반영(must 1): 관문을 거치지 않는 소식 좋아요·답장·채팅 보내기가 403 `ONBOARDING_REQUIRED`를 받으면 세션이 온보딩을 연다(`onOnboardingRequired`). 주문서로 직접 들어와 온보딩을 닫으면 그 상품 화면으로(주문서 ↔ 온보딩 고리 제거). 10/17에 만든 계정의 이름 자리(이메일·‘카카오 사용자’)는 온보딩 이름 칸에 채우지 않음. 로그인 Mock 주석 갱신. Mock 확인: 관문에서 닫기 → 상품 화면, 주문서에서 닫기 → 상품 화면, 온보딩 전 좋아요 → 온보딩, 콘솔 오류 0. 범위에 `scripts/test-onboarding.mjs` 추가.
- 10/18 남긴 리뷰 항목: 온보딩 e2e(Playwright)는 실서버 통합이 카카오 키 없이 돌아 카카오 첫 가입을 만들 수 없어 넣지 않았다. 대신 Mock 계약 테스트(`test-onboarding.mjs`)와 서버 pytest가 규칙을 덮고, 화면 흐름은 Mock Playwright 스크립트로 확인했다. 소식방에서 본인 답장 이름이 실명으로 보이는 것은 기존 동작이라 그대로 둠.

