# server/app/messaging spec

> 구현하는 기능: FEAT-12(소식·채팅), FEAT-13(채팅·전달 쪽), FEAT-15(소식 목록·좋아요) · 지키는 규칙: M-01, M-02, M-03, M-04, M-05, M-06, M-07, M-08, M-09, M-14, M-16, N-04, N-05, N-06 (M-17은 I2) · 인수 조건: AC-12-1~5, AC-13-1~4(AC-13-5는 I2), AC-15-1~5
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-12·13·15, rules.md (여기에 다시 쓰지 않는다)
> API 원본: docs/spec/screens.md 7.2 messaging

## 역할
농가의 소식(공개·팔로워 전용), 소식 좋아요, 소비자와 농가의 1:1 채팅, AI 응답 저장, 농가에 전달(질문함), 생산자 답변, 연락처 가림. 운영자의 메시지 삭제. 화면 용어는 ‘소식’(Broadcast)과 ‘채팅’(Thread)이다.

## 구조
- `router.py` — prefix `/messaging`(앱에서는 `/api/messaging`). 소식 `/news`, 농가별 공개 소식 `/farms/{farmId}/news`, 좋아요 `/news/{broadcastId}/reaction`, 채팅 `/chats`, 질문함 `/questions`. 관리 API `/admin/messages/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Broadcast`, `Reaction`, `Thread`, `ThreadMessage`, `Escalation`
- `schemas.py` — 소식·좋아요·채팅·질문함 입출력
- `service.py` — 소식 올리기, 팔로우한 농가의 소식 목록, 좋아요 켬·끔, 채팅 시작(자동 팔로우), 질문 → AI 응답 시도 → 전달, 연락처 가림(M-16)

## 계약
- `Thread`는 (Farm, Consumer)당 1개. `ThreadMessage.senderType`은 CONSUMER/PRODUCER/AI(farmclub 문의 대화방은 OPERATOR, 아래 구현 결정), AI 응답은 `senderType = AI`와 근거(`sourceRefs`)를 가진다(M-08). 채팅에는 소식이 섞이지 않는다(AC-12-5).
- 소식 탭(`GET /news`)은 그 사용자가 팔로우한 농가의 공개·팔로워 전용 소식, 농가 페이지(`GET /farms/{farmId}/news`)는 공개 소식만(M-14, AC-15-1).
- `Reaction`은 (broadcastId, userId) 유일. 그 사용자가 볼 수 있는 소식(공개, 또는 팔로우한 농가의 팔로워 전용)에만 만들 수 있고, 아니면 404(AC-15-5). 응답에 반응 수와 내 반응을 담는다.
- 채팅은 팔로우한 농가와만(M-04). `POST /chats`(`farmId`)는 팔로우하지 않았으면 farms service로 팔로우를 먼저 만들고 대화를 연다(AC-12-4). 메시지 경로는 `/chats/{farmId}/messages`이고(대화가 농가·소비자당 1개), 팔로우하지 않은 농가면 403. 채팅 목록은 팔로우 중인 농가만.
- 채팅은 그 소비자와 농가만 본다(M-02). 남의 대화는 404.
- 첨부: 소식 사진 최대 5장(장당 10MB)·영상 1개(60초, 100MB), 채팅 사진 최대 3장(장당 10MB). 서버에서 다시 검사하고 넘으면 413(stack.md 6장 FQ-05). 저장소(R2)는 기능 이슈에서.
- AI 답변 확인 요청(M-17, AC-13-5, I2: 옛 이름 ‘틀렸어요’)은 `POST /chats/{farmId}/messages/{messageId}/report`. 농가의 ‘답이 맞아요’는 `POST /producer/chats/{consumerId}/messages/{messageId}/confirm`, 바로잡기는 그 AI 답변을 인용한 생산자 답장(DEV-296, AC-13-11~13).
- 다른 모듈과의 경계
  - ai: 질문이 오면 ai 어댑터에 문의 응답을 요청한다. 시간 초과·실패·답할 수 없음은 `Escalation`(전달)으로 처리한다(N-04, M-06). 연락처 가림은 이 모듈, AI 전송 전 개인정보 제거는 ai 모듈이 한다.
  - farms: 팔로워 목록(M-01), 팔로우 여부 확인, 자동 팔로우는 farms service를 부른다.
  - catalog: AI 근거용 상품 정보는 catalog service에서 받는다.
  - analytics: `broadcast_sent`, `chat_message_sent`(채팅 질문), `reaction_toggled`, `ai_replied`, `escalated` 서버 이벤트(본문 없이, N-05).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우터 prefix는 `/messaging` | 소식·채팅을 한 모듈이 맡음 | — |
