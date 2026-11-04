## DEV-47 AI가 근거 없음을 답으로 내면 전달로 바꾸기
- 이슈: [DEV-47](https://linear.app/sswp6/issue/DEV-47) (GitHub [#92](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/92)) — 내부 테스트 A-10 FAIL
- 브랜치: `zahragholami/dev-47-ai-non-answer-handoff`
- 기능·인수 조건: FEAT-13 정상 흐름 3(근거가 없으면 전달 후 needsReply), 예외 흐름 E1(근거 검증 실패 → 전달), C06
- 상태: 진행 중
- 예상: 1시간

### 목표
Claude가 `action=ANSWER`로 "정보가 없어 답할 수 없어요, 판매자에게 문의하세요" 같은 비답변을 내면 지금은 AI 답으로 저장되어 생산자 needsReply 목록에 들어가지 않는다. 이런 답을 전달(HANDOFF)로 처리한다.

### 재현 (10/18, Railway 실제 Claude)
- `POST /api/farms/me/ai-settings/preview`(u-kang, productId p-house) "원산지가 어디예요?" → 3회 모두 `ANSWER` "제공된 정보에 원산지가 없어 … 판매자에게 직접 문의해 주시기 바랍니다", sourceRefs `["product:p-house"]`.
- 근거에 원산지가 없으므로 FEAT-13 정상 흐름 3에 따라 전달되어야 한다.

### 범위 (수정 허용 경로)
- `server/app/ai/grounding.py`, `server/app/ai/service.py`(프롬프트·비답변 처리)
- `server/tests/test_ai_service.py`, `server/tests/test_messaging.py`
- `server/app/ai/spec.md`(구현 결정 한 줄), `server/tasks.md`

### 비범위 (건드리지 않음)
- 규칙 답(`_rule_answer`), 전달 주제 판별, messaging 저장 흐름, 앱 화면
- 제품 스펙 문서: 동작은 FEAT-13에 이미 정해져 있고 구현이 어긋난 버그라 바꾸지 않는다

### 결정 사항
- 10/18 프롬프트만 고치면 모델 출력이 확률적이라 다시 샐 수 있다. 저장 전 검증(`validate_model_answer`)처럼 결정적인 검사를 둔다: 답이 근거·정보 없음을 말하거나 판매자·농가 문의로 돌리면 HANDOFF.
- 10/18 일부만 답하고 나머지는 "근거에 없다"고 하는 답도 전달한다. 소비자 질문을 생산자가 확인하는 쪽이 FEAT-13 원칙(추측하지 않고 전달)에 맞다.
- 10/18 프롬프트에도 "근거에 없다는 답은 ANSWER가 아니라 HANDOFF"를 적어 모델이 처음부터 전달을 고르게 한다.

### 작업
- [x] 비답변 판별(`grounding.is_non_answer`)과 `_claude_answer`의 HANDOFF 처리
- [x] 프롬프트 보강
- [x] 회귀 테스트: 실제 Railway 출력 3개 판별, 정상 답 오탐 없음, 가짜 Claude로 `_claude_answer` HANDOFF, 채팅 전송 시 FORWARDED·needsReply
- [ ] pytest·Ruff, 관련 Playwright(conversation-ui) 통과

### 완료 조건
- [x] 회귀 테스트 포함 pytest·Ruff 통과
- [ ] 머지 후 Railway에서 같은 질문이 HANDOFF인지 확인

### 기록
- 10/18 회귀 테스트 3개를 먼저 추가해 수정 전 실패를 확인했다(판별 함수 없음, `_claude_answer`가 ANSWER 반환, 채팅 답 `handoffStatus` None). 채팅 테스트는 처음에 f-kang 근거가 비어 가짜 Claude가 예외를 내고 기존 실패 경로로 전달되어 버그 없이도 통과했다. f-kang AI 설정에 FAQ를 넣고 Claude 호출 여부를 확인하도록 고쳤다.
- 10/18 수정 후 pytest 327개 통과(3개 추가), Ruff 통과.
- 10/18 AI 1차 리뷰: '정보상 추가 비용 없이'·'농장에서 확인한 당도'가 비답변으로 오탐되어 정규식을 좁혔다(명사+조사 바로 뒤 '없'(없이 제외), '판매자·농가에게/께 문의·확인'만). 두 문장을 오탐 방지 테스트에 추가. pytest 327 통과, Ruff 통과.

