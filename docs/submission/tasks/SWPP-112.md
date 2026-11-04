## SWPP-112 I2 AI 협업 보고서 — Minsun PM 기여

- 이슈: https://linear.app/sswp6/issue/SWPP-112
- 브랜치: `violetsunshades/swpp-112-i2-t47-coordinate-final-revisions-and-verify-submission`
- 상태: 기여 초안 작성 및 AI 자체 검토 완료, 사람 리뷰 예정. 전체 SWPP-112 완료를 의미하지 않는다.
- 기준: `docs/submission/spec.md`의 I2 AI 협업 보고서 기여분, 기존 Wiki 템플릿, 수업 AI Collaboration Report Guidelines v1.1, Session Exporter 안내, 사용자 승인 대화와 실제 기록.

### 목표
기존 보고서 형식을 유지하면서 PM의 계획·역할 교정·리뷰 거버넌스·범위 분리·내부 테스트 판단을 검증 가능한 원문 근거와 함께 기록한다.

### 범위 (수정 허용 경로)
- `docs/wiki/AI-Collaboration-Report---Iteration-2.md`
- `docs/submission/spec.md`의 I2 AI 협업 보고서 기여분
- `docs/submission/tasks.md`의 이 이슈 섹션

### 비범위
- 제품 코드·설정·API·UI·기능 스펙·Figma 변경
- 다른 팀원의 기여 작성, Session Exporter 실행 또는 완료 주장
- PDF·일정표·제출 ZIP·원본 세션 공개, 승인 없는 main 직접 push

### 결정 사항
- 10/22 사용자 요청으로 커밋과 main 대상 PR을 준비한다. 별도 기여 보고서는 만들지 않고 기존 파일에 반영한다.
- 기존 1~7장과 기여 표·Exporter 체크리스트를 유지한다. 자세한 P1~P12 프롬프트와 E1~E5 출처는 같은 페이지 접이식 영역에 둔다.
- 51개 I2 이관 태스크와 128개 I1/I2 effort-format 수정, 9 PASS/6 FAIL/3 BLOCKED PM 시나리오를 서로 구분한다. 당시 기록을 현재 배포 상태로 표현하지 않는다.
- 전체 팀 보고서의 분량 조정·나머지 기여·전체 세션 검토는 후속 작업이다. 이 PR을 전체 제출 완료로 처리하지 않는다.

### 작업 및 완료 조건
- [x] 사용자 승인 PM 기여와 원문 프롬프트를 기존 보고서 구조에 통합
- [x] 선택 대화·원문 turn ID·당시 산출물로 근거를 추적하고 불명확한 수치는 미측정으로 표시
- [x] 문서 범위 및 원래 장 구조를 정적 확인
- [x] AI 자체 검토: 남은 must 없음; PR에 검토 결과 코멘트 기록 예정
- [ ] main 대상 PR 제출 및 사람 리뷰
- [ ] 사람 승인 후 main 머지 (미완료)

### 기록
- 10/22 main/origin/main 동기 상태 확인 후 Linear에서 제공한 SWPP-112 브랜치 이름을 사용한다. 변경 전 로컬 수정은 보고서 한 파일이었다.
- 10/22 문서만 변경한다. 애플리케이션 테스트를 재실행하거나 10/19 내부 테스트를 새로 수행한 것으로 기록하지 않는다.
- 10/22 정적 검토: 원래 장 순서·표, P1~P12·E1~E5, details/code fence 짝, 미완료 Exporter 5항목, 선언한 3개 파일 범위, 알려진 자격증명 문자열 제외와 `git diff --check`를 통과했다. AI 작성자 자체 검토는 사람 승인과 구분한다.

### 10/22 후속 — 내보낸 입력 Prompt Log의 Wiki 게시

