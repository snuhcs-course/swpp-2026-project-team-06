# apps/consumer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-06, FEAT-07, FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-12, FEAT-13, FEAT-15, FEAT-19(도착) · 지키는 규칙: R-03, R-05, R-06, R-17, R-20, R-21, R-23, M-02, M-04, M-08, M-14, N-01, N-02, N-05, N-06 (M-17은 I2)
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장, 화면별 명세·API: docs/spec/screens.md 5장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
소비자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 공개 화면 SCR-01~05, 로그인 후 화면 SCR-10~18을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 발견(SCR-01) · 내 주문(SCR-13) · 채팅(SCR-15·18) · 내 정보(SCR-17). `src/app/(tabs)/_layout.tsx`. 주문 내역·상세·완료는 내 주문 탭 안.
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 상품 상세, 주문서, 결제.
- 현재 경로는 PR #39의 `docs/spec/navigation-1.3.md`를 따른다.

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-01 | 홈·발견 | `/` | `src/app/(tabs)/index.tsx` | FEAT-06, 15 |
| SCR-02 | 농가 목록 | `/farms` | `src/app/(tabs)/farms/index.tsx` | FEAT-06 |
| SCR-03 | 농가 페이지 | `/farms/:farmId` | `src/app/(tabs)/farms/[farmId].tsx` | FEAT-02, 06, 12, 15, 19 |
| SCR-04 | 상품 상세 | `/products/:productId` | `src/app/products/[productId].tsx` | FEAT-07 |
| SCR-05 | 로그인(소비자 테스트 계정만) | `/login` | `src/app/login.tsx` | FEAT-01 |
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
- 화면 모양·크기·문구는 `docs/design/`(screens/*.html, README 토큰·규칙)이 기준이다.

## 구현 결정
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

소비자 주문 문구는 미확정 주문, 생산자 상품 그룹은 판매 중/심사 중/작성 중/판매 중지/판매 종료다. 배송 기간 변경은 미출하 결제 주문의 동의·환불 선택을 보존한다(R-21). 일반 상품 변경·가격 변경에 재승인을 요구하지 않는다.
