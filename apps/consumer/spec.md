# apps/consumer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-06, FEAT-07, FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-12, FEAT-13, FEAT-15, FEAT-19(도착) · 지키는 규칙: R-03, R-05, R-06, R-17, R-20, R-21, R-23, M-02, M-04, M-08, M-14, N-01, N-02, N-05, N-06 (M-17은 I2)
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장, 화면별 명세·API: docs/spec/screens.md 5장·7장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
소비자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 공개 화면 SCR-01~05, 로그인 후 화면 SCR-10~18을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 발견(SCR-01) · 소식(SCR-18) · 채팅(SCR-15) · 내 정보(SCR-17). `src/app/(tabs)/_layout.tsx`. 주문 내역(SCR-13·14·12)은 내 정보 탭 안.
- 탭 밖 화면은 루트 Stack에 둔다: 로그인, 상품 상세, 주문서, 결제.
- 아래 표는 P22(SWPP-26)에서 정한 목표 경로다. 현재 코드(DEV-12 뼈대)는 이전 탭(농가·메시지·주문·내 정보)이고, 옮기는 일은 `tasks.md`의 DEV-3 절에 있다.

| SCR | 화면 | 경로 | 파일(목표) | FEAT |
| --- | --- | --- | --- | --- |
| SCR-01 | 홈·발견 | `/` | `src/app/(tabs)/index.tsx` | FEAT-06, 15 |
| SCR-02 | 농가 목록 | `/farms` | `src/app/(tabs)/farms/index.tsx` | FEAT-06 |
| SCR-03 | 농가 페이지 | `/farms/:farmId` | `src/app/(tabs)/farms/[farmId].tsx` | FEAT-02, 06, 12, 15, 19 |
| SCR-04 | 상품 상세 | `/products/:productId` | `src/app/products/[productId].tsx` | FEAT-07 |
| SCR-05 | 로그인(테스트 계정) | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-10 | 주문서 | `/checkout/:productId` | `src/app/checkout/[productId]/index.tsx` | FEAT-08 |
| SCR-11 | 결제 | `/checkout/:productId/pay` | `src/app/checkout/[productId]/pay.tsx` | FEAT-09 |
| SCR-12 | 주문 완료 | `/me/orders/:orderId/done` | `src/app/(tabs)/me/orders/[orderId]/done.tsx` | FEAT-09 |
| SCR-13 | 주문 내역 | `/me/orders` | `src/app/(tabs)/me/orders/index.tsx` | FEAT-10 |
| SCR-14 | 주문 상세 | `/me/orders/:orderId` | `src/app/(tabs)/me/orders/[orderId]/index.tsx` | FEAT-10, 11 |
| SCR-15 | 채팅 목록 | `/chats` | `src/app/(tabs)/chats/index.tsx` | FEAT-12 |
| SCR-16 | 농가 채팅 | `/chats/:farmId` | `src/app/(tabs)/chats/[farmId].tsx` | FEAT-12, 13 |
| SCR-17 | 내 정보 | `/me` | `src/app/(tabs)/me/index.tsx` | FEAT-06, 08, 10 |
| SCR-18 | 소식 | `/news` | `src/app/(tabs)/news.tsx` | FEAT-12, 15 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다. 화면에서 `fetch`를 직접 부르지 않는다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec). 쓰는 API는 screens.md 7.2.
- 농가 링크는 서버 `/s/farms/<id>`(ADR 0006)를 거쳐 `/farms/:farmId`로 도착한다. 이 경로는 바꾸지 않는다.
- I1 로그인은 테스트 계정 선택(`GET /api/auth/test-accounts`, `POST /api/auth/test-login`, ADR 0009). 카카오 리다이렉트 `/auth/kakao`는 I2.
- 로그인 관문(팔로우·예약하기·채팅하기·좋아요, 소식·채팅·내 정보 탭)과 권한 표시는 화면에서 하되, 실제 권한 검사는 서버가 한다(N-06).
- 레이블은 ia.md 4장: 소비자 화면에 ‘메시지’를 쓰지 않는다(‘소식’, ‘채팅’).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹 안에 탭별 Stack으로 둔다. 상품 상세·주문서·결제·로그인은 탭 밖 루트 Stack | ia.md 2장 경로를 그대로 쓰면서 하단 탭 4개(ia.md 4장)를 유지 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로(`:farmId` 등) | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다 | 뼈대 이슈, 기능은 DEV-3 이후 | — |
| 2026-10-07 | 탭을 발견·소식·채팅·내 정보로, 첫 화면을 홈·발견(SCR-01)으로, 주문 내역을 내 정보 안(`/me/orders`)으로, 메시지함을 채팅(`/chats`)으로 | P22 결정(SWPP-26) | AC-06-4, AC-12-5 |
