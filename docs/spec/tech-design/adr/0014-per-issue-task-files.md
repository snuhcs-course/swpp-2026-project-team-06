# 0014 작업 기록을 폴더별 tasks.md에서 이슈별 파일로 나눈다

- 상태: 결정·적용 (2026-11-04). PM이 A안 승인, 같은 날 PR #414(DEV-219)에서 18개 폴더 분리
- 관련: DEV-219, DEV-212(PR #400 `merge=union`·Mock 테스트 글롭), [docs/spec/README.md](../../README.md) 두 층 스펙, `AGENTS.md` 파일 구조·Spec-Anchored 원칙, `.github/spec-check/check.py`

## 배경
폴더마다 `tasks.md` 하나에 이슈 절(`## DEV-xxx …`)을 맨 아래에 덧붙인다. 같은 폴더를 건드린 PR 둘이 동시에 열리면 둘 다 파일 끝을 고치므로 반드시 충돌한다. 11/4 PR #393~#396은 머지마다 서로 충돌해 tasks.md를 5번 손으로 풀었다. 파일도 커졌다: `server/tasks.md` 2,220줄, `apps/producer` 1,419줄, `server/app/source_analysis` 953줄, `apps/consumer` 908줄. 에이전트가 한 이슈 절을 보려고 이 파일을 통째로 읽는다.
DEV-212(PR #400)에서 검토한 `.gitattributes tasks.md merge=union`은 로컬 `git merge`만 돕고 GitHub PR 화면 충돌은 그대로라 머지 전에 뺐고, Mock 테스트 글롭 러너만 들어갔다.

## 안 비교
| 안 | 모양 | 충돌 | 에이전트 읽기 | 이전 비용 |
| -- | -- | -- | -- | -- |
| **A (채택)** | `<폴더>/tasks/DEV-123.md` 이슈당 파일. `<폴더>/tasks.md`는 분리 시점 목록으로 얼리고 더 고치지 않는다 | 없음(새 파일만 추가) | 이슈 파일 하나(중앙값 40줄, 최대 298줄) | 스크립트 1회 + 문구 교체 |
| B | 내용은 A처럼 나누되 `tasks.md`를 살아 있는 목록으로 두고 PR마다 링크 한 줄 추가 | 남음(목록 끝 한 줄끼리 충돌) | A와 같음 | A와 같음 |
| C | 레포 루트 `tasks/DEV-123.md` 하나에 모든 폴더 기록 | 없음 | 이슈가 여러 폴더면 한 파일이라 편함 | 같은 키가 여러 폴더에 있어(DEV-58은 4곳) 합칠 때 순서·출처가 섞임. 작업 폴더 옆 `spec.md`와 떨어짐. 한 폴더에 파일 190여 개 |

A를 채택했다. 충돌이 구조적으로 사라지고, 작업 폴더 옆에 `spec.md`·`tasks/`가 함께 있는 지금의 "두 층" 그림을 그대로 둔다. B는 충돌을 한 줄로 줄일 뿐 없애지 못한다.

## 결정 (A)
1. **배치**: 새 이슈는 작업 폴더에 `tasks/<이슈 키>.md`(대문자 키, 예: `server/tasks/DEV-216.md`)를 만든다. 한 이슈가 여러 폴더를 쓰면 지금처럼 폴더마다 파일을 둔다. `tasks.md`가 없는 폴더도 `tasks/`만 만든다.
2. **파일 틀**: `spec` 스킬 템플릿(`templates/task.template.md`)과 같다. 첫 줄 `## DEV-123 <이슈 제목>`, 이슈·브랜치·기능·인수 조건·상태, `###` 목표·범위(수정 허용 경로)·비범위·결정 사항·작업·완료 조건·기록. 분리로 옮긴 옛 절과 제목 깊이를 맞추려고 `#`로 올리지 않았다.
3. **`spec.md`는 그대로**: 오래 남는 구현 결정은 계속 폴더 `spec.md`에 둔다. 머지 때 이슈 파일의 결정 사항을 `spec.md`로 옮기는 규칙도 같다. check.py의 "바뀐 구현 파일의 가장 가까운 상위 `spec.md`를 읽는" 동작도 그대로다.
4. **옛 `tasks.md`**: 머리말 + 경고 주석 + 원래 `## ` 제목 줄 + 새 파일 링크 한 줄씩만 남긴다. 제목 줄이 같으므로 GitHub 앵커(`tasks.md#dev-12-…`)와 `.github/spec.md`의 `spec-check/tasks.md#dev-40` 같은 옛 링크가 계속 맞는 자리로 간다. 이후 아무도 이 파일을 고치지 않는다.

## 이전 (`scripts/split-tasks.py`)
- 기본 dry-run. `--apply`로 쓴다. 절을 `## ` 줄부터 다음 `## ` 직전까지 바이트 그대로 옮긴다(코드 블록 안 `## `는 무시). 같은 폴더 같은 키 절이 여럿이면 원래 순서대로 한 파일에 이어 붙인다. 키 없는 `## ` 절과 머리말은 목록에 남긴다. 키 있는 절이 하나도 없는 파일은 건드리지 않는다.
- 검증: 임시 clone에 적용해 옛 절 269개가 모두 새 파일에 그대로 들어 있음을 확인했고, 두 번 돌려도 바뀌는 것이 없다.
- 2026-11-04 `origin/main`(8fdb6a8, #400·#401·#402·#406 머지 뒤) 적용 결과:

| 폴더 | 줄 | 옮긴 절 | 새 파일 | 같은 키 합침 |
| -- | --: | --: | --: | -- |
| `server` | 2,220 | 64 | 48 | DEV-4×5, DEV-58×13 |
| `apps/producer` | 1,419 | 48 | 27 | DEV-3×7, DEV-58×16 |
| `server/app/source_analysis` | 953 | 13 | 11 | DEV-182×3 |
| `apps/consumer` | 908 | 34 | 26 | DEV-3×9 |
| `packages/ui` | 644 | 26 | 14 | DEV-3×6, DEV-57×8 |
| `.github/spec-check` | 439 | 11 | 11 | |
| `packages` | 426 | 11 | 8 | DEV-3×4 |
| `docs/submission` | 375 | 12 | 6 | SWPP-34×4, SWPP-112×4 |
| `docs/spec` | 357 | 9 | 6 | DEV-3×4 |
| 나머지 9곳 | 1,526 | 46 | 40 | `packages/api` DEV-3×6, DEV-58×2 |
| 합계 18곳 | 9,267 | **274** | **197** | 14개 키 |

  옛 절 274개가 모두 새 파일에 바이트 그대로 있음을 확인했고, 적용 뒤 dry-run은 "옮길 절 0개"다. `docs/spec/tasks.md` 머리의 SWPP-18 기록(키 없는 `## 목표` 등 7개 절)은 손으로 `docs/spec/tasks/SWPP-18.md`에 바이트 그대로 옮기고 색인에 링크했다. `docs/planning/source-analysis/tasks.md`(`# DEV-53` 단일 이슈 형식)는 그대로 둔다. 색인 18개는 합쳐 1,172줄(`server/tasks.md` 2,220 → 260줄), 이슈 파일은 199개(중앙값 40줄, 최대 298줄).
- 히스토리: 새 파일은 `git log --follow`로 옛 `tasks.md` 이력을 따라가지 못한다(한 파일이 190개로 갈라진 것은 rename으로 잡히지 않음). 대신 목록에 제목 줄이 남아 있고, 옛 내용은 `git log -S "<문장>" -- <폴더>/tasks.md`나 분리 커밋 직전 `git show <커밋>^:<폴더>/tasks.md`로 찾는다. 분리 커밋은 #414의 `chore(tasks): split per-folder tasks.md into per-issue files (DEV-219)`다(squash 뒤에는 #414 머지 커밋).

## 도구·규칙 변경 (PR #414)
`tasks.md`를 가리키는 곳: 지정 범위 grep 78곳/16파일. 이 중 `docs/wiki` 6곳은 과거 기록이라 두고, **고칠 곳 72곳/14파일 + `check_table.py` 판정 1곳**.
- `check.py` `author_mapping`: `작업 기록:` 값으로 `…/tasks/DEV-123.md`를 받는다(앵커 생략, 키는 파일 이름에서). 옛 형식 `…/tasks.md#dev-xx`도 받는다. `collect()`: 이슈 파일이면 절 대신 파일 전체를 `documents[...]`로 보낸다. 옛 형식인데 같은 폴더에 `tasks/<키>.md`가 있으면 그 파일을 읽는다(분리 뒤 갱신 안 한 PR 본문 대비). 표의 다른 `tasks/*.md`도 파일 전체. `test_check.py`에 두 형식 케이스 추가. `figma_line.py`는 tasks.md를 보지 않아 그대로.
- `check_table.py`: 이슈 파일이면 "파일이 있고 첫 제목 줄에 키가 있음"을 본다.
- 스킬: `spec`(절 추가 → 파일 생성, 템플릿 `templates/task.template.md`로 교체, "같은 폴더에 진행 중 절이 있으면 멈춤" 규칙 삭제), `pr-context`(`작업 기록:` 예시 `server/tasks/DEV-60.md`), `pr-review`(읽을 곳 문구).
- `AGENTS.md` 파일 구조(`tasks.md` 줄 → `tasks/<이슈 키>.md`, "같은 폴더 동시 작업 금지"는 범위가 겹칠 때만으로 완화), Spec-Anchored 원칙 5줄, 작업 순서 3·5, 리뷰 줄, 스킬 표. `CLAUDE.md` 1줄, `.agents/examples` 3줄, PR 템플릿 4곳, `docs/spec/README.md` 3곳, `stack.md` 1곳, `README.md` 2곳(영문), `.github/spec-check/README.md` 4곳, `.github/spec.md`·`.github/spec-check/spec.md` 각 1곳.
- PR #400: 글롭 러너는 그대로 둔다. `merge=union`은 머지 전에 빠져 main에 없다. 앞으로도 넣지 않는다: 분리 커밋처럼 파일 전체가 바뀌는 병합에서 union은 옛 내용과 새 목록을 섞는다.

## 적용 순서
- 한 PR(#414)로 18곳을 한 번에 나눴다. 커밋은 체커 → 분리 → 규칙·스킬 → 문서로 나눴다.
- 남은 PR(#410 DEV-215, #411 DEV-214, #412 DEV-216)은 작성자가 main 병합 **전에** 자기 절만 꺼낸다: `git show origin/main:scripts/split-tasks.py > /tmp/split-tasks.py && python3 /tmp/split-tasks.py --only <키> --apply` → 커밋 → `git merge origin/main`. 이 세 브랜치로 임시 clone에서 돌려 보니 tasks.md diff가 0이 되고 병합 충돌이 없었다. PR 본문 `작업 기록:` 줄은 `<폴더>/tasks/<키>.md`로 고친다(옛 줄을 그대로 둬도 checker가 이슈 파일을 찾아 읽는다).
- 팀원 PR #387(DEV-180, `server/tasks.md`)도 같은 방법이다. 작성자에게 안내만 한다.

## 위험
- spec-check 과거 보고서·EVIDENCE의 `tasks.md#dev-xx` 경로는 그대로 두며, 앵커가 목록 제목 줄로 계속 이어진다.
- wiki 동기화는 `docs/wiki/`만 보므로 영향 없다. `docs/wiki` 본문의 tasks.md 언급은 과거 서술이라 두되, 다음 AI 보고서부터 새 경로를 쓴다.
- 습관: 팀원·에이전트가 옛 tasks.md 끝에 절을 계속 덧붙일 수 있다. 목록 머리에 경고 주석을 두고, 후속으로 CI에서 "얼린 tasks.md에 `## ` 줄 추가" 를 경고할 수 있다(이번 범위 밖).

## 팀 공지(한 줄)
"11/4부터 작업 기록은 폴더의 `tasks/<이슈 키>.md` 새 파일로 씁니다(tasks.md 끝에 덧붙이지 않음). 분리 전에 연 PR은 main 병합 전에 `split-tasks.py --only <키> --apply` 한 번만 돌려 주세요 — ADR 0014."
