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

- F/L/H/R의 유효 소비자=User.role CONSUMER·deleted_at 없음. 운영자가 확정한 M은 별도 검토 근거이므로 신고자 탈퇴로 사라지지 않고 판정 반전으로만 제거한다. 로컬 테스트 계정도 실제 저장 행동만 반영.
- 창: now-28days <= created_at <= now, UTC 비교. 날짜·주 cap만 Asia/Seoul. 무활동으로 창 밖 P/L/H 제거, F/R/M은 현 근거 유지.
- GET /api/farms/{id}/temperature: 승인 농가 공개, temperatureTenths·contributions(F/P/L/H/R/M)·calculatedAt·policyVersion=1. 개인정보/신고 이유/대화 미노출.
- 소개 상단 “농가 온도 36.5°C” 누름 카드→산식·기간·별점·신고 설명 시트. 로딩/실패·재시도 구분, 실패에 임의36.5 표시 금지.

## AC-ENG-3 검증 별점·신고
- GET /api/engagement/reviews/{orderId}: 본인 주문만 조회하고 {orderId,stars:number|null}로 기존 별점을 반환한다. 미완료·환불 주문은 stars=null이며 쓰기는 거절한다.
- PUT /api/engagement/reviews/{orderId}: OnboardedConsumer 본인 주문, 위 R 조건. stars strict integer1..5. order PK upsert·수정 대체. 남의 주문404, 미완료/환불409. 완료 주문 상세에 별점 입력 UI.
- POST /api/engagement/farms/{farmId}/reports: OnboardedConsumer·승인 농가, trim reason10..1000자, 실제 PENDING 저장. pair당1개, 중복은 기존 기록 반환(첫 내용 유지). 제출만으로 차감 없음. 소개의 “농가 신고” UI와 제출 결과·에러.
- GET /api/engagement/reports?status=PENDING: Admin 전용, 기본20·최대50·cursor 페이지로 {items:[{reportId,farmId,reason,status,incidentKey,createdAt,reviewedAt}],nextCursor} 반환. 소비자 식별자는 노출하지 않으며 다른 역할은 차단한다. 검토자가 실제 접수 내용을 찾고 판정하도록 제공한다.
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

언팔/반응 취소/환불로 근거가 사라지면 미완료 복귀. “현재 저장된 활동 기준” 표시. 주문서·입금신고·미확인 입금은 구매 달성 아님. CTA는 탐색 /farms, 소식 /chats?view=news, 채팅 /chats, 구매·후기 /orders 실제 화면 이동만 한다. /me/achievements와 내 정보 링크. focus마다 서버 재조회, 계정 전환 이전 데이터 노출 금지, 로딩/오류·재시도 구분.

## AC-ENG-5 테스트·CI
- pytest: 신호별 양수/음수/0/1/cap, stars0/1/2/3/4/5/6/소수/bool, 중복·동시 팔로우·재팔로우, KST 일/주 및28일 양끝, 삭제/환불, 신고 판정·중복·반전, 상하한 overflow 반전, 권한/계정 격리, 실제 과제 완료/취소.
- scripts/test-engagement.mjs: mock 실제 상태 전이/실패/중복/계정 격리. 기존 test-*.mjs 자동발견 사용.
- scripts/e2e/customer-engagement.spec.ts: 실제 스택 팔로우→환영 번호→소개, 온도 설명, 실제 행동 전후 과제·새로고침, 별점·신고. 실패 시 불변.
- 기존 CI pytest·mock/typecheck·Playwright 자동포함 및 경로분류 검증. make test-engagement 추가. migration upgrade/check·단일 head 검증.
- 실행 결과로만 완료 기록. 독립 AI 리뷰 후 PR, 병합/배포 금지. Figma 반영 불가 시 PR에 추적 후속 이슈.

## AC-ENG-6 기존 데이터 수명주기 통합
관리자 purge_except의 명시 테이블 보존 목록에 신규3개를 등록한다. 기존 정리는 모든 소비자·주문을 지우므로 소비자 소유 영수증·신고·별점3개 테이블도 명시 false 규칙으로 정리한다. 기존 미리보기·백업·대상 일치·거부 가드는 유지한다. 이는 기존 정리 도구 호환성만이며 이 작업에서 운영 정리를 실행하지 않는다. 일반 탈퇴의 익명 User 행은 유지되므로 영수증/운영 확정 M의 일반 수명주기와 구별한다.

## 실행된 대표 테스트 행렬

|분류|입력/행동|기대 결과|
|---|---|---|
|양수|기본 농가에 첫 활성 팔로우1개|365→366, 첫 환영 true·번호1|
|음수|실패/무권한 팔로우·동일 요청 반복|새 receipt 없음/기존 번호 유지, 완료 가산 없음|
|경합|다른2명 동시 팔로우·같은 사람 중복|고유 번호1,2·활성 pair당1개, stale 캐시에도 count 정확|
|경계|stars0/6/소수/bool vs1/2/3/4/5|잘못된 값 거절; 유효 별점 −1/−1/0/+1/+1점|
|반전|5점→1점 수정·환불|R +1→−1→0, 누적 가산 없음|
|경계|팔로우100/101, 공감·답변30/31|F100, L/H30 상한 유지|
|경계|KST 자정/월요일,28일 양끝·1마이크로초 밖/미래|일·주 cap 정확, 창 양끝 포함·밖과 미래 제외|
|반전|PENDING→CONFIRMED→OVERTURNED 신고|M0→1→0, 중복 incident는1, 신고자 탈퇴는 확정 근거 보존|
|경계|상하한 밖 기여 후 제거|최종 clamp만 적용, 정확한 반전 결과|
|실재성|과제 버튼 클릭/주문 열기/입금 신고 vs 실제 구매 확정·후기 저장|전자는 미완료 유지, 후자는 실제 저장 뒤 달성·새로고침 유지|
|격리|지연된 첫 팔로우 응답 중 계정 전환|새 계정에 환영·이동·완료 누출 없음|
|수명주기|레거시 backfill·upgrade/downgrade·정리 preview/commit|실제 Follow 기준 순번, 기존 데이터 유지, preview rollback·허용한 정리만 commit|

실행 결과: 전체 서버2191통과/1skip(신규44케이스), 전체Mock497통과/1skip(신규6그룹), 실제 브라우저18통과, CI선택22통과, 모든 타입·lint·마이그레이션 검사 통과. 구체적 명령은 tasks/DEV-465.md 및 PR에 기록했다.
