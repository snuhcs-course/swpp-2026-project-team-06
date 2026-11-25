# apps/consumer spec

## DEV-481 탭 레이아웃 key
`(tabs)/_layout`의 Tabs `key`는 세션의 `tabsKey`(`lib/tabsKey.ts`의 `TabsKey`)다. 인증 이벤트(onAuthChange) 때만 바뀐다: 토큰이 생기거나 바뀌면 늘 바꾸고, 토큰이 지워지면 그 토큰으로 사용자를 확인(auth.me 성공)한 적이 있을 때만 바꾼다. 같은 사용자의 auth.me 답(첫 확인·실패 뒤 다시 확인)으로는 안 바뀌고, 지금 탭에서 확인한 사용자와 다른 사용자가 확인되면(웹에서 다른 브라우저 탭이 계정을 바꿔 토큰이 알림 없이 바뀜) 바뀐다. 전 key `user?.userId ?? "guest"`(DEV-3)는 저장된 토큰으로 연 첫 실행에서 답이 오는 순간 탭을 다시 만들어 그 사이 누른 동작을 지웠다. 저장된 토큰이 있을 때 탭을 auth.me까지 그리지 않는 방법(생산자 앱 DEV-56)은 소비자 앱에 없던 로딩 화면이 생겨 쓰지 않았다. `scripts/test-tabs-key.mjs`, e2e `scripts/e2e/session-restore-taps.spec.ts`.

## DEV-473 화면 오류 경계
`lib/ScreenBoundary.tsx`. 화면 한 장 경계는 레이아웃 prop `unstable_screenErrorBoundary`(루트 Stack = 탭 밖 화면 `StackScreenBoundary`, `(tabs)/_layout`의 Tabs와 탭 폴더 Stack = `TabScreenBoundary`). Tabs prop이 레이아웃 없는 탭 화면과 앞으로 `(tabs)` 바로 아래에 더할 화면을 받으므로 화면 파일에 경계를 따로 내보내지 않는다(배치는 `scripts/test-screen-error.mjs`가 검사). 받는 것은 그리기·effect 중 예외뿐이고 이벤트 핸들러·비동기 콜백 예외는 못 받는다. expo-router가 죽은 화면만 장면 안에서 감싸 스택·탭 바가 남고 ‘다시 시도’는 그 화면만 다시 그린다. 탭 폴더 `_layout`의 `export ErrorBoundary`는 Stack째 갈려 하위 상태가 지워지므로 쓰지 않는다. 루트 `_layout`의 `export ErrorBoundary`(`RootBoundary`)는 세션·탭 레이아웃이 죽을 때의 마지막 그물이라 세션·내비게이터 없이 움직인다(웹은 `location.replace`). ‘홈으로’는 죽은 화면이 든 스택을 첫 화면으로 되돌리고, 웹은 그 주소 변화를 본 다음(최대 1초) `router.replace`(뒤로 가기로 돌아오지 않음). 죽은 화면이 운영팀 방이면 ‘운영팀에 알리기’를 숨긴다. 홈 `/`, 운영팀 `/chats/support`(비로그인은 관문 시트). `scripts/e2e/screen-error-boundary.spec.ts`.

## DEV-440 내 정보 계정 출처
- FEAT-01 AC-01-38: SCR-17의 계정 출처는 `lib/meSummary.ts`의 accountLabel에서 username 우선, 없을 때 isTestAccount로 결정한다. ID 발급 뒤 시드 테스트 분류를 유지하는 AC-01-37과 맞춘다. 역할 접미사·프로필·비밀번호 메뉴 조건은 바꾸지 않는다.

## DEV-379 이미 예약한 사람의 '알아 둘 세 줄' 첫 줄
상품 상세는 로그인했을 때만 `orders.list({ productId })`를 `allPages`로 끝까지 읽어 `lib/myReservation.ts`의 `myReservationHref`로 이동 대상을 정한다(이미 예약 상태가 없으면 null → 'n번째'). 앱이 다시 productId로 거르므로 거르기를 모르는 서버여도 맞다. `useFocusedAsync`라 화면에 돌아오면 다시 읽고, 답에 `사용자:상품` 키를 붙여 옛 답으로 그리지 않는다. 첫 답 전은 `myReservation={ state: "checking" }`(보조 줄 높이만), 실패는 넘기지 않음('n번째'). 하나면 주문 상세, 둘 이상이면 내 주문(모두 구매 확정이면 확정 탭). FEAT-07 AC-07-10, `scripts/test-my-reservation.mjs`.

## DEV-367 평가 진입 폐기
- FEAT-01 AC-01-34: release 실서버는 시드 계정을 요청·표시하지 않는다. 개발 빌드 또는 명시적 앱 Mock만 목록을 쓴다. 개발 실서버는 카카오 비활성·오류 시, 앱 Mock은 카카오와 함께 보인다.
- 평가 query/storage/buildflag 로직을 제거한다. 저장된 표시를 읽거나 새로 저장하지 않는다. 카카오·아이디 인증과 기존 세션/복귀는 유지한다.

## DEV-348 가격 계단·알아 둘 세 줄·팬 호칭
홈 카드 가격·취소선은 main 그대로(`productPrices`의 `referencePrice`), 상품 상세도 `referencePrice`를 넘겨 옵션 줄에 ‘지금 예약가 ~~비교 가격~~’(11/17 PM 결정으로 취소선 유지). 카드 메타는 ‘이 가격 D-n’ 한 줄 + ‘n명 예약’ 한 줄, 개념 상자는 추천 상품이 있을 때만. 상품 상세 판매자 줄의 ‘팬 n명’은 상품 응답에 없어 `farms.get(farmId)`를 한 번 더 읽고, 실패하면 수만 뺀다. 소식방 머리도 ‘팬 N명’(버튼·공개 범위 이름 ‘팔로워 전용’은 그대로). FEAT-06 AC-06-9, FEAT-07 AC-07-9·10.

