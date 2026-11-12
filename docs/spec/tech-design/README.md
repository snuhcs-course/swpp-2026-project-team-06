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
| `User` | id, kakaoId?(I2 카카오 로그인), isTestAccount(시드 테스트 계정, Mock 로그인 대상), opsTester(운영자가 표시한 운영 검증용 실계정. 테스트 농가 숨기기에서만 테스트 계정처럼 센다, DEV-107), role(CONSUMER·PRODUCER·ADMIN 중 하나, 바꾸지 않음), name, phone, nickname?(I2 온보딩, 농가에 보이는 이름), email?(I2 카카오계정 이메일, 연락용) | (kakaoId, role)당 1개. 같은 사람이라도 소비자·생산자 계정은 따로(ADR 0010). 소비자 카카오 계정은 nickname·name·phone·필수 동의가 모두 있어야 온보딩 완료(FEAT-01 AC-01-12) |
| `UserConsent` | id, userId, kind(TERMS·PRIVACY·AGE14·MARKETING), version, agreed, agreedAt | User 1 : N, (userId, kind)당 1개. 다시 동의하면 버전·시각 갱신(AC-01-14) |
| `ShippingAddress` | id, userId, label?, recipientName(받는 사람), recipientPhone(연락처), postalCode(우편번호), address(주소), addressDetail(상세 주소), isDefault(기본 배송지 여부), createdAt | User 1 : N ShippingAddress (사용자별 저장 배송지, AC-08-5). 계정당 50개, 기본을 지우면 가장 최근 것이 기본(AC-01-15) |
| `Farm` | id, producerId, name, region, intro, mainItems(주 품목), contactPhone(신청 연락처), approvalStatus(PENDING/APPROVED/REJECTED/SUSPENDED), rejectReason?, suspendReason?, appliedAt, decidedAt?, bankName?·accountNumber?·accountHolder?·accountUpdatedAt?(입금 계좌, DEV-68) | User(role = PRODUCER) 1 : 1 Farm. 가입 신청 때 생기고, 신청한 대표자 이름은 `User.name` |
| `Follow` | consumerId, farmId, createdAt | User(role = CONSUMER) N : M Farm |
| `Product` | id, farmId, name, variety, description, deliveryWindow(start, end), maxDelayUntil, expectedBrix?, measuredBrix?, grade?, status(DRAFT/PENDING\_APPROVAL/PUBLISHED/CLOSED), shippingFeeType(FREE/SEPARATE), shippingFee?, maxQuantityPerOrder | Farm 1 : N Product |
| `ProductOption` | id, productId, weightKg | Product 1 : N Option |
| `Stage` | id, productId, seq, name, startsAt, endsAt | Product 1 : N Stage |
| `StagePrice` | stageId, optionId, price(원) | Stage × Option → 1 |
| `StageAllocation` | stageId, optionId, quantity, reservedCount(예약 박스 수) | Stage × Option → 1. 상품 응답의 `reservedCount`(예약한 사람 수, 중복 없음)와 다르다. 그건 결제된 주문의 소비자 수로 계산한다 |
| `Order` | id, orderNo(`FC-MMDD-NNNN`, NNNN 무작위 4자리·UNIQUE, 입금자명), consumerId, optionId, stageId, quantity, unitPrice, totalAmount, recipientName(받는 사람), recipientPhone(연락처), postalCode(우편번호), address(주소), addressDetail(상세 주소), deliveryNote?(배송 메모, 100자 이하), status, consentAt, consentVersion, paidAt?, shippedAt?, carrier?(택배사 코드: CJ/EPOST/HANJIN/LOTTE/LOGEN/ETC), trackingNumber?(송장 번호, 50자 이하), deliveredAt?, completedAt?, depositDueAt?(입금 기한)·depositReportedAt?(소비자 ‘입금했어요’)·depositConfirmedBy?(PRODUCER/ADMIN)·cancelReason?(DEV-68) | 배송지 사본(주문 시점 복사). `ShippingAddress`를 참조하지 않는다. 배송 메모는 주소와 같은 개인정보로 다룬다(R-15) |
| `Payment` | id, orderId, method(BANK_TRANSFER; 과거 행은 CARD), provider(FARM_ACCOUNT; 과거 행은 MOCK), amount, status, approvedAt(=입금 확인 시각) | Order 1 : 1 Payment. 입금 확인 때 만들어진다(DEV-68) |
| `Refund` | id, orderId, amount, reason, actor, actorUserId?, managerEventId?, createdAt, settledAt?(농가가 입금했던 계좌로 송금을 마친 시각, DEV-68) | Order 1 : N Refund |
| `ProducerDecisionHistory` | farmId, applicationAt, decision, reason?, managerId, decidedAt | Farm 1 : N Decision |
| `ManagerEvent` | action/target, original body(private), sanitized summary, status, retry metadata | Audit only; idempotency remains `IdempotencyRecord` |
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

