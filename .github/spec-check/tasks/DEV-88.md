## DEV-88 화면이 바뀌면 Figma v6도 맞추게 하기(PR 본문 Figma 줄 + CI 검사)

- 이슈: [DEV-88](https://linear.app/sswp6/issue/DEV-88)
- 브랜치: `nemodleo/dev-88-dev-화면이-바뀌면-figma-v6도-맞추게-하기pr-본문-figma`
- 기능·인수 조건: infra. 제품 동작 변경 없음. 화면 모양 기준 Figma v6(DEV-51)
- 상태: 완료

### 목표
DEV-74는 `tasks.md`에 Figma를 비범위로 적고 넘어가 Figma만 옛 화면으로 남았다. 문장 규칙만으로는 약하므로 원칙(AGENTS.md)·PR 템플릿·CI 결정적 검사로 막는다.

### 범위 (수정 허용 경로)
- `.github/spec-check/figma_line.py`(새 파일), `.github/spec-check/test_figma_line.py`(새 파일), `.github/spec-check/README.md`, `.github/spec-check/tasks.md`
- `.github/workflows/spec-check.yml`(`figma-line` 잡 추가)
- `.github/pull_request_template.md`(`## Figma` 절)
- `AGENTS.md`(원칙 한 줄)
- `apps/producer/tasks.md`(DEV-74 기록 한 줄)

### 비범위
- Figma 파일 자체(관리자 화면은 다른 작업이 그림), 모델 기반 spec-check 로직, `pr-context` 스킬(템플릿을 채우므로 따로 안 고침), branch protection 필수 체크 등록

### 결정 사항
- 10/19 형식은 한 줄 `Figma: <값> — <내용>`. 값은 `반영함`(Figma 링크 또는 node-id `123:456`), `해당 없음`(이유), `후속`(`DEV-숫자`). 구분자는 `—`·`–`·`-`·`:`·공백 모두 받는다. HTML 주석 안 줄은 세지 않고, 줄이 둘 이상이면 실패.
- 10/19 대상 경로는 `apps/*/src/**`, `packages/ui/src/**`, `scripts/admin-web/**`(테스트·문서·설정 파일 제외: 점 파일, `*.md`, `package.json`, `vercel.json`). `apps/*/src`는 화면·화면 부품·문구 파일이 섞여 있어 전부 대상으로 두고, 로직만 바꾼 PR은 `해당 없음 — 이유`로 통과한다.
- 10/19 checker-tests처럼 test-merge 커밋(`github.sha`)을 checkout하고 첫 부모와의 `git diff --name-only --no-renames`로 바뀐 파일을 구한다. 토큰·API 호출 없음. 본문은 이벤트 파일에서 읽어 `edited` 때 새 본문으로 다시 돈다.
- 10/19 봇 PR(Dependabot)은 건너뛴다. fork PR은 키가 필요 없으니 돈다.
- 10/19 처음에는 branch protection 필수 체크로 등록하지 않는다(spec-check 기존 방침). 빨간 잡으로 보인다.
- 10/19 이 검사는 본문 형식만 보고 Figma 내용은 보지 않는다. `반영함` node-id가 Figma에 실제로 있는지 REST API로 확인하는 일은 [DEV-89](https://linear.app/sswp6/issue/DEV-89)로 뺐다(사용자 결정). 버전 시각·문구·스크린샷 비교는 오탐이 많아 하지 않는다.

### 작업
- [x] `figma_line.py` 검사, `test_figma_line.py`(빈 줄·형식 오류·후속 키 없음·대상 경로·진입점)
- [x] `figma-line` 잡
- [x] PR 템플릿 `## Figma` 절, AGENTS.md 한 줄, README
- [x] DEV-74 기록

### 완료 조건
- [x] 계약 테스트 통과(로컬·GitHub checker-tests)
- [x] 이 PR에서 `figma-line` 통과
- [x] main 머지(10/19 사용자가 직접 머지, 사람 Approve 없음)

### 기록
- 10/19 main b6ee11a에서 시작.
- 10/19 계기 사례 확인: PR #158(DEV-74)의 실제 본문·바뀐 파일로 `figma_line.evaluate`를 돌리면 FAIL(화면 경로 4개, "Figma 줄이 없다"). README 7절에 사례를 적음.
- 10/19 사용자 지시로 소문자 `figma:`·굵게 `**Figma:**`도 Figma 줄로 인식. 최근 머지 PR 25개에 돌려 보니 `scripts/admin-web/README.md`·`.gitignore`·`.vercelignore`만 바뀐 경우도 대상이 돼 문서·설정 파일을 대상에서 뺌.
- 10/19 GitHub에서 figma-line·checker-tests·apps·server 통과(2933123). spec-code-review는 보호 환경 승인 대기인 채로 머지.