| 2026-10-07 | 좋아요는 `Reaction`(broadcastId, userId 유일), 종류 필드 없음 | P22 결정: 반응은 ‘좋아요’ 하나, 한 사람 한 번 | AC-15-3, AC-15-5 |
| 2026-10-07 | 채팅 시작 때 팔로우하지 않았으면 자동 팔로우 | P22 결정, M-04 유지 | AC-12-4 |
| 2026-10-07 | 홈 소식 미리보기 제공을 없애고, 질문 목록 응답에 그 소비자 채팅(`thread`)을 담아 소비자별 채팅 하위 화면이 쓴다. 채팅·소식 반응은 소비자 계정만 | SWPP-81(screens.md 1.1 결정 23·31) | AC-13-2 |
| 2026-10-08 | 1.1 Must는 농가 공개 소식 조회만. 좋아요 수는 `Broadcast.reaction_count`에 둔다. cursor는 (createdAt, id) | screens.md 7.2 | AC-15-1 |
| 2026-10-08 | 소식방은 방송 + 소비자는 본인 답장만, 생산자는 모든 답장(이름 앞 글자). 권한 필터 뒤에 (createdAt, id) keyset으로 자르고 cursor는 사용자·자원에 묶는다 | contracts-1.2 4장, M-19 | AC-12-6 |
| 2026-10-08 | 소비자 전송은 대화 행을 FOR UPDATE로 잠그고 AI 답까지 같은 트랜잭션에 저장, 저장 직전 대화·농가 설정 버전을 다시 확인한다. HUMAN·농가 AI OFF면 `needsHuman` | contracts-1.2 4장, M-20 | AC-13-6, AC-13-7 |
| 2026-10-08 | 생산자 답변은 저장과 HUMAN 전환을 함께, 지정한 전달 질문만 ANSWERED. 질문함 API(1.1)는 같은 Thread·Escalation을 쓴다 | M-09 | AC-13-2 |
| 2026-10-08 | 첨부는 1.2 (2/2)에서. 지금은 `attachmentIds`가 비어 있지 않으면 404 (1.2 (2/2)에서 아래 행으로 대체) | 단계적 구현 | — |
| 2026-10-08 | 비공개 사진은 `private_attachments`(I1은 DB 바이트), 업로드 때 형식 확인·메타데이터 제거(`core/images.py`), 조회는 `Cache-Control: private, no-store`. 문의는 `order_inquiries`, 대화를 HUMAN으로, 열린 문의는 답변 필요 | contracts-1.2 6장, M-21 | AC-33-1~4 |
| 2026-10-09 | 승인 농가 소식방의 공개 방송은 비로그인·미팔로우도 읽는다. 팔로워만 전용 방송·본인 답장, 소유 생산자만 모든 답장을 보며 필터 뒤에 요약·cursor를 계산한다 | storefront-1.5 | AC-12-10, AC-15-6 |
| 2026-10-20 | 소비자 보내기의 선택 `productId`는 그 농가의 판매 중 상품만(아니면 404, 메시지 저장 전). AI 근거로만 쓰고 대화에 저장하지 않는다. 근거 상품은 주문 > `productId` > 판매 중 상품 1개 | 상품이 2개 이상인 농가에서 상품 페이지 채팅이 근거 없이 전달되던 문제(DEV-97). 저장하지 않아 마이그레이션 없음 | AC-13-1, AC-13-3 |
| 2026-10-22 | farmclub 문의 대화방(DEV-111, FEAT-34, M-22)은 기존 Thread를 쓰고 상대는 운영팀 계정 `u-farmclub`(ADMIN), 운영팀 메시지는 `OPERATOR`다(`support.py`). 농가 승인과 같은 트랜잭션에서 만들고(`accounts.decide_producer_application`), 기존 승인 농가는 마이그레이션 0019가 넣는다. `ai_mode` HUMAN 고정·AI 모드 변경 400, 생산자 안 읽음은 OPERATOR도 센다, 생산자 목록에 `isSupport`로 표시(고정하지 않고 최근 순). 운영자 읽음은 `consumer_last_read_message_id` 칸을 쓴다 | 생산자 목록·방·답장 API를 그대로 써서 바꿀 곳이 가장 적다. 소비자 경로는 소비자 본인 ID로만 찾으므로 노출되지 않는다 | AC-34-1~4 |
| 2026-10-29 | 소비자 farmclub 문의 대화방(DEV-150, AC-34-6~8)은 `support_threads`(사용자당 하나)·`support_messages`(CONSUMER·OPERATOR)에 둔다. 가입(`kakao_signup`)·시드에서 만들고, 기존 소비자는 마이그레이션 0022가 넣는다. 소비자 경로 `/messaging/support/messages`·`/support/read`, 채팅 목록에 `is_support` 행을 섞는다. 연락처 가림 유지, AI 없음, 첨부 없음. 탈퇴 때 소비자 문의 본문을 지운다 | 소비자 1:1(Thread)은 농가 FK가 필수이고 팔로우·AI·전달·환불 알림에 묶여 있다. 가짜 농가는 농가·카탈로그·관리 목록에 샌다. 운영 중인 생산자 방은 그대로 둔다 | AC-34-6~8 |
| 2026-11-03 | (10-08 결정 수정) 소비자 전송은 AI 호출 동안 대화 행을 잠그지 않는다. 시작할 때 모드·대화 버전·농가 AI ON·설정 버전을 캡처하고, 호출 뒤 저장 직전에 행을 FOR UPDATE로 잠가 다시 확인한다. 하나라도 바뀌었으면 AI 답을 저장하지 않고 질문을 `needsHuman`으로 남긴다. AI 답이 저장되지 않는 질문은 모두 `needsHuman`. 한 트랜잭션은 그대로(멱등 기록과 함께 커밋) | contracts-1.2 5장, I3-T09(CS-059/060, AIGUARD-05) | AC-13-6 |
| 2026-11-10 | AI 답변 확인 요청 깃발(DEV-296): `escalations.resolution`(CONFIRMED·CORRECTED)·`resolved_by`(마이그레이션 0031). `status`는 OPEN·ANSWERED 그대로. 메시지 응답 `checkState`는 `_check_state`(OPEN → REQUESTED, ANSWERED는 `resolution` 그대로, resolution 없는 0031 전 옛 행은 null = 깃발 없음, `reported`는 true). 확인 요청은 AI 답변 인용(또는 지정)으로만 닫히고(소비자 질문 인용은 전달 질문만 닫는다) CORRECTED이며, 인용 대상 없이 하나만 닫으면 그 AI 답변을 인용해 저장한다. `confirm`은 행 잠금 후 OPEN일 때만 닫고, 이미 CONFIRMED면 그대로, CORRECTED면 409. CONFIRMED 뒤 그 AI 답변을 인용한 답장은 CORRECTED로 바꾼다. `needsReply`(목록 필터)는 확인 요청을 포함하고, 현황 `open_question_count`는 `_needs_reply(checks=False)`로 확인 요청만 열린 대화를 뺀다. 건수는 `_ai_check_count`·`ai_check_request_count` | 질문함 계약(status)을 유지하면서 누가·언제·어떻게 닫았는지 남기고, 현황에서 같은 일을 두 줄에 세지 않는다(PM 11/09 승인 Figma) | AC-13-5, AC-13-11, AC-13-12, AC-13-13 |
| 2026-11-04 | 소식 삭제 `DELETE /news/{broadcastId}`(승인 생산자, 자기 농가만, 다른 농가·없는 소식 404, 이미 지운 것 204). `broadcasts.deleted_at` 소프트 삭제(마이그레이션 0025), 모든 조회가 `_LIVE` 조건으로 뺀다. 방송 응답에 `visibility`를 담아 삭제 시트 안내에 쓴다. 본문 수정은 아래 DEV-289의 본인 메시지 PATCH 계약을 따른다 | HE P3(DEV-210), M-23. 운영자 복구·분쟁 확인용으로 행을 남기고 좋아요·답장·첨부 정리가 필요 없다 | AC-12-14, AC-12-15 |