## DEV-314 우편번호 찾기
배송지 입력(`lib/AddressForm.tsx`)은 `usePostcodeSearch`(웹 `lib/postcodeSearch.tsx`, 앱 `lib/postcodeSearch.native.tsx`)로 ‘우편번호 찾기’를 연다. 웹은 카카오 우편번호 스크립트(키 없음)를 버튼을 처음 누를 때 한 번 불러와 화면 위 레이어에 embed한다(누르기 전에는 카카오에 요청하지 않음). 앱은 전체 화면 모달 안 `react-native-webview`(13.16.1, `npx expo install`, PM 승인 11/12)에 같은 스크립트를 넣은 HTML을 열고 postMessage로 결과를 받는다. 웹 번들은 웹뷰를 가져오지 않는다(플랫폼 파일 분리). 두 파일은 확장자가 같아야 한다: Metro는 확장자마다 `.android`→`.native`→무접미사 순으로 찾고 `ts`를 `tsx`보다 먼저 보므로, 웹이 `.ts`이고 앱이 `.native.tsx`이면 앱 번들에 웹 파일이 들어간다(DEV-474, `scripts/test-native-pairs.mjs`가 Metro 순서를 흉내 내 검사). 웹은 `.native`를 보지 않으므로(`preferNativePlatform: false`) 웹 번들은 `.tsx` 웹 파일을 그대로 잡는다. 결과 → 칸 값, 앱 메시지 읽기, 도서산간 판정은 순수 함수 `lib/postcode.ts`(서버 규칙과 같음, `scripts/test-postcode.mjs`). 못 불러오면 안내 후 직접 입력.

## DEV-252 권한 확인 뒤 읽기 위치 복구
SessionProvider는 auth 이벤트마다 메모리 scope를 동기 폐기한다. 같은 토큰 문자열로 다시 로그인해도 새 generation이고, 같은 세션 auth.me 성공은 기존 scope를 유지한다. event/request serial은 이전 세션·늦은 사용자 응답을 버린다. 일시적인 auth.me 실패는 UI만 숨기며 안전한 geometry는 재시도까지 유지한다.

농가 route는 시작 → 새 권한 있는 head의 consumer/farm/thread 검증 → store.open → initialPage/viewState 순서를 지킨다. callback은 scope/lease/route epoch를 확인하고, blur capture는 focus가 없어도 현재 lease에 저장한다. terminal head 실패는 해당 farm만 지우고, 열린 방의 실패는 정확히 같은 lease만 지운다. 메시지·사진 URL·draft는 저장소에 넣지 않는다. 채팅 목록도 current scope가 유효할 때만 preview를 보인다. 읽기 위치 identity는 thread이고 composer의 선택 주문/product 문맥은 별도 sendScope다.

## DEV-248 주문 상세 → 대화
orderChatTarget은 두 질문 버튼을 공유하고 paidAt로 결제 예외와 일반 대화를 구분한다. fromOrder는 뒤로 대상, orderId는 검증된 전송 문맥이다. route는 시작 → 권한 있는 첫 페이지 → composer 순서와 15초 network deadline을 책임진다. 세션/농가/문맥 변경은 이전 응답을 폐기한다. 여러 주문은 명시적으로 고르며 초기 실패와 전송 실패는 별도 재시도다.

