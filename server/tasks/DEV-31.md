## DEV-31 Core AI draft, grounded answer, and producer escalation

- 이슈: [DEV-31](https://linear.app/sswp6/issue/DEV-31) (GitHub [#76](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/76), source T13)
- 브랜치: `zahra/dev-31-core-ai-draft-grounded-answer-handoff`
- 기능·인수 조건: FEAT-03 / AC-03-1~3 / P02, FEAT-13 / AC-13-1~4·6~8 / C06, M-05~M-12·M-15·M-18·M-20·M-21, N-04·N-08 / [contracts-1.2](../docs/spec/contracts-1.2.md) 5장
- 상태: 머지 (예상 8시간, T01·T04는 로컬 Mock 구현을 막지 않음)

### 목표
상품 초안은 생산자 원문에서 확인되는 값만 채우고, AI 채팅 답변은 실제로 전달한 근거와 검증 가능한 사실만 사용하게 한다. 실패·위험 질문은 생산자에게 원자적으로 전달하고, 환불·보상 요청은 저장 성공 뒤 개인정보 없는 운영 로그를 한 번만 남긴다.

### 범위 (수정 허용 경로)
- `server/**`
- `packages/api/src/mock/**`
- `scripts/test-spec12.mjs`
- `docs/spec/functional/FEAT-03-ai-product-draft.md`, `docs/spec/functional/FEAT-13-ai-reply.md`, `docs/spec/functional/rules.md`, `docs/spec/contracts-1.2.md`
- `docs/wiki/Testing-Documentation.md`

### 비범위 (건드리지 않음)
- Langfuse 연동과 새 의존성, `틀렸어요`, 자연어 출하, 환불·보상 결정·지속 저장·운영자 예외 UI
- DEV-35가 맡는 운영자 예외 목록·진단·실패 가시성·재시도·복구
- 데이터베이스 마이그레이션과 공개 API 응답 형식 변경

### 결정 사항
- 10/13 PR #98(`jangjinuite`)은 서버·Mock 구현을 막지 않는다. 현재 `main`에서 즉시 구현하고, #98 머지 뒤 `main`을 합쳐 “1:1 목록 / 답변 필요” 용어를 보존한 다음 겹치는 FEAT-13·wiki 문서를 마무리한다
- 10/13 Anthropic 생성은 공통 `_client(timeout)`에서 `max_retries=0`을 사용한다. 상품·상세 초안은 20초, 채팅·설정 미리보기는 `AI_ANSWER_TIMEOUT_SECONDS=8`을 사용하며 기존 실패 fallback을 유지한다
- 10/13 초안의 중량 단위와 사실을 정규화해 필드별로 원문 근거를 확인한다. `5키로`는 `5kg`와 같고 입력에 없는 `궁천조생`은 제거·누락 표시하므로 기존 fixture를 환각 회귀 검사로 강화한다
- 10/13 로컬 FAQ·전달 주제 매칭에는 원문을 유지하고 모델 payload 복사본만 개인정보를 가린다. 모델 답은 전달한 근거 ID만 인용하며 숫자·한국어 날짜·예상 당도 표기·금지 주제·농가 1인칭을 사후 검증한다. 생산자가 쓴 FAQ·정책의 1인칭은 AI 안내 아래 그대로 허용한다
- 10/13 `sourceRefs`는 기존 문자열 배열 계약과 과거 `ai:evidence` 표시를 유지한다. 새 답은 `product:<id>`, `order:<id>`, `farm:faq`, `farm:smallOrderPolicy`, `farm:reservationShippingPolicy`만 사용한다
- 10/13 환불·보상 의도는 AI 모드와 무관하게 저장 흐름에서 감지하되 router가 커밋된 응답의 `messageId`와 요청 로컬 alert의 message ID가 같을 때만 `farmclub.ai.safety`의 `manager_refund_request`를 남긴다. 본문·소비자 신원·연락처·주소·첨부는 기록하지 않는다
- 10/13 설정 미리보기에는 운영자 alert를 남기지 않는다. rollback/commit 실패에도 alert를 남기지 않는다. 멱등 경쟁에서 진 요청에도 alert를 남기지 않는다. 순차 cached replay에도 두 번째 alert를 남기지 않는다
- 10/13 Langfuse는 일정상 후속으로 미룬다. M-08 근거 기록은 메시지의 `source_refs`, `source_summary`, `settings_version`으로 충족하고 N-08 provider tracing은 후속 작업으로 남긴다

### 작업
- [x] 공통 Anthropic client·20/20/8초 timeout·재시도 비활성화
- [x] 한국어 단위·필드별 상품 초안 grounding과 fallback 검증
- [x] 근거 reference·한국어 숫자/날짜·예상 당도·금지 답변 사후 검증
- [x] 정확한 결정 규칙·예약 출하 정책·Mock 동작 정렬
- [x] 커밋 후 환불 alert와 멱등 경쟁·실패 억제
- [x] FEAT/rules/contracts/AI spec/wiki 문서 동기화

### 완료 조건
- [x] P02 / AC-03-1~3 초안 grounding·실패 테스트 통과
- [x] C06 / AC-13-1~4·6~8 답변·전달·미리보기 테스트 통과
- [x] M-07 성공·AI OFF·rollback·경쟁 loser·cached replay·preview alert 테스트 통과
- [x] Mock 회귀 테스트와 전체 server pytest, `ruff check .` 통과
- [x] `git diff origin/main...HEAD`가 이 범위와 일치
- [x] main 머지 (일정 압박으로 사람 승인 없이 작성자 결정으로 머지, 기록 참고)

### 기록
- 10/13 GitHub #76의 source T13·P02/C06·완료 조건을 DEV-31과 확인. 예상 시간을 4시간에서 8시간으로 조정하고 `origin/main`에서 별도 worktree·브랜치를 시작했다
- 10/13 PR #98은 FEAT-13·Testing wiki만 겹치고 서버·Mock은 겹치지 않음을 확인. 구현은 즉시 시작하고 문서는 #98 이후 재조정한다
- 10/13 공통 client, 초안/답변 grounding, 예약 출하 정책, 커밋 뒤 환불 alert와 멱등 race 억제를 구현. 집중 pytest 16개와 Ruff 통과, `test-spec12.mjs` 통과. 전체 Mock은 병렬 news-room mock server 1건이 종료되어 10/11였고 DEV-31이 수정한 spec 1.2 시나리오는 통과했다
- 10/13 PR #98에 서버/Mock은 독립 진행하고 머지 뒤 FEAT-13·Testing wiki를 재조정한다는 coordination comment를 남겼다
- 10/13 local port 권한으로 Mock 전체를 다시 실행해 11/11 통과. server 전체 pytest 147개와 `ruff check .`도 통과했다
- 10/16 PR #98·#104·#109 머지 뒤 `origin/main`을 병합하고 `server/tasks.md` 충돌만 해결했다. #98의 “1:1 목록(서버 needsReply 상태 유지)” 용어를 유지해 FEAT-13 예외 흐름·근거 검증과 Testing wiki를 갱신했다. 일정 압박으로 리뷰어 없이 작성자가 squash merge하고 사후 리뷰를 요청한다.

