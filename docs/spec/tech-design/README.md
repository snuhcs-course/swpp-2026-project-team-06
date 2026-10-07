> **스펙 1.2 보충**: 아래 기존 모델·시드에 [공통 계약](../contracts-1.2.md)을 함께 적용한다. stages/stageId는 유지하지만 화면은 날짜 기반이다. 이 문서는 마이그레이션 구현 완료를 의미하지 않는다.

> 공급 물량·승인·가격의 현재 기준: [스펙 1.4](../capacity-1.4.md). 기존 박스 한도/가격 재승인 계약을 대체한다.

# 기술 설계 초안

PRD에서 옮겨 온 데이터 모델과 주문 상태 초안이다. 기술 스택 확정(P19) 때 기술 설계 문서로 정식 작성하고, PRD의 R·M 규칙을 구현 단위로 풀어 쓴다.

기술 스택과 레포 구조는 [stack.md](./stack.md), 결정 기록은 [adr/](./adr/)에 둔다.

## 앱 구성

프론트엔드는 소비자 앱과 생산자 앱 두 개의 모바일 웹이다(PRD N-01, IA 2장). 계정은 앱별로 따로다([ADR 0010](./adr/0010-separate-accounts.md)). 계정 하나는 역할(`role`) 하나이고, 같은 사람이라도 소비자 계정과 생산자 계정은 둘이다(I1은 앱별 시드 테스트 계정 Mock 로그인 [ADR 0009](./adr/0009-mock-login.md), I2부터 카카오 [ADR 0003](./adr/0003-auth-kakao.md)). 소비자 API는 `CONSUMER`, 생산자 앱 API는 `PRODUCER` 역할과 농가 승인(`Farm.approvalStatus = APPROVED`)을 서버에서 확인하고, 다른 앱 계정의 토큰은 403 `WRONG_APP`이다. 두 앱의 주소, 저장소 구조는 P19에서 정한다. 백엔드는 FastAPI 서버 하나다([ADR 0007](./adr/0007-backend-fastapi.md), [stack.md](./stack.md)).

## 데이터 모델

아래는 최소 필드다. 구현에서 필드를 더해도 되지만 이름과 의미는 PRD 용어집을 따른다.

| 엔티티 | 필수 필드 | 관계 |
| --- | --- | --- |
| `User` | id, kakaoId?(I2 카카오 로그인), isTestAccount(시드 테스트 계정, Mock 로그인 대상), role(CONSUMER·PRODUCER·ADMIN 중 하나, 바꾸지 않음), name, phone | (kakaoId, role)당 1개. 같은 사람이라도 소비자·생산자 계정은 따로(ADR 0010) |
| `ShippingAddress` | id, userId, recipientName(받는 사람), recipientPhone(연락처), postalCode(우편번호), address(주소), addressDetail(상세 주소), isDefault(기본 배송지 여부), createdAt | User 1 : N ShippingAddress (사용자별 저장 배송지, AC-08-5) |
| `Farm` | id, producerId, name, region, intro, mainItems(주 품목), contactPhone(신청 연락처), approvalStatus(PENDING/APPROVED/REJECTED/SUSPENDED), rejectReason?, suspendReason?, appliedAt, decidedAt? | User(role = PRODUCER) 1 : 1 Farm. 가입 신청 때 생기고, 신청한 대표자 이름은 `User.name` |
| `Follow` | consumerId, farmId, createdAt | User(role = CONSUMER) N : M Farm |
| `Product` | id, farmId, name, variety, description, deliveryWindow(start, end), maxDelayUntil, expectedBrix?, measuredBrix?, grade?, status(DRAFT/PENDING\_APPROVAL/PUBLISHED/CLOSED), shippingFeeType(FREE/SEPARATE), shippingFee?, maxQuantityPerOrder | Farm 1 : N Product |
| `ProductOption` | id, productId, weightKg | Product 1 : N Option |
| `Stage` | id, productId, seq, name, startsAt, endsAt | Product 1 : N Stage |
| `StagePrice` | stageId, optionId, price(원) | Stage × Option → 1 |
| `StageAllocation` | stageId, optionId, quantity, reservedCount(예약 박스 수) | Stage × Option → 1. 상품 응답의 `reservedCount`(예약한 사람 수, 중복 없음)와 다르다. 그건 결제된 주문의 소비자 수로 계산한다 |
| `Order` | id, consumerId, optionId, stageId, quantity, unitPrice, totalAmount, recipientName(받는 사람), recipientPhone(연락처), postalCode(우편번호), address(주소), addressDetail(상세 주소), deliveryNote?(배송 메모, 100자 이하), status, consentAt, consentVersion, paidAt?, shippedAt?, carrier?(택배사 코드: CJ/EPOST/HANJIN/LOTTE/LOGEN/ETC), trackingNumber?(송장 번호, 50자 이하), deliveredAt?, completedAt? | 배송지 사본(주문 시점 복사). `ShippingAddress`를 참조하지 않는다. 배송 메모는 주소와 같은 개인정보로 다룬다(R-15) |
| `Payment` | id, orderId, method(CARD), provider(MOCK/PG), amount, status, approvedAt | Order 1 : 1 Payment |
| `Refund` | id, orderId, amount, reason, refundedAt | Order 1 : N Refund |
| `Broadcast` | id, farmId, body, attachments?(사진·영상), visibility(PUBLIC/FOLLOWERS), createdAt | Farm 1 : N Broadcast. 화면 이름은 ‘소식’ |
| `Reaction` | broadcastId, userId, createdAt | Broadcast × User → 0 또는 1(한 사람 한 번). 종류는 ‘좋아요’ 하나라 필드 없음. 볼 수 있는 소식에만(FEAT-15) |
| `Thread` | id, farmId, consumerId | (Farm, Consumer)당 1개. 화면 이름은 ‘채팅’ |
| `ThreadMessage` | id, threadId, senderType(CONSUMER/PRODUCER/AI), body, sourceRefs?, createdAt | Thread 1 : N |
| `Escalation` | id, threadMessageId, status(OPEN/ANSWERED), answeredAt? | — |
| `ProductDraft` | id, farmId, inputText, output(JSON), missingFields, createdAt | — |