## DEV-250 읽기 위치 저장소
chatViewState singleton은 메모리 geometry/ID만 가진다. consumer/user/session generation/thread ID로 격리하고 매 방문 lease를 새로 만든다. clear/eviction/재방문 뒤 이전 callback은 저장할 수 없다. 20개/idle 30분, 새 로그인·hard reload는 깨끗이 시작한다. 현재는 기반만 제공하며 인증·화면 연결은 DEV-252에서 적용한다.

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-06, FEAT-07, FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-12, FEAT-13, FEAT-15, FEAT-19(도착) · 지키는 규칙: R-03, R-05, R-06, R-17, R-20, R-21, R-23, M-02, M-04, M-08, M-14, N-01, N-02, N-05, N-06 (M-17은 I2)
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장, 화면별 명세·API: docs/spec/screens.md 5장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
소비자 앱. Expo + Expo Router 웹 출력으로 만들어 Vercel에 정적 배포하고(ADR 0001), 같은 코드로 iOS·Android 네이티브 앱을 EAS로 낸다(ADR 0013, DEV-33). 공개 화면 SCR-01~05, 로그인 후 화면 SCR-10~18을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 발견(SCR-01) · 내 주문(SCR-13) · 채팅(SCR-15·18) · 내 정보(SCR-17). `src/app/(tabs)/_layout.tsx`. 주문 내역·상세·완료는 내 주문 탭 안.
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 주문서, 결제. 상품 상세는 발견 탭 Stack 안에 둔다.
- 현재 경로는 PR #39의 `docs/spec/navigation-1.3.md`를 따른다.

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-01 | 홈·발견 | `/` | `src/app/(tabs)/index.tsx` | FEAT-06, 15 |
| SCR-02 | 농가 목록 | `/farms` | `src/app/(tabs)/farms/index.tsx` | FEAT-06 |
| SCR-03 | 농가 페이지 | `/farms/:farmId` | `src/app/(tabs)/farms/[farmId].tsx` | FEAT-02, 06, 12, 15, 19 |
| SCR-04 | 상품 상세 | `/products/:productId` | `src/app/(tabs)/products/[productId].tsx` | FEAT-07 |
| SCR-05 | 로그인(카카오 · 소비자 테스트 계정) | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-05 하위 | 카카오 로그인 복귀 | `/auth/kakao` | `src/app/auth/kakao.tsx` | FEAT-01 |
| SCR-10 | 주문서 | `/checkout/:productId` | `src/app/checkout/[productId]/index.tsx` | FEAT-08 |
| SCR-10 하위 | 배송지 입력 | `/checkout/:productId/address` | `src/app/checkout/[productId]/address.tsx` | FEAT-08 |
| SCR-11 | 결제 | `/checkout/:productId/pay` | `src/app/checkout/[productId]/pay.tsx` | FEAT-09 |
| SCR-12 | 주문 완료 | `/orders/:orderId/done` | `src/app/(tabs)/orders/[orderId]/done.tsx` | FEAT-09 |
| SCR-13 | 주문 내역 | `/orders` | `src/app/(tabs)/orders/index.tsx` | FEAT-10 |
| SCR-14 | 주문 상세 | `/orders/:orderId` | `src/app/(tabs)/orders/[orderId]/index.tsx` | FEAT-10, 11 |
| SCR-15 | 채팅 목록 | `/chats` | `src/app/(tabs)/chats/index.tsx` | FEAT-12 |
| SCR-16 | 농가 채팅 | `/chats/:farmId` | `src/app/(tabs)/chats/[farmId].tsx` | FEAT-12, 13 |
| SCR-17 | 내 정보 | `/me` | `src/app/(tabs)/me/index.tsx` | FEAT-01, 06, 08, 10 |
| SCR-17 하위 | 배송지 관리 | `/me/addresses` | `src/app/(tabs)/me/addresses/index.tsx` | FEAT-08 |
| SCR-18 | 소식방 | `/news/:farmId` | `src/app/(tabs)/news/[farmId].tsx` | FEAT-12, 15 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다. 화면에서 `fetch`를 직접 부르지 않는다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec). 쓰는 API는 screens.md 7.2.
- 농가 링크는 서버 `/s/farms/<id>`(ADR 0006)를 거쳐 `/farms/:farmId`로 도착한다. 이 경로는 바꾸지 않는다.
- I1 로그인은 소비자 테스트 계정 선택(`GET /api/auth/test-accounts?app=consumer`, `POST /api/auth/test-login`의 `app: consumer`, ADR 0009·0010). 생산자 계정은 이 앱에 로그인하지 않는다. 403 `WRONG_APP`이면 토큰을 지우고 로그인으로. 카카오 리다이렉트 `/auth/kakao`는 I2.
- 내 정보의 ‘농가로 시작하기’는 ‘생산자 앱은 따로 가입해요’ 시트 뒤 생산자 앱 주소(`EXPO_PUBLIC_PRODUCER_URL`)의 로그인으로 보낸다(AC-01-7).
- 로그인 관문(팔로우·예약·채팅하기·좋아요, 내 주문·채팅·내 정보 탭)은 안내 시트를 먼저 띄우고, 예약은 옵션·수량 시트의 ‘주문서로’에서 띄워 로그인 뒤 고른 값을 유지한다(screens.md 결정 25). 권한 표시는 화면에서 하되, 실제 권한 검사는 서버가 한다(N-06).
- 레이블은 ia.md 4장: 소비자 화면에 ‘메시지’를 쓰지 않는다(‘소식’, ‘채팅’). 주문 상태는 소비자 문구(수확·포장 중, 배송 중)로 보인다.
- 화면 모양·크기·문구는 Figma v6와 `docs/spec/conversation-ui-1.6.md`가 기준이다. `docs/design/screens`는 이전 평가 기록이다.

## 구현 결정 이력 (현재 화면은 DEV-51 절 우선)
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹 안에 탭별 Stack으로 둔다. 상품 상세·주문서·결제·로그인은 탭 밖 루트 Stack | ia.md 2장 경로를 그대로 쓰면서 하단 탭 4개(ia.md 4장)를 유지 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로(`:farmId` 등) | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다 | 뼈대 이슈, 기능은 DEV-3 이후 | — |
| 2026-10-07 | 탭을 발견·소식·채팅·내 정보로, 첫 화면을 홈·발견(SCR-01)으로, 주문 내역을 내 정보 안(`/me/orders`)으로, 메시지함을 채팅(`/chats`)으로 | P22 결정(SWPP-26) | AC-06-4, AC-12-5 |
| 2026-10-07 | 앱별 로그인(소비자 계정만), 하위 화면 `/checkout/:productId/address`·`/me/addresses`, 홈 농가 둘러보기, 상품 상세 최신 소식 없음, 소비자 상태 문구·택배 조회 | SWPP-81(screens.md 1.1, ADR 0010) | AC-01-6, AC-01-7 |


## DEV-3 로컬 이식 결정 (2026-10-07)

ZIP의 SCR-01~05·10~18 구현을 이식했다. 이전 뼈대의 inbox·최상위 orders 경로를 제거하고 발견·소식·채팅·내 정보 및 하위 경로를 사용한다. 루트 npm run dev로 Mock 로컬 실행한다.

기존 구현 결정 표의 DEV-12 뼈대 설명은 과거 기록이며 현재 구현은 이 절을 따른다.


DEV-3: /news는 방 목록, /news/:farmId는 공용 NewsRoom. 기존 /chats는 1:1 채팅으로 표기한다. 사용자 권한은 API가 검사하며 소비자 화면은 서버 응답을 그대로 렌더링한다.

## DEV-3 스펙 1.2 구현 기준

PR #38의 contracts-1.2.md와 디자인 README를 따른다. 판매 설정/날짜 기간의 버전·멱등 키와 권한을 공유 Mock까지 구현한다. 공용 대화 UI에 API 함수를 주입하고 활성 화면만 polling한다. 구형 로컬 중간 구조의 호환 API는 남기지 않는다.


