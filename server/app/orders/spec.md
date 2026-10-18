# server/app/orders spec

> 구현하는 기능: FEAT-08, FEAT-09, FEAT-10, FEAT-11, FEAT-14(주문 쪽), FEAT-17(상태 변경·송장) · 지키는 규칙: R-01, R-02, R-03, R-05, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, R-14, R-15, R-17, R-19, R-20, R-21, R-23, R-24, N-05, N-06 · 인수 조건: AC-08-1~5, AC-09-1~2, AC-10-1~3, AC-11-1~2, AC-14-1~2, AC-09-3, AC-17-2~5(AC-17-1은 I2)
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-08·09·10·11·14·17, rules.md (여기에 다시 쓰지 않는다)
> 주문 상태 전이표: [docs/spec/tech-design/README.md "주문 상태"](../../../docs/spec/tech-design/README.md#주문-상태-orderstatus), 데이터 불변 조건 1·2·4·8

> API 원본: docs/spec/screens.md 7.2 orders

## 역할
예약 주문, 무통장 입금 안내·확인(DEV-68), 출하 전 취소·환불(농가 송금 완료 표시), 수확 시작·출하, 배송 완료, 구매 확정. 운영자의 배송 완료·환불·입금 확인·만료 일괄.

## 구조
- `router.py` — prefix `/orders`(앱에서는 `/api/orders`). 관리 API `/admin/orders/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Order`, `Payment`, `Refund`
- `schemas.py` — 주문서·주문 내역·주문 상세·결제·출하 입출력
- `service.py` — 주문 생성(차감 포함), 상태 전이, 환불, 출하 반영

## 계약
- **상태 전이**는 tech-design/README.md "주문 상태" 표만 허용하고, 표에 없는 전이는 막는다(409). 전이 표는 service 한 곳에 둔다.
- **R-06 물량 차감**: 주문 생성(결제 성공)과 `StageAllocation.reservedCount` 증가는 한 트랜잭션에서 하고, 해당 행을 `SELECT … FOR UPDATE`로 잠근 뒤 `reservedCount + quantity ≤ quantity`를 확인한다. 동시 결제에서 마지막 물량은 한 건만 성공한다(AC-09-1). 출하 전 최종 전액 환불에서만 남은 수량을 한 번 되돌린다.
- `Order.unitPrice`는 주문 시점 `StagePrice` 복사본(R-17). `totalAmount = unitPrice × quantity`, 배송비 별도면 더해 결제(R-20). 금액은 원 단위 정수.
- 결제일·배송 완료일·구매 확정일을 기록한다(R-13). 금전성 필드(잔액·포인트 등)는 만들지 않는다(R-08).
- 받는 사람·연락처·주소는 주문 시점 값을 `Order`에 복사해 저장한다. `ShippingAddress`(accounts)를 참조하지 않는다 — 저장 배송지를 나중에 바꿔도 지난 주문이 바뀌지 않게.
- 생산자는 배송 완료 전 주문의 배송 정보만 본다(R-15). 배송 메모(`deliveryNote`)도 같다.
- 생산자가 바꿀 수 있는 전이는 예약 완료 → 출하 준비(수확 시작), 출하 준비 → 출하(택배사 `carrier`·송장 번호 선택)뿐이다. 여러 건 출하는 앱이 주문별 API를 반복하고, 서버에 일괄 API는 없다. 배송 완료는 운영자 관리 API만(R-19, AC-17-4).
- `POST /api/orders`·`POST /api/orders/{orderId}/deposit`는 `Idempotency-Key`로 중복 처리를 막는다(AC-09-3, server/spec.md).
- **무통장 입금(DEV-68, R-28)**: 물량은 입금 안내(`deposit`) 시점에 선점하고 주문은 `AWAITING_DEPOSIT`이 된다. `holds_stock(order)`(입금 대기 또는 `paid_at` 있음)가 물량·중량 집계의 기준이다. 입금 확인(`confirm_deposit`)은 자기 농가 생산자 또는 운영자만, 멱등이며 `paid_at`=확인 시각에 `Payment(BANK_TRANSFER/FARM_ACCOUNT)`를 만든다. 기한(`deposit_due_at` = 안내 + `DEPOSIT_DEADLINE_HOURS`)이 지난 입금 대기는 소비자 조회·취소, 생산자 목록·현황·확인 시점에 `expire_overdue_deposits`로 취소(`CANCELED`, `cancel_reason`)하고 물량을 돌려주며, 운영자 `POST /admin/orders/expire-deposits`가 일괄 처리한다. 입금 대기 취소는 환불 없이 `CANCELED`. 환불 송금은 농가가 하고 `Refund.settled_at`만 기록한다. 농가 계좌·판매자 정보는 `holds_stock`인 본인 주문 응답에서만 내려준다.
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
| 2026-10-08 | 결제는 `catalog.lock_allocation`(FOR UPDATE)으로 잠근 뒤 차감, 주문 생성은 물량을 잡지 않는다. 409(STAGE_CHANGED·SOLD_OUT)도 멱등 결과로 저장 | FQ-03, contracts 1장 | AC-09-1, AC-09-3 |
| 2026-10-08 | 주문 번호는 `FC-MMDD-NNNN`(`order_no_seq`). (2026-10-18 DEV-68: 형식은 그대로, NNNN은 무작위 4자리·충돌 시 재시도. 입금자명으로 쓰며 연번이면 거래 건수가 드러나서 바꿈. 시퀀스는 미사용) 도서산간은 우편번호·주소 예시 규칙, 생산자 지역 설정은 후속 | Mock과 같음, R-20 | AC-08-4 |
| 2026-10-08 | 현황의 `openQuestions`는 채팅 구현 전까지 0, 대표 상품은 지금 단계가 가장 일찍 끝나는 판매 중 상품 | FEAT-14 | AC-14-1 |
| 2026-10-08 | 주문 문의 API(`POST·GET /api/orders/{id}/inquiries`)는 orders 라우터, 로직은 messaging 서비스. 결제한 본인 주문·그 농가 생산자만 | contracts-1.2 6장 | AC-33-1 |
| 2026-10-16 | 모든 환불 경로는 `_refund`에서 `Refund` 이력과 `Payment.status`를 함께 기록한다. 부분 환불은 주문 상태·환불 필드·물량을 바꾸지 않고 결제액(배송비 포함)의 잔액만 줄인다 | DEV-35 정책 결정 | AC-10-6, AC-11-3 |
| 2026-10-18 | `AWAITING_DEPOSIT` 신설, `/pay`·`mockResult` 삭제 → `deposit`·`deposit-reported`·`confirm-deposit`·`refund-settled`, 관리 `confirm-deposit`·`expire-deposits`. 만료는 지연 검사 + 일괄 API(스케줄러 없음). 입금 대기 줄의 배송지는 생산자에게 숨김 | DEV-68(C안: farmclub은 통신판매중개자), R-28 | AC-09-1·2·3·7·8, AC-17-7 |
