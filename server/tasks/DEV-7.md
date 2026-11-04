## DEV-7 Bug #54 — 생산자 신청 상태 API 누락

- 이슈: [DEV-7](https://linear.app/sswp6/issue/DEV-7) (GitHub [#54](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/54), 관련 #8)
- 브랜치: `zahra/dev-7-bug-54-producer-application-status`
- 기능·인수 조건: FEAT-01 / AC-01-3·7 / SCR-20·21
- 상태: 리뷰 중

### 목표
실제 서버에 빠진 생산자 가입 신청 조회·제출 API를 프론트·Mock 계약과 맞춰, 승인 대기·반려 생산자가 신청 내용과 반려 사유를 보고 다시 신청할 수 있게 한다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`, `docs/spec/**`
- 생산자 승인·반려 관리 API, 계정 관문 화면, 데이터베이스 스키마·시드 변경

### 결정 사항
- 10/09 `Farm`의 기존 신청 필드와 `User.name`을 사용해 Mock의 `ProducerApplication` 응답 계약을 그대로 구현한다. 새 모델·마이그레이션은 만들지 않는다
- 10/09 `GET` 누락과 같은 원인으로 빠진 `POST`도 함께 복구한다. 반려 농가는 기존 farm ID를 유지해 다시 신청하고, 그 밖의 기존 농가 상태는 `INVALID_TRANSITION`으로 거부한다
- 10/09 첫 신청 행이 아직 없을 때의 동시 제출도 직렬화하도록 생산자 `User` 행을 먼저 잠근 뒤 농가 상태를 확인·저장한다

### 작업
- [x] 생산자 신청 입력·응답 스키마 추가
- [x] 신청 조회·신규 신청·반려 후 재신청 서비스와 라우트 추가
- [x] 권한·검증·상태 전이 회귀 테스트 추가

### 완료 조건
- [x] 오미숙(PENDING)·박순자(REJECTED)의 신청 내용 조회와 반려 사유 표시 계약이 맞음
- [x] 신규 생산자 신청과 반려 후 재신청이 되고 잘못된 역할·상태는 거부됨
- [ ] 관련 pytest·ruff와 DEV-6 실제 서버 재검증 통과
- [ ] AI 1차 리뷰 후 사람 리뷰·main 머지

### 기록
- 10/09 DEV-6 실제 서버 브라우저 테스트에서 `GET /api/auth/producer-application` 404를 재현. 서버 spec·화면 명세·packages/api·Mock에는 GET·POST 계약이 있으나 FastAPI 라우터와 서비스에 구현이 없음을 확인
- 10/09 GET·POST와 신규 신청·반려 재신청을 구현. POST 직후와 GET의 같은 시각이 서로 다른 오프셋으로 직렬화되는 문제를 테스트에서 발견해, commit 후 다시 읽어 UTC 응답을 일관되게 반환하도록 수정
- 10/09 accounts 집중 테스트 17개, 전체 pytest 133개, Ruff, Alembic upgrade·check 통과. DEV-6 실제 앱 전체 재검증은 이 PR 머지 후 진행
- 10/09 AI 1차 diff 점검에서 첫 신청 동시 제출 시 농가 행이 아직 없어 잠금이 되지 않는 경쟁 조건을 발견. 생산자 계정 행을 먼저 잠그도록 수정하고 Ruff·전체 pytest 133개 재통과