## DEV-3 화면 구조 1.3 (변경 이력)

이전 탭/로컬 이식 기록은 변경 이력이다. PR #39의 navigation-1.3.md를 따른다. 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 주문은 `/orders`, 채팅 목록은 소식방/1:1 선택을 유지하며 활성 화면만 갱신한다. 앱 공통 메신저 행/헤더는 API를 직접 호출하지 않는다. 전체 cursor 수집은 취소·실패·반복 cursor를 처리한다. 새 API/DB 계약은 없다.


## DEV-3 공급 물량 승인 1.4 (현재 구현 기준)

제품·API 기준은 main에 먼저 머지한 PR #40의 `docs/spec/capacity-1.4.md`이며 위 1.2/1.3 기록에서 충돌하는 결정은 대체한다. 상품별 kg 입력을 정수 g로 전달하고 승인량과 판매 한도를 구분한다. 최초 승인만 상품을 공개하고 증액 심사 중에는 기존 판매를 유지한다. 가격은 신규 주문부터 즉시 반영하며 기존 결제 중량·가격 스냅샷은 보존한다(AC-04-8/9, AC-05-6, AC-09-6). 요청 버전과 멱등 키는 동일 본문 재시도에서 유지한다.

Mock 스키마 7은 단일 판매값·capacityRequests·주문 unitWeightGrams/releasedQuantity를 사용한다. 예전 승인 복제값·publish-request·박스 총 한도·런타임 마이그레이션은 제거한다. 로컬 공유 서버와 독립 브라우저 저장소를 지원하며 실제 서버는 DEV-4 범위다. 로그인 변경 시 탭 상태를 새로 만들고 비동기 이전 응답을 폐기한다.

소비자 주문은 구매 확정 기준의 확정/미확정/취소·환불 탭, 생산자 상품 그룹은 판매 중/심사 중/작성 중/판매 중지/판매 종료다. 배송 기간 변경은 미출하 결제 주문의 동의·환불 선택을 보존한다(R-21). 일반 상품 변경·가격 변경에 재승인을 요구하지 않는다.


## DEV-3 주문 탭 구현
AC-10-6/7: orderGroups의 상태별 분류·정렬을 사용하고, 기존 전체 cursor 조회와 useLiveList를 조합해 계정·focus별 갱신을 한다. 필터는 URL에 보존하고 제목·탭은 목록 스크롤 밖에 둔다. API/DB 변경 없음.

## DEV-3 상세·공개 소식방 구현 (1.5)
명세 PR #44의 storefront-1.5.md를 따른다. 상세는 text/image 블록과 공유 DetailStory 렌더러를 사용하며 생성은 저장 전 편집안이다. 기존 intro/description은 실제 기존 데이터의 기본 소개로 유지한다. 소식방 공개 읽기와 답장 권한을 분리하고 권한 변경 후 이전 비동기 메시지를 폐기한다. 실제 AI 호출은 구현하지 않으며 Mock임을 명시한다.

## DEV-51 현재 프론트 구현 기준 (1.6)

제품 동작은 `docs/spec/conversation-ui-1.6.md` 및 관련 FEAT를 따른다. 이전 DEV-3/1.3/1.5 화면 배치는 변경 이력이며 API 계약만 유지한다. Figma 현재 시안 v6가 시각 기준이다.
FarmRoom은 `/farms/:id`와 `/news/:id`의 공용 컨테이너이고 `/farms/:id/info`는 짧은 정보다. 판매 품목 상태는 대화와 분리하며 권한 변경 때 메시지를 재마운트해 폐기한다. 상품 상세의 BottomBar는 aboveTabs로 고정한다. 홈의 공개 news와 제품 비교 가격은 기존 API를 조합한다.


## DEV-57 실측 당도 표시
상품 상세의 기존 당도 영역은 공통 BrixReading을 사용한다. 생성 당도계 그림은 실측값이 있는 경우에만 장식으로 표시하고 API 수치/날짜를 그대로 전달한다. API/측정 등록 흐름과 상품 사실을 생성하지 않는다.

## DEV-32 카카오 로그인 (SCR-05 · `/auth/kakao`)

**첫 가입 온보딩(SCR-06, 10/18)**: `POST /api/auth/kakao` 응답의 `user.needsOnboarding`이 true면 `/auth/kakao`(실제)·`/login`(Mock)이 `/onboarding?next=`로 보낸다. `/onboarding`(닉네임·이름·휴대폰·동의 4개, `saveConsents` → `updateMe` → `refresh`) → `/onboarding/address`(`AddressForm` manage 모드, `alwaysDefault`, ‘주문할 때 입력할게요’) → 관문에서 왔으면 `router.back()`, 아니면 `next`. 세션은 온보딩이 남았거나 `/onboarding*` 경로에 있는 동안 `resume`을 숨겨 스택 아래 화면이 먼저 행동을 실행하지 않게 하고(`hasResume`으로 돌아갈 곳만 판단), `requireLogin`은 온보딩이 남은 계정을 온보딩으로 보낸다(탭 열기는 제외). 주문서는 온보딩이 남은 계정을 온보딩으로 보낸다. 배송지 50개: 배송지 관리는 추가 버튼을 끄고, 주문서는 새 주소를 그 주문에만 쓴다. 내 정보는 닉네임을 머리에 두고 `/me/profile`에서 고친다. Mock 카카오 로그인은 소비자 계정 `u-kakao`(처음엔 이메일만)로 들어가 온보딩을 탄다.

