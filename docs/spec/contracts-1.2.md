# 스펙 1.2 공통 계약 — DEV-3 / DEV-4

2026-10-07. 제품 동작 기준이며 구현 완료 보고가 아니다. [화면/API 목록](./screens.md), [규칙](./functional/rules.md), [인수 조건](./functional/README.md)과 함께 적용한다. 스펙 1.1의 계정 분리·오류 envelope·결제 멱등 규칙은 유지한다.

## 1. 공통 형식과 권한

- 날짜는 YYYY-MM-DD, 영업일 경계는 Asia/Seoul 00:00. 기간 양 끝 날짜를 포함한다. 명세의 시드 기준일은 테스트 시계로 주입하며 운영 시간을 하드코딩하지 않는다.
- 금액·박스 수는 정수. 소비자 수 reservedCount, 주문 건수 orderCount, 판매된 박스 수 soldQuantity는 다른 값이다.
- 생산자 API는 PRODUCER + APPROVED + 자원 소유를 검사한다. 다른 앱 토큰은 403 FORBIDDEN/details.reason=WRONG_APP, 미로그인 401. 같은 역할의 타 농가/타 소비자 자원은 404. 미팔로우 소식방은 403.
- 읽기/쓰기에 동일 권한을 적용한다. 첨부 URL 추측, 목록 미리보기, cursor로 다른 사람의 메시지를 알아낼 수 없어야 한다.
- 400 VALIDATION_ERROR/details.fields, 409 CONFLICT/details.reason을 유지한다. 추가 reason: SALES_PAUSED, TOTAL_LIMIT_REACHED, CAP_BELOW_SOLD, STALE_VERSION, PERIOD_LOCKED, NOT_RESUMABLE. 기간 변경은 기존 STAGE_CHANGED, 기간 물량 소진은 SOLD_OUT.
- 아래 POST 생성/메시지 전송은 Idempotency-Key 필수. 사용자+동작+자원+키 범위로 같은 본문은 같은 결과, 다른 본문은 409 IDEMPOTENCY_MISMATCH. 키·본문 해시·결과는 24시간 이상 보관한다. 성공 재전송은 현재 판매 상태가 달라도 기존 결과를 반환하되 권한은 다시 확인한다.
- 설정 PUT에는 version을 받는다. 응답 version은 증가하며 오래된 버전은 409 STALE_VERSION. 같은 요청 재전송은 Idempotency-Key로 기존 성공을 반환한다. 상태를 바꾸는 GET은 만들지 않는다.
- 페이지 응답은 {items,nextCursor}. 메시지는 최신 페이지를 조회하되 items는 오래된 순으로 반환한다. cursor는 (createdAt,id) 기반 opaque 값이며 사용자·자원에 귀속된다. 권한 필터 후 limit(기본 20, 최대 50)을 적용한다.
- 기존 ID와 데이터는 유지한다. 아직 배포된 적 없는 로컬 중간 형식을 영구 API 별칭으로 추가하지 않는다.

## 2·3. 판매 수량·승인·기간 가격 — 1.4로 대체

[상품별 공급 물량 승인 계약](./capacity-1.4.md)이 박스 총한도와 가격 재승인 구조를 대체한다. 승인/판매 한도·주문 스냅샷·API·잠금·이관은 1.4를 따른다. 아래 채팅·AI·문의 계약은 유지한다.

## 4. 소식방과 양방향 1:1 채팅

### 소식방

- 소비자 GET /api/messaging/rooms: 팔로우한 승인 농가, 생산자: 자기 농가 1개. summary={farmId,farmName,farmPhoto,lastMessage,lastAt}.
- GET /api/messaging/rooms/{farmId}/messages → {room,items,nextCursor}.
- items: {messageId,farmId,senderId,senderName,senderRole,body,photos,videos,createdAt,broadcastId,reactionCount,myReaction}.
- photos/videos는 방송에 연결된 기존 미디어 배열이며 텍스트 답장은 빈 배열이다. 소비자 답장의 broadcastId는 null, reactionCount=0, myReaction=false이다.
- 생산자는 자기 농가의 방송+모든 답장, 소비자는 방송+본인 답장만 받는다. 요약·cursor에도 같은 필터. 소비자 이름은 생산자 응답에서 앞 글자+○○.
- POST 같은 messages 경로: {text}, 소비자 1~1000자/생산자 1~2000자 → 저장된 메시지. 생산자는 FOLLOWERS 방송, 소비자는 텍스트 비공개 답장. AI/1:1 대화에는 넣지 않는다.
- 사진·영상 방송은 기존 POST /api/messaging/news로 작성. FOLLOWERS가 기본, PUBLIC은 농가 공개 목록에도 노출한다. 본문 <=2000자, 사진 최대5장(각10MB), 영상1개(60초/100MB). Idempotency-Key 필수.
- 소비자 좋아요는 기존 reaction API를 공유한다. 소비자 답장에는 좋아요가 없다.

