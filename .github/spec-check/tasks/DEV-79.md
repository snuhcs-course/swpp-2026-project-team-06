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