카카오 로그인은 전체 페이지 리다이렉트라 React 상태(`resume`)가 사라진다. 그래서 `lib/kakao.ts`가 돌아갈 화면과 이어서 할 행동을 sessionStorage에 두고 인가 요청 `state`(일회용 값)와 함께 저장하며, `/auth/kakao`가 `state`를 대조한 뒤 한 번만 꺼내 `POST /api/auth/kakao` → `refresh()` → `restoreResume()` → `router.replace(next)` 순으로 복귀한다. 카카오 설정(`enabled`, `clientId`, `redirectPath`)은 서버 `GET /api/auth/kakao/config`에서 받고 앱 env에 키를 두지 않는다. Mock 모드는 리다이렉트 없이 바로 로그인한다. 테스트 계정 로그인은 Mock 플래그가 켜진 동안 같은 화면에 남는다. 리프레시 토큰·생산자 앱 카카오 화면은 범위 밖.

DEV-112: `/auth/kakao`는 생산자 앱(DEV-108)과 같은 모양(닫기 + 가운데 `ActivityIndicator` + ‘카카오 로그인 중이에요’). `state`가 없거나 달라도 토큰이 있으면(새로고침) `auth.me()` 뒤 홈(온보딩이 남았으면 `/onboarding?next=/`)으로 간다. 돌아갈 화면은 이미 꺼내 지웠으므로 홈으로 보낸다. 로그인+`refresh()`와 새로고침의 `auth.me()`는 15초 제한, 넘으면 오류와 ‘다시 로그인’·‘홈으로’. 화면을 떠난 뒤 온 결과는 무시한다.

## DEV-33 EAS 네이티브 빌드 (ADR 0013)

- 식별자 `kr.farmclub.consumer`, 스킴 `farmclub-consumer`, 설치 이름(`expo.name`) `farmclub`(DEV-377, 스토어 제목과 같게), `runtimeVersion` 정책 `fingerprint`. `eas.json` 프로필 `development`·`preview`(채널 preview, 스토어 형식)·`production`. `updates.url`·`extra.eas.projectId`는 `eas init`·`eas update:configure`가 썼다(2026-10-23, Expo 조직 `snu-omm`, `owner` 필드). `internal` 프로필은 채널 `preview`를 그대로 쓴다.
- DEV-435: iPad 미지원(`ios.supportsTablet: false`). `android.blockedPermissions`로 `SYSTEM_ALERT_WINDOW`·`VIBRATE`·`USE_BIOMETRIC`·`USE_FINGERPRINT`·`BIND_GET_INSTALL_REFERRER_SERVICE`를 막는다(템플릿·androidx.biometric·expo-application의 installreferrer가 더하고 앱은 안 씀). 저장소 권한(Android 12 이하)은 남긴다: 사진 선택(`pickPhoto.native.ts`·`pick.native.ts`·`sourceFiles.native.ts`)이 `requestMediaLibraryPermissionsAsync`를 먼저 부르고, expo-image-picker가 Android 12 이하에서 이 권한을 요청해 매니페스트에 없으면 거절로 끝난다. iOS 아이콘은 모든 픽셀이 불투명이어야 한다(prebuild가 흰 바탕 위에 다시 그려 RGB로 냄). 검사는 `scripts/test-native-config.mjs`·`scripts/test-brand-meta.mjs` DEV-435.
- 플랫폼 분기는 `*.native.ts` 쌍(Metro가 고른다)이 우선이고, 웹 파일은 런타임 import 없이 두어 Node 테스트가 읽는다. `lib/kakao.ts`(웹: sessionStorage, `window.location.origin`) / `lib/kakao.native.ts`(메모리, `EXPO_PUBLIC_CONSUMER_URL`, state `app-` 접두어), `lib/kakaoAuth.ts`(페이지 이동) / `lib/kakaoAuth.native.ts`(`expo-web-browser` 인증 세션).
- 카카오 복귀(앱): 인가 요청의 복귀 주소는 웹과 같은 `https://farmclub.kr/auth/kakao`. 웹 복귀 화면 `/auth/kakao`는 `state`가 `app-`이면 `appReturnUrl`로 코드를 `farmclub-consumer://auth/kakao?code&state`에 넘기고 ‘앱으로 돌아가는 중’ + ‘앱 열기’ 버튼을 보인다. 앱의 `login.tsx`는 인증 세션 결과를 받아 같은 `/auth/kakao` 화면을 열고, 그 화면이 메모리 복귀 정보로 `state`를 대조한 뒤 `POST /api/auth/kakao`(`redirectUri`는 `kakaoCallbackUri()`)를 부른다. 서버 변경 없음.
- 복사는 `expo-clipboard`, 바깥 주소는 `Linking`, 토큰은 `@farmclub/api`가 SecureStore에 둔다. `public/.well-known/`의 `apple-app-site-association`·`assetlinks.json`은 Team ID·지문 자리표시자(사람이 채움), `vercel.json`이 JSON으로 응답. 앱 링크로 여는 경로는 아직 없다(AASA 전부 제외). Android는 복귀 스킴을 expo-router 딥링크로 받으므로 `kakaoAuth.native.ts`가 결과를 돌려주지 않는다.

## DEV-207 주문 상태 문구
- 주문 상태 문구(목록 굵은 줄·아래 줄, 상세·주문 완료 제목, 입금 대기·환불 본문, 하단 바 요약, 취소 가능 여부)는 `src/lib/orderText.ts` 순수 함수 한곳에서 만든다. 날짜 도우미는 화면이 넘기고, `scripts/test-order-text.mjs`가 React Native 없이 검사한다.
- 라벨 원칙은 R-28 끝 문장(입금 대기·입금 확인 중·환불 대기·환불 완료). 입금을 알린 뒤 취소 버튼은 앱에서만 숨긴다(서버 `cancel` 행동은 그대로, 후속 이슈 후보는 `tasks.md#DEV-207`).

