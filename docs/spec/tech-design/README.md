# 기술 설계 초안

PRD에서 옮겨 온 데이터 모델과 주문 상태 초안이다. 기술 스택 확정(P19) 때 기술 설계 문서로 정식 작성하고, PRD의 R·M 규칙을 구현 단위로 풀어 쓴다.

## 앱 구성

프론트엔드는 소비자 앱과 생산자 앱 두 개의 모바일 웹이다(PRD N-01, IA 2장). 두 앱은 같은 카카오 계정을 쓰고, 한 계정이 여러 역할(`roles`)을 가질 수 있다. 생산자 앱 API는 `PRODUCER` 역할과 농가 승인(`Farm.approvalStatus = APPROVED`)을 서버에서 확인한다. 두 앱의 주소, 저장소 구조, 백엔드를 하나로 둘지는 P19에서 정한다.

## 데이터 모델

아래는 최소 필드다. 구현에서 필드를 더해도 되지만 이름과 의미는 PRD 용어집을 따른다.

| 엔티티 | 필수 필드 | 관계 |
| --- | --- | --- |
| `User` | id, kakaoId, roles(CONSUMER·PRODUCER·ADMIN 중 복수), name, phone | — |
| `Farm` | id, producerId, name, region, intro, approvalStatus(PENDING/APPROVED/REJECTED) | User(PRODUCER) 1 : 1 Farm |
| `Follow` | consumerId, farmId, createdAt | User(CONSUMER) N : M Farm |
| `Product` | id, farmId, name, variety, description, deliveryWindow(start, end), maxDelayUntil, expectedBrix?, measuredBrix?, grade?, status(DRAFT/PENDING\_APPROVAL/PUBLISHED/CLOSED), shippingFeeType(FREE/SEPARATE), shippingFee?, maxQuantityPerOrder | Farm 1 : N Product |
| `ProductOption` | id, productId, weightKg | Product 1 : N Option |
| `Stage` | id, productId, seq, name, startsAt, endsAt | Product 1 : N Stage |
| `StagePrice` | stageId, optionId, price(원) | Stage × Option → 1 |
| `StageAllocation` | stageId, optionId, quantity, reservedCount | Stage × Option → 1 |
| `Order` | id, consumerId, optionId, stageId, quantity, unitPrice, totalAmount, recipientName, recipientPhone, address, status, consentAt, paidAt?, shippedAt?, deliveredAt?, completedAt? | — |
| `Payment` | id, orderId, method(CARD), provider(MOCK/PG), amount, status, approvedAt | Order 1 : 1 Payment |
| `Refund` | id, orderId, amount, reason, refundedAt | Order 1 : N Refund |
| `Broadcast` | id, farmId, body, attachments?(사진·영상), visibility(PUBLIC/FOLLOWERS), createdAt | Farm 1 : N Broadcast |
| `Thread` | id, farmId, consumerId | (Farm, Consumer)당 1개 |
| `ThreadMessage` | id, threadId, senderType(CONSUMER/PRODUCER/AI), body, sourceRefs?, createdAt | Thread 1 : N |
| `Escalation` | id, threadMessageId, status(OPEN/ANSWERED), answeredAt? | — |
| `ProductDraft` | id, farmId, inputText, output(JSON), missingFields, createdAt | — |

## 데이터 불변 조건

1. `Order.unitPrice`는 주문 시점 `StagePrice`의 복사본이다(PRD R-17).
2. `StageAllocation.reservedCount ≤ quantity`. 주문 생성과 차감은 한 트랜잭션에서 한다(PRD R-06).
3. 주문은 현재 시각이 `Stage.startsAt ~ endsAt` 안인 단계로만 만들 수 있다. 한 상품의 단계 구간은 겹치지 않는다.
4. `totalAmount = unitPrice × quantity`. 금액은 원 단위 정수다. 배송비가 별도(SEPARATE)면 shippingFee를 더해 결제한다(PRD R-20).
5. `deliveryWindow.end ≤ maxDelayUntil`.
6. `Product`는 모든 옵션에 단계 가격이 있고 `deliveryWindow`가 있어야 `PUBLISHED`가 될 수 있다.
7. 생산자는 자기 상품의 단계·가격·물량만 쓸 수 있고(PRD R-18), 다른 농가 상품의 `Stage`, `StagePrice`를 쓸 수 없다.
8. 잔액·포인트·크레딧·충전금 같은 금전성 필드는 만들지 않는다(PRD R-08).

