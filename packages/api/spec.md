# packages/api spec

> 구현하는 기능: 공용(두 앱의 서버 호출) · 지키는 규칙: N-05, N-06
> API 원본: docs/spec/screens.md 7장(엔드포인트·오류 형식·페이지네이션·멱등 키), 구현 후에는 서버 코드에서 나온 OpenAPI 스키마(ADR 0007). 서버 계약: server/spec.md

## 역할
두 앱이 서버를 부르는 클라이언트와 타입. 패키지 이름은 `@farmclub/api`.

## 구조
- `src/client.ts` — `EXPO_PUBLIC_API_URL`을 기준 주소로 쓰는 `fetch` 래퍼.
- `src/index.ts` — 공개 export. DEV-12에는 `health()` 하나.
- 이후: 서버 OpenAPI(`/openapi.json`)에서 타입·함수를 생성해 `src/generated/`에 둔다(도구는 생성 도입 이슈에서 정한다).

## 계약
- 기준 주소: `process.env.EXPO_PUBLIC_API_URL` (예: 로컬 `http://localhost:8000`). 없으면 `http://localhost:8000`.
- `health(): Promise<{ status: "ok" }>` → `GET /health`.
- 인증 헤더(`Authorization: Bearer <JWT>`)는 DEV-3·DEV-4에서 이 패키지에 넣는다. I1 토큰은 Mock 로그인(`POST /api/auth/test-login`, `app` 필수, ADR 0009)으로 받고, 카카오·토큰 갱신은 I2(ADR 0003). 앱은 토큰을 직접 헤더에 붙이지 않는다.
- 계정은 앱별이다(ADR 0010). 앱이 시작할 때 자기 앱 이름(`consumer`·`producer`)을 설정하고, 이 패키지는 그 이름으로 테스트 계정 목록(`?app=`)과 로그인(`app`)을 부르며 토큰을 앱별 키로 따로 보관한다. 403 `WRONG_APP`이면 토큰을 지우고 로그아웃 이벤트를 낸다.
- 1.1 응답 필드: 상품 `reservedCount`(예약한 사람 수), 상품 상세 농가 요약 `brixRecordCount`, 주문 `carrier`(택배사 코드 `CJ`·`EPOST`·`HANJIN`·`LOTTE`·`LOGEN`·`ETC`)·`trackingNumber`. 상품 상세에 최신 소식은 없다. 택배사별 배송 조회 주소 표는 이 패키지에 둔다.
- 오류 응답은 `{code, message, details}`(screens.md 7.1). `ApiError`는 `status`와 함께 `code`·`message`·`details`를 꺼내 준다. 화면은 `message`를 그대로 보여주고 409는 `details`의 최신 값으로 다시 그린다.
- 목록 함수는 `{ items, nextCursor }`를 돌려주고 `cursor`·`limit`을 받는다.
- `POST /api/orders`, `POST /api/orders/{orderId}/pay`는 이 패키지가 `Idempotency-Key`(UUID)를 만들어 붙이고, 재시도할 때 같은 키를 다시 쓴다.
- 이 패키지는 분석 이벤트에 개인정보를 넣지 않는다(N-05). 지표 SDK는 여기 두지 않는다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 빌드 없이 TS 소스(`src/index.ts`)를 `main`으로 둔다 | packages/ui와 같은 방식 | — |
| 2026-10-07 | 손으로 쓴 함수는 `health()`만 두고, 나머지는 OpenAPI 생성으로 채운다 | 서버 스키마와 어긋나지 않게(ADR 0007) | — |
| 2026-10-07 | 오류 `{code, message, details}`, cursor 목록, 주문·결제 멱등 키를 이 패키지가 처리 | P22 결정(screens.md 7.1). 현재 `ApiError(status, body)`를 바꾸는 일은 DEV-3 | AC-09-3 |
| 2026-10-07 | 앱별 계정·토큰(`app`), `WRONG_APP` 처리, `reservedCount`·`brixRecordCount`·`carrier` 타입, 택배 조회 주소 | SWPP-81(screens.md 1.1, ADR 0010) | AC-01-6 |