## DEV-214 농가 목록 검색 실패·다시 시도
- SCR-02 FarmList 상태는 `src/lib/farmSearch.ts` 리듀서(`start`·`success`·`fail`) 한곳에서 바꾼다. 요청마다 번호(`useRef`)를 붙이고 마지막 요청이 아닌 응답은 버린다. 페이지를 합칠 때 `farmId`로 거른다.
- 실패 종류로 재시도를 가른다(FEAT-06 E4): 새 검색(reset) 실패는 검색칸 아래 `Notice tone="error"` + ‘다시 시도’(cursor 없이 처음부터, 목록을 바꿈), ‘더 보기’(more) 실패는 목록 아래 한 줄 + 같은 cursor로 이어 받기. 목록이 없을 때 실패는 `LoadError` 그대로.
- 오류 상자 본문은 서버 메시지 대신 고정 문구 두 가지(`ApiError.status === 0`이면 연결 끊김). 머리줄·문구는 `listHeader`·`failureCopy`, `scripts/test-farm-search.mjs`가 React Native 없이 검사한다.

## 주문서 409 분기 (DEV-216·DEV-218, 2026-11-04)

- 안내·버튼은 `src/lib/checkoutConflict.ts` 순수 함수(`conflictView`)가 `details.reason`·`details`·다시 읽은 상품 `availability`로 정한다. 서버 `message`와 상품 `soldOut`은 쓰지 않는다(`soldOut`은 서버에서 판매 중지를 보지 않음, DEV-215).
- ‘바뀐 금액으로 예약하기’는 `STAGE_CHANGED`이면서 `details.current`가 있을 때만. 주문 생성 본문에 화면이 보인 기간·단가·중량(`seenValues`)을 싣는다(FEAT-08 AC-08-8).
- 확정된 가격·물량 등 도메인 409 뒤에는 주문·입금 멱등 키를 둘 다 새로 만들고 받는 곳·메모·동의·수량은 지우지 않는다. 입금 안내를 보내기 전 생성 단계의 `IDEMPOTENCY_MISMATCH`는 새 키로 한 번만 다시 보낸다. 입금 안내 결과가 불확실한 경우는 아래 DEV-320 복구가 우선이며, 원래 입금 요청 재생의 `IDEMPOTENCY_MISMATCH`로는 문맥·키를 지우지 않는다.
- 판매 중지·계좌 없음의 ‘다시 확인하기’는 상품을 다시 읽어 열렸으면 안내를 지우되, 처음 보낸 값과 지금 값이 다르면 가격 안내로 바꾼다(`recheckedConflict`). 품절·물량·수량 안내는 옵션·수량을 바꾸면 사라진다.
- 입금 기한이 지나 SCR-11에서 돌아온 경우(`changed=1`)는 `EXPIRED`로 ‘입금 기한이 지나 예약이 취소됐어요’ + ‘다시 예약하기’.
- 보드 `docs/design/proposals/dev-216-checkout-stage-changed.html`, 테스트 `scripts/test-checkout-conflict.mjs`·`scripts/e2e/checkout-stage-changed.spec.ts`.

## 로그인 필요 화면과 로그아웃 이동 (DEV-222, 2026-11-04)

- 주문서(`checkout/[productId]/index.tsx`)의 로그인·온보딩 이동은 `useFocusEffect`로 화면이 보일 때만 하고, `user`는 의존성이 아니라 ref로 읽는다. 보는 중에 계정이 사라지면(로그아웃·401) 세션(`lib/session.tsx`)만 이동한다. expo-router `<Redirect>`(내 주문·채팅 탭)와 같은 규칙이다.
- 입금 안내 → 완료 화면은 `canDismiss()`이면 `router.dismissAll()` 뒤 `replace`로 주문서·입금 안내를 루트 스택에서 걷어 낸다. 로그아웃(`logout`)은 그대로 `replace("/")`.
- 이어서 할 행동(`resume`)은 관문 시트가 연 로그인(`from` 파라미터)만 쓴다. `from` 없는 로그인 화면은 열릴 때 `clearResume()`.
- 온보딩(`onboarding/index.tsx`)도 `user` 변화에 반응해 로그인으로 보내지만, 온보딩 위에 쌓이는 화면은 약관·처리방침뿐이라 로그아웃이 일어나지 않아 그대로 둔다.
- 테스트 `scripts/e2e/checkout-logout.spec.ts`.

## 팔로우 해제 토스트와 소식방 해제 상태 (DEV-230, 2026-11-05)
- `useToast().act(message, label, onPress)`: 행동 버튼 토스트. 소식방(`lib/FarmRoom.tsx`)과 주문 완료(`orders/[orderId]/done.tsx`) 모두 해제 성공 뒤 ‘팔로우를 끊었어요 · 되돌리기’, 되돌리기는 다시 팔로우.
- `FarmRoom`은 `FollowButton`(체크 + 팔로잉)을 쓰고 `NewsRoom`의 `onLapsedChange`로 헤더를 테두리 버튼으로 낮춘다. 띠의 ‘다시 팔로우’는 `join`(관문 포함)과 같다.
- 채팅 소식방 목록은 바꾸지 않았다(서버 `rooms()`가 팔로우한 농가만). 테스트 `scripts/e2e/unfollow-feedback.spec.ts`.

