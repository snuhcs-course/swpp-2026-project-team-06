# server/app/orders spec

> 구현하는 기능: FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-14(주문 쪽), FEAT-17(상태 변경·송장) · 지키는 규칙: R-01, R-02, R-03, R-05, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-17, R-19, R-20, R-21, R-23, R-24, N-05, N-06 · 인수 조건: AC-08-1~5, AC-09-1~2, AC-10-1~3, AC-11-1~2, AC-14-1~2, AC-09-3, AC-17-2~5(AC-17-1은 I2)
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-08·09·10·11·14·17, rules.md (여기에 다시 쓰지 않는다)
> 주문 상태 전이표: [docs/spec/tech-design/README.md "주문 상태"](../../../docs/spec/tech-design/README.md#주문-상태-orderstatus), 데이터 불변 조건 1·2·4·8

> API 원본: docs/spec/screens.md 7.2 orders

## 역할
예약 주문, Mock 결제, 출하 전 취소·환불, 수확 시작·출하, 배송 완료, 구매 확정. 운영자의 배송 완료·환불.

## 구조
- `router.py` — prefix `/orders`(앱에서는 `/api/orders`). 관리 API `/admin/orders/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Order`, `Payment`, `Refund`
- `schemas.py` — 주문서·주문 내역·주문 상세·결제·출하 입출력
- `service.py` — 주문 생성(차감 포함), 상태 전이, 환불, 출하 반영

## 계약
- **상태 전이**는 tech-design/README.md "주문 상태" 표만 허용하고, 표에 없는 전이는 막는다(409). 전이 표는 service 한 곳에 둔다.
- **R-06 물량 차감**: 주문 생성(결제 성공)과 `StageAllocation.reservedCount` 증가는 한 트랜잭션에서 하고, 해당 행을 `SELECT … FOR UPDATE`로 잠근 뒤 `reservedCount + quantity ≤ quantity`를 확인한다. 동시 결제에서 마지막 물량은 한 건만 성공한다(AC-09-1). 환불되면 그 수량만큼 되돌린다.
- `Order.unitPrice`는 주문 시점 `StagePrice` 복사본(R-17). `totalAmount = unitPrice × quantity`, 배송비 별도면 더해 결제(R-20). 금액은 원 단위 정수.
- 결제일·배송 완료일·구매 확정일을 기록한다(R-13). 금전성 필드(잔액·포인트 등)는 만들지 않는다(R-08).
- 받는 사람·연락처·주소는 주문 시점 값을 `Order`에 복사해 저장한다. `ShippingAddress`(accounts)를 참조하지 않는다 — 저장 배송지를 나중에 바꿔도 지난 주문이 바뀌지 않게.
- 생산자는 배송 완료 전 주문의 배송 정보만 본다(R-15). 배송 메모(`deliveryNote`)도 같다.
- 생산자가 바꿀 수 있는 전이는 예약 완료 → 출하 준비(수확 시작), 출하 준비 → 출하(택배사 `carrier`·송장 번호 선택)뿐이다. 여러 건 출하는 앱이 주문별 API를 반복하고, 서버에 일괄 API는 없다. 배송 완료는 운영자 관리 API만(R-19, AC-17-4).
- `POST /api/orders`·`POST /api/orders/{orderId}/pay`는 `Idempotency-Key`로 중복 처리를 막는다(AC-09-3, server/spec.md).
- 다른 모듈과의 경계
  - accounts: 주문서 기본값으로 저장 배송지(`ShippingAddress`, AC-08-5)를 accounts service에서 읽어 오고, 값만 복사한다.
  - catalog: 단계 가격 조회·물량 잠금·차감·되돌리기는 catalog service를 같은 세션으로 부른다.
  - ai: I1에는 없다. (I2) 출하 문장 해석(FEAT-17)은 ai 어댑터가 후보 주문을 돌려주고, 확정·반영은 이 모듈이 한다. AI에 받는 사람 이름·주소를 보내지 않는다(M-18).
  - farms: 농가 정지(R-24) 때 farms가 이 모듈의 일괄 환불을 부른다.
  - analytics: `order_paid`, `order_canceled` 서버 이벤트.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 물량 차감은 트랜잭션 + `SELECT … FOR UPDATE`(StageAllocation 행 잠금) | 동시 결제 시 초과 판매 방지(R-06, ADR 0007) | AC-09-1 |
| 2026-10-07 | 주문은 배송지를 참조하지 않고 주문 시점 주소를 `Order`에 복사 | 저장 배송지 수정·삭제가 지난 주문에 영향 없게(팀 결정) | AC-08-5 |
| 2026-10-07 | 라우터 prefix는 `/orders` | ia.md 경로와 같은 말 | — |
| 2026-10-07 | 출하는 주문별 상태 변경 + 송장 번호(`trackingNumber`), 자연어·AI는 I2 | P22 결정 | AC-17-2, AC-17-5 |
| 2026-10-07 | `Order.carrier`(택배사 코드) 추가, 여러 건 출하는 주문별 ship 반복, 대시보드에 상품별 `reservedCount`·주문 수, 주문 API는 소비자 계정만 | SWPP-81(screens.md 1.1 결정 32) | AC-17-2 |