## UAT 데이터 (DEV-305)

운영 UAT는 데모 시드가 아니라 `python -m app.core.seed_uat [--commit]`이 넣는 전용 테스트 계정으로 한다(11/10 결정). 운영 데이터 정리(DEV-304) 뒤에 사람이 넣는다. 기본은 미리보기(넣어 본 뒤 롤백)이고, UAT ID(표지 `u-uat-c1`)가 하나라도 있으면 거부한다.

| 앱 | 계정 | 농가 | 상태 | 데이터 |
| --- | --- | --- | --- | --- |
| 소비자 | UAT 소비자 1~3 (`u-uat-c1..c3`) | — | — | 닉네임 `UAT소비자N`, 가짜 연락처, 기본 배송지 1개, farmclub 문의방 |
| 생산자 | UAT 생산자 1 (`u-uat-p1`) | UAT 농가 1 (`f-uat-1`) | 승인 → 테스트 농가 숨김(SUSPENDED) | 판매 중 상품 2개(하우스 감귤 5kg/10kg, 레드향 3kg), 입금 계좌, farmclub 문의방 |
| 생산자 | UAT 생산자 2 (`u-uat-p2`) | UAT 농가 2 (`f-uat-2`) | 승인 → 테스트 농가 숨김(SUSPENDED) | 판매 중 상품 1개(노지 감귤 5kg/10kg), 입금 계좌, farmclub 문의방 |
| 생산자 | UAT 생산자 3 (`u-uat-p3`) | UAT 농가 3 (`f-uat-3`) | PENDING(확인 중) | — |

- 모두 `isTestAccount = true`이고 테스트 로그인 목록에 오른다. `MOCK_LOGIN_ENABLED`가 꺼져 있으면 아무도 들어오지 못한다(ADR 0009). 켜고 끄는 순서와 정리는 루트 `README.md` 'Server on Railway'.
- 상품 기간은 실행한 날(앱 기준일 `today()`, KST)부터 1단계 14일 → 2단계 21일로 이어지고, 받는 시기는 실행일 + 40~50일, 최대 지연 기한은 + 60일이다. 기간 물량 합은 승인 물량(1,000kg·200kg·800kg)보다 작다.
- 승인 농가 2곳은 넣자마자 '테스트 농가 숨김'(DEV-93, `retire_test_farm.retire_in`, 감사 이벤트 `test_farm_retired`)으로 둔다(PM 결정 11/10). 공개 목록·상세에 없고, UAT 생산자는 숨김 사유가 적힌 정지 안내를 본다. UAT를 시작할 때 관리자 웹 '다시 공개'나 `retire_test_farm --restore --commit`으로 열고, 끝나면 다시 숨긴다.
- 주문·메시지는 넣지 않는다(문의방 환영 메시지만). 이름·연락처·주소는 실제 사람처럼 보이지 않는 가짜 값이다.

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
| `PENDING_PAYMENT` | 동의 완료, 입금 안내 전. 물량을 잡지 않는다 | AWAITING_DEPOSIT, CANCELED | 시스템 |
| `AWAITING_DEPOSIT` | 입금 안내를 받음. 물량을 잡고 있고 입금 기한(안내 + 24시간)이 있다 (화면: 입금 확인 중, DEV-68) | RESERVED, CANCELED | 생산자·운영자 입금 확인 / 소비자 취소(환불 없음) / 시스템(기한 만료, R-28) |
| `RESERVED` | 입금 확인 완료(결제일 = 확인 시각), 출하 대기 (화면: 예약 완료) | PREPARING, REFUNDED | 생산자 기존 API(현재 UI 없음, 자동 전이 없음) / 소비자 취소 / 시스템(R-09) |
| `PREPARING` | 수확·출하 준비 중 | SHIPPED, REFUNDED | 생산자(출하, FEAT-17) / 소비자 취소 / 시스템(R-09·R-10) |
| `SHIPPED` | 출하됨. 이후 소비자 단순 취소 불가 | DELIVERED | 운영자 |
| `DELIVERED` | 배송 완료(택배 조회로 확인), 구매 확정 대기 | COMPLETED, REFUNDED | 소비자 구매 확정 / 시스템(배송 완료 8일 경과, PRD R-14) / 운영자(R-11) |
| `COMPLETED` | 구매 확정. 농가 정산 대상(PRD R-14) | — | — |
| `CANCELED` | 입금 없이 종료(입금 전 취소 또는 기한 초과, `cancelReason`). 잡았던 물량은 한 번 돌려준다 | — | — |
| `REFUNDED` | 전액 환불 | — | — |
| `PARTIALLY_REFUNDED` | 과거 데이터 읽기 호환용. 신규 부분 환불은 주문 상태를 바꾸지 않고 `Payment.status`에만 기록 | — | — |

