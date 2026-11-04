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

