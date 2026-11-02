# Spec-to-code check tasks

## DEV-40 [I2-T23] Disabled-by-default spec-to-code checker infrastructure

- 이슈: https://linear.app/sswp6/issue/DEV-40
- 설계: https://linear.app/sswp6/issue/SWPP-90
- 브랜치: `violetsunshades/dev-40-i2-t23-add-an-ai-assisted-spec-to-code-github-actions-check`
- 기능·인수 조건: infra. 사용자 승인 분리 후 DEV-40은 비활성 기본값의 구현·계약 검증·문서·사람 승인/머지를 완료한다. 실제 모델 증거는 DEV-55.
- 상태: 리뷰 중 (사람 승인·머지 대기)

### 목표
명시된 스펙과 PR 코드의 불일치를 보고할 기반을 비활성 기본값으로 제공한다. API 논의는 다른 개발과 core 머지를 막지 않게 후속 이슈로 진행한다.

### 범위 (수정 허용 경로)
- `.github/spec-check/**` — 수집기·모델 클라이언트·검증·프롬프트·계약 검증·격리된 데모·설명
- `.github/workflows/spec-check.yml` — 별도 workflow
- `.github/spec.md`, `.github/tasks.md` — 이 CI 작업의 결정과 이슈 기록만 추가
- `AGENTS.md` — 제품 AI 규칙에 CI 전용 클라이언트 범위를 명시하는 한 줄

### 비범위
- 앱·서버·제품 스펙·기존 CI/wiki-sync·의존성 파일
- repository settings, secrets, billing, 자동 머지/사람 승인 대행

