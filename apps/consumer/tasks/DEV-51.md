## DEV-51 대화 중심 Figma v6 프론트 반영

- 이슈: https://linear.app/sswp6/issue/DEV-51 · GitHub #97
- 브랜치: `jinumeral/dev-51-dev-implement-conversation-centered-figma-frontend-and`
- 기능: FEAT-02/06/07/09/12/14/15/17, R-17/18/19, M-14, N-02
- 상태: 구현·로컬 검증·AI 리뷰 완료, PR CI/사람 리뷰 대기

### 목표
확정 Figma v6를 양 앱에 구현하고 활성 제품 명세·구현 명세·영문 wiki를 동기화한다.

### 범위 (수정 허용 경로)
- `apps/consumer/**`, `apps/producer/**`, `packages/ui/**`
- `packages/api/src/**`, `packages/api/spec.md`, `packages/api/tasks.md` (기존 API를 사용하는 표현/조회 도우미만)
- `scripts/**`, `docs/spec/**`, `docs/wiki/**`, `docs/design/README.md`, 루트 `README.md`

### 비범위
서버/API 계약, 실제 주문 전이, Figma 원본, 기존 PR #72의 주문 목록 리팩터링, .cache 사용자 자료. 머지하지 않는다.

### 결정 사항
- 10/13 사용자 승인 계획 기준. 홈은 소식/상품 독립 가로 목록, 농가 URL은 소식방 직접 진입, 상세는 고정 구매/4개 탭이다.
- 10/13 판매 품목은 소비자 펼침·생산자 접힘. 소비자 답장 안내 제거, 생산자 공개 안내는 본문 시스템 메시지.
- 10/13 비교 가격은 동일 옵션의 마지막 기간 가격이 현재보다 높을 때만 표시. 시안 금액 하드코딩 및 품절 할인 금지.
- 10/13 수확 시작 프론트 동작만 제거. 예약 주문 조회/기존 출하 준비 주문 처리는 유지하고 자동 전이는 추가하지 않는다.
- 10/13 실제 detailContent를 보존한다. AI 농가 이야기 샘플은 해당 Mock 시드 상품에만 사용하며 일반 상품 fallback으로 넣지 않는다.
- 10/13 기존 paging/polling/권한/계정 변경 폐기/멱등 재시도는 보존한다.

### 작업
- [x] 소비자 홈·농가 소식방·상품 상세·예약 완료
- [x] 생산자 대시보드·채팅·출하 UI
- [x] 공통 토큰·가격·접이식 상품 목록·숫자 한 줄
- [x] 활성 명세·FEAT/IA/screens·앱 spec·영문 wiki 갱신
- [x] 타입 검사·Mock·웹 빌드·360/390/430 UI E2E (실서버 통합은 PR CI로 검증)
- [x] AI 리뷰 반영 및 PR 작성 (CI 확인 후 리뷰 요청)

### 기록
- 10/13 main 9d6b42e에서 시작. 확정 시안과 API/기존 구현 대조 완료, 구현 착수.

- 10/13 구현·명세/영문 wiki 동기화. 타입 검사, Mock 12/12, 양 앱 web export 통과. 소비자 360/390/430 가로 목록·방 진입·고정 구매/탭, 같은 방 답장, 생산자 방 기본 접힘·전송 검증. 최종 이미지/긴 이름 검사 진행 중.
- 10/13 리뷰 보완: 웹 aria-expanded/aria-selected, 팔로우 요청의 농가·계정 변경 가드, 품절 옵션 비교 가격 숨김, 소식방 안전 영역, 짧은 농가 정보의 로그인·팔로우 안내 복귀를 보완.
- 10/13 Docker 엔진 미실행으로 실서버 로컬 통합은 실행하지 않았다. PR CI의 전용 PostgreSQL에서 실서버 API/E2E 검증 예정. 사용자 DB는 변경하지 않았다.

- 10/13 최종 리뷰 추가: 최초 생산자 room 응답 전 입력이 지워지는 경합을 재현해 ready 후 입력 활성화로 수정. 긴 이미지 원비율·고정 구매/탭 및 긴 농가명 테스트 통과. 커밋 0ada553 PR 앱 CI 통과, 실서버 통합 진행 중.
- 레거시 호환 점검: 후보 2건 — 지적 0건 / 정당 2건 (`/news/:farmId`, `description` fallback: origin/main 3cc2332 및 12251d2에 존재). 브랜치 중간 구조 호환 없음.

- 최종 로컬 UI 검증: `npx playwright test scripts/e2e/conversation-ui.spec.ts` 6/6 통과. 커밋 전·브랜치 diff 검사와 명세 대조 완료. 소수 중량 옵션도 정수 g로 판정하고 생산자 상품 편집 복귀 시 판매 품목을 다시 읽는다.
- PR: https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/98 (머지하지 않음). 최신 실서버 CI 결과와 AI 리뷰는 PR에 기록. Linear MCP는 읽기 전용이며 브라우저 연결도 실패해 이슈 상태 직접 수정은 미완료.

