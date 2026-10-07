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


## DEV-3 로컬 이식 결정 (2026-10-07)

로컬 프로토타입은 ZIP의 수기 타입·엔드포인트 및 도메인별 Mock 전송을 사용한다. OpenAPI 생성은 후속 서버 연동 작업이며 이번에 도입하지 않는다. Mock 공유 URL은 EXPO_PUBLIC_CONSUMER_URL을 따른다. Mock DB는 앱별 localStorage로 분리되어 앱 간 데이터 동기화는 없다.

기존 구현 결정 표의 DEV-12 뼈대 설명은 과거 기록이며 현재 구현은 이 절을 따른다.


소식방 계약은 docs/spec/screens.md의 DEV-3 추가 항목을 따른다. rooms.ts가 권한 필터를 요약·cursor보다 먼저 적용하며 방송은 기존 news, 개인 답장은 roomReplies로 저장한다. 공유 HTTP Mock은 scripts/mock-server.mjs에서 같은 핸들러를 실행하고 .expo 아래 상태·미디어를 유지한다.

## DEV-3 스펙 1.2 구현 기준

PR #38의 contracts-1.2.md와 디자인 README를 따른다. 판매 설정/날짜 기간의 버전·멱등 키와 권한을 공유 Mock까지 구현한다. 공용 대화 UI에 API 함수를 주입하고 활성 화면만 polling한다. 구형 로컬 중간 구조의 호환 API는 남기지 않는다.


## DEV-3 화면 구조 1.3 (변경 이력)

이전 탭/로컬 이식 기록은 변경 이력이다. PR #39의 navigation-1.3.md를 따른다. 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 주문은 `/orders`, 채팅 목록은 소식방/1:1 선택을 유지하며 활성 화면만 갱신한다. 앱 공통 메신저 행/헤더는 API를 직접 호출하지 않는다. 전체 cursor 수집은 취소·실패·반복 cursor를 처리한다. 새 API/DB 계약은 없다.


## DEV-3 공급 물량 승인 1.4 (현재 구현 기준)

제품·API 기준은 main에 먼저 머지한 PR #40의 `docs/spec/capacity-1.4.md`이며 위 1.2/1.3 기록에서 충돌하는 결정은 대체한다. 상품별 kg 입력을 정수 g로 전달하고 승인량과 판매 한도를 구분한다. 최초 승인만 상품을 공개하고 증액 심사 중에는 기존 판매를 유지한다. 가격은 신규 주문부터 즉시 반영하며 기존 결제 중량·가격 스냅샷은 보존한다(AC-04-8/9, AC-05-6, AC-09-6). 요청 버전과 멱등 키는 동일 본문 재시도에서 유지한다.

Mock 스키마 7은 단일 판매값·capacityRequests·주문 unitWeightGrams/releasedQuantity를 사용한다. 예전 승인 복제값·publish-request·박스 총 한도·런타임 마이그레이션은 제거한다. 로컬 공유 서버와 독립 브라우저 저장소를 지원하며 실제 서버는 DEV-4 범위다. 로그인 변경 시 탭 상태를 새로 만들고 비동기 이전 응답을 폐기한다.

소비자 주문 문구는 미확정 주문, 생산자 상품 그룹은 판매 중/심사 중/작성 중/판매 중지/판매 종료다. 배송 기간 변경은 미출하 결제 주문의 동의·환불 선택을 보존한다(R-21). 일반 상품 변경·가격 변경에 재승인을 요구하지 않는다.