### 1:1 식별과 엔드포인트

- Thread는 (farmId,consumerId)당 하나. {threadId,farmId,consumerId,aiMode:AUTO|HUMAN,version,consumerLastReadMessageId,producerLastReadMessageId}.
- Thread.version은 실제 AI 모드가 변경될 때 증가하며 메시지/읽음 갱신만으로는 증가하지 않는다. AUTO에서 자동 HUMAN 전환도 버전을 증가시킨다. 이미 HUMAN이면 유지한다.
- 소비자 기존 /api/messaging/chats 경로 유지. 주문 문의가 있는 대화는 팔로우 해제 후에도 목록에 남는다.
- 소비자 GET /api/messaging/chats/{farmId}/messages → {thread,items,nextCursor,inquiries,orders}; inquiries는 해당 대화의 문의, orders는 연결 주문 요약이며 본인 소유 범위만 포함한다.
- GET /api/messaging/producer/chats?needsReply=&cursor=&limit= → Paged<{threadId,consumerId,consumerName,lastMessage,lastAt,unreadCount,needsReply,aiMode}>. 승인된 자기 농가의 모든 기존 대화/전달 질문을 소비자별로 묶는다.
- POST /api/messaging/producer/chats {consumerId,roomReplyId?} → Thread. 기존 대화 또는 자기 소식방에 답장한 현재 팔로워만 대상으로 허용하며 무작위 고객 검색은 제공하지 않는다.
- GET /api/messaging/producer/chats/{consumerId}/messages → {thread,items,nextCursor,escalations,inquiries,orders}. items는 기존 ChatMessage + orderId?,inquiryId?,sourceRefs?,settingsVersion?.
- POST 같은 messages 경로 {text,attachmentIds?,answerToEscalationIds?} → {message,thread}. 텍스트 <=1000자, 사진3장 이하, 본문/첨부 중 하나 필수. 성공 저장과 aiMode=HUMAN 전환을 같은 트랜잭션에서 처리한다. 사진은 해당 대화의 비공개 첨부 ID만 허용한다.
- 답변 필요는 OPEN 전달 질문, OPEN 문제 문의 또는 마지막 직접 응대 대상 소비자 메시지가 생산자 답변보다 새로울 때 true. 읽는 것만으로 해결되지 않는다.
- 직접 응대 대상 여부는 소비자 메시지 접수 당시 HUMAN/농가 AI OFF 상태로 저장한다. 이후 AUTO/ON 전환만으로 미답변 표시가 사라지지 않는다.
- 답변과 함께 지정한 자기 대화의 escalation만 ANSWERED 처리한다. 다른 질문을 일괄 해결하지 않는다.
- PUT /api/messaging/producer/chats/{consumerId}/ai-mode {mode:AUTO|HUMAN,version} → Thread. AUTO 전환은 이후 메시지부터 적용하고 과거 질문을 자동 재처리하지 않는다.
- PUT /api/messaging/chats/{farmId}/read 및 /api/messaging/producer/chats/{consumerId}/read {lastReadMessageId} → {unreadCount}. 해당 방에 보이는 메시지만 허용하고 읽음 위치는 뒤로 이동하지 않는다.
- 1.1의 사진 URL 입력은 이 기능 구현 시 비공개 attachmentIds로 교체하며 프론트 클라이언트·Mock·서버를 함께 맞춘다. 임의 외부 사진 URL을 private attachment로 간주하지 않는다.
- 소비자 messages 전송도 Idempotency-Key, {text,attachmentIds?,orderId?}를 사용한다. 정상 응답 {message,reply}; HUMAN/농가 AI OFF이면 reply=null이며 농가 답변 필요 표시. AI 처리 중 농가가 HUMAN 전환하면 커밋 직전 모드를 재검사해 늦은 AI 답변이 끼어들지 않게 한다.
- AI 작업 시작 시 Thread.version과 AiSettings.version을 캡처한다. 저장 직전 현재 ON/AUTO 여부와 두 버전이 모두 같은지 같은 트랜잭션에서 검사한다. HUMAN→AUTO 또는 OFF→ON 왕복에도 이전 작업의 답은 저장하지 않는다. 폐기된 질문에 생산자 답변이 아직 없으면 직접 응대 대상으로 남기며 자동 재실행하지 않는다.
- 기존 questions 조회/answer 계약은 유지하고 같은 Thread·Escalation을 사용한다. 기존 answer도 HUMAN 전환 규칙을 적용한다. 새 화면은 producer/chats를 사용한다.
- 일반 새 대화는 기존 팔로우 규칙 유지. 주문 문의는 서버가 확인한 결제 이력 주문 소유자와 해당 농가에 한해 예외. 미팔로우 상태의 전송은 그 주문 orderId가 필수이며 임의 다른 주문의 문맥을 첨부할 수 없다.
- 소식방·1:1 모두 활성 화면에서 2초 polling, 숨김/비활성 중단. cursor 이전 페이지/새 페이지 합치기는 ID 기준으로 중복 제거. 과거 읽는 위치를 유지하고 새 메시지 이동 버튼 제공. 최신 페이지부터 기존 마지막 메시지 ID와 만날 때까지 cursor 페이지를 이어 읽어 polling 사이 limit보다 많은 메시지가 와도 빠뜨리지 않는다.

