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
- 상태: 진행 중

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
- [ ] 계약 테스트 통과(로컬·GitHub)
- [ ] live 재실행에서 이 오류가 다시 나지 않는지 확인(환경 승인 필요, 사람 몫)
- [ ] 사람 1명 승인 후 main 머지

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