표에 없는 전이는 막는다. 부분 환불은 주문 흐름과 물량을 바꾸지 않는다. 최종 전액 환불이면 출하 전 남은 수량만 한 번 되돌리고, 출하 후에는 되돌리지 않는다. 환불 송금은 농가가 소비자가 입금했던 계좌로 직접 하고, 앱은 `Refund.settledAt`으로 완료만 기록한다(DEV-68).

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
| `draft_created` | AI 초안 생성. 생산자 앱이 요청한 AI 채우기가 끝날 때 요청마다 최대 한 번(속성: flow, result, durationMs, 자료 경로면 productId, DEV-312) | AI 초안 게시율(result success·partial만), 파일럿: AI 초안 재시도 수 |
| `draft_published` | 초안 게시(수정 필드 수 포함). 공개는 운영자 승인 뒤라 서버 몫이고 아직 보내지 않는다 | AI 초안 게시율 |
| `reaction_toggled` | 소식 좋아요 켬·끔(속성: on/off) | 소식 반응(참고 지표, I1은 측정만) |
| `checkout_submitted` | 주문서 제출 → 입금 안내(주문 생성·입금 대기, 속성: productId, orderId, quantity) | 주문 전환율(퍼널 단계) |
| `deposit_reported` | 입금 안내에서 ‘입금을 마쳤어요’(속성: orderId) | 주문 전환율(퍼널 단계), 파일럿: 입금 확인 대기 |
| `product_editor_opened` | 생산자 앱 새 상품 화면(SCR-24)을 열 때. 자료 분석 경로는 상품마다 화면에서 한 번, 글 경로는 화면을 열 때(속성: flow, 자료 경로면 productId) | 파일럿: 상품 등록 소요 시간 |
| `draft_requested` | AI 채우기 요청(속성: flow, trigger, 자료 경로면 productId). 자료 경로는 서버가 받아들인 뒤, 글 경로는 응답을 받은 뒤 입력 검증 오류가 아닐 때 | 파일럿: AI 초안 재시도 수 |
| `sale_start_requested` | 판매·가격 ‘판매 시작 요청’ 또는 물량 신청 성공(속성: productId, screen, requestKind) | 파일럿: 상품 등록 소요 시간 |
| `deposit_decided` | 출하 처리에서 입금 승인·미승인 성공(속성: orderId, decision, 미승인이면 reasonKind·cancelOrder. 사유 글자 없음) | 파일럿: 주문 처리 시간 |
| `invoice_saved` | 송장 시트 저장 성공(속성: orderId, hasCarrier, afterShipped. 택배사·송장 번호 없음) | 파일럿: 주문 처리 시간(참고) |
| `order_shipped` | ‘…건 출하로 바꾸기’에서 주문 한 건이 출하로 바뀔 때마다(속성: orderId, hasCarrier) | 파일럿: 주문 처리 시간 |
| `producer_reply_sent` | 생산자 채팅 답장 전송 성공, ‘답이 맞아요’ 성공(속성: kind. 본문·소비자 ID 없음, farmclub 문의방 제외) | 파일럿: 전달 질문 응대(참고) |
| `form_error_shown` | 생산자 앱 화면 검사·서버 검증 오류 안내가 보일 때(속성: screen, code. 안내 글자 없음) | 파일럿: 오류 안내 횟수와 위치 |

