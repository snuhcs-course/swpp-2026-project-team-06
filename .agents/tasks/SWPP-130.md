## SWPP-130 PR·Linear 마무리 때 Human 시간을 작성자에게 묻기

- 이슈: [SWPP-130](https://linear.app/sswp6/issue/SWPP-130)
- 브랜치: `jangjinuite/swpp-130-ask-human-time`
- 기능·인수 조건: infra(팀 작업 규칙). 제품 동작 변경 없음.
- 상태: 진행 중

### 목표
에이전트가 마무리한 PR·Linear에 "Agent 시간·Tokens 미계측"만 남고 Human 시간이 빠지는 문제를 막는다. Agent 시간·Tokens는 에이전트가 재서 적고, Human 시간은 마무리 전에 작성자에게 묻는다.

### 범위 (수정 허용 경로)
- `AGENTS.md`
- `.agents/skills/pr-context/SKILL.md`, `.agents/skills/pr-review/SKILL.md`(머지 5단계 Linear 결과), `.agents/tasks/SWPP-130.md`
- `.github/pull_request_template.md`

### 비범위 (건드리지 않음)
- `.github/workflows/**`, `.github/spec-check/**`(형식 자동 검사 없음)
- `docs/wiki/**`

### 결정 사항
- 11/10 진우 결정: PR·Linear를 마무리할 때 에이전트가 작성자에게 Human 시간을 묻는다. Agent 시간도 빠짐없이 적는다(값이 없으면 실행 기록으로 어림).
- 11/10 진우 결정: Agent 시간은 0.5시간 단위로 고정했으니 앞에 '약'을 붙인다(예: `약 1.5h`).
- 11/10 진우 결정: Tokens는 하네스가 준 값만 적고 없으면 비워 둔다. 어림하지 않는다(제출 시트 컬럼에 없음).
- 템플릿 줄은 `Agent 약 ?h / Tokens  / Human 미확인`이다. 채우지 않은 칸이 0으로 읽히지 않게 자리표시만 둔다. 시간은 0.5시간 단위로 적는다.
- 작성자에게 묻지 못했으면 `Human 미확인`으로 두고 완료 보고에 그 사실을 적는다. 템플릿 기본값도 `Human 미확인`이라 0시간으로 읽히는 값이 남지 않는다.

### 작업
- [x] `AGENTS.md` 'AI 사용 기록'
- [x] `pr-context` 본문 갱신 4단계
- [x] `pr-review` 머지 5단계(Linear 결과)
- [x] PR 템플릿 'AI 사용' 줄

### 완료 조건
- [ ] 사람 리뷰(고위험: AGENTS.md·.agents/skills/**)
- [ ] main 머지

### 기록
- 11/10 main 50925f4에서 시작.
- 11/10 scan-before-commit 1회차: WARNING 1(템플릿 Human 0.0h가 지어낸 값으로 읽힘 → `Human 미확인`), INFO 3(pr-context 0.5시간·미계측 금지 보강, 측정 출처 한 줄, 완료 조건·시작 base) 모두 반영.
- 11/10 scan-before-commit 2회차: WARNING 1(하네스가 값을 주지 않을 때 처리 없음 → 실행 기록으로 어림해 적는다), INFO 3(pr-review 5단계에 Human 시간 묻기 추가·범위 확대, 템플릿 주석 0.5시간 단위를 시간 전체로, '작성자(사용자)') 모두 반영.
- 11/10 문서만 바뀌는 변경이라 실행할 테스트가 없다.
- 11/10 scan-before-commit 3회차: CRITICAL·WARNING 0, INFO 5. 반영: 비슷한 빈 값 문구('계측 미제공')도 금지, 템플릿 Agent·Tokens 자리표시, 절 순서(작업 → 완료 조건). 반영 안 함: 어림값 표기('약')는 PM 결정으로 표기하지 않음. Tokens 어림은 PM 결정으로 없앰(빈칸).
- 11/10 scan-before-commit 4회차: CRITICAL·WARNING 0, INFO 3. 반영: AGENTS.md Agent 시간 문장을 한곳으로 모으고 '숫자로 적는다'. 반영 안 함: 템플릿 줄 파싱 없음 확인(조치 불필요), 0.5시간 올림 규칙은 PM이 정한 적 없어 넣지 않음.
- 11/10 PM 결정으로 Agent 시간에 '약' 표기를 넣음(3회차에서 반영 안 한 INFO를 뒤집음).