## 주문 상태 (`Order.status`)

| 상태 | 뜻 | 다음 상태 | 바꾸는 주체 |
| --- | --- | --- | --- |
| `PENDING_PAYMENT` | 동의 완료, 결제 전 | RESERVED, CANCELED | 시스템 |
| `RESERVED` | 결제 완료, 출하 대기 (화면: 예약 완료) | PREPARING, REFUNDED | 생산자(수확 시작) / 소비자 취소 / 시스템(R-09) |
| `PREPARING` | 수확·출하 준비 중 | SHIPPED, REFUNDED, PARTIALLY\_REFUNDED | 생산자(출하, FEAT-17) / 소비자 취소 / 시스템(R-09·R-10) |
| `SHIPPED` | 출하됨. 이후 소비자 단순 취소 불가 | DELIVERED | 운영자 |
| `DELIVERED` | 배송 완료(택배 조회로 확인), 구매 확정 대기 | COMPLETED, REFUNDED, PARTIALLY\_REFUNDED | 소비자 구매 확정 / 시스템(배송 완료 8일 경과, PRD R-14) / 운영자(R-11) |
| `COMPLETED` | 구매 확정. 농가 정산 대상(PRD R-14) | — | — |
| `CANCELED` | 결제 없이 종료 | — | — |
| `REFUNDED` | 전액 환불 | — | — |
| `PARTIALLY_REFUNDED` | 일부 환불 후 나머지 배송 진행 | SHIPPED, DELIVERED | 운영자 |

표에 없는 전이는 막는다. 환불되면 해당 수량만큼 `StageAllocation.reservedCount`를 되돌린다.

## 용어 ↔ 코드 식별자

PRD 용어집(14.1)의 용어를 코드에서는 아래 이름으로 쓴다.

| 용어 | 식별자 |
| --- | --- |
| 농가 | `Farm` |
| 상품 | `Product` |
| 중량 옵션 | `ProductOption` |
| 단계 | `Stage` |
| 단계 가격 | `StagePrice` |
| 단계 물량 | `StageAllocation` |
| 당도 | `brix` (`expectedBrix`, `measuredBrix`) |
| 등급 | `grade` |
| 배송 예정 기간 | `deliveryWindow` |
| 최대 지연 기한 | `maxDelayUntil` |
| 예약 주문 | `Order` |
| 결제 | `Payment` |
| 환불 | `Refund` |
| 팔로우 | `Follow` |
| 전체 메시지 | `Broadcast` |
| 대화 | `Thread`, `ThreadMessage` |
| AI 응답 | `ThreadMessage(senderType = AI)` |
| 전달 | `Escalation` |
| AI 상품 초안 | `ProductDraft` |

## 트래킹 플랜

PRD 4장 지표를 계산하는 데 필요한 이벤트다. 이벤트 속성에 개인정보(이름·연락처·주소·메시지 본문)를 넣지 않는다.

| 이벤트 | 발생 시점 | 쓰는 지표 |
| --- | --- | --- |
| `product_viewed` | 상품 상세 열람 | 주문 전환율 |
| `checkout_started` | 주문 시작 | 주문 전환율 |
| `order_paid` | 결제 완료(단계 포함) | 주문 전환율, 이른 단계 주문 비중, 팔로우 → 주문 |
| `order_canceled` | 출하 전 취소 | 출하 전 취소율 |
| `farm_followed` | 팔로우 | 팔로우 → 주문 |
| `broadcast_sent` | 전체 메시지 발송 | 답장률 |
| `reply_sent` | 소비자 답장 | 답장률 |
| `ai_replied` | AI 응답 | AI 자체 해결률 |
| `escalated` | 생산자에게 전달 | AI 자체 해결률 |
| `draft_created` | AI 초안 생성 | AI 초안 게시율 |
| `draft_published` | 초안 게시(수정 필드 수 포함) | AI 초안 게시율 |