## 시드 데이터 (I1 데모)

서버 시드와 앱 Mock은 이 표 하나를 따른다(screens.md 결정 36). 오늘은 2026년 10월 7일(수)이고, 요일은 날짜에서 계산한다(10월 5일 월, 6일 화, 7일 수).

**테스트 계정**(`isTestAccount = true`, 앱별, ADR 0009·0010)

| 앱 | 이름 | 역할 | 농가 | 농가 상태 |
| --- | --- | --- | --- | --- |
| 소비자 | 김민지 | CONSUMER | — | — |
| 소비자 | 이서준 | CONSUMER | — | — |
| 생산자 | 강영수 | PRODUCER | 강씨네 귤밭(제주 서귀포, 팔로워 128명) | APPROVED |
| 생산자 | 오미숙 | PRODUCER | 위미 감귤농장(제주 서귀포시 남원읍) | PENDING(확인 중) |
| 생산자 | 박순자 | PRODUCER | 하례 귤밭 | REJECTED(반려 사유 있음) |
| 생산자 | 최태호 | PRODUCER | 신례 감귤원 | SUSPENDED(정지 사유 있음) |
| 생산자 | 신규 생산자 | PRODUCER | 없음(가입 신청 시험용) | — |

**대표 상품과 주문**(강씨네 귤밭 · 하우스 감귤)

| 항목 | 값 |
| --- | --- |
| 상품 | 옵션 5kg / 10kg, 받는 시기 11월 10일~20일, 최대 지연 기한 11월 30일, 예상 당도 12Brix, 실측 11.8Brix(10월 5일), 당도 기록 5회 |
| 1단계 (10월 1일~12일, 지금) | 5kg 29,000원 · 80박스 / 10kg 55,000원 · 20박스 |
| 2단계 (10월 13일~11월 5일) | 5kg 33,000원 · 60박스 / 10kg 62,000원 · 25박스 |
| 3단계 (11월 6일~9일) | 5kg 36,000원 · 40박스 / 10kg 68,000원 · 15박스 |
| 예약 | 37명(`reservedCount`), 40건. 5kg 34건 38박스(42박스 남음), 10kg 6건 6박스(14박스 남음) |
| 주문 상태 | 예약 완료 30건, 출하 준비 7건, 출하 3건 (합 40) |
| 김민지 주문 | FC-1007-0042, 5kg × 2, 10월 7일 예약, 예약 완료(30건 안). 출하 준비 목록 예시는 10월 6일까지 들어온 주문만 |
| 생산자 현황 | 답할 질문 3, 출하할 주문 7, 승인 대기 상품 1 → 오늘 할 일 11 |

## 데이터 불변 조건

