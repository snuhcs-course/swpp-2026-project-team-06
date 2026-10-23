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

## SWPP-119 공용 AI 규칙: 브랜치 이름 영어 슬러그로, 반복 사고에서 나온 규칙 추가

- 이슈: [SWPP-119](https://linear.app/sswp6/issue/SWPP-119)
- 브랜치: `nemodleo/swpp-119-ascii-branch-names`
- 상태: 완료

### 목표
Linear "Copy git branch name"이 한글 제목을 브랜치 이름에 넣어 생긴 문제(URL 인코딩된 PR 링크, 셸 따옴표, 도구 호환)를 없애고, 최근 2주 반복된 실수를 공용 규칙으로 막는다.

### 범위 (수정 허용 경로)
- `AGENTS.md`
- `.agents/**` (스킬, 예시, 이 파일)

### 비범위 (건드리지 않음)
- `.claude/settings.json`, `CLAUDE.md` (Co-Authored-By 끄기는 SWPP-115 PR #157)
- `.github/**` (PR 템플릿·CI), 기존 브랜치 이름 변경
- `docs/wiki/**` — 개발 규칙 요약 절이 없어 동기화 대상 없음

### 결정 사항
- 10/22 브랜치 이름: `<github 아이디>/<이슈 키 소문자>-<영어 요약 2~5단어>`. Linear는 브랜치 이름이나 PR 제목에 이슈 키만 있으면 PR을 연결한다(Linear 문서 Origin/GitLab "Linking pull requests"; DEV-93은 Linear 제안 브랜치가 한글인데 `zahra/dev-93-purge-test-farm` PR #192가 연결됨, SWPP-118도 영어 브랜치 PR #189·#195·#198 연결).
- 10/22 추가 규칙은 근거 2건 이상이거나 사고로 이어진 것만. AGENTS.md는 한 줄씩, 절차는 스킬에.
- 10/22 넣음: PR 쌓기 금지(#179·#211·#213·#221·#124), base 변경 뒤 CI 확인(#179·#211), `alembic heads` 확인(#213·#124·#121·#113/#119), 브랜치별 로컬 DB(`apps/producer/tasks.md`·`server/tasks.md` 3건), 고정 시계 동률 금지(#213·dc63e6b·#51), 배포 확인(DEV-98·DEV-107 관리자 재배포 미체크, DEV-114), 운영 접근은 사람(`server/tasks.md` 4건·#149), worktree 정리·PR 본문 먼저 읽기(이번 주 사고, 레포 기록 없음), 비밀값 줄에 사업자 정보 추가.
- 10/23 공용/개인 분리: 근거 PR 작성자가 2명 이상인 것만 공용(쌓기 2명, Alembic 3명, 브랜치별 DB 3명, 시각 동률 2명). worktree 정리·PR 본문 먼저 읽기는 한 사람 세션에서만 생겨 개인 규칙(`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`)으로 옮김. base 변경 뒤 CI 확인은 쌓기 절차(`pr-context`)에, 시각 동률은 `pr-review` 테스트 항목에만 둠.
- 10/23 PR 제목 요약도 영어로 제한(사용자 결정). squash merge 때 PR 제목이 main 커밋 제목이 되므로 브랜치와 같이 영어로 맞춘다. 본문·커밋 메시지는 그대로 한국어 가능.
- 10/23 PR 쌓기: 금지 대신 절차로(기본 B → A 후 A → main, 대안 A 먼저 main 후 B `rebase --onto`). 임시 저장소 실험: 위에서부터 base 병합해야 spec-check diff가 B만 남고, A squash 뒤 B를 merge하면 B가 고친 A의 줄에서 충돌(rebase --onto는 없음). 도구 준비(CI·spec-check 트리거, Linear 브랜치 규칙, 선택 증분 spec-check)는 [DEV-126](https://linear.app/sswp6/issue/DEV-126) — 그 전까지는 쌓지 않는다.
- 10/23 main 보호(필수 체크·up to date·승인 필수)는 강제하지 않고 권장. 대신 머지 전 체크 확인, main CI가 깨지면 머지한 사람이 바로 복구.
- 10/22 보류: Co-Authored-By 끄기(SWPP-115 #157 미머지라 중복 안 함), 사람 Approve 규칙과 실제 운영 불일치(10/08 이후 머지 60건 중 59건 Approve 없음 — 팀 결정 필요), integration e2e 로케이터 간헐 실패(3건, 테스트 수정 이슈로).

### 작업
- [x] 브랜치 규칙 변경(AGENTS.md 작업 순서·브랜치 절, spec 스킬·템플릿, pr-context 스킬, 예시)
- [x] 근거 수집(머지 PR·리뷰·tasks.md 기록) → 규칙 추가, 나머지는 PR 본문 "후보(보류)"
- [x] 링크·경로 확인
- [x] AI 1차 리뷰 → ready

### 완료 조건
- [x] 레포 규칙·스킬·예시에 "Copy git branch name" 언급이 남지 않음
- [x] main 머지 (사용자 지시, Approve 없이 — 팀 운영 방식)

### 기록
- 10/22 이슈 생성, 브랜치 직접 생성(origin/main 기준). 규칙·스킬 수정, 문서 변경만이라 실행할 테스트 없음(경로 존재·"Copy git branch name" 잔존 grep만 확인)
- 10/22 PR #231, AI 1차 리뷰 must 0·should 1(브랜치별 DB 구체화) 반영, ready. 사람 리뷰 대기
- 10/23 main 병합 후 머지(사용자 지시). 후속: DEV-126(쌓기 도구 준비)

## DEV-80 [I2-T23 follow-up] 에이전트가 PR 본문 Spec ↔ Code 확인 표를 spec-check 형식대로 채우게 하기

- 이슈: [DEV-80](https://linear.app/sswp6/issue/DEV-80) (관련: DEV-79, DEV-55)
- 브랜치: `nemodleo/dev-80-i2-t23-follow-up-에이전트가-pr-본문-spec-code-확인`
- 기능·인수 조건: infra(에이전트 작업 규칙). 제품 동작 변경 없음.
- 상태: 완료

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
- [x] 사람 1명 승인 후 main 머지(10/23 PR #162, a56408f)

### 기록
- 10/18 main 56ac959에서 시작.
- 10/18 자가 점검 `check_table.py` 확인(Python 3.14.7): #160 현재 본문 → OK(exit 0). #160 처음 본문 → exit 1, `test_check.py` 미매핑과 함수 이름 backtick(`model_review`, `block_type`) 2개를 잡음(실제 run 39129046460의 실패 원인과 같음). 표 없는 본문 → exit 1.
- 10/23 `origin/main`(0d57e99) 병합. 10/18 이후 main에서 이 PR의 파일을 바꾼 커밋은 SWPP-119 #231(pr-context 1·3번 단계에 영어 브랜치 이름·영어 PR 제목 규칙, "PR 쌓기" 절, pr-review 테스트 항목, 이 파일에 SWPP-119 절)과 DEV-88 #181(PR 템플릿에 Figma 절). 충돌 2개: `pr-context/SKILL.md` "draft PR 열기" 1~3번은 main 문구를 그대로 두고 2번 끝에 표 작성·자가 점검 문장만 더했고, `.agents/tasks.md`는 양쪽 절을 모두 남겼다(SWPP-119 → DEV-80 순). PR 템플릿(Figma 절 유지 + 표 주석)과 pr-review는 자동 병합. 병합 후 `python3 .agents/skills/pr-context/check_table.py <#162 본문>` → OK(exit 0, Python 3.14.7). 스킬이 가리키는 경로(`.github/spec-check/check.py`, PR 템플릿, FEAT-06, `server/app/farms/service.py`)는 main에 모두 있음.
- 10/23 PR #162 main 머지(a56408f). 상태·완료 조건은 DEV-81 PR에서 갱신(main 직접 push 금지).