### 결정 사항
- 2026-10-16 기존 PR #106은 merged이며 과거 tasks 상태는 수정하지 않는다. DEV-9/DEV-25/SWPP-89 모두 Linear Done 확인.
- 2026-10-16 root .github의 기존 기록을 보존하고 전용 하위 폴더에서 구현한다.
- 2026-10-16 spec-check 환경/키는 없음. 현재 GitHub 계정은 maintain 권한이며 admin은 아님. 임의 키 탐색·과금 활성화를 하지 않는다.
- 2026-10-16 보호 환경 승인자는 실행할 checker/프롬프트/workflow의 정확한 commit을 확인한다. 키는 live 호출 단계에만 전달한다.
- 2026-10-16 제품 AI 규칙의 CI 예외는 이 PR의 명시적 review point로 기록한다.
- 2026-10-16 모델 job에 환경 설정 확인용 actions: read만 추가한다. required reviewers와 prevent-self-review가 없으면 호출을 중단한다.
- 2026-10-16 비용 없는 계약 검증은 DEV-40/SWPP-90의 실패 처리·증거 요구사항에 포함한다. mock 결과를 genuine 모델 결과로 사용하지 않는다.
- 2026-10-16 사용자 결정: live runs pending. repository variable SPEC_CHECK_ENABLED=true인 경우만 live job을 실행한다. 기본 SKIPPED를 모델 PASS로 해석하지 않는다.
- 2026-10-16 사용자 승인 scope split: live API 설정·genuine mismatch/PASS·실제 모델 finding의 사람 판단을 [DEV-55](https://linear.app/sswp6/issue/DEV-55)로 이전한다. DEV-55가 core 완료 후 진행되며 DEV-40의 머지를 막지 않는다. 원래 요구사항은 후속 이슈에 보존한다.
- 2026-10-16 기존 feature branch가 checker 파일 없이 생성되었어도 실행할 수 있도록 workflow 실행 코드는 GitHub의 고정 test-merge SHA에서 읽는다. 검토 대상 파일은 계속 captured PR head/base에서 읽고 runner SHA를 보고서 metadata에 별도로 기록한다.

### 작업
- [x] 이슈·설계·기존 PR 템플릿/스펙 읽기, 범위 기록
- [x] 수집기/결과 검증/Claude 클라이언트와 workflow 구현
- [x] deterministic 계약 검증 및 실패 처리 확인
- [x] AI 1차 리뷰 및 수정 (작성자 Codex 검토, PR 본문에 결과 기록; 독립 사람 검토 아님)
- [x] actual model mismatch/pass run과 finding resolution을 DEV-55로 이전 (실행 완료를 뜻하지 않음)

### 완료 조건
- [x] workflow PR 및 credential-free CI 결과
- [x] live job 기본 비활성 및 기존 CI 유지
- [x] API 준비·실제 모델 증거는 독립 후속 DEV-55에 기록
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 2026-10-16 계획 작성. 실제 모델 접근·설계 승인 미확인. 확인 안 된 시간·토큰·승인은 기록하지 않는다.
- 2026-10-16 draft PR #107 생성. 로컬 계약 검증 26개 통과, actionlint v1.7.12의 workflow 구문 검사 통과(shellcheck 별도 도구는 미설치). 제품 workflow 및 코드 변경 없음.
- 2026-10-16 작성자 AI 검토에서 hidden artifact 기본 제외를 발견하여 두 report 파일만 명시적으로 허용했다. 삭제 파일의 인용 revision도 보고 metadata에 보존한다.
- 2026-10-16 GitHub checker-tests 및 기존 CI jobs 통과. 키/모델 없음은 INCOMPLETE로 보고되고 artifact 3개를 보존한 것을 확인했다. genuine mismatch/PASS·사람 판단은 미완료. 상세 run 링크는 EVIDENCE.md.
- 2026-10-16 core merge와 live commissioning을 분리했다. 코드/활성화 변수/키는 변경하지 않았다. 이 PR의 사람 리뷰는 여전히 필요하다.

## DEV-55 [I2-T23 follow-up] Configure Claude API access and validate live spec-to-code review

- 이슈: https://linear.app/sswp6/issue/DEV-55
- 브랜치: `nemodleo/dev-55-i2-t23-follow-up-configure-claude-api-access-and-validate`
- 기능·인수 조건: infra. DEV-55 완료 조건 2(보호 환경)의 승인 방식 변경. 실제 MISMATCH/PASS 증거(완료 조건 4~7)는 이 PR 범위가 아니다.
- 상태: 리뷰 중

### 목표
spec-code-review를 승인자 1명의 승인으로 실행하되, PR 작성자 본인도 자기 PR 실행을 승인할 수 있게 한다.

### 범위 (수정 허용 경로)
- `.github/spec-check/check.py`(`check_environment`), `.github/spec-check/test_check.py`, `.github/spec-check/README.md`, `.github/spec-check/spec.md`, `.github/spec-check/tasks.md`

### 비범위
- workflow 권한·트리거, 프롬프트, 수집·검증 로직, 저장소 설정·키(관리자가 따로 함), EVIDENCE.md의 genuine run 기록

### 결정 사항
- 10/18 사용자(박현) 결정: Prevent self-review 필수 확인을 뺀다(A안). Required reviewers는 계속 필수라 모델 호출 전 사람 승인 한 번은 남는다. 승인 없이 자동 실행(B안)은 하지 않는다.
- 10/18 설정 현황(키 값 제외): environment spec-check에 `SPEC_CHECK_MODEL=claude-sonnet-5-5`, secret `SPEC_CHECK_API_KEY` 등록(키 소유자 박현). 모델 선택은 DEV-55 코멘트로 Minsun Kim에게 확인 요청 중. `SPEC_CHECK_ENABLED`는 이 PR 머지 전까지 false.

### 작업
- [x] `check_environment`에서 prevent-self-review 확인 제거, 승인자 없음은 그대로 INCOMPLETE
- [x] 계약 테스트: 승인자 없음 → INCOMPLETE, 승인자 있음(본인 승인 금지 켬/끔) → 통과
- [x] README·spec 갱신

### 완료 조건
- [ ] 계약 테스트 통과(로컬·GitHub)
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 10/18 main 0639fbf에서 시작.
- 10/18 PR #147 머지(c3c721d). 설정: 승인자 4명(nemodleo·jangjinuite·xozier·llovablanche), 본인 승인 금지 꺼짐, 관리자 우회 꺼짐, `SPEC_CHECK_ENABLED=true`. EVIDENCE.md에 키 값 없이 설정 기록. 시연 PR로 live 실행 확인 중.
- 10/18 PR #150에서 첫 live 실행(https://github.com/snuhcs-course/swpp-2026-project-team-06/actions/runs/39124913548): 시연 mismatch → MISMATCH(SC-001, DEMO-AC-01과 `>= 0` 인용), 시연 matched → PASS. 일반 검사는 60 KiB 초과로 INCOMPLETE(모델 호출 없음). 사람 판단(완료 조건 6)은 리뷰어 몫으로 남김.

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

## DEV-79 [I2-T23 follow-up] spec-check: thinking 블록 섞인 모델 응답을 INCOMPLETE로 처리하는 문제

- 이슈: https://linear.app/sswp6/issue/DEV-79 (관련: DEV-55)
- 브랜치: `nemodleo/dev-79-i2-t23-follow-up-spec-check-thinking-블록-섞인-모델`
- 기능·인수 조건: infra. 제품 동작 변경 없음.
- 상태: 완료

### 목표
모델 응답에 `thinking`/`redacted_thinking` 블록이 섞여도 text 블록의 리뷰 JSON으로 검증을 계속한다. 그 외 형식은 지금처럼 INCOMPLETE.

### 범위 (수정 허용 경로)
- `.github/spec-check/check.py`(`model_review`), `.github/spec-check/test_check.py`, `.github/spec-check/README.md`, `.github/spec-check/spec.md`, `.github/spec-check/tasks.md`

### 비범위
- workflow(job 5분 포함), 프롬프트, 수집·검증(`validate`) 로직, 저장소 설정·키, EVIDENCE.md

### 결정 사항
- 10/18 현상: PR #157 run 39128411038 INCOMPLETE "Unexpected model content type."(model `claude-sonnet-5-5`, usage {}). artifact `report.json`에는 블록 type이 남지 않아 실제 타입은 확인할 수 없다.
- 10/18 원인 가설(문서 근거): Claude API 문서(Sonnet 5.5 마이그레이션)상 `claude-sonnet-5-5`는 `thinking`을 생략하면 adaptive thinking으로 돌고, 응답이 빈 `thinking` 블록(기본 display "omitted")으로 시작할 수 있다. checker는 text 외 블록을 모두 거부했다. PR #150 시연은 입력이 작아 thinking을 건너뛰었을 수 있다(간헐).
- 10/18 (b)안 채택: `thinking`·`redacted_thinking`은 내용을 읽지 않고 버리고 text 블록만 이어 붙인다. text 블록이 없거나 그 외 타입(tool_use 등)이면 INCOMPLETE. (a)안(요청에서 thinking 끄기)은 쓰지 않는다: 이 모델에서 `{type: "disabled"}`는 400이고, 대안 `{type: "between_tools"}`는 Sonnet 5.5 전용이라 `SPEC_CHECK_MODEL`을 바꾸면 400이 난다(모델 fallback 금지 원칙과 같은 이유로 모델별 분기를 두지 않음).
- 10/18 원인 확인용으로 INCOMPLETE 메시지에 허용되지 않은 블록의 type 이름만 붙인다(`[a-z_]` 40자 이하만, 그 외는 `unknown`). 본문·thinking 내용·비밀값은 남기지 않는다.
- 10/18 남은 위험: thinking 토큰도 `max_tokens` 4096에 포함되므로 긴 thinking이면 `stop_reason: max_tokens` → INCOMPLETE(안전한 실패)가 날 수 있다. 한도 조정은 spec.md 결정 변경이라 이 이슈에서 하지 않고, 재발하면 후속 이슈로 다룬다.
- 10/18 사용자(박현) 결정: 한도를 늘린다(위 "한도 조정은 하지 않는다"를 대체). checker를 고치는 PR(#160 약 195 KiB)은 물론 2개 파일만 바꾼 #150도 60 KiB에 걸렸다(EVIDENCE.md). 문맥을 자르지 않는 원칙은 유지한다.
  - 입력(파일 1개·전체 문맥·prompt 포함 요청) 60 KiB → 256 KiB. claude-sonnet-5-5 기준 입력 약 $2/MTok이라 한 번에 대략 $0.2 안팎.
  - 출력 `max_tokens` 4096 → 16000. thinking 토큰도 여기에 포함되므로 입력이 커지면 4096에서 잘릴 위험이 크다. 비스트리밍 요청의 권장 상한(약 16000) 안이다.
  - 요청 timeout 60초 → 120초 → 90초(live run 39135896837 지적 반영, 아래 기록). retry 1회와 GitHub API 호출을 합쳐도 workflow job 5분 안에 든다(workflow는 바꾸지 않음).
  - 메시지·문서의 "60 KiB" 문구는 상수에서 만든다.

### 작업
- [x] `model_review`: thinking/redacted_thinking 무시, text 필수, 그 외 타입은 type 이름과 함께 INCOMPLETE
- [x] 계약 테스트: thinking·redacted_thinking 섞인 정상 응답, thinking만 있는 응답, tool_use 섞인 응답, 이상한 type 이름 정리
- [x] README·spec 갱신
- [x] 로컬 `python -m unittest` 실행, GitHub checker-tests 확인
- [x] 입력 256 KiB·출력 16000 tokens로 한도 상향, 문서 갱신, 계약 테스트
- [x] 요청 timeout 90초·GitHub API timeout 상수화, 시간 예산 테스트에 API 호출 합산

### 완료 조건
- [x] 계약 테스트 통과(로컬·GitHub)
- [x] live 재실행에서 이 오류가 다시 나지 않는지 확인(run 39135896837, 아래 기록)
- [x] 사람 1명 승인 후 main 머지(10/23 PR #160, b720b3d)

### 기록
- 10/18 main 56ac959에서 시작.
- 10/18 로컬 `python3 -m unittest discover -s .github/spec-check -p 'test_*.py'`(Python 3.14.7): 28개 통과. 새 테스트 2개는 main의 check.py로 돌리면 실패(failures=6, errors=3)하는 것을 확인. GitHub checker-tests(Python 3.12)는 PR에서 확인 예정.
- 10/18 draft PR #160. GitHub checker-tests 통과(run 39129046460).
- 10/18 live spec-code-review run 39129046460(환경 승인 후): INCOMPLETE "Unmapped changed files: .github/spec-check/test_check.py", 모델 호출 없음. PR 본문 표에서 `test_check.py`를 셋째 열(근거)에만 적어서 생긴 작성자 실수였고, 같은 표의 함수 이름 backtick도 경로로 읽혔다. 본문을 고쳤다.
- 10/18 고친 본문으로 `collect()`를 로컬에서 재현: "Complete context exceeds 60 KiB"(checker 22 KiB·테스트 19 KiB·README·tasks 포함). 이 PR의 일반 검사로는 thinking 수정의 live 검증이 불가능하다. 머지 뒤 작은 PR에 새 이벤트를 만들어(#157은 브랜치 갱신 등, 단순 re-run은 옛 merge SHA의 checker를 씀) 승인·실행해 확인한다.
- 10/18 live spec-code-review run 39134152845(head 181bdaf, 환경 승인 후): 예상대로 "Complete context exceeds 60 KiB" INCOMPLETE, 모델 호출 없음(usage {}). thinking 수정의 live 검증은 아직 안 됨. 남은 방법은 머지 뒤 작은 PR에서 새 이벤트로 실행하거나, 이 PR 본문에 시연 마커를 넣어 시연 job으로 확인하는 것(사용자 결정 대기).
- 10/18 한도 상향 후 로컬 unittest 29개 통과(Python 3.14.7). #160 본문으로 `collect()`·요청 크기를 로컬 재현: 문맥 약 160 KiB, 요청 약 208 KiB로 256 KiB 안. 이 PR의 다음 live 실행은 모델까지 간다(thinking 수정의 live 확인 가능).
- 10/18 live run 39135896837(head cffe3f2, 환경 승인 후): **모델 호출 성공**(usage 입력 74709·출력 1442 tokens, 14.6초). "Unexpected model content type" 재발 없음. 모델 판정은 INCOMPLETE(검증 통과한 정상 보고서). 사유 3개: ① workflow 파일이 문맥에 없어 job 5분 확인 불가 ② 시간 테스트가 GitHub API 호출(20초×3)을 빼고 계산 ③ `prompt.txt`가 문맥에 없음.
- 10/18 ②는 실제 결함: 최악 2×120 + 2 + 20×3 = 302초 > 300초. 요청 timeout을 90초로 낮추고(이번 실행 14.6초) GitHub API timeout을 상수로 빼 테스트가 합산한다(2×90 + 2 + 3×20 = 242초, checkout·setup 여유 포함 300초 안). git 명령(각 20초)은 보통 즉시 끝나므로 합산하지 않는다. ①③은 PR 본문 표의 spec 열에 workflow와 `prompt.txt`를 추가해 해결한다(코드 변경 없음).
- 10/18 timeout 조정 후 로컬 unittest 29개 통과. workflow·`prompt.txt`를 넣은 PR 본문으로 로컬 재현: 요청 약 223 KiB로 256 KiB 안(여유 약 33 KiB, tasks.md 기록이 늘면 줄어듦).
- 10/23 `origin/main`(0d57e99) 병합. 10/18 이후 main에서 이 폴더를 바꾼 커밋은 DEV-88 #181(`figma_line.py`·`test_figma_line.py` 추가, README에 Figma 줄 절, tasks.md에 DEV-88 절)뿐이고 `check.py`·`test_check.py`·`spec.md`는 main에서 바뀌지 않았다. 충돌은 `tasks.md`(양쪽이 맨 아래에 섹션 추가) 하나였고 두 절을 모두 남겼다(DEV-88 → DEV-79 순). README의 한도 문구·thinking 절과 DEV-88 Figma 절은 자동 병합됐다. 병합 후 로컬 `python3 -m unittest discover -s .github/spec-check -p 'test_*.py'`(Python 3.14.7) 41개 통과(check 29 + figma_line 12).
- 10/23 PR #160 main 머지(b720b3d). 상태·완료 조건은 DEV-81 PR에서 갱신(main 직접 push 금지).


## DEV-137 Figma v6 싱크 빈 곳: 관리자 화면 4개, 생산자 farmclub 문의 대화방

- 이슈: [DEV-137](https://linear.app/sswp6/issue/DEV-137) (관련: DEV-88, DEV-98·106·107·111, DEV-110)
- 브랜치: `nemodleo/dev-137-admin-support-figma-sync`
- 기능·인수 조건: 문서·Figma만. 제품 동작 변경 없음
- 상태: 리뷰 중

### 목표
10/23 Figma v6 ↔ 코드 싱크 점검에서 나온 빈 곳 두 가지를 채운다. ① 관리자 웹 `/users`·`/users/<id>`·`/farms`·`/inbox`(PR #213·#211·#202·#221)가 Figma에 없다. 이 PR들은 Figma 줄을 "해당 없음 — 관리자 페이지는 Figma에 화면이 없음"으로 적었지만 10/19부터 '현재 시안 · 관리자' 페이지가 있다. ② 생산자 앱 "farmclub 문의" 대화방(PR #221)은 Figma를 "후속 DEV-110"으로 넘겼지만 DEV-110은 도움말 투어만 다룬다.

### 범위 (수정 허용 경로)
- `docs/design/README.md`(머리말 한 줄), `AGENTS.md`(Figma 원칙 줄에 한 문장), `.github/spec-check/tasks.md`(이 절)
- Figma v6 파일과 레포 밖 스크립트 `figma-plugins/farmclub-admin/`(확장), `figma-plugins/farmclub-dev137/`(새 폴더)

### 비범위
- 관리자 웹·생산자 앱 코드, `figma_line.py` 검사 로직(형식만 보는 방침 그대로), DEV-110 도움말 투어(다른 담당, 범위 안 바꿈)

### 결정 사항
- 10/23 두 빈 곳을 이슈 하나(DEV-137)로 묶었다. 둘 다 같은 점검에서 나온 Figma 반영이고, 문서 한 줄 외에 코드 변경이 없다. DEV-110에는 "farmclub 문의 대화방은 DEV-137이 맡음" 댓글만 남긴다.
- 10/23 관리자 웹이 Figma 기준이라는 사실을 `docs/design/README.md`와 `AGENTS.md`에 적는다. CI `figma-line`은 이미 `scripts/admin-web/**`을 대상 경로로 보므로 검사는 고치지 않는다.
- 10/23 관리자 스크립트는 예전엔 '관리자 · ' 노드를 지우고 새로 만들었다. 지금은 이름이 같은 최상위 프레임을 찾아 안만 다시 그려 A01~A11의 node-id(379:3757 등)를 유지한다. 목록에서 빠진 이름만 지운다. 사이드바는 지금 메뉴 6개(가입 신청·공급 물량 승인·테스트 농가·사용자·사용자 찾기·문의함)로 A01~A11도 함께 맞췄다.
- 10/23 새 관리자 화면은 A12~A24 13개다: 사용자 목록·테스트로 표시 확인/해제·검색 결과 없음, 사용자 상세·입금 확인 대행/환불 칸·사용자 찾기 못 찾음, 테스트 농가 공개 중·미리보기/확인·숨길 수 없음·숨김 탭, 문의함 답변 대기·대화 열기·빈 목록. 시드에 없는 상태(카카오 가입 사용자, 입금 대기 주문, 실사용자 주문 거부, 생산자 문의)는 명세 상자에 '예시'로 적었다.
- 10/23 생산자 쪽은 기존 관례대로 `02 · 채팅 / 1:1`을 고쳐 이름 끝에 "· DEV-137 수정"을 붙이고 같은 줄 x=3470에 "수정 전 · " 사본을 두었다. 대화 화면은 `04 · 소비자 대화`를 복제해 DEV-116 줄 아래 새 줄(y=31100)에 그렸다. 운영팀 말풍선 옆 작은 로고는 Figma 04의 사진 자리 관례를 따랐다(코드 `ChatBubble`에는 아바타가 없다).
- 10/23 Figma MCP는 보기 권한뿐이라 DEV-108·116처럼 사용자 Chrome의 Figma 웹 편집기 콘솔에서 스크립트를 실행했다.

### 작업
- [x] Figma '현재 시안 · 관리자'(node 379:2819): A12~A24 + 명세, A01~A11 사이드바 갱신
- [x] Figma '현재 시안 · 생산자'(node 108:1735): 02 목록 문의방 줄(110:1748, 사본 486:8441), 04-1 문의 대화(486:8627, 명세 486:8686)
- [x] `docs/design/README.md`·`AGENTS.md` 한 줄
- [x] DEV-110 댓글

### 완료 조건
- [x] Figma 문구가 코드 문구와 같음(관리자 고정 문구 자동 대조, 생산자 문구 수동 대조)
- [ ] 사람 리뷰·머지

### 기록
- 10/23 main a56408f에서 시작.
- 10/23 관리자 화면 문구 대조: 24개 화면의 글자 노드 934개를 admin-web 소스(`api/_views/*.html`, `assets/admin.js`, `api/login.js`·`proxy.js`)와 비교했다. 예시 데이터(이름·날짜·금액·ID)를 걷어 낸 뒤 남은 고정 문구는 모두 소스에 있고, 템플릿(`${won(…)}.`, `${n}건`)과 서버 메시지(‘주문을 찾을 수 없어요.’, `server/app/admin/user_detail.py`)만 소스 밖이다.
- 10/23 두 스크립트를 두 번씩 실행해 최상위 node-id가 그대로이고 다른 프레임과 겹치지 않음을 확인했다(관리자 페이지 노드 49개, 생산자 페이지 +5).

## DEV-81 [I2-T23 follow-up] spec-check: 파일 통째 대신 diff와 필요한 기준 문서만 보내기

- 이슈: https://linear.app/sswp6/issue/DEV-81 (관련: DEV-55, DEV-79 #160, DEV-80 #162)
- 브랜치: `nemodleo/dev-81-spec-check-diff-only`
- 기능·인수 조건: infra. 제품 동작 변경 없음.
- 상태: 진행 중

### 목표
일반 PR(diff 100 KiB 이하)이 입력 한도 256 KiB 안에 들어 모델 리뷰가 실제로 끝나게 한다. 지금은 표의 스펙·구현 파일 전문 + 이전 버전 전문 + base 변경본을 보내서 `server/tasks.md`(200 KiB+) 같은 기록 파일이 늘 끼고, 7파일 PR이 212 KiB, 11~24파일 PR이 600 KiB~1.5 MB가 되어 INCOMPLETE만 난다(diff만은 15~170 KiB). 문맥을 잘라 PASS로 만들지 않는 원칙(다 못 보내면 INCOMPLETE)은 유지한다.

### 범위 (수정 허용 경로)
- `.github/spec-check/check.py`(`collect`, `validate`, 발췌 함수), `.github/spec-check/prompt.txt`, `.github/spec-check/test_check.py`, `.github/spec-check/README.md`, `.github/spec-check/spec.md`, `.github/spec-check/tasks.md`
- `.agents/skills/pr-context/SKILL.md`(표에 AC ID를 적는 안내, "통째로 보낸다" 문구 수정)
- `.agents/tasks.md`, 이 파일의 DEV-79·DEV-80 절 — 머지된 두 이슈의 상태·완료 조건 체크만(10/23 사용자 요청, 별도 문서 PR 대신 여기서 처리)

### 비범위
- workflow(`.github/workflows/spec-check.yml`), 저장소 설정·키, 모델·한도 상수(DEV-79 값 유지), EVIDENCE.md
- 표 파서 `author_mapping`과 결정론 검사(표 매핑, 안 적힌 변경 파일, 비밀값, 민감 경로)는 그대로 둔다. 표를 선택으로 바꾸는 안(10/19 초안 D4·D7·D11·D13, 이슈 키를 제목·브랜치에서 읽기)은 채택하지 않는다 — DEV-80(#162)이 표 형식을 막 정착시켰고, 결정론 검사가 모델 호출 전에 실수를 잡는 장치여서다.
- `.agents/skills/pr-context/check_table.py`(파서 시그니처가 바뀌지 않아 수정 없음), `pr-review` 스킬, PR 템플릿

### 결정 사항
- 10/23 모델에 보내는 `context`를 다음으로 바꾼다. 전문(`files`·`previous_files`·`target_changes`)은 보내지 않는다.
  1. `diff`: 지금처럼 `git diff --unified=5 merge-base..head`. 단 lock 파일(`*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), 스냅샷(`*.snap`, `__snapshots__/`), 이미지·폰트·바이너리(`.png .jpg .jpeg .gif .webp .svg .ico .pdf .woff .woff2 .ttf .otf .zip`), 생성 산출물(`*.min.js`, `*.min.css`, `*.map`), `docs/wiki/**`는 diff에서 빼고 `excluded_paths`로 경로만 보낸다. 표 매핑 검사는 제외 경로에도 그대로 적용한다.
  2. `tasks.md`: 전문 대신 `## <이슈 키>` 섹션만(다음 `## ` 전까지).
  3. FEAT 파일(`docs/spec/functional/FEAT-*.md`): PR 본문 `## Spec ↔ Code 확인` 절과 tasks.md 섹션에 적힌 ID(`AC-xx-y`, `R-xx`, `M-xx`)가 있는 줄과 그 들여쓴 하위 줄만. ID가 하나도 없으면 인수 조건 항목(`- [ ] AC-…` 줄) 전부. `rules.md`는 ID가 있는 표 행만, ID가 없으면 전문.
  4. 구현 폴더 `spec.md`: "결정" 표에서 이슈 키 또는 수집한 ID가 있는 행만. 없으면 그 표의 최근 10행. "결정" 표가 없으면 이슈 키가 제목에 있는 절. 어느 것도 없으면 제목 줄만(발췌는 항상 1행 제목을 포함한다).
  5. 그 밖의 1열 참조 파일(workflow, `prompt.txt` 등): `경로#앵커`로 적으면 그 제목 절만, 아니면 `reference_paths`에 경로·크기만. `docs/spec/README.md` 자동 포함은 없앤다.
  6. 바뀐 파일마다 `changed_files[path] = {status, size, previous_size}` 메타만.
  7. 합친 크기가 256 KiB를 넘으면 지금처럼 INCOMPLETE("Split the PR"). 결정론 검사는 그대로.
- 10/23 발췌 문서 형식은 `documents[path] = {kind: "excerpt"|"full", selection: <고른 방법>, segments: [{start, text}]}`. 줄 번호는 **원본 파일 기준**이어서 보고서의 `rules.md:12`가 실제 파일 줄과 같다.
- 10/23 인용 검증(`validate`): requirement는 `documents`에 보낸 segment 안의 줄이고 quote가 그 줄의 부분 문자열. code는 diff 경로이고, 줄 번호는 diff hunk(`@@ -a,b +c,d @@`)에서 계산한 **새 쪽 줄 번호**(추가·문맥 줄)이며 지운 줄은 인용할 수 없다. `reviewed_files`(PASS/MISMATCH)는 `documents` 키와 diff 경로의 합집합과 같아야 한다. finding 스키마(`path`, `line`, `quote`)는 그대로.
- 10/23 diff에 줄 번호를 붙이지 않고 raw unified diff를 그대로 보낸다(지시: "지금처럼"). 모델이 줄 번호를 틀리면 그 finding은 검증에서 걸려 INCOMPLETE가 되므로 PASS로 새지 않는다. 자주 걸리면 후속에서 번호 붙이기를 검토한다.
- 10/23 `prompt.txt`(`dev81-v2`): 스펙 조각과 diff만 받았다는 것, diff 밖 코드·보내지 않은 스펙 문맥이 필요해 판단할 수 없으면 그 항목은 `missing_context`에 `UNVERIFIED: …`로 적고 PASS로 만들지 말라는 것을 명시한다.
- 10/23 demo 모드: fixture `spec.md`는 `documents` full 문서, 구현 fixture는 빈 트리 대비 diff(status added)로 같은 검증 경로를 쓴다.
- 10/23 `pr-context` 스킬: 표 1열 경로 뒤 또는 3열에 AC·R·M ID를 적어야 FEAT 발췌가 그 항목을 포함한다고 한 줄 안내. "checker는 표의 파일을 통째로 보내므로…" 문구를 바꾼다.

### 작업
- [x] `collect`: 제외 경로, tasks 섹션, FEAT·rules ID 발췌, spec.md 결정 행, 앵커 절, changed_files 메타, 전문 제거
- [x] `validate`: documents·diff 기반 인용 검증
- [x] `prompt.txt` 갱신(`dev81-v2`)
- [x] 계약 테스트: 섹션만 추출, AC ID 발췌, 전문 미포함, 제외 경로, 한도 초과 INCOMPLETE, diff 줄 번호 인용·지운 줄 거부, demo 모드
- [x] README·spec·pr-context 스킬 갱신
- [x] `python3 -m unittest discover -s .github/spec-check -p 'test_*.py'`
- [x] 최근 머지 PR(#202 #213 #264 #230)으로 context 크기 전후 측정(모델 호출 없음)
- [x] 머지된 DEV-79·DEV-80 절 상태·완료 조건 갱신(이 파일, `.agents/tasks.md`)

### 완료 조건
- [ ] 계약 테스트 통과(로컬·GitHub checker-tests)
- [ ] 측정 결과 보고(PR별 전후 표)
- [ ] 머지 뒤 ready PR 하나에서 spec-check 승인을 눌러 실제 리뷰 1회 확인(사람 몫)
- [ ] 사람 1명 승인 후 main 머지

### 기록
- 10/23 `origin/main`(a56408f, #160·#162 머지 뒤)에서 시작. 10/19 초안(DEV-79 위에 쌓은 옛 브랜치)은 tasks.md 초안만 참고하고 브랜치는 쓰지 않는다.
- 10/23 로컬 `python3 -m unittest discover -s .github/spec-check -p 'test_*.py'`(Python 3.14.7): 48개 통과(check 36 = 기존 29 + 새 7, figma_line 12). 새 테스트는 main의 check.py로 돌리면 실패한다(`documents` 키 없음).
- 10/23 구현 중 잡은 것: `decisions_excerpt`의 `needles & A | B` 연산자 우선순위 실수(키가 있는 행이 모두 매칭됨)를 테스트가 잡아 괄호로 고침. `git diff --name-status -z`는 `상태\0경로\0` 형식.
- 10/23 크기 측정(수집 함수만, 모델 호출 없음; 네 PR의 실제 표는 DEV-80 이전 형식이라 `author_mapping`이 거부해, 1열 FEAT·rules + 2열 바뀐 파일 전부로 합성한 표를 썼다. 이전 = main의 `collect`, 이후 = 이 브랜치):

  | PR | 바뀐 파일 | diff(제외 후) | 이전(전문) | 이후(diff+발췌) | 발췌 문서 |
  | --- | --- | --- | --- | --- | --- |
  | #202 | 17(제외 1) | 50 KiB | 845 KiB ❌ | 65 KiB ✅ | 9 KiB |
  | #213 | 21(제외 1) | 52 KiB | 924 KiB ❌ | 75 KiB ✅ | 16 KiB |
  | #264 | 24(제외 1) | 92 KiB | 1,672 KiB ❌ | 115 KiB ✅ | 14 KiB |
  | #230 | 57(제외 1) | 183 KiB | 2,366 KiB ❌ | 231 KiB ✅ | 29 KiB |

  제외된 파일은 모두 `docs/wiki/*.md`. 발췌가 9~29 KiB에 그쳐 크기는 diff가 결정한다. #230처럼 diff 180 KiB 이상이면 한도에 가까우니 PR을 나누는 안내가 그대로 필요하다.
- 10/23 PR #281(ready). `origin/main`(57dcb0b, DEV-133·SWPP-125·SWPP-115·DEV-136·DEV-137) 병합: 충돌은 `.agents/tasks.md`·이 파일(양쪽이 맨 아래에 절 추가)이고 모든 절을 남겼다(DEV-137 → DEV-81 순). checker 파일은 main에서 바뀌지 않았다. 병합 후 로컬 unittest 48개 통과.
- 10/23 첫 live 실행(run 39947732979, PR #281 자체): MISMATCH 1건(SC-001) — `collect`가 tasks.md 섹션 ID를 `segments[0]`(제목 줄)에서만 찾아 섹션에만 적힌 ID가 수집되지 않음. 모든 조각을 합쳐 찾도록 고치고, ID가 섹션에만 있는 테스트 추가. 새 수집 경로의 크기·thinking 처리는 문제 없이 모델까지 감.

## DEV-144 spec-code-review AI 비용을 서버에 보고

- 이슈: [DEV-144](https://linear.app/sswp6/issue/DEV-144) · 작업 기록 본문은 [`server/tasks.md#DEV-144`](../../server/tasks.md)
- 범위: `check.py`(보고 함수), `test_check.py`, `backfill_usage.py`(새 파일), `README.md`, 이 파일, `.github/workflows/spec-check.yml`(spec-code-review·live-demo 단계에 `SPEC_CHECK_USAGE_URL`·`SPEC_CHECK_USAGE_TOKEN` 두 줄)
- 결정: 모델 응답에 `usage`가 있을 때만 PR 번호·제목·head SHA·결과·모드·모델·입력/출력 토큰·실행 URL을 `POST <SPEC_CHECK_USAGE_URL>`로 보낸다. 두 값 중 하나라도 없으면 보내지 않는다. 보고 실패는 경고 한 줄만 찍고 리뷰 결과·보고서·종료 코드는 바꾸지 않는다. 표준 라이브러리만 쓴다.