- 사용자 지정 브랜치: `llovablanche-AI-Colab-Report-2-revision-1`. 사용자 지정 이름을 유지하며 커밋에는 SWPP-112 키를 포함한다.
- 기준: 해당 브랜치의 사용자 수정본 `c618375` 및 10/22 비공개 Session Exporter 결과. 사용자가 수정한 보고서 날짜·모델 정보·본문은 유지한다.
- 추가 수정 허용 경로: `docs/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log.md`, `docs/wiki/_Sidebar.md`. 기존 보고서·이 spec/tasks의 관련 부분만 함께 수정한다.
- 결정: eTL에는 Prompt Log 원문을 중복 수록할 필요 없이 Wiki 링크를 넣는다는 Q3 안내에 따라 별도 Prompt Log를 연결한다. 앞선 단일 보고서 파일 요청 이후의 명시적 변경이다.
- 결정: 기록 141건의 순서·시각·출처 위치와 입력 문구를 유지하고, 남아 있는 기기명 및 메일 이미지 프록시 URL만 추가 개인정보 표시로 가린다. 원본 ZIP/JSONL과 응답은 커밋하지 않는다.
- [x] Prompt Log 게시용 Markdown 생성 및 보고서·사이드바 링크
- [x] 141건 전체 원문 대조·추가 개인정보 검사·링크/범위 정적 검토
- [x] 사용자 지정 브랜치로 전달할 문서 변경 준비 (커밋 SHA와 push 결과는 완료 보고로 추적)
- [ ] main 머지 후 Wiki 자동 동기화 확인 (이번 요청의 브랜치 push와 구분)
- 검토 결과: 원문 대비 추가 가림은 기기명 5곳·메일 이미지 프록시 URL 9곳뿐이다. 문서 스캔에서 추가 자격증명·알려진 이름/계정·학번 패턴은 남지 않았다. 원래 보고서 장 구성과 미완료 팀 검토 5항목은 유지한다. 기본 `git diff --check`는 새 Prompt Log의 원문 코드 블록 3행(565·725·1058)의 끝 공백을 지적한다. 원문 보존을 위해 유지하며, 세 위치가 모두 원문 블록 안임을 확인했다. 나머지 공백 검사는 `git -c core.whitespace=-blank-at-eol diff --check`로 확인한다. 문서만 바꾸므로 애플리케이션 테스트는 재실행하지 않았다.

## SWPP-112 I2 Testing Documentation 최종 대조

- 이슈: https://linear.app/sswp6/issue/SWPP-112
- 브랜치: `llovablanche-testing-documentation-revision` (사용자 지정)
- 상태: 문서 개정·원본 대조 완료, main 대상 PR 준비. 필수 coverage 증빙은 미충족이며 제출 완료가 아니다. Linear의 기존 Done 상태를 이 문서 작업의 완료 증거로 사용하지 않는다.
- 기준: `origin/main` a2627148b2a4b842133fe361e6b1c4d1c59be36c, Guideline 4, 사용자 제공 최종 워크북 및 후속 승인된 GitHub 증빙 조회.