## DEV-235/213 메시지 표시 계약
기존 ThreadMessage.seq를 ChatMessage.sequence로 전달한다. 목록·전송·소비자·생산자 조회의 값은 동일하며 읽음/커서의 기존 순번을 그대로 쓴다. FORWARDED 메시지는 저장 시 source_summary를 비우고 과거 행도 응답에 이유를 노출하지 않는다. 일반 ANSWER 근거는 유지한다.

## DEV-245 결제 주문 대화 문맥
- ThreadOrderContext는 (thread_id,order_id) 복합 PK와 부모 삭제 시 연결만 정리하는 FK를 가진다(0026). 기존 문의는 backfill 없이 함께 조회한다.
- order_context.py는 orders service를 통해 결제 이력·소유·농가를 매번 검사한다. 연결은 기록이며 영구 권한이 아니다. 읽기 helper는 쓰기/팔로우/문의 접수를 하지 않는다.
- 빈 주문 대화의 재진입을 지원한다. 일반 시작과 문제 문의 접수는 별도 기존 동작을 유지한다(M-04, AC-33-2). 순차 배포는 스키마 → 서버 → 클라이언트, rollback 시 추가 테이블은 남길 수 있다.


### DEV-289
인용 답장과 서버 기준 10분 직접 응대 계약은 FEAT-12·13 DEV-289 절을 따른다. 전체 AI 설정의 다른 정책 필드는 보존하고 폴링은 설정 버전을 역행시키지 않는다. 주문 문의 접수의 별도 직접 응대는 일반 타이머와 구분한다.

- 본인 메시지 본문 수정은 `PATCH /messages/{messageId}`와 `PATCH /rooms/{farmId}/messages/{messageId}`로 제공한다. 마이그레이션0029는 `edited_at`·`edit_version`을 추가한다. 버전 충돌 및 멱등 재시도를 검증하고, 미디어·원래 시각·인용·AI 대기 상태는 유지한다. 수정은 Thread.version을 올려 이전 질문에 대한 진행 중 AI 응답을 무효화한다.
- 소식방 소비자 원문은 비공개를 유지한다. 생산자가 같은 농가 글에 답장하면 익명 인용 스냅샷을 FOLLOWERS Broadcast의 `reply_to`에 저장한다(0030). 전화·계좌·이메일 가림, 선택 원문 버전409 검증과 별도1:1 이동은 FEAT-12를 따른다.