앱이 보내는 것과 서버가 보내는 것(ADR 0005, DEV-71):
- 앱(`packages/analytics`): 화면 전환마다 `$pageview`(네이티브는 `$screen`), `product_viewed`(productId, farmId), `checkout_started`(productId), `checkout_submitted`, `deposit_reported`. 세션 녹화·히트맵도 앱이 켠다.
- 생산자 앱(DEV-312): `product_editor_opened`·`draft_requested`·`draft_created`·`sale_start_requested`·`deposit_decided`·`invoice_saved`·`order_shipped`·`producer_reply_sent`·`form_error_shown`. 행동 이벤트(`sale_start_requested`·`deposit_decided`·`invoice_saved`·`order_shipped`·`producer_reply_sent`, 자료 경로 `draft_requested`)는 서버 성공 응답 뒤에만 보낸다(출하 전 송장은 화면 저장 뒤). `deposit_decided`·`order_shipped`는 생산자 행동 시각으로만 쓰고, 입금 확인·취소 집계는 서버 `order_paid`·`order_canceled`만 쓴다(겹쳐 세지 않음, ADR 0005). `draft_created`는 앱이 보내고 서버는 보내지 않는다.
- 서버(`server/app/analytics`, DEV-100): `order_paid`(무통장 입금에서는 생산자·운영자의 입금 확인 시점, DEV-68)·`order_canceled`·`farm_followed` 등 확정 사실.
- 구매 퍼널(상품 → 주문서 → 입금 안내 → 입금했어요): `product_viewed` → `checkout_started` → `checkout_submitted` → `deposit_reported`. 서버 이벤트가 붙으면 입금 확인 단계 `order_paid`를 뒤에 더한다.
- 사용자 구분은 내부 `userId`(identify)와 사람 속성 `app`·`role`·`isTestAccount`만. 이벤트 속성은 위 표의 ID·수량·결과·enum·불리언·ms만 보내고, URL의 쿼리는 보내기 전에 지운다.
- enum 속성은 아래 값만 나간다(`packages/analytics/src/privacy.ts` `ENUM_VALUES`, 그 밖의 값은 `cleanProps`가 버림). `flow`: source(자료 분석 새 상품 화면)·text(글로 초안, 자료 분석이 꺼진 서버). `trigger`: start·retry. `result`: success·partial·failed·canceled. `decision`: approved·rejected. `reasonKind`: preset·custom. `requestKind`: initial(승인 물량 0)·increase. `kind`: forwarded(열린 전달 질문을 인용해 답함)·check_confirmed(‘답이 맞아요’)·check_corrected(확인 요청된 AI 답변을 인용해 바로잡음)·plain(그 밖, 인용 없는 답장 포함. 서버는 인용한 메시지로만 전달을 닫는다). `screen`: product_new·product_edit·product_sell·product_sales·ship. `code`: variety_required·photo_required·options_invalid·delivery_invalid·prices_invalid·shipping_invalid·quantity_invalid·deposit_account_required·carrier_required·tracking_too_long·reason_required·other.
- 세션 녹화: 입력칸은 모두 가린다. 화면 대부분이 개인정보이거나 입력 화면인 곳은 화면 글자를 모두 가린다: 소비자 `/chats`·`/me/profile`·`/me/addresses`·`/checkout/*/address`·`/orders/*/inquiry`·`/onboarding`·`/auth`, 생산자 `/chats`·`/ship`·`/pending`·`/apply`·`/farm/account`·`/auth`. 그 밖의 화면(내 정보·주문 목록·주문 상세·주문서·입금 안내 등)은 법적으로 개인정보인 글자만 가린다: 소비자 이름·연락처·이메일, 받는 사람·주소·배송 메모(R-15), 송장 번호(조회하면 받는 사람이 드러남), 입금 계좌번호·예금주, 채팅·소식방 메시지, 농가 프로필의 입금 계좌 줄. 판매자 정보(상호·대표·지역·연락처)는 전자상거래법상 공개 표시 항목이고, 취소·환불·입금 미확인 사유는 개인정보가 아니어서 가리지 않는다(DEV-104). 네트워크·콘솔은 녹화하지 않는다.

### 파일럿 지표

실제 농가 2곳 파일럿(UAT 뒤, 다음 이터레이션 베타 전)에서 생산자 쪽을 재는 지표다(DEV-312). 이벤트는 위 표, 한 사람은 내부 `userId`(distinct_id)다. 테스트 계정(`isTestAccount`)과 공식 도메인 밖 접속(DEV-125)은 이미 빠진다.

**읽는 규칙**: 참여 농가가 2곳뿐이라 평균·중앙값·신뢰구간을 내지 않는다. 농가(참여자)마다 숫자와 건별 목록을 그대로 보고하고, 두 농가를 합치지 않는다. 0건·결측은 0으로 메우지 않고 '없음'으로 적는다.