### 목표
기존 Wiki 문서와 최종 내부 시험 기록을 완전히 대조하고, I2 필수 계획·결과를 출처와 함께 읽을 수 있도록 정리한다. 증빙 없는 필수 항목은 가려서 완료로 만들지 않는다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md`
- `docs/submission/spec.md`의 I2 Testing Documentation 절
- `docs/submission/tasks.md`의 이 절

### 결정 사항
- 10/22 깨끗한 기존 SWPP-112 브랜치를 최신 main으로 fast-forward하여 재사용한다. 커밋·push·PR은 이번 요청에서 실행하지 않는다.
- 10/22 원본 워크북 전체 77건을 영어로 옮기며 TC ID와 시트/행 위치를 유지한다. 합계는 상태 셀을 직접 집계한다: 66 PASS, 6 FAIL, 3 BLOCKED, 2 NOT READY. 기존 3 FAIL/6 BLOCKED 요약을 대체한다.
- 10/22 사용자 후속 요청에 따라 GitHub에서 coverage와 자동화 실행 근거를 찾는다. c98be9b/79eaea7 CI 결과는 별도 실행으로 인용하며 workbook 행의 FAIL/BLOCKED를 해제하지 않는다.
- 10/22 기존 계획/과거 실행 기록은 기준 커밋에 영구 연결해 보존한다. 현재 결과는 workbook과 구분된 GitHub 실행만 사용하고 I1·10/20·모델 개발 실험을 같은 집계에 섞지 않는다.
- 10/22 사전 커버리지 목표·측정 보고서가 없으면 미충족으로 보고한다. 임의 목표·수치·모델 평가·결함 F-03의 내용을 만들지 않는다.
- 10/22 후속 사용자 요청으로 `llovablanche-testing-documentation-revision` 브랜치 생성·커밋·push·main 대상 PR을 진행한다. 사용자 지정 이름이 일반 이슈 키 브랜치 규칙보다 우선하며 커밋·PR 제목에는 SWPP-112를 포함한다. 앞선 로컬 편집 한정 결정을 이 범위에서 대체한다. main 머지는 요청되지 않았다.

### 작업 및 완료 조건
- [x] Guideline 4 전 페이지와 워크북 6탭·주석·링크 전체 추출
- [x] GitHub의 기존 계획·설정·PR·c98be9b/79eaea7 CI 원문 확인
- [x] I2 본문·전체 77건·불일치·후속 조치·가이드 충족표 반영
- [x] 모든 TC/필드·합계·출처 링크·허용 범위·문서 구조 검토
- [x] 작성자 AI 1차 리뷰: 문서 범위/원본 추적/불일치 명시 확인, 미해결 must 없음 (필수 coverage 증빙 미충족은 본문과 PR에서 유지)
- [ ] 사람 검토 후 미충족 필수 증빙 보완 및 제출 확정

### 기록
- 10/22 원본 SHA-256: `aee26d3da0d62626bbc51381514addea836513edd5405cc893d36b378ef7d961`. 임시 추출본은 저장소 밖 작업 outputs에만 둔다. 새 애플리케이션 테스트는 실행하지 않는다.
- 10/22 정적 대조 결과: TC 77개 고유 ID·상태·행 위치·확인 시각·7개 필드 그룹, 원본의 계정/상품/이슈 ID 및 주요 기술 토큰 보존 확인. 집계 66/6/3/2와 UT 26/46/5, 15개 참조 링크 정의·목차 앵커·코드 fence·`git diff --check` 통과. 수정은 선언한 기존 문서 3개뿐이다.
- 10/22 GitHub 원문 로그에서 c98be9b의 pytest 364/Mock 15/API 7/Chromium 43과 79eaea7의 pytest 365/API 7/Chromium 43을 확인했다. 숫자/목표/coverage screenshot은 찾지 못해 미충족으로 표시했다. 커밋·push·PR·제품 테스트·PDF 생성은 실행하지 않았다.
- 10/22 후속 PR 준비: 원격 main은 기준 a262714와 동일하다. `git diff --check`와 3개 문서 허용 범위를 확인했다. 문서 전용 변경으로 새 애플리케이션 테스트는 실행하지 않는다. 최종 커밋 SHA·PR 링크·게시 결과는 완료 보고와 PR에 기록한다.

## SWPP-112 I2 최종 산출물 로컬 검토

- 기준: main `691949e985080f372a45d54fa950191e88adb8ce` (#233 머지), 요구사항/설계/테스트 가이드 전 페이지, 현재 제품 스펙·코드, 확인된 일별 진행 기록, 발표 자료에 연결된 데모 사이트.
- 브랜치: `llovablanche-final-deliverables-for-iteration-2` (검토된 demo README 통합). 별도 `iteration-2-demo` 로컬 작업 트리는 보존한다.
- 상태: 10/23 사용자 요청에 따라 지정 브랜치에 로컬 커밋. Push·PR·main 머지는 별도 확인 전 진행하지 않는다.

### 범위 (수정 허용 경로)
- `docs/wiki/Requirements-and-Specifications.md`
- `docs/wiki/Design-Documentation.md`
- `docs/wiki/Testing-Documentation.md` (새 측정·증빙과 readiness 갱신; 기존 77건 상태 유지)
- `docs/wiki/meetings/2026-10-12-*.md` ~ `2026-10-21-*.md`
- `docs/wiki/images/i2-*` (현재 다이어그램·실제 coverage 보고서 캡처)
- `docs/submission/evidence/iteration-2/**` (coverage 사전 계획·설정·실행 스크립트·집계/실행 근거)
- `docs/submission/spec.md`, `docs/submission/tasks.md`의 이 작업 절
- 루트 `README.md` (검토된 별도 데모 작업 트리의 README를 지정 산출물 브랜치에도 통합) 및 관련 spec/tasks 기록

### 결정 사항
- 10/22 #233은 사용자가 머지한 상태다. 새 문서는 그 결과를 보존한 최신 main에서 준비한다.
- 10/22 기존 원격 `iteration-2-demo`는 10/19 기준이며 main보다 35커밋 뒤에 있다. 로컬 데모 브랜치는 최신 main에서 만들고, 이전 기록을 삭제하지 않는다. 앱의 기능 코드는 바꾸지 않는다.
- 10/22 제공 자료의 일별 기록은 10/21 14:58까지다. 10/22–23 회의나 사용자 테스트 완료를 만들어 채우지 않는다. 일별 로그는 참석이 확정되지 않은 사람을 Attendees로 단정하지 않고 Contributors로 표시한다.
- 10/22 영상은 발표 자료의 demo.farmclub.kr에서 확인한 story/consumer/producer/admin MP4 네 개를 연결한다. 영상의 공개 안내와 코드 스냅샷·로컬 mock 실행·실서버/유료 모델의 차이를 설명한다.
- 10/22 사용자 명시 승인으로 로컬 테스트·coverage 측정을 추가한다. PostgreSQL은 별도 임시 클러스터로 준비하고, collector는 개발 도구로만 설치한다. 제품 의존성·잠금파일·테스트를 임의로 수정하지 않는다.

### 작업
- [x] 현재 코드/가이드/기존 로그/발표 자료/4개 영상 페이지 확인
- [x] 측정 전 coverage 목표·분모·도구·실행 조건 기록
- [x] 로컬 테스트·coverage 실행 및 원문 보고서/스크린샷 확보
- [x] 요구사항과 설계 본문·도식·구현 상태 갱신
- [x] 10/12–21 일별 로그 작성 및 근거·개인정보 검토
- [x] demo README에 네 영상·환경·설정·실행·기능·한계 정리
- [x] 전체 링크·AC·형식·코드 대응·허용 범위 검토 후 사용자에게 검토본 제공
- [x] 사용자 로컬 커밋 승인 (10/23 지정 브랜치 생성·커밋 요청; 제출 확정·PR 승인과는 별도)

### 기록
- 10/22 외부 서비스와 원본 자료는 읽기만 했다. 로컬 작업 폴더는 원본 미러의 sources 밖 outputs이며, 미가공 기록은 Git 밖에 둔다. 이 채팅의 프로젝트 미러는 Git 저장소가 아니어서 앱 관리 worktree 도구 대신 실제 저장소에 별도 로컬 Git worktree를 만들었다.
- 10/22 수치 목표를 저장한 뒤 제품 691949e에서 측정했다. 최초 pytest 420 PASS/2 FAIL은 로컬 DB timezone에 따른 동일 시각의 문자열 차이였다. UTC 설정 후 422 PASS/0 FAIL, 제품 코드나 assertion 변경 없음. Mock 22/admin 18 통과; source-enabled API 7 및 Chromium 65 통과/2 조건부 skip, disabled 설정에서 같은 API 7 및 fallback 2 통과. workspace typecheck 5개, Ruff, Alembic check 통과.
- 10/22 서버 statement 90.90%/branch 75.47%, consumer 54.34%, producer 72.22%, API 86.02%, UI 85.66%, admin JS 68.15%, analytics 79.13% line coverage. accounts/orders/source branch 및 consumer/admin line 목표 미달을 그대로 보고했다. 원본 Python 93개, TS/TSX 142개, admin JS 7개 분모를 확인했다. native HTML ZIP/JSON/로그/실제 HTML 캡처를 보존했다.
- 10/22 Chromium 설치 후 FFmpeg 다운로드가 DNS 문제로 실패했다. 설치된 full Chromium과 video off 설정으로 기존 테스트를 실행했다. c8의 virtual shim 출력 실패는 remap 후 원본 소스 필터 및 출력 옵션을 바로잡아 해결했으며 목표/소스 분모/테스트는 바꾸지 않았다.
- 10/22 Appendix A의 기존 77건은 기준 main과 바이트 단위 동일하다. Req abstract 200단어, 기존 AC 보존, source/support GWT, 현행 구조/상태/입력/실패 도식과 그림 참조를 확인했다. 공개 증빙에 원본 대화/비밀값/개인 로컬 경로를 포함하지 않았다.
- 10/22 원격 main=691949e, demo=7b2b123 유지. 측정용 PostgreSQL과 통합 테스트 서버를 종료했다. 로컬에 uv/PostgreSQL 16 도구를 설치했으며 기록/데이터는 비공개 outputs에 보존한다. 사용자는 누락된 과거 PM HTML/DEV-41 스크린샷을 새로 만들지 않고 현재 근거로 검토하겠다고 답했다.
- 10/22 AI 작성자 1차 검토: 허용 범위/수치/기존 결과 보존/그림/링크/개인정보 확인. 필수 과거 첨부자료 누락과 미달 목표는 문서에 표시했다. 커밋/push/PR/외부 편집 없음. 사용자 검토 승인은 미완료다.

- 10/23 사용자가 `llovablanche-final-deliverables-for-iteration-2` 생성 및 검토본 전체 커밋을 명시 요청했다. 새 브랜치에 문서·일별 로그·도식·coverage 증빙과 검토된 demo README를 함께 포함한다. 기존 demo 작업 트리/브랜치는 보존하고 push·PR·main 변경은 진행하지 않는다. 문서/증빙 커밋 단계이므로 새 제품 테스트는 실행하지 않고 이전 실제 실행 결과와 정적 대조를 사용한다.

- 10/23 커밋 직전 독립 읽기 전용 검토에서 미해결 must 없음. 원본 77건, 21개 증빙 체크섬, 실제 counter 재계산, 200단어 abstract, 로컬 링크, 비밀값/경로 점검 통과. revision history 표의 끊긴 행을 정리했다. 사용자가 승인한 변경 파일만 지정해 stage하고 SWPP-112 문서 커밋으로 기록한다.

- 10/23 stage 후 전체 whitespace 검사에서 자동 생성 로그의 후행 공백/마지막 빈 줄을 발견해 공개 사본의 서식만 정리했다. 모든 공백 제외 token은 원문과 동일함을 확인했고 checksum을 갱신했다. 원본 출력은 비공개 artifacts에 그대로 보존했다.


## SWPP-112 README 범위 복구

- 브랜치: `llovablanche-SWPP-112-readme-scope-fix`
- 계기: 사용자가 데모 README를 iteration-2-demo에만 두어야 한다고 지적했다. PR #241은 이미 main에 머지된 상태다.
- 범위: 루트 README.md의 c884e90 원문 복원, docs/submission/spec.md와 이 작업 기록. 다른 I2 문서/증빙/제품 코드/테스트는 수정하지 않는다.
- 정정: 앞선 demo README 통합은 사용자 요구가 아니라 에이전트의 잘못된 범위 판단이었다. 일반 README를 대체하는 요구로 해석하면 안 된다.
- [x] 머지 전 README 원문과 이후 변경 유무 확인
- [x] 일반 README 복구 변경을 별도 로컬 브랜치에 준비
- [ ] 사용자 확인 후 복구 브랜치 push 및 main 대상 복구 PR 생성
- [ ] 사람 검토 후 main 복구 반영

문서만 복원하므로 새 애플리케이션 테스트는 실행하지 않는다. 원본 blob 일치 및 README 외 파일 보존, diff 형식을 확인한다.

- 10/23 사용자 응답으로 원래 프로젝트 README 복구 브랜치의 커밋/push 및 main 대상 복구 PR 게시를 승인받았다. 독립 읽기 전용 검토에서 README 원문/허용 경로/나머지 문서 및 코드 보존/네 영상/whitespace 확인을 마쳤다. 실제 커밋·push·PR 결과는 완료 보고에 기록한다. main 머지는 하지 않는다.

