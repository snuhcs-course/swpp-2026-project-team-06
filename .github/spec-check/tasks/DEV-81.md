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