1. `Order.unitPrice`는 주문 시점 `StagePrice`의 복사본이다(PRD R-17).
2. `StageAllocation.reservedCount ≤ quantity`. 주문 생성과 차감은 한 트랜잭션에서 한다(PRD R-06).
3. 주문은 현재 시각이 `Stage.startsAt ~ endsAt` 안인 단계로만 만들 수 있다. 한 상품의 단계 구간은 겹치지 않는다.
4. `totalAmount = unitPrice × quantity`. 금액은 원 단위 정수다. 배송비가 별도(SEPARATE)면 shippingFee를 더해 결제한다(PRD R-20).
5. `deliveryWindow.end ≤ maxDelayUntil`.
6. `Product`는 모든 옵션에 단계 가격이 있고 `deliveryWindow`가 있어야 `PUBLISHED`가 될 수 있다.
7. 생산자는 자기 상품의 단계·가격·물량만 쓸 수 있고(PRD R-18), 다른 농가 상품의 `Stage`, `StagePrice`를 쓸 수 없다.
8. 잔액·포인트·크레딧·충전금 같은 금전성 필드는 만들지 않는다(PRD R-08).
9. `Follow.consumerId`, `Order.consumerId`, `Thread.consumerId`는 `role = CONSUMER` 계정만, `Farm.producerId`는 `role = PRODUCER` 계정만 가리킨다(ADR 0010).

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
| 소식(전체 메시지) | `Broadcast` |
| 좋아요 | `Reaction` |
| 채팅(대화) | `Thread`, `ThreadMessage` |
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
| `broadcast_sent` | 소식 올리기 | 질문률 |
| `chat_message_sent` | 소비자가 채팅으로 질문(이전 이름 `reply_sent`) | 질문률 |
| `ai_replied` | AI 응답 | AI 자체 해결률 |
| `escalated` | 생산자에게 전달 | AI 자체 해결률 |
| `draft_created` | AI 초안 생성 | AI 초안 게시율 |
| `draft_published` | 초안 게시(수정 필드 수 포함) | AI 초안 게시율 |
| `reaction_toggled` | 소식 좋아요 켬·끔(속성: on/off) | 소식 반응(참고 지표, I1은 측정만) |

## 스펙 1.2 데이터·트랜잭션

| 자원 | 추가 계약 |
| --- | --- |
| Product | approvedSupplyGrams, salesLimitGrams, salesPaused, version. reservedGrams/shippedGrams/remainingGrams는 주문 스냅샷·반환량에서 계산. 한 주문 박스 상한은 별개 |
| Stage/Allocation | stable stageId, 단일 판매값과 주문 가격·중량 스냅샷. 예약 기간 날짜/삭제 잠금, 옵션별 가격 엄격 증가 |
| Thread | (farmId,consumerId) 유일, aiMode·version·양쪽 읽음 위치. 전달 질문 없는 대화도 조회 |
| RoomReply | farmId·consumerId·body·createdAt, 방송과 구분. 소비자별 권한 필터 뒤 페이지 조회 |
| FarmAiSettings | 농가별 버전·enabled·원칙·FAQ·추가 전달 주제, 변경 이력 |
| OrderInquiry | 주문·대화 참조, type·text·status·version·처리 시각. 환불 상태와 독립 |
| PrivateAttachment | 업로더·귀속 주문/대화·MIME·크기·private storage key·만료. 공개 방송 파일과 분리 |

결제와 판매 설정은 상품 → 기간 옵션 순서로 잠근다. 수량 차감/반환, 상태 변경, 멱등 결과를 같은 트랜잭션에 저장한다. 취소·미공급 반환은 누적 반환량으로 중복을 막는다. AI 응답은 저장 직전 farm.enabled와 Thread.aiMode를 다시 확인하며 직접 답변/모드 변경과 직렬화한다. 작업 시작 시 Thread/FarmAiSettings 버전을 캡처하고 저장 시 동일성을 검사해 OFF→ON·HUMAN→AUTO 왕복 후 오래된 답변도 폐기한다. 아직 답하지 않은 질문은 직접 응대 대상으로 남긴다.

기존 데이터 이관·초기 한도·읽음·AI 모드·승인값 분리는 계약 7장이다. 시드에 상품 총 한도 도달, 판매 중지, 기간 공백, 두 소비자의 비공개 답장, HUMAN/OFF, 주문 사진 문의를 추가하되 시계를 주입한다. 승인/대기 값을 구분할 수 없는 기존 데이터는 조용히 덮어쓰지 않는다.

## 스펙 1.4 모델 변경

CapacityRequest에 상품/요청량/초기·증액 구분/상태/사유/버전/처리 시각을 저장한다. Product에는 승인·실제 판매 g 한도, Order에는 unitWeightGrams·releasedQuantity를 저장한다. 상품별 PENDING 신청 하나와 원자적 결제/취소/출하를 보장한다. 상세 스키마·API·이관은 [계약](../capacity-1.4.md)을 따른다.
