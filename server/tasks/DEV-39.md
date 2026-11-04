## DEV-39 [I2-T22] Add AI answer feedback and verify producer AI settings

- 이슈: [DEV-39](https://linear.app/sswp6/issue/DEV-39)
- 브랜치: `zahra/dev-39-ai-answer-feedback`
- 기능·인수 조건: C09 / FEAT-13 AC-13-5·M-17; P08 / FEAT-32 AC-32-1~4
- 상태: 진행 중
- 예상: Human 6시간 / Agent 0시간

### 목표
소비자가 잘못된 AI 답을 농가에 전달하고 생산자가 바로잡을 수 있게 한다. AI 설정의 저장·미리보기·버전 충돌 흐름을 합의된 인수 조건으로 검증하고, 오래된 버전 저장 뒤에도 편집 입력을 보존한다.

### 범위 (수정 허용 경로)
- `server/**`
- `packages/api/**` (Mock 포함)
- `packages/ui/**`
- `apps/consumer/**`
- `apps/producer/**`
- `scripts/**`
- `package.json` (`test:mock` 목록만)
- `docs/spec/screens.md`
- `docs/spec/functional/FEAT-13-ai-reply.md`
- `docs/wiki/Design-Documentation.md`
- `docs/wiki/Requirements-and-Specifications.md`
- `docs/wiki/Testing-Documentation.md`

### 비범위 (건드리지 않음)
- 위 허용 경로 이외의 파일
- 운영자 예외 알림·화면 추가, AI 답변 내용 수정·철회

### 결정 사항
- 10/16 잠정 기본값: 오답 신고는 채팅을 HUMAN으로 바꾸지 않는다. 이전 AI 답변을 포함해 해당 대화의 모든 AI 답변을 신고할 수 있다. 이 두 질문을 Linear DEV-39에 올려 확인을 구했으며 팀 답변이 다르면 동작을 조정한다.
- 10/16 오답 신고는 기존 `Escalation` 흐름을 재사용한다. `reason="WRONG_ANSWER"`, `thread_message_id`는 질문 메시지, unique `reported_message_id`는 신고한 AI 답변이다. 질문은 같은 thread에서 해당 AI 답보다 `seq`가 작은 마지막 CONSUMER 메시지다. `question`에는 마스킹된 본문, `context`에는 전달 질문과 같은 주문 문맥을 복사한다.
- 10/16 동일 답변 중복 신고는 기존 Escalation을 200으로 반환한다. 동시 unique 충돌은 IntegrityError rollback 후 기존 행을 다시 읽는다. 전달된 AI 답은 이미 열린 질문이므로 400으로 거부한다.
- 10/16 생산자가 질문함 항목을 선택하지 않고 답하면 이 신고는 OPEN으로 남고 `needsReply`도 true다. 별도 다른 농가 AC-32-4 테스트는 `/farms/me/...`가 로그인 농가를 사용하므로 만들지 않는다.
- 10/16 `reported`는 서버가 AI 메시지에 계산해 소비자·생산자 양쪽 GET messages 응답에 제공한다. 생산자는 WRONG_ANSWER 코드를 한국어 레이블로 본다.
- 10/16 AI 설정 저장이 STALE_VERSION이면 최신 version을 다시 불러오되 편집 필드를 유지하며, 최신 version으로 재저장할 수 있게 한다.
- 10/16 PR #113 작성자에게 migration 순서 확인을 요청했다. 현재 main의 0007 뒤로 DEV-39는 0008을 쓴다. PR #113에는 0008(`down_revision="0007"`)·0009가 있어 revision이 충돌하므로, PR #113의 migration 순서를 DEV-39 병합 후 main 기준으로 조정해야 한다.

### 작업
- [x] 메시지 신고 모델·migration·권한 검사·동시 중복 회복 API 구현
- [x] 소비자 버튼·신고 상태·생산자 WRONG_ANSWER 레이블 및 두 앱 message API 반영
- [x] Mock와 `scripts/test-ai-feedback.mjs`, root `test:mock` 목록 반영
- [x] AC-32 stale-version 입력 보존·재저장 구현 및 AC-32-3 부작용 회귀 보강
- [x] API·Mock·Playwright 검증, 스펙·위키 갱신, AC-13-5 체크

### 완료 조건
- [x] AC-13-5 서버·Mock·브라우저 검증 통과(질문 격리, 중복·동시 신고, 보고 상태 양쪽 reload 포함)
- [x] AC-32-3 preview가 설정·대화·문의 기록을 바꾸지 않음
- [x] AC-32-4 server refreshed-version save와 producer 화면 입력 보존·재저장 검증 통과
- [x] 마이그레이션 upgrade/downgrade/check, 전체 허용 Mock·앱 테스트, spec/wiki 일치 확인
- [x] `git diff main...HEAD` 허용 범위 감사 및 AI 1차 리뷰 코멘트 게시
- [x] 사용자가 I2 승인 규칙 면제와 squash merge를 명시적으로 승인함

### 기록
- 10/16 Linear DEV-39를 Human 6h로 재산정하고 provisional HUMAN/older-answer 질문을 DEV-39에 게시했다. PR #113 작성자에게 migration 0008 순서를 확인 요청했다.
- 10/16 API·Mock·소비자 신고 버튼·생산자 한국어 표기·STALE_VERSION 입력 보존 흐름과 pytest/Mock/Playwright 회귀 케이스 구현을 마쳤다.
- 10/16 의존성 설치(`npm ci`, `uv sync`) 후 실행해 보니 새 AC-13-5 서버 테스트 4개와 Mock 테스트가 실패했다. 원인: API 키 없이는 "배송비" 질문이 주문·상품 없이 `FORWARDED`가 되고, Mock 시드에서는 `u-seojun`이 `f-kang`을 팔로우하지 않는다. 서버·Mock·Playwright 모두 소량 주문 원칙을 저장하고(Mock·Playwright는 대화를 AUTO로 돌린 뒤) "소량 주문 되나요?"로 규칙 답변을 받도록 고쳤다. Mock의 다른 소비자 404 검사는 그 소비자가 대화를 시작한 뒤 확인한다.
- 10/16 AC-13-5 원문을 `FEAT-13-ai-reply.md`·wiki에서 복원했고(구현 용어로 바꾸지 않음), `screens.md`의 영어 표현을 한국어로 고쳤다. 당시 확인한 PR #113 migration 정보와 revision 충돌은 아래 결정 사항 기록을 참조한다.
- 10/16 마이그레이션 `0008_ai_answer_report.py`(신고 답변 FK·unique)를 추가했다. 임시 DB에서 Alembic `upgrade head → downgrade 0007 → upgrade head → check`(새 작업 없음) 통과. 같은 임시 DB로 `npm run test:integration:full` 실행: 실서버 통합 7개, Playwright 21개 통과(AC-13-5 신고·양쪽 표시·reload, AC-32-4 STALE_VERSION 입력 보존·재저장 포함). 임시 DB는 삭제했다.
- 10/16 최종 검증: Ruff 통과, pytest 211개 통과, `npm run typecheck` 통과, `npm run test:mock` 13개 통과. 마이그레이션 upgrade/downgrade/check와 실서버 통합·Playwright 결과는 위 기록 참조.
- 10/16 PR 1차 검토에서 오래된 AI 답 신고 직후 해당 페이지가 refresh 결과에 없을 때 버튼 상태가 갱신되지 않는 경계를 보완했다. 성공 응답에서 현재 메시지를 바로 `reported`로 표시하고, 더 최신 답변이 있는 상태에서 이전 답변을 신고하는 AC-13-5 서버 회귀를 추가했다. 재검토에서 typecheck·diff check 통과. 이 worktree에는 `psycopg`가 없어 변경한 pytest는 여기서 재실행하지 못했다(위 전체 pytest 211개 통과 기록은 유지).
- 10/16 1차 리뷰 커밋 `3b6ee08`, 리뷰 보완 `2ef8dbf`를 push하고 PR #119를 열었다. AI 1차 리뷰 코멘트 게시: must 없음. I2 승인 규칙은 사용자가 면제했다. PR #113의 0008/0009 migration revision은 DEV-39 병합 뒤 충돌이 없게 조정해야 한다.
- 10/17 `main`을 병합해 `server/tasks.md`의 DEV-39/DEV-59 섹션을 보존했다. main의 AI grounding 변경까지 포함한 재검증: Ruff 통과, pytest 215개 통과, `npm run typecheck` 통과, `npm run test:mock` 13개 통과.
- 10/17 별도 로컬 DB `farmclub_dev39_ship_test`에서 Alembic upgrade/check 통과. `npm run test:integration:full`은 localhost만 대상으로 서버 통합 7개와 Playwright 21개 통과. Railway에는 연결하지 않았다.
- 10/17 GitHub PR #113 실제 diff를 확인해 migration 충돌 정보를 바로잡고 PR #119에 정정 코멘트를 남겼다. DEV-39 merge 이후 PR #113 migration을 새 main head 뒤로 재배치해야 한다.

