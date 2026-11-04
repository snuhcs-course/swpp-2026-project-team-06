## DEV-44 [I2-T29] 운영자 기능·AI 전달 내부 점검

- 이슈: [DEV-44](https://linear.app/sswp6/issue/DEV-44)
- 브랜치: `zahra/dev-44-manager-ai-checklist`
- 기능·인수 조건: FEAT-01 / R-22, FEAT-04 / R-25, FEAT-10 / R-19, R-11 / R-12, M01~M03 / M07, FEAT-13 AC-13-6·AC-13-7, FEAT-32 AC-32-3
- 상태: 진행 중

### 목표
시드 로컬 데이터로 운영자 승인·권한·예외·AI 전달을 점검하고, 영문 통과/실패/보류 체크리스트와 근거를 남긴다. 제품 코드는 바꾸지 않는다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md`
- `server/tasks.md`

### 비범위 (건드리지 않음)
- 제품 소스·제품 동작·자동 테스트 소스 변경
- 실제 결제·환불 연동, 운영자 전용 UI
- `POST /admin/farms/{farmId}/suspend`(R-24)와 `DELETE /admin/messages/{messageId}`(정책): `docs/spec/screens.md`에는 있으나 서버 라우트가 없고 M01~M03 밖이다

### 결정 사항
- 10/16 시드 로컬 데이터를 쓴다. 서버 pytest와 Playwright `producer-i2`·`conversation-ui`를 실행하고, 기존 AC 이름 테스트를 근거로 인용하며, 테스트가 없는 흐름은 Swagger/API로 확인한다.
- 10/16 구현된 모든 `/admin/...` 라우트에 대해 토큰 없음 401, Mock 로그인 소비자 `u-minji`·생산자 `u-kang` 403을 확인한다. 운영자 토큰은 `cd server && uv run python -m app.accounts.admin_token`(기본 `u-admin`)으로 받아 Swagger Authorize에 넣는다.
- 10/16 일시 실패 재시도는 M01~M03에만 허용, 환불 요청 알림은 해결만 가능·재시도 불가, 해결·복구된 이벤트는 재시도 불가를 확인한다. 오래된 공급 물량 버전(409), 필수 `Idempotency-Key` 누락(400), 같은 키 반복 시 첫 결과 반환을 확인한다.
- 10/16 AC-13-6, AC-13-7, M-07 환불·보상 알림의 `GET /admin/exceptions` 저장, AC-32-3 미리보기 무기록을 확인한다. API 키 없이 AI OFF·강제 전달·로컬 규칙/FAQ·기본 전달 경로를 직접 확인하고, Claude 근거 답변은 pytest(monkeypatch) 근거를 인용한다.
- 10/17 DEV-39가 main에 병합되어 AI 설정과 AC-13-5 재검증을 완료했다. 결과는 `docs/wiki/Testing-Documentation.md`에 기록했다. wiki에 소비자 부분 환불 이력이 T29 전 프론트·스펙 후속 작업으로 남아 있으므로, 완료가 확인되지 않으면 보류로 둔다.
- 10/16 스펙에만 있고 코드에 없는 위 두 운영자 라우트를 기록한다. 삭제할지 구현할지는 후속 이슈에서 정한다.
- 10/16 범위 안의 실패마다 Bug 이슈를 만들어 체크리스트에 연결하고 DEV-47(T38)로 넘긴다. DEV-44는 기록만 하고 고치지 않는다.

### 작업
- [x] `docs/wiki/Testing-Documentation.md`에 영문 결과 체크리스트 추가
- [x] 서버 pytest와 지정 Playwright spec 실행, 관련 `test_AC_…` 인용
- [x] 테스트가 없는 시드 API 흐름과 권한 확인, 통과/실패/보류와 근거 기록
- [x] 최종 실행 확인. 범위 안 제품 실패가 없어 DEV-47용 Bug 이슈는 만들지 않음
- [x] draft 문서 PR [#118](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/118) 열고 실제 소요·근거 기록

### 완료 조건
- [x] 승인·권한·예외·AI 전달마다 통과/실패/보류 결과와 근거가 있음
- [x] 체크리스트·이슈 범위·결정·테스트 결과·후속 Bug가 연결되고 최신임
- [ ] 문서 PR 리뷰 후 머지

### 기록
- 10/16 `origin/main`에서 분리된 worktree로 시작. DEV-39가 진행 중이고 부분 환불 이력 후속 작업이 아직 남아 있음을 확인했다.
- 10/16 서버 전체 테스트 통과(206), 지정 Playwright spec 통과(11). 첫 Playwright 실행은 API 호스트 이름이 맞지 않았고, route intercept URL을 맞춘 뒤 모두 통과해 제품 Bug는 만들지 않았다.
- 10/16 시드 HTTP 확인 통과: 운영자 라우트 12개 모두 토큰 없음 401, Mock 로그인 `u-minji`·`u-kang` 403. 승인·반려·공급 물량·배송 완료·환불 흐름, 오래된 버전, 키 필수·반복, 예외 수명주기, AC-13-6·7, AC-32-3을 확인했다. AI 로컬 경로는 API 키 없이 통과했다.
- 10/17 AC-13-5와 AI 설정 점검은 DEV-39 병합 후 재검증했다. 소비자 부분 환불 이력은 문서화된 프론트·스펙 후속 작업 때문에 보류. 스펙에만 있는 두 라우트는 없음으로 기록하고 M01~M03에서 제외했다.
- 10/16 draft PR #118을 열었다. Agent 시간 추정 0.5h, 토큰 합계는 이 세션에서 제공되지 않아 PR과 Linear 결과에도 그대로 적었다.
- 10/16 재검증: 위 실행 기록은 의존성이 없는 worktree에서 나온 것이라 출처를 확인할 수 없어 다시 실행했다. 현재 `main`(`34c9009`, #116·#117 포함)을 별도 worktree에 두고 `npm ci`·`uv sync --frozen` 후 임시 DB로 실행: pytest 210개 통과, `npm run test:integration:full` 실서버 통합 7개·Playwright 19개 통과(`producer-i2`·`conversation-ui` 11개 포함). 시드 API 점검 스크립트 46개 항목 통과(라우트 12개 × 3계정 권한, 승인·반려·이력, 공급 물량 409·승인, 배송 완료·환불 키 필수(4개 작업)·같은 키 반복·환불 이력 1건, 환불 요청 알림 목록·상세·재시도 거부·해결·해결 후 재시도 거부, AC-32-3, 규칙 답변·강제 전달·기본 전달, AC-13-6·7). 일시 실패 재시도 복구는 HTTP로 재현하지 않았고 `test_AC_11_3_transient_retry_uses_original_actor_and_exact_body` 통과로 대신한다. 임시 DB·worktree는 삭제했다.
- 10/17 DEV-39(#119)가 main에 squash-merge되어 AC-13-5를 재검증했다. 현재 main에서 서버 pytest 215개, integration 7개, Playwright 21개, Mock 13개와 typecheck/Ruff/Alembic check가 통과했다. Railway는 별도 URL 미확인 상태로 미검증이다.

