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
- `Thread`는 (Farm, Consumer)당 1개. `ThreadMessage.senderType`은 CONSUMER/PRODUCER/AI, AI 응답은 `senderType = AI`와 근거(`sourceRefs`)를 가진다(M-08). 채팅에는 소식이 섞이지 않는다(AC-12-5).
- 소식 탭(`GET /news`)은 그 사용자가 팔로우한 농가의 공개·팔로워 전용 소식, 농가 페이지(`GET /farms/{farmId}/news`)는 공개 소식만(M-14, AC-15-1).
- `Reaction`은 (broadcastId, userId) 유일. 그 사용자가 볼 수 있는 소식(공개, 또는 팔로우한 농가의 팔로워 전용)에만 만들 수 있고, 아니면 404(AC-15-5). 응답에 반응 수와 내 반응을 담는다.
- 채팅은 팔로우한 농가와만(M-04). `POST /chats`(`farmId`)는 팔로우하지 않았으면 farms service로 팔로우를 먼저 만들고 대화를 연다(AC-12-4). 메시지 경로는 `/chats/{farmId}/messages`이고(대화가 농가·소비자당 1개), 팔로우하지 않은 농가면 403. 채팅 목록은 팔로우 중인 농가만.
- 채팅은 그 소비자와 농가만 본다(M-02). 남의 대화는 404.
- 첨부: 소식 사진 최대 5장(장당 10MB)·영상 1개(60초, 100MB), 채팅 사진 최대 3장(장당 10MB). 서버에서 다시 검사하고 넘으면 413(stack.md 6장 FQ-05). 저장소(R2)는 기능 이슈에서.
- ‘틀렸어요’(M-17, AC-13-5)는 I2. I1에는 엔드포인트가 없다.
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
