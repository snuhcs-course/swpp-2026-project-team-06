## DEV-68 무통장 입금 API·Mock
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-09(개정)·14·17 · 상태: 진행 중

### 목표
서버와 같은 계약으로 types·endpoints·Mock을 바꾼다. 결제(`pay`, `mockResult`)를 입금 안내(`deposit`)·입금 확인(`confirmDeposit`)으로 교체한다.

### 범위 (수정 허용 경로)
- `packages/api/src/types.ts`, `packages/api/src/endpoints.ts`
- `packages/api/src/mock/{db,derive,orders,farms,sales}.ts`
- `scripts/test-capacity.mjs`, `scripts/test-spec12.mjs`, `scripts/test-navigation.mjs`, `scripts/test-integration.mjs`, `scripts/e2e/checkout-and-fulfillment.spec.ts`

### 비범위
- PortOne 클라이언트(#124). 소식·채팅 Mock.

### 결정 사항
- 10/18 `OrderStatus`에 `AWAITING_DEPOSIT`. `Order`에 `depositAccount`(bankName·accountNumber·accountHolder)·`depositDueAt`·`depositReportedAt`·`cancelReason`·`refundSettledAt`·`sellerInfo`(farmName·ownerName·region·phone). `ProducerOrder`에 `totalAmount`·`depositDueAt`·`depositReportedAt`·`refundSettledAt`. `Dashboard.todo`에 `awaitingDeposit`·`refundsToSettle`·`hasAccount`. `MyFarm`에 `bankName`·`accountNumber`·`accountHolder`.
- 10/18 Mock 시드: 농가 4곳 계좌, 입금 대기 주문 1건(김민지). Mock 테스트 스크립트는 `deposit` → 생산자 `confirm-deposit`으로 예약 완료를 만든다.

### 작업
- [x] types·endpoints 교체(`orders.deposit`·`depositReported`·`confirmDeposit`·`refundSettled`, `farms.updateMine` 계좌)
- [x] Mock orders: deposit·confirm·expire(지연)·reported·refund-settled, 목록 필터·대시보드
- [x] Mock farms: 계좌 GET/PATCH 검증, 초기 승인 요청 409 `NO_FARM_ACCOUNT`
- [x] Mock 테스트·통합 테스트·e2e 스크립트 갱신 후 `npm run test:mock`·`npm run typecheck` 통과

### 완료 조건
- [ ] 소비자·생산자 앱이 Mock과 실서버에서 같은 흐름으로 동작
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 범위 추가: `packages/api/src/mock/{auth,capacity,catalog}.ts`(가입 농가 레코드 계좌 칸, NO_FARM_ACCOUNT, holdsStock 집계).
- 10/18 `npm run typecheck`·`npm run test:mock`(13 통과) 확인. 범위 추가: `packages/ui/src/{format,index}.ts`(deadline 포맷).
- 10/18 농가 미승인: `orders.rejectDeposit(id, reason, cancel)`·`orders.refundIssue(id, reason)`, `Order`·`ProducerOrder`에 `depositIssue`·`refundIssue`, Mock 핸들러 같은 규칙(사유 필수 400, 409). Mock DB 필드는 선택이라 DB_VERSION 유지. test-capacity에 AC-09-9/AC-17-8.
- 10/18 Mock도 서버와 같게: 입금했다고 알린 주문은 기한이 지나도 취소하지 않음, 생산자 목록에서 `paidAt` 없는 취소 제외·`paidAt` 없으면 배송 정보 숨김.

