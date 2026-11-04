## DEV-51 상품 표시 가격 조회
- 상태: 구현·로컬 검증·AI 리뷰 완료, PR CI/사람 리뷰 대기. 이슈 https://linear.app/sswp6/issue/DEV-51
- 범위: packages/api/src/productPresentation.ts, src/index.ts, spec.md, tasks.md; 기존 API 계약 변경 없음.
- 결정: 마지막 기간의 동일 옵션 가격과 현재 가격을 비교하며 품절/누락/동일 금액은 취소선을 생략한다. 목록은 기존 상품 상세 API를 제한된 동시 요청으로 조회하고 실패 시 비교 금액만 생략한다.
- 작업: [ ] 조회 도우미와 가격 기준 테스트; [ ] 검증 기록.
- 10/13 범위 확장: packages/api/src/mock/db.ts의 p-house 신규 시드 detailContent에 기존 승인된 단일 AI 농가 이야기 이미지를 지정한다. 소비자/생산자 public/photos에 같은 원본을 복사한다. 기존 저장 데이터는 재설정하거나 마이그레이션하지 않는다.

- 10/13 구현·명세/영문 wiki 동기화. 타입 검사, Mock 12/12, 양 앱 web export 통과. 소비자 360/390/430 가로 목록·방 진입·고정 구매/탭, 같은 방 답장, 생산자 방 기본 접힘·전송 검증. 최종 이미지/긴 이름 검사 진행 중.
- 10/13 리뷰 보완: 웹 aria-expanded/aria-selected, 팔로우 요청의 농가·계정 변경 가드, 품절 옵션 비교 가격 숨김, 소식방 안전 영역, 짧은 농가 정보의 로그인·팔로우 안내 복귀를 보완.
- 10/13 Docker 엔진 미실행으로 실서버 로컬 통합은 실행하지 않았다. PR CI의 전용 PostgreSQL에서 실서버 API/E2E 검증 예정. 사용자 DB는 변경하지 않았다.

- 10/13 최종 리뷰 추가: 최초 생산자 room 응답 전 입력이 지워지는 경합을 재현해 ready 후 입력 활성화로 수정. 긴 이미지 원비율·고정 구매/탭 및 긴 농가명 테스트 통과. 커밋 0ada553 PR 앱 CI 통과, 실서버 통합 진행 중.
- 레거시 호환 점검: 후보 2건 — 지적 0건 / 정당 2건 (`/news/:farmId`, `description` fallback: origin/main 3cc2332 및 12251d2에 존재). 브랜치 중간 구조 호환 없음.

- 최종 로컬 UI 검증: `npx playwright test scripts/e2e/conversation-ui.spec.ts` 6/6 통과. 커밋 전·브랜치 diff 검사와 명세 대조 완료. 소수 중량 옵션도 정수 g로 판정하고 생산자 상품 편집 복귀 시 판매 품목을 다시 읽는다.
- PR: https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/98 (머지하지 않음). 최신 실서버 CI 결과와 AI 리뷰는 PR에 기록. Linear MCP는 읽기 전용이며 브라우저 연결도 실패해 이슈 상태 직접 수정은 미완료.


