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