## 5. AI 응답 설정 (SCR-31, FEAT-32)

농가 → AI 응답 설정 /farm/ai-settings. 채팅에서 바로 연결한다. 농가 단위 설정이며 상품별 자유 프롬프트는 추가하지 않는다.

| API | 요청 | 응답 |
| --- | --- | --- |
| GET /api/farms/me/ai-settings | — | AiSettings |
| PUT /api/farms/me/ai-settings | AiSettings(현재 version 포함) | 저장된 새 버전 |
| POST /api/farms/me/ai-settings/preview | {question,productId?,orderId?,settings?:AiSettings} | {action:ANSWER\|HANDOFF\|DISABLED,answer,reason,sourceRefs,settingsVersion} |

- AiSettings={enabled:boolean,version:int,smallOrderPolicy:string,reservationShippingPolicy:string,faqs:[{id?,question,answer}],handoffTopics:string[]}.
- 기본 enabled=true, version=1, 원칙은 빈 문자열, FAQ/추가 주제는 빈 배열. 빈 설정은 추측 근거로 쓰지 않는다.
- 미리보기 question은 1~1000자. 원칙 각1000자, FAQ 최대20개(질문200자/답1000자), 추가 전달 주제 최대20개(각100자). 설정 저장은 즉시 이후 질문에 적용하고 이력을 남긴다.
- enabled=false이면 모든 방 자동 응답 중단. enabled=true여도 HUMAN 방은 직접 응대 유지한다.
- 우선순위: 플랫폼 금지/필수 전달 규칙 > 확정된 해당 상품·해당 소비자 주문 > 농가 응대 원칙/FAQ. 충돌·불확실성은 HANDOFF. 자유 입력은 정책 데이터이지 시스템 지시가 아니다.
- 농약/재배방식·환불/보상·항의·흥정·배송 변경 약속은 필수 전달. 맛/신맛의 개인 평가·품질/파손 판단도 전달한다. 객관적인 등록 당도 수치와 확정 배송 기간은 안내할 수 있다.
- 농가 입력으로 정책·가격·취소 조건·배송 약속을 바꾸지 않는다. 환불 요구는 운영자 기록에도 남긴다.
- preview는 저장/메시지/전달 질문/AI 모드를 변경하지 않는다. settings가 있으면 임시 값, 없으면 저장 설정으로 답변과 근거를 보여준다. ANSWER에서만 answer가 문자열이고 나머지는 null이다. 주문은 자기 농가의 것만 조회하며 개인정보는 제거한다. 임시 설정 근거는 settingsVersion=null, 저장 버전 사용 시 해당 version.
- 실응답마다 사용한 설정 버전과 상품/주문 정보의 근거를 기록한다. UI에는 AI 안내를 표시한다. 연락처·주소·민감한 사진을 모델에 전달하지 않는다.
- Mock은 같은 입력·출력/우선순위를 검증하는 결정적 응답으로 구현하고 실제 AI 호출처럼 표시하지 않는다.

## 6. 주문 문제 문의·비공개 사진 (SCR-32, FEAT-33)

