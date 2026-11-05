## DEV-71 [I2] PostHog 연결: 두 웹앱 세션 녹화·퍼널·히트맵 (test2 사용자 테스트)

- 이슈: [DEV-71](https://linear.app/sswp6/issue/DEV-71)
- 브랜치: `nemodleo/dev-71-i2-posthog-연결-두-웹앱-세션-녹화퍼널히트맵-test2`
- 기능·규칙: ADR 0005, N-05, 트래킹 플랜(`docs/spec/tech-design/README.md`), stack.md TQ-01
- 상태: 완료(PR #146 머지 09c2902, 2026-10-21)

### 목표
ADR 0005대로 두 웹앱에 PostHog를 붙여 test2 사용자 테스트에서 세션 녹화·구매 퍼널·히트맵을 본다. 개인정보는 녹화·이벤트 어디에도 남기지 않는다(N-05).

### 범위 (수정 허용 경로)
- `packages/analytics/**`(새 패키지 `@farmclub/analytics`), `packages/tasks.md`
- `packages/ui/src/ChatThread.tsx`, `packages/ui/src/NewsRoom.tsx`: 메시지 영역에 `data-ph-private` 표시만
- `apps/consumer/package.json`, `apps/producer/package.json`, 루트 `package.json`(test:mock에 테스트 추가), `package-lock.json`
- `apps/*/src/app/_layout.tsx`, `apps/*/src/lib/session.tsx`(초기화·identify·reset·pageview)
- 소비자 화면 이벤트: `apps/consumer/src/app/(tabs)/products/[productId].tsx`, `apps/consumer/src/app/checkout/[productId]/index.tsx`, `apps/consumer/src/app/checkout/[productId]/pay.tsx`
- 생산자 입금 계좌 줄 가리기: `apps/producer/src/app/(tabs)/farm/index.tsx`
- `scripts/test-analytics.mjs`(새 테스트)
- `.github/workflows/deploy-vercel.yml`(변수 주입), `README.md` Deployment 표
- `docs/spec/tech-design/README.md`(트래킹 플랜), `docs/spec/tech-design/stack.md`(TQ-01, 지표), `docs/spec/tech-design/adr/0005-analytics-posthog.md`, `docs/wiki/Design-Documentation.md`

### 비범위 (건드리지 않음)
- 서버 이벤트(`server/app/analytics`, `order_paid`·`order_canceled`·`farm_followed` 등): [DEV-100](https://linear.app/sswp6/issue/DEV-100)(test2 뒤). 서버 의존성 추가 없음
- PostHog 계정·프로젝트·대시보드 설정(사람이 함), Figma, Meta Pixel(쓰지 않음)
- Android·iOS(EAS) 빌드용 posthog-react-native

### 결정 사항
- 10/18 리전 US Cloud(`https://us.i.posthog.com`)로 TQ-01을 닫는다(사용자 결정)
- 10/18 범위는 두 웹앱만. 서버 이벤트는 다음 이슈(사용자 결정)
- 10/18 posthog-js는 3주 넘은 `1.434.14`로 고정한다(새 의존성, 사용자 요청)
- 10/18 공용 패키지 `@farmclub/analytics`를 새로 둔다. `@farmclub/api`(서버 호출)와 `@farmclub/ui`(화면) 어느 쪽 책임도 아니어서
- 10/18 `EXPO_PUBLIC_POSTHOG_KEY`가 비면 posthog-js를 아예 초기화하지 않는다(로컬·Mock·CI·Playwright에서 꺼짐). 웹(`Platform.OS === "web"`)에서만 켠다
- 10/18 개인정보 보호(N-05): 입력칸 전부 마스킹, 개인정보가 보이는 경로(소비자 `/checkout`·`/orders`·`/chats`·`/me`, 생산자 `/chats`·`/ship`·`/products/*/sales`·`/settings`)는 녹화 텍스트 전부 마스킹, 그 밖의 경로는 `data-ph-private` 영역만 마스킹. 자동 수집(autocapture)은 요소 글자·속성을 보내지 않는다(`mask_all_text`·`mask_all_element_attributes`). 네트워크·콘솔 녹화 끔. URL 쿼리는 보내기 전에 지운다
- 10/18 `ph-no-capture` 클래스 대신 `data-ph-private` 속성을 쓴다. react-native-web은 `className`을 받지 않고 `dataSet`만 `data-*`로 내보낸다. 모달(Sheet)은 화면 밖 portal에 그려지므로 경로 기준 마스킹을 함께 쓴다
- 10/18 (처음) 앱에는 '입금 안내/입금했어요' 화면이 없고 카드 결제(Mock)라 마지막 단계를 `payment_submitted`로 뒀다 → 같은 날 DEV-68(무통장 입금, #141) 머지 뒤 아래로 바꿈
- 10/18 main 병합(DEV-68). 퍼널은 상품 → 주문서 → 입금 안내 → 입금했어요: `product_viewed` → `checkout_started` → `checkout_submitted`(주문 생성·입금 대기, 입금 안내로) → `deposit_reported`(‘입금을 마쳤어요’). `payment_submitted`는 없앰. 입금 확인(`order_paid`)은 서버 이슈
- 10/18 DEV-68로 생긴 생산자 입금 계좌 화면 `/farm/account`를 가릴 경로에 추가하고, 농가 프로필(`/farm`)의 입금 계좌 줄은 `privateArea`로 가린다. 소비자 입금 안내(`/checkout/*/pay`, 판매자 대표·연락처·계좌)는 이미 `/checkout`으로 가려짐
- 10/18 identify는 내부 `userId`만, person 속성은 `app`·`role`·`isTestAccount`만. 이름은 보내지 않는다

### 작업
- [x] `@farmclub/analytics`: 설정(no-op), 마스킹 규칙, 속성 정리, identify·reset·pageview 훅
- [x] 두 앱 `session` 연결(`_layout`은 고칠 필요 없었음)
- [x] 메시지 영역 `data-ph-private`(ChatThread·NewsRoom)
- [x] 소비자 퍼널 이벤트 4개
- [x] `scripts/test-analytics.mjs`(no-op, 마스킹 경로, 속성 정리)와 test:mock 연결
- [x] deploy-vercel.yml 변수, README Deployment 표
- [x] docs/spec 트래킹 플랜·TQ-01·ADR 0005, docs/wiki 요약

### 완료 조건
- [x] 키 없으면 no-op, 로그인 identify·로그아웃 reset·화면 전환 pageview
- [x] 녹화 마스킹·이벤트 속성에 개인정보 없음
- [x] 핵심 화면 이벤트와 구매 퍼널
- [x] 배포 변수 주입, spec·wiki 갱신
- [x] 테스트 통과(`npm run typecheck`, `npm run test:mock`, 관련 Playwright)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 Linear DEV-71 생성(In Progress), main(f31c7b0)에서 브랜치. 사용자 지시로 커밋은 구현이 끝난 뒤 의미 단위로 나눠 한다(spec 커밋을 맨 앞에 둠)
- 10/18 `packages/analytics/spec.md` 추가(구현 결정 표). `Messenger.tsx`는 고칠 필요가 없어 범위에서 뺌(대화 목록은 `/chats` 경로 마스킹으로 가려짐)
- 10/18 `npm run typecheck` 5개 workspace 통과, `npm run test:mock` 17/17 통과(새 test-analytics 4개 포함), `actionlint` 통과
- 10/18 실서버 통합: 포트 8082를 다른 프로세스가 써서 러너를 스크래치에 복사해 포트(8100·8181·8182)와 DB(`farmclub_dev71`)만 바꿔 실행. API smoke 7/7, Playwright Chromium 43/43 통과
- 10/18 키를 넣은 Mock export를 로컬 수집기(127.0.0.1)로 보내 확인: pageview(앱 안 이동 포함)·product_viewed·checkout_started·heatmap 수신, 로그인 뒤 distinct_id=`u-minji`·person 속성 role·isTestAccount만, 로그아웃 뒤 새 익명 ID, URL 쿼리 제거, 이름·연락처·주소 문자열 없음. 헤드리스 Chrome은 PostHog가 봇으로 보고 이벤트를 버려 검증 때만 webdriver·userAgentData를 숨김
- 10/18 미검증: 실제 PostHog 녹화 화면의 마스킹(녹화 스크립트는 PostHog 서버에서 받음). 키 등록 뒤 첫 배포에서 `/checkout`·`/chats` 녹화를 열어 확인한다
- 10/18 main(54dc274, DEV-68 무통장 입금) 병합. 충돌 3곳(주문서·입금 안내·wiki 개정 이력) 해결, 퍼널·마스킹 경로를 무통장 흐름에 맞춤(결정 사항 참고)
- 10/18 AI 1차 리뷰: must 2(무통장 퍼널, `/farm/account` 마스킹) 해결, should 히트맵 `$heatmap_data` URL 키의 쿼리 제거 해결. 경로 기준 마스킹의 화면 전환 타이밍은 배포 뒤 녹화로 확인
- 10/18 병합 뒤 `npm run typecheck` 통과(오래된 `.expo/types` 생성 파일을 지운 뒤. CI에는 없음), `npm run test:mock` 18/18 통과

- 10/18 병합 뒤 실서버 통합(포트 8100·8181·8182, DB farmclub_dev71, 끝나고 삭제): API smoke 7/7, Playwright Chromium 43/43 통과
- 10/21 main(b7d3417) 병합. 충돌 2곳(소비자 `session.tsx`: 온보딩 resume 숨김과 `useAnalytics` 둘 다 유지, `package.json` test:mock: test-onboarding·test-analytics 둘 다). 카카오 로그인(DEV-32·74)으로 생긴 소비자 `/onboarding`·`/auth`, 생산자 `/auth`를 가릴 경로에 추가. 카카오 복귀 URL의 `?code=`는 이벤트에서 쿼리 제거로 빠진다
- 10/21 서버 이벤트를 Linear DEV-100(Backlog, DEV-71과 관련 연결)으로 분리
- 10/21 병합 뒤 `npm run typecheck` 통과, `npm run test:mock` 19/19 통과. 실서버 통합 1회차: API 7/7, Playwright 51/52(AC-SRC-11 상품 작업공간 API 직접 호출이 `ECONNRESET`, API 로그에 오류 없음, 분석 코드와 무관) → 2회차 API 7/7, Playwright 52/52 통과