| 지표 | 계산식 | 쓰는 이벤트 | 한계 |
| --- | --- | --- | --- |
| 상품 등록 소요 시간 | 자료 경로: 상품(productId)마다 첫 `product_editor_opened` → 같은 상품의 첫 `sale_start_requested`(requestKind initial) 시각 차. 글 경로: 사람마다 `product_editor_opened`(flow text) 하나를 구간 시작으로 보고, 다음 열림 전까지의 첫 `sale_start_requested`(initial)까지 시각 차 | `product_editor_opened`, `sale_start_requested` | 글 경로는 상품 ID가 없어 같은 사람이 새로고침하면 구간이 나뉜다. 임시 저장 뒤 며칠 지나 요청하면 그 시간도 들어가므로 건별로 본다 |
| AI 초안 재시도 수 | 상품(자료 경로)이나 글 경로 구간마다, 첫 `draft_created`(result success) 전까지의 `draft_requested` 수 − 1. 성공이 없으면 전체 요청 수를 '성공 못 함'으로 따로 적는다. 함께 보는 값: trigger retry 수, result별 건수, durationMs 목록 | `draft_requested`, `draft_created` | 끝나기 전에 화면을 떠나면 `draft_created`가 없다(자료 경로는 서버에서 계속 돈다). 자료 경로 durationMs는 다음 상태 확인(2.5초 간격)에서 끝을 본 시각까지라 약 2.5초(간격과 응답 시간)만큼 길 수 있고, canceled의 durationMs는 생산자가 취소하기까지(개인정보 확인 대기 포함) 걸린 시간을 포함한다. 글 경로는 응답을 기다리다 떠난 요청이 잡히지 않는다 |
| 오류 안내 횟수와 위치 | 사람·screen·code별 `form_error_shown` 수. 같은 화면 방문(`$pageview`) 대비 비율도 함께 적는다 | `form_error_shown`, `$pageview` | 연결 끊김·서버 오류(5xx)·이미 바뀐 상태(409, 단 생산자가 고칠 409 — 판매 한도가 승인 물량을 넘거나 예약량보다 작음은 quantity_invalid, 입금 계좌 없음은 deposit_account_required로 센다), 채팅 전송 실패, 새 상품 열기 실패는 세지 않는다. 서버 칸으로 못 나눈 오류는 other(새 상품 화면의 권한·없음 같은 4xx도 들어간다). 출하 처리 화면은 환불 완료·미승인의 실패·사유 누락 안내도 센다. 새 상품 화면을 나가기 전 임시 저장 실패 안내는 세지 않는다 |
| 주문 처리 시간 | 같은 orderId의 `deposit_decided`(approved) → `order_shipped` 시각 차. 참고로 입금 확인 대기 = 소비자 `deposit_reported` → `deposit_decided` | `deposit_reported`, `deposit_decided`, `order_shipped` | 운영자가 관리 API로 입금을 확인한 주문은 앱 이벤트가 없어 빠진다. 응답만 잃은 출하를 다시 누르면 409라 `order_shipped`가 빠질 수 있다. 소비자가 ‘입금을 마쳤어요’를 누르지 않은 주문은 대기 시간이 없다 |
| 막힌 지점 | 한 사람의 세션 안에서 (1) 같은 경로 `$pageview`가 30분 안에 3번 이상, (2) 다음 단계로 가지 않고 앞 화면으로 돌아간 `$pageview` 순서(예: `/products/:id/sell` → `/products/source-analysis` → 다시 sell), (3) `form_error_shown` 뒤 같은 화면에 머문 경우를 경로·화면별로 센다. 녹화가 있으면 그 세션을 열어 확인한다 | `$pageview`(네이티브 `$screen`), `form_error_shown`, `product_editor_opened`, `draft_*` | URL 쿼리를 지우므로 `/products/source-analysis`는 새 상품 화면과 예전 자료 작업 화면이 같은 경로다. 한 화면 안 단계(사진 → AI → 다음)는 pageview로 안 보여 `draft_*`·`form_error_shown`으로 보완한다. 생산자 `/ship`·`/chats`는 녹화 글자를 모두 가린다 |
| 전달 질문 응대(참고) | 사람별 `producer_reply_sent` kind별 수. 답장 수는 check_confirmed(‘답이 맞아요’, 메시지 아님)를 빼고 센다 | `producer_reply_sent` | kind는 화면 값으로 맞춘다: 전달 목록에 질문 메시지 ID가 없어, 서버가 전달할 때 질문과 전달을 같은 시각으로 저장하는 점으로 인용한 질문의 열린 전달을 찾는다. 아직 불러오지 않은 옛 메시지 인용, 응답을 잃은 뒤 ‘다시 보내기’(그사이 전달이 닫혀 보임)는 plain이 될 수 있다 |

AI 초안 게시율은 `draft_published`(서버)가 없어 이번 파일럿에서 계산하지 않는다.

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