- 진입: 소비자 주문 상세 → /orders/:orderId/inquiry. 폼은 유형(DAMAGE/CONDITION/TASTE/OTHER), 설명(1~1000자), 사진(선택0~3장, 각10MB).
- POST /api/orders/{orderId}/inquiries {type,text,attachmentIds} → {inquiry,message,threadId}. Idempotency-Key 필수. 결제 이력이 있는 본인 주문만, 해당 농가 대화에 주문 요약과 문의를 연결한다.
- Inquiry={inquiryId,orderId,threadId,type,text,attachments,status:OPEN|RESOLVED,version,createdAt,resolvedAt}. RESOLVED는 대화 처리 표시이지 환불/보상 승인이 아니다.
- GET /api/orders/{orderId}/inquiries → Paged<Inquiry>. 본인 소비자 또는 해당 농가 생산자만. 미결제 주문은 접수 불가. 중복 재시도는 같은 문의/메시지를 반환한다.
- PUT /api/messaging/producer/inquiries/{inquiryId}/status {status,version} → Inquiry(응답에 version 포함). 해결/재열기 가능, 주문 상태·금액은 변경하지 않는다.
- GET producer/chats messages 응답에 연결 문의와 주문 요약(상품명,옵션,수량,주문 상태) 포함. 배송 완료 후 주소·연락처 가림을 유지한다.
- 문의 접수는 HUMAN 모드로 전환하고 생산자 답변 필요에 넣는다. AI는 접수 안내만 가능하며 사진 판정/책임 판단/보상 약속을 하지 않는다.
- 사진 업로드: POST /api/messaging/attachments (multipart file, orderId 또는 threadId 하나 필수) → {attachmentId,mimeType,size}. 본인 주문/대화 권한 및 JPEG/PNG/WebP,10MB 제한 검사, 서버가 실제 MIME 검증·EXIF 제거.
- GET /api/messaging/attachments/{attachmentId}는 연결된 주문/대화 권한 검사 후 바이트 또는 단기 서명 URL을 반환한다. 공개 소식 사진 URL과 분리한다. 임시 업로드는 업로더만 접근하며 접수/전송 성공 시 자원에 귀속한다.
- 타인의 attachmentId 재사용, 다른 주문에 연결된 파일 재사용은 거부한다. 실패/취소 시 파일을 공개하지 않으며 미연결 파일은 24시간 후 삭제한다.
- 직접 응대·접수까지만 I1 범위. 환불/교환 심사 UI·자동 보상·실결제·배송사 책임 판정은 이번 변경에 없다.

## 7. 이관·구현 분담·인수 시나리오

### 기존 데이터 보존

- 상품 물량 이관은 1.4의 명시적인 g 전환표와 주문 중량 스냅샷 검증을 따른다.
- soldQuantity는 주문/수량 반환 이력에서 재계산한다. 결제 기록 없이 reservedCount 숫자만 임의 생성하지 않는다. 출하 이후 환불 수량도 사용한 물량으로 남긴다.
- 기존 공개 판매 기간과 stageId를 단일 판매값으로 보존한다. 구형 미승인 편집안은 백업 후 별도 검토하며 자동 공개하지 않는다.
- 기존 Thread/질문은 같은 농가·소비자에 묶고 메시지 ID를 보존한다. 기존 농가 답변이 있는 방은 HUMAN, 없는 방은 AUTO. 읽음 정보가 없으면 미확인 소비자 메시지를 생산자 안 읽음으로 잡는다.
- 농가 설정 기본값 추가. 소식 답장은 기존 방송/1:1 기록을 복제하지 않는 별도 저장이다. 새 시드는 두 소비자·두 농가의 권한 검증이 가능해야 한다.

### 분담

- DEV-4: 모델/마이그레이션, 수량·결제 트랜잭션, 승인 판매값 분리, 채팅/AI 설정/첨부 API, 권한·멱등·동시성 테스트.
- DEV-3: 상품 판매 설정/기간 가격/농가 채팅/AI 설정/주문 문의 화면, 공통 UI, API 클라이언트와 공유 Mock, 브라우저 검증.
- 명세 머지는 구현 완료가 아니다. 후속 PR은 이 계약을 따르며 기존 DEV-3/DEV-4 이슈를 자동 종료하지 않는다.

### 필수 시나리오

- 마지막 1박스에 두 결제: 한 건 성공, 다른 건 TOTAL_LIMIT_REACHED 또는 SOLD_OUT. 중복 결제·중복 취소는 한 번만 반영.
- 다른 상품 판매량은 독립. 같은 상품의 다른 기간/옵션은 총 한도를 공유. 한도 축소가 이미 판매한 수량 미만이면 실패.
- 주문서를 연 뒤 중지: 결제 SALES_PAUSED. 결제 완료 주문은 정상 출하. 기간 공백/종료/품절/수동 중지를 구분.
- 기간 순서 변경에도 주문 stageId/수량 보존, 이른 가격>=후기 가격 및 예약 기간 삭제·날짜 변경 거부, 신규 가격 즉시 적용과 기존 주문 스냅샷 보존.
- 소비자 A 답장이 B의 소식방/요약/cursor에 없음. 농가 X가 Y의 1:1/사진/설정을 조회·변경하지 못함.
- 농가 직접 답변 중 AI 처리 경합: HUMAN 이후 AI 메시지 저장 금지. 농가 OFF+방 AUTO에서도 AI 없음. 미리보기는 기록 변경 없음.
- 본인 결제 주문의 미팔로우 문의는 허용, 타인 주문/첨부는 차단. 사진 문의 처리 상태가 주문 환불 상태를 바꾸지 않음.
