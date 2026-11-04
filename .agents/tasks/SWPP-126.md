## SWPP-126 PR 작업에서 사람·에이전트 역할 기준과 고위험 변경 사람 승인 규칙

- 이슈: [SWPP-126](https://linear.app/sswp6/issue/SWPP-126)
- 브랜치: `zahra/swpp-126-human-agent-roles`
- 기능·인수 조건: infra(팀 작업 규칙). 제품 동작 변경 없음.
- 상태: 완료

### 목표
TA 피드백("어떤 부분을 agent에게 맡기고 어떤 부분을 사람이 할지 명확한 기준 필요")에 따라, 사람이 책임지는 일과 고위험 변경의 사람 리뷰 규칙을 짧게 정하고, PR 본문에 사람이 한 일이 드러나게 한다.

### 범위 (수정 허용 경로)
- `AGENTS.md`
- `.agents/skills/pr-review/SKILL.md`, `.agents/skills/pr-context/SKILL.md`, `.agents/tasks.md`
- `.github/pull_request_template.md`

### 비범위 (건드리지 않음)
- `.github/workflows/**`, `.github/spec-check/**` — 위험 등급 자동 검사(CI)는 DEV-204
- GitHub 브랜치 보호·CODEOWNERS 설정(관리자 수동)
- `docs/wiki/**` — I3 AI Collaboration Report 작성 때 반영

### 결정 사항
- 11/03 팀 결정(Zahra 전달): 고위험 변경은 사람 리뷰를 예외 없이 받는다. 일정 때문에 승인 생략을 합의한 기간(I2)에도 고위험 PR은 생략하지 않는다.
- 11/03 Zahra 결정: 사람 리뷰는 다른 팀원 Approve 또는 작성자 본인 리뷰(GitHub 자기 Approve 불가라 PR 본문 `사람이 한 일:`에 적음). 에이전트도 사람이 한 일을 적을 수 있지만 사용자가 한 일(말한 것, 직접 한 커밋)만.
- 11/03 Zahra 결정: 규칙을 짧게 한다(큰 회사 관행: 작성자 책임 원칙 + 민감 경로에 사람 리뷰 + 짧은 PR 템플릿). 단계별 역할 표, 사람 체크박스 3개, "근거" 세부 규칙, 리뷰어 기록 추가 줄은 넣지 않는다.
- 11/03 고위험 경로는 경로만으로 정한다(개인정보 일반 조항 없음, spec-check SC-001): `server/migrations/**`, `server/app/*/models.py`, `server/app/accounts/**`, `server/app/admin/**`, `server/app/core/security.py`, `server/app/core/config.py`, `server/app/core/masking.py`, `server/app/orders/**`, `server/app/ai/**`, `.github/workflows/**`, `server/railway.json`, `server/Dockerfile*`, `**/vercel.json`, `**/eas.json`, `AGENTS.md`, `.agents/skills/**`.

### 작업
- [x] `AGENTS.md`: "사람·에이전트 역할" 절(4줄), 머지·사람 리뷰 줄
- [x] `.github/pull_request_template.md`: "AI 사용"에 `위험 등급:`, `사람이 한 일:`
- [x] `pr-context`: 위험 등급·사람이 한 일 채우는 방법
- [x] `pr-review`: 1차 리뷰 위험 등급 항목, 머지 절차 고위험 규칙
- [x] `check_table.py`로 이 PR 본문 표 점검

### 완료 조건
- [x] 사람 리뷰(이 PR 자체가 고위험: `AGENTS.md`·`.agents/skills/**`) — 11/03 Zahra 작성자 본인 리뷰
- [x] main 머지(PR #382)

### 기록
- 11/03 main 896b836에서 시작. 처음엔 단계별 역할 표·체크리스트·근거 규칙까지 넣었으나(`31db9df`~`017c961`) Zahra가 너무 복잡하다고 해 짧게 다시 씀.
- 11/03 spec-code-review pass. Zahra가 짧게 다시 쓴 최종본을 읽고 머지 지시.

