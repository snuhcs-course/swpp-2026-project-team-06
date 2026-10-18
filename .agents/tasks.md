# .agents tasks

## DEV-10 공통 AI 규칙 파일 작성

- 이슈: [DEV-10](https://linear.app/sswp6/issue/DEV-10) (GitHub #11)
- 브랜치: `nemodleo/dev-10-i1-공통-ai-규칙-파일-작성-agentsskill-pr리뷰-규칙`
- 상태: 진행 중

### 목표
어떤 에이전트(Claude Code / Codex)로 작업해도 같은 워크플로(Spec-Anchored)와 PR·리뷰 규칙을 따르도록, 공용 규칙과 스킬을 레포에 둔다.

### 범위 (수정 허용 경로)
- `AGENTS.md`, `CLAUDE.md`, `.gitignore`
- `.agents/**`, `.claude/skills` (심링크)
- `.github/pull_request_template.md`

### 비범위 (건드리지 않음)
- `docs/wiki/**` (워크플로 wiki 문서화는 SWPP-56)
- `.github/workflows/**` (CI는 #10)
- 브랜치 전략(SWPP-58), GitHub 브랜치 보호 설정(관리자 수동)

### 결정 사항
- 공용 규칙만 git에 올림. 개인 규칙은 local 파일에 **덧붙여** 사용 (Claude: `CLAUDE.local.md`, Codex: `~/.codex/AGENTS.md`)
- 스펙은 두 층: `spec.md`(구현 결정) + `tasks.md`(이슈별 기록, 누적)
- 리뷰: AI 1차 리뷰 + 사람 1명 Approve
- 규칙 본문은 한국어
- `AGENTS.md`가 단일 원천, `CLAUDE.md`는 `@AGENTS.md` import
- 스킬 원본은 `.agents/skills/`, `.claude/skills`는 심링크
- 2026-10-07 제품 스펙 원본 `docs/spec` 연동(#16), 기술 스택 반영(#17)

### 작업
- [x] Linear 이슈 본문(왜·완료 조건) 작성, In Progress
- [x] 브랜치 생성, tasks.md 작성
- [x] draft PR 생성
- [x] `AGENTS.md` / `CLAUDE.md` / `.gitignore`
- [x] 스킬: `spec`, `pr-context`, `pr-review` (`/review`는 Claude Code 내장 명령과 겹쳐서 피함)
- [x] `.claude/skills` 심링크
- [x] `.github/pull_request_template.md`
- [x] 개인 규칙 예시 파일 `.agents/examples/` (Claude·Codex·Claude 권한 설정)
- [x] 두 층 스펙·docs/spec 연동·기술 스택 반영
- [ ] AI 1차 셀프리뷰 → ready for review

### 완료 조건
- [ ] Claude Code에서 `/spec`, `/pr-context`, `/pr-review` 스킬이 보이고 AGENTS.md 규칙을 따름
- [x] Codex에서 AGENTS.md와 `.agents/skills` 인식 (팀원 확인)
- [x] `CLAUDE.local.md`가 git에 잡히지 않음
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/06 spec 작성, draft PR #15
- 10/06 규칙·스킬·PR 템플릿 작성. Codex(`codex exec`)에서 AGENTS.md 규칙·3개 스킬 인식 확인. Claude Code headless 확인은 CLI 인증 만료로 못 함 → 리뷰어가 새 세션에서 확인
- 10/06 결정: 스킬명 `review` → `pr-review` (Claude Code 내장 `/review`와 충돌 회피)
- 10/06 ! 작업 중 워킹트리가 main으로 전환돼 규칙 커밋이 origin/main에 직접 push됨 → 브랜치로 옮김, origin/main을 bc6965e로 force-with-lease 원복 완료
- 10/06 결정: 같은 폴더에서 여러 세션이 브랜치를 바꾸지 않는다 → AGENTS.md에 worktree 규칙 추가
- 10/06 개인 규칙 예시 파일 추가 (사용자 요청)

## DEV-80 [I2-T23 follow-up] 에이전트가 PR 본문 Spec ↔ Code 확인 표를 spec-check 형식대로 채우게 하기

- 이슈: [DEV-80](https://linear.app/sswp6/issue/DEV-80) (관련: DEV-79, DEV-55)
- 브랜치: `nemodleo/dev-80-i2-t23-follow-up-에이전트가-pr-본문-spec-code-확인`
- 기능·인수 조건: infra(에이전트 작업 규칙). 제품 동작 변경 없음.
- 상태: 진행 중

### 목표
에이전트가 PR 본문을 쓸 때 `Spec ↔ Code 확인` 표를 spec-check(`.github/spec-check/check.py` `author_mapping`)가 읽는 형식으로 채우고, PR을 열기 전에 스스로 점검한다.

### 범위 (수정 허용 경로)
- `.agents/skills/pr-context/SKILL.md`, `.agents/skills/pr-context/check_table.py`(자가 점검), `.agents/skills/pr-review/SKILL.md`, `.agents/tasks.md`
- `.github/pull_request_template.md` — 주석 한 줄

### 비범위
- `.github/spec-check/**`(checker 동작 변경은 DEV-79·후속 이슈), `AGENTS.md`, 앱·서버·제품 스펙

### 결정 사항
- 10/18 사용자(박현) 결정: 표 작성 규칙을 `.agents` 스킬에 넣어 에이전트가 따르게 한다. 지금까지는 에이전트가 PR마다 형식을 임의로 정했다.
- 10/18 규칙은 checker 코드에서 그대로 옮긴다: `## Spec ↔ Code 확인` 절, `작업 기록:` 줄의 `<폴더>/tasks.md#<이슈 키>` 경로, 3열 표 중 1열(spec)과 2열(구현)에 둘 다 backtick 경로가 있는 줄만 읽음, 바뀐 파일은 모두 1·2열 어딘가에 있어야 함, backtick 안의 값은 모두 파일 경로로 읽힘.
- 10/18 자가 점검은 checker의 `author_mapping`을 직접 불러 바뀐 파일과 대조한다. 모델·키·네트워크가 필요 없다. 입력 한도 숫자는 checker 버전마다 달라서(60→256 KiB, DEV-79) 스킬에 숫자를 쓰지 않는다.
- 10/18 diff 기반으로 바꾸면(후속 제안) 표가 선택 사항이 될 수 있다. 그 전까지는 이 규칙을 쓴다.

### 작업
- [x] `pr-context`: 표 작성 규칙과 자가 점검 명령
- [x] `pr-review`: 표가 diff 전체를 덮는지 확인 항목
- [x] PR 템플릿 주석
- [x] 자가 점검 명령을 #160 본문(정상)과 고치기 전 본문(오류)으로 확인

### 완료 조건
- [x] 자가 점검이 정상 본문은 통과, 잘못된 본문은 실패로 잡음
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 10/18 main 56ac959에서 시작.
- 10/18 자가 점검 `check_table.py` 확인(Python 3.14.7): #160 현재 본문 → OK(exit 0). #160 처음 본문 → exit 1, `test_check.py` 미매핑과 함수 이름 backtick(`model_review`, `block_type`) 2개를 잡음(실제 run 39129046460의 실패 원인과 같음). 표 없는 본문 → exit 1.
