# apps/consumer spec

> 구현하는 기능: FEAT-01, FEAT-02, FEAT-06, FEAT-07, FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-12, FEAT-13, FEAT-15, FEAT-19(도착) · 지키는 규칙: R-03, R-05, R-06, R-17, R-20, R-21, R-23, M-02, M-04, M-08, M-17, N-01, N-02, N-05, N-06
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 화면·경로·레이블 원본: docs/spec/ia.md 2장·4장, FEAT ↔ 폴더: docs/spec/tech-design/stack.md 4장

## 역할
소비자 앱(모바일 웹). Expo + Expo Router 웹 출력으로 만들고 Vercel에 정적 배포한다(ADR 0001). 공개 화면 SCR-01~05, 로그인 후 화면 SCR-10~17을 맡는다.

## 구조
- `src/app/` — Expo Router 라우트. 파일 하나가 화면 하나다.
- 하단 탭 4개(ia.md 4장): 농가(SCR-02) · 메시지(SCR-15) · 주문(SCR-13) · 내 정보(SCR-17). `src/app/(tabs)/_layout.tsx`
- 탭 밖 화면은 루트 Stack에 둔다: 랜딩, 로그인, 상품 상세, 주문서, 결제.

| SCR | 화면 | 경로 | 파일 | FEAT |
| --- | --- | --- | --- | --- |
| SCR-01 | 랜딩 | `/` | `src/app/index.tsx` | FEAT-06 |
| SCR-02 | 농가 목록 | `/farms` | `src/app/(tabs)/farms/index.tsx` | FEAT-06 |
| SCR-03 | 농가 페이지 | `/farms/:farmId` | `src/app/(tabs)/farms/[farmId].tsx` | FEAT-06, 15, 19 |
| SCR-04 | 상품 상세 | `/products/:productId` | `src/app/products/[productId].tsx` | FEAT-07 |
| SCR-05 | 로그인 | `/login` | `src/app/login.tsx` | FEAT-01 |
| SCR-10 | 주문서 | `/checkout/:productId` | `src/app/checkout/[productId]/index.tsx` | FEAT-08 |
| SCR-11 | 결제 | `/checkout/:productId/pay` | `src/app/checkout/[productId]/pay.tsx` | FEAT-09 |
| SCR-12 | 주문 완료 | `/orders/:orderId/done` | `src/app/(tabs)/orders/[orderId]/done.tsx` | FEAT-09 |
| SCR-13 | 주문 내역 | `/orders` | `src/app/(tabs)/orders/index.tsx` | FEAT-10 |
| SCR-14 | 주문 상세 | `/orders/:orderId` | `src/app/(tabs)/orders/[orderId]/index.tsx` | FEAT-10, 11 |
| SCR-15 | 메시지함 | `/inbox` | `src/app/(tabs)/inbox/index.tsx` | FEAT-12 |
| SCR-16 | 농가 대화 | `/inbox/:farmId` | `src/app/(tabs)/inbox/[farmId].tsx` | FEAT-12, 13 |
| SCR-17 | 내 정보 | `/me` | `src/app/(tabs)/me.tsx` | FEAT-06 |

## 계약
- 공용 컴포넌트·토큰은 `@farmclub/ui`(packages/ui), 서버 호출은 `@farmclub/api`(packages/api)만 쓴다. 화면에서 `fetch`를 직접 부르지 않는다.
- 서버 주소는 `EXPO_PUBLIC_API_URL`(packages/api spec).
- 농가 링크는 서버 `/s/farms/<id>`(ADR 0006)를 거쳐 `/farms/:farmId`로 도착한다. 이 경로는 바꾸지 않는다.
- 카카오 로그인 리다이렉트 주소는 `/auth/kakao`(stack.md 5장). 라우트는 DEV-3에서 만든다.
- 로그인 관문·권한 표시는 화면에서 하되, 실제 권한 검사는 서버가 한다(N-06).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우트는 `src/app/`, 탭 화면은 `(tabs)` 그룹 안에 탭별 Stack으로 둔다(농가·메시지·주문). 상품 상세·주문서·결제·로그인·랜딩은 탭 밖 루트 Stack | ia.md 2장 경로를 그대로 쓰면서 하단 탭 4개(ia.md 4장)를 유지 | — |
| 2026-10-07 | 웹 출력은 `web.output: "single"`(SPA). Vercel rewrite는 DEV-8 | 정적 호스팅, 동적 경로(`:farmId` 등) | — |
| 2026-10-07 | Expo는 SDK마다 바뀌므로 docs.expo.dev의 버전별 문서를 확인하고, 패키지는 반드시 `npx expo install`로 추가한다 | create-expo-app이 만든 AGENTS.md 규칙을 루트 AGENTS.md 하나로 합치며 옮김 | — |
| 2026-10-07 | DEV-12의 화면은 `Placeholder`로 "SCR-xx 화면 이름 · FEAT-xx"만 보여준다 | 뼈대 이슈, 기능은 DEV-3 이후 | — |
