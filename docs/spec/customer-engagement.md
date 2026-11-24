# 고객 참여 기능 — DEV-465

2026-11-24 · FEAT-06/12/15 확장 · 이번 사용자 요청의 구현 기준.

## 목적·디자인
소비자가 농가를 직접 선택하고 응원하며 소식을 기다리도록 첫 팔로우 환영, 농가 온도, 실제 활동 도전과제를 구현한다. 기존 ui 토큰·기존 브랜드 강조색·크림·둥근 카드·아이콘·여백을 재사용한다. 본문16px, 누름48px, 작은 화면 줄바꿈과 접근성 레이블. 랭킹·현금 보상·가짜 활동은 없다.

## 공식 조사
[당근 공식 제품 사례](https://careers.daangn.com/blog/post/당근마켓-매너온도-해외시장-진출-1/)는 36.5°C 시작·99°C 상한·활동과 평가·정확한 산식 비공개를 설명한다. [현재 공식 FAQ](https://www.daangn.com/wv/faqs/158)는 최근3년·최신 평가 가중을 설명한다. Farmclub은 표현 방식을 참고한 **자체 산식**을 사용한다. 당근 산식 복제나 품질 보증으로 표현하지 않는다.

## AC-ENG-1 팔로우 환영
- PUT /api/farms/{id}/follow: 기존 following/followerCount + firstFollow:boolean, fanNumber:positive int|null. DELETE는 firstFollow=false.
- 실제 첫 성공만 “{닉네임}님은 {농가명}을 팔로우한 소중한 {N}번째 손님이에요”. 부제 “이제 농가의 소식을 함께 기다려요”. CTA “농가 소개 보기”. 확인/닫기/뒤로는 /farms/{id}/info로 한 번 이동. 자동 타이머 없음.
- 별도 영속 FollowReceipt의 pair PK·(farm_id,fan_number) UNIQUE. Farm 행 잠금 안에서 max receipt+1. 언팔해도 receipt 유지. 중복/재팔로우/실패는 새 번호·새 환영 없음. 실제 첫 팔로우만 번호를 받는다.
- migration은 기존 실제 Follow를 created_at,consumer_id 순으로 backfill. 도입 시 확인 가능한 기록 기준임을 도움말에 명시. 과거 언팔 이력과 fixture follower_count 숫자를 추정에 쓰지 않는다.
- 모든 명시적 팔로우 진입에서 공통 성공 UI. 채팅 자동 팔로우는 채팅 흐름 유지, 서버 기록은 반영. 쓰기 중 중복 차단, 세션 변경 뒤 늦은 응답으로 배너/이동 금지, 실패 배너 금지.

## AC-ENG-2 농가 온도
정수 tenths: **T=clamp(0,990,365+F+P+L+H+R-M)**. 1점=0.1°C, 마지막 표시만 나누어 소수1자리. 마지막 합계만 clamp하여 overflow 뒤 reversal 보존. 온도 쓰기 API 없음.

|항목|정확한 근거·기여|
|---|---|
|F|현재 유효 소비자 distinct Follow 수, 최대100. 취소 제거·재팔로우 누적 불가|
|P|최근28일 삭제되지 않은 공개 Broadcast, KST 날짜당1·월요일 시작 주당3. 미래 제외|
|L|최근28일 저장된 Reaction의 유효 소비자 distinct 수, 최대30. 삭제 소식 제외·취소 제거|
|H|최근28일 실제 PRODUCER ThreadMessage가 앞선 CONSUMER 메시지 뒤 저장된 Thread의 유효 소비자 distinct 수, 최대30. AI/OPERATOR 제외|
|R|해당 농가 COMPLETED·completed_at 있음·refunded_at 없음 주문당 검증별점1개. stars4/5:+1,3:0,1/2:-1. 수정 대체·환불이면0|
|M|운영자 CONFIRMED 농가 신고 incident distinct 수. PENDING/REJECTED/OVERTURNED=0. 같은 incident 중복 차감 금지|

- 유효 소비자=User.role CONSUMER·deleted_at 없음. 로컬 테스트 계정도 실제 저장 행동만 반영.
- 창: now-28days <= created_at <= now, UTC 비교. 날짜·주 cap만 Asia/Seoul. 무활동으로 창 밖 P/L/H 제거, F/R/M은 현 근거 유지.
- GET /api/farms/{id}/temperature: 승인 농가 공개, temperatureTenths·contributions(F/P/L/H/R/M)·calculatedAt·policyVersion=1. 개인정보/신고 이유/대화 미노출.
- 소개 상단 “농가 온도 36.5°C” 누름 카드→산식·기간·별점·신고 설명 시트. 로딩/실패·재시도 구분, 실패에 임의36.5 표시 금지.

## AC-ENG-3 검증 별점·신고
- GET /api/engagement/reviews/{orderId}: 같은 소유권·완료 주문 검증 뒤 {orderId,stars:number|null}로 기존 별점을 조회한다.
- PUT /api/engagement/reviews/{orderId}: OnboardedConsumer 본인 주문, 위 R 조건. stars strict integer1..5. order PK upsert·수정 대체. 남의 주문404, 미완료/환불409. 완료 주문 상세에 별점 입력 UI.
- POST /api/engagement/farms/{farmId}/reports: OnboardedConsumer·승인 농가, trim reason10..1000자, 실제 PENDING 저장. pair당1개, 중복은 기존 기록 반환(첫 내용 유지). 제출만으로 차감 없음. 소개의 “농가 신고” UI와 제출 결과·에러.
- PATCH /api/engagement/reports/{reportId}: Admin만 status CONFIRMED/REJECTED/OVERTURNED, incidentKey trim1..100(CONFIRMED 필수). 같은 farm·incidentKey 여러 신고는1회 차감. 판정/반전 원자 저장·재계산. 기존 관리자 인증 API/Swagger로 운영, 별도 관리자 UI 범위 밖.
- AI 답변 확인요청은 농가 신고가 아니다.

## AC-ENG-4 도전과제
GET /api/engagement/achievements: Consumer 자기 레코드만. task id/title/description/completed/progress(0|1)/target=1/action 경로, completedCount·total=5. 완료 쓰기 API·localStorage flag·낙관적 완료 없음.

|id|이름|현재 판정|
|---|---|---|
|first_follow|첫 팔로우|승인 농가 실제 활성 Follow>=1|
|first_reaction|첫 소식 공감|삭제되지 않은 소식 실제 Reaction>=1|
|first_message|첫 인사|자기 Thread CONSUMER 메시지 또는 자기 RoomReply>=1. 삭제 행 제외 가능한 경우 제외|
|first_purchase|첫 상품 구매|자기 COMPLETED·completed_at 있음·refunded_at 없음 Order>=1|
|first_review|첫 구매 후기|위 유효 주문에 자기 별점>=1|

언팔/반응 취소/환불로 근거가 사라지면 미완료 복귀. “현재 저장된 활동 기준” 표시. 주문서·입금신고·미확인 입금은 구매 달성 아님. CTA는 탐색/소식/채팅/주문 실제 화면 이동만 한다. /me/achievements와 내 정보 링크. focus마다 서버 재조회, 계정 전환 이전 데이터 노출 금지, 로딩/오류·재시도 구분.

## AC-ENG-5 테스트·CI
- pytest: 신호별 양수/음수/0/1/cap, stars0/1/2/3/4/5/6/소수/bool, 중복·동시 팔로우·재팔로우, KST 일/주 및28일 양끝, 삭제/환불, 신고 판정·중복·반전, 상하한 overflow 반전, 권한/계정 격리, 실제 과제 완료/취소.
- scripts/test-engagement.mjs: mock 실제 상태 전이/실패/중복/계정 격리. 기존 test-*.mjs 자동발견 사용.
- scripts/e2e/customer-engagement.spec.ts: 실제 스택 팔로우→환영 번호→소개, 온도 설명, 실제 행동 전후 과제·새로고침, 별점·신고. 실패 시 불변.
- 기존 CI pytest·mock/typecheck·Playwright 자동포함 및 경로분류 검증. make test-engagement 추가. migration upgrade/check·단일 head 검증.
- 실행 결과로만 완료 기록. 독립 AI 리뷰 후 PR, 병합/배포 금지. Figma 반영 불가 시 PR에 추적 후속 이슈.