## 소비자 화면 개편 (DEV-293, 2026-11-09)
- 탭 첫 화면(내 주문·내 정보)은 `LargeTitle`, 하위 화면은 `HeaderBar` 제목(주문서·입금 안내·주문 상세). 상품 상세는 머리 없이 사진 위 뒤로·공유.
- 상품 상세·주문서처럼 하단 CTA가 있는 구매 화면은 `useHideTabBar()`로 탭 바를 숨긴다. 상품 상세 하단 바는 `aboveTabs` 없이 ‘채팅’·‘예약하기’.
- 공유: 웹은 `navigator.share`, 없으면 `copyText`로 링크 복사 + 토스트. 앱은 RN `Share`. 링크 주소는 웹이면 접속한 origin, 앱이면 `EXPO_PUBLIC_CONSUMER_URL`(없으면 https://farmclub.kr).
- 홈 제철 상품은 2열 그리드(`ProductCard`), 소식은 `FeedCarousel` 가로.
- 주문서: 배송 메모는 선택 목록 시트(`MEMO_PRESETS` + 직접 입력 + 선택 안 함), 동의 본문은 ‘보기’로 펼침(체크박스 접근 이름은 보이는 글자와 같은 ‘동의 제목 (필수)’), 버튼 이름 ‘N원 예약하기’(충돌 안내가 다른 이름을 주면 그 이름), 금액 줄은 ‘상품 금액’·‘배송비’(FREE면 0원, SEPARATE·0이면 ‘배송비 확정 전’)·‘총 입금액’.
- 주문 상세: 버튼 없는 하단 바는 두지 않는다. 배송 중 반품 안내는 본문 한 줄.
- 개발 용어(Mock)는 `isMock`일 때만(로그인 캡션, 데모 데이터 초기화).

## 내 정보 첫 화면 개인정보 (DEV-316, 2026-11-12)
- `/me` 첫 화면 글은 `lib/meSummary.ts`가 만든다: 머리는 닉네임만(`meHeading`, 없으면 실명 대신 ‘닉네임을 정해 주세요’(닉네임 없는 카카오 계정은 늘 가입 전이라 링크 없음)/테스트 계정 ‘닉네임 없음’), 배송지 행은 개수만(`addressSummary`). 첫 화면에서 `user.name`·`user.phone`·`user.email`·배송지 주소를 그리지 않는다(`scripts/test-me-privacy.mjs`가 소스를 확인). 전체 값은 `/me/profile`·`/me/addresses`에서만.


## DEV-318 주문 상태와 조회 복구
- orderText는 현재 depositReportedAt을 과거 depositIssue보다 우선한다. 미승인은 서버가 알림 시각을 비우므로 실제 새 미승인은 계속 보이며 과거 기록은 서버에 남긴다(AC-09-9/10).
- useOrderDetail은 검증된 계정/세션 generation과 주문 ID에 조회 상태를 묶는다. focus·foreground 복귀 및 활성 8초 polling을 적용하고 background/blur/scope 변경·쓰기 시작/완료마다 읽기를 무효화한다. 쓰기와 겹친 읽기는 폐기 후 새로 읽는다(AC-10-9).
- InquiryForm의 주문 reload는 문의 유형·본문·사진 상태를 재생성하지 않는다. 조회 실패/로딩 문구를 구분하고 공통 LoadError로 재시도한다(AC-33-5).

## DEV-320 입금 안내 결과가 불확실할 때의 복구
- 주문 생성 응답을 받은 뒤 원래 주문 ID·옵션·수량·입금 안내 멱등 키를 입금 요청 **전에** 기억한다. transport 실패·5xx는 commit 여부가 불확실하므로 폼을 편집해도 새 주문을 만들지 않고 원래 주문에 원래 키로 입금 안내 요청을 재생한다(FEAT-08 E2, AC-09-3). 단일 GET이 `PENDING_PAYMENT`여도 미완료인 원래 POST를 대신 판정하지 않는다.
- 반복 불확실 실패와 재생의 `IDEMPOTENCY_MISMATCH`는 같은 문맥·키를 유지한다. 서버의 명확한 도메인 400/409로 처리 거부가 확인되면 해당 문맥을 해제하고 기존 필드 오류·가격/물량 충돌 재확인 흐름을 적용한다.
- 불확실 상태는 ‘예약 결과를 확인해 주세요’·‘예약 결과 확인하기’로 원래 요청을 재생한다. 성공 뒤에는 ‘이미 만든 예약이 있어요’와 ‘입금 안내 보기’를 제공해 원래 주문·옵션·수량으로 이동한다. 재생 성공을 새 주문 생성이나 현재 입금 상태 확인으로 표시하지 않으며, 뒤에 편집한 주문서 값은 저장되지 않았고 바꾸려면 기존 예약을 취소한 뒤 다시 예약해야 함을 알린다. 기존 Notice·Button을 재사용한다.
- 같은 화면의 제출은 상태 갱신을 기다리지 않는 동기 잠금으로 직렬화한다. 현재 계정·세션과 주문서 문맥을 확인해 이전 세션의 지연 응답·복구 콜백이 새 요청이나 이동을 실행하지 못하게 한다. 복구 보장은 이 주문서의 기억된 문맥에 적용하며 다른 기기·새 주문서의 주문 의도를 판정하지 않는다.

## 홈·농가 목록 품절 상품 (DEV-327, 2026-11-15)
- 홈 카드는 `soldOut`이면 사진을 `SoldOutOverlay`로 덮는다(홈 추천에는 서버가 품절 두 가지만 남긴다). 사진 아래 여백은 덮개 바깥 View에 둔다.
- 농가 목록 줄은 `featured.availability`가 `TOTAL_SOLD_OUT`·`PERIOD_SOLD_OUT`일 때만(필드가 없으면 판매 중) 농가 사진에 덮개를 얹고, 가격·D-day 칩 대신 `unavailableLabel(availability)` 한 줄만 둔다(상품 다시 읽기 `FeaturedPrice`도 부르지 않음).


## DEV-337 Consumer price freshness

Home/product data use useFocusedAsync: useAsync loads initially and on resource changes; later focus events reload with its existing request-generation guard. Failed refreshes preserve content and expose retry; the product reservation CTA stays disabled during loading/error. Checkout retains its own reviewed snapshot and existing AC-08-8 conflict gate. Product entry carries the previously seen unit price for an informational notice when initial checkout loads a different price; it never replaces the server-authoritative amount.


## DEV-340 Chat Back history

Conversation headers use goBackOr with roomBackTarget as the direct-entry fallback. Existing in-app history is consumed with back, rather than adding another forward visit to the source product. A fresh direct URL replaces its fallback.

## DEV-356 로그인·주문서·입금 안내 (2026-11-17)
로그인(SCR-05)은 제목 왼쪽 · 조합형 `BrandLogo variant="full"` 오른쪽(생산자 SCR-19 배치), 폭은 `min(150, max(96, 창 폭 − 236))`라 390에서 150, 좁은 폭에서도 제목 두 줄. 제목은 `from=reserve`만 ‘로그인하고 예약을 이어 가요’. 관문 시트(`lib/session.tsx`)는 예약 관문에서만 `lib/GateSummary.tsx`(next의 `/products/:id`·data의 optionId·quantity로 상품을 읽음, 순수 계산 `lib/reserveSummary.ts`)와 예약용 본문을 그리고, 닫히는 동안 마지막 관문 문구를 유지한다. 주문서는 `control.placed`(이 주문서로 만든 입금 대기 주문)가 있으면 화면이 다시 보일 때(useFocusEffect) ‘이미 만든 예약’ Notice를 띄우고 첫 줄을 `orders.get` + `placedLine`(lib/orderText.ts)으로 채운다. 강조색은 하단 버튼 하나(‘변경’·총 입금액은 글자색). 입금 안내는 `DepositCard hideAmount hideHint`로 ‘입금액’ 줄과 카드 아래 안내 한 줄을 빼고(완료·주문 상세는 그대로) 큰 금액 옆에 복사, 입금자명 안내는 Notice + `depositorNameTitle(depositCode ?? orderNo)`(끝 숫자 읽기로 로/으로, DEV-342 짧은 입금 코드), 상자는 `privateArea`로 녹화에서 가림. FEAT-01 AC-01-21, FEAT-08 AC-08-10, FEAT-09 AC-09-11·12.


## DEV-465 고객 참여 (AC-ENG-1~5)

- 명세는 `docs/spec/customer-engagement.md`. `FollowWelcome`은 명시적 팔로우 진입 세 곳(FarmRoom·농가 정보·주문 완료)이 공유하며 서버 firstFollow/fanNumber 성공 응답만 환영 시트를 연다. 확인·닫기·뒤로는 한 번만 농가 정보로 이동한다. 동기 잠금과 검증된 auth generation·farm 문맥을 확인해 중복/이전 세션 응답을 폐기한다.
- 농가 정보 맨 위 `FarmTemperature`는 서버 정수 tenths를 소수 한 자리로 표시한다. 실제 기여와 정책을 설명하며 실패 시 재시도를 제공한다. 기존 강조색/중립 surface 토큰을 재사용한다.
- `/me/achievements`는 서버 판정만 표시하고 focus마다 새로 읽는다. 검증된 세션 generation으로 화면을 분리한다. CTA는 관련 실제 화면만 열고 완료를 쓰지 않는다.
- 2026-11-25 승인 디자인: `FollowWelcome`은 기존 `EmoticonImage`의 고마워요 감귤 일러스트와 실제 번호 카드(숫자44px)를 조합하고, 기존 `Sheet`·단일 CTA·한 번 이동 규칙은 유지한다. `/me/achievements`는 기존 브랜드 아이콘을 요약에 두고5개 독립 스탬프와 재사용 `ActivityRow`로 실제 서버 상태를 표시한다. 미달성 행은 기존 목적지로 이동하며 제목·상태·설명·행동을 접근성 이름으로 제공한다. 첫 공감의 화면용 설명만 좁은 폭에 맞춰 줄인다. 색·글꼴·반경은 공용 토큰을 쓰고 작은 강조 글자는 accentPressed로 구분한다. 제품 기준은 AC-ENG-1/4이며 판정·반전·세션 경계는 바꾸지 않는다.
- 완료·미환불 주문의 `PurchaseReview`는 기존 별점을 조회하고 정수1~5 선택을 저장한 성공 응답만 반영한다. 농가 신고는 별도 인증 관문 action(report) 및 실제 저장 폼을 쓰며 성공 접수와 운영 검토 전 온도 미반영을 안내한다.
## DEV-454 UAT cycle 2
The checkout uses a dedicated condition-change modal while preserving the existing submission and deposit-recovery path. Dismissal does not acknowledge a reservation; the footer reopens the prompt.

## DEV-476 정식 서비스 전환 문구 (2026-11-24)
주문서·입금 안내 머리 아래 ‘테스트 서비스’ 띠는 지웠고(`TestBand`는 `packages/ui`에서 뺐다), 가입 동의 시트는 ‘버전 ○’만, 로그인 하단 안내는 ‘· 테스트 서비스’ 꼬리 없이 둔다. 약관 요지는 ‘입금은 농가 계좌로 직접 하고, farmclub은 거래를 중개해요.’로 끝난다. `app.config.js`는 app.json을 그대로 돌려주고, EAS 빌드 서버에서 `development`가 아닌 모든 프로필(이름·대소문자와 상관없이 제외 목록으로 본다)에서 사업자 정보 필수 값이 비면 던져서 빌드를 멈춘다. 생산자 앱과 글자까지 같은 파일이고, fingerprint가 바뀌지 않게 다른 파일을 require하지 않는다(`scripts/test-store-business-check.mjs`).
