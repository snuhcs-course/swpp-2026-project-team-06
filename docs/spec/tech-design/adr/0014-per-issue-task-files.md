# 0014 작업 기록을 폴더별 tasks.md에서 이슈별 파일로 나눈다

- 상태: 제안 (2026-11-04). PM 승인 전에는 적용하지 않는다
- 관련: DEV-219, DEV-212(PR #400 `merge=union`·Mock 테스트 글롭), [docs/spec/README.md](../../README.md) 두 층 스펙, `AGENTS.md` 파일 구조·Spec-Anchored 원칙, `.github/spec-check/check.py`

## 배경
폴더마다 `tasks.md` 하나에 이슈 절(`## DEV-xxx …`)을 맨 아래에 덧붙인다. 같은 폴더를 건드린 PR 둘이 동시에 열리면 둘 다 파일 끝을 고치므로 반드시 충돌한다. 11/4 PR #393~#396은 머지마다 서로 충돌해 tasks.md를 5번 손으로 풀었다. 파일도 커졌다: `server/tasks.md` 2,220줄, `apps/producer` 1,419줄, `server/app/source_analysis` 953줄, `apps/consumer` 908줄. 에이전트가 한 이슈 절을 보려고 이 파일을 통째로 읽는다.
PR #400의 `.gitattributes tasks.md merge=union`은 로컬 `git merge`만 돕는다. GitHub PR 화면의 충돌 판정은 이 설정을 모르므로 "Resolve conflicts"는 그대로 뜬다.

## 안 비교
| 안 | 모양 | 충돌 | 에이전트 읽기 | 이전 비용 |
| -- | -- | -- | -- | -- |
| **A (추천)** | `<폴더>/tasks/DEV-123.md` 이슈당 파일. `<폴더>/tasks.md`는 분리 시점 목록으로 얼리고 더 고치지 않는다 | 없음(새 파일만 추가) | 이슈 파일 하나(중앙값 40줄, 최대 298줄) | 스크립트 1회 + 문구 교체 |
| B | 내용은 A처럼 나누되 `tasks.md`를 살아 있는 목록으로 두고 PR마다 링크 한 줄 추가 | 남음(목록 끝 한 줄끼리 충돌) | A와 같음 | A와 같음 |
| C | 레포 루트 `tasks/DEV-123.md` 하나에 모든 폴더 기록 | 없음 | 이슈가 여러 폴더면 한 파일이라 편함 | 같은 키가 여러 폴더에 있어(DEV-58은 4곳) 합칠 때 순서·출처가 섞임. 작업 폴더 옆 `spec.md`와 떨어짐. 한 폴더에 파일 190여 개 |

A를 고른다. 충돌이 구조적으로 사라지고, 작업 폴더 옆에 `spec.md`·`tasks/`가 함께 있는 지금의 "두 층" 그림을 그대로 둔다. B는 충돌을 한 줄로 줄일 뿐 없애지 못한다.

## 결정 (A)
1. **배치**: 새 이슈는 작업 폴더에 `tasks/<이슈 키>.md`(대문자 키, 예: `server/tasks/DEV-216.md`)를 만든다. 한 이슈가 여러 폴더를 쓰면 지금처럼 폴더마다 파일을 둔다. `tasks.md`가 없는 폴더도 `tasks/`만 만든다.
2. **파일 틀**: 지금 `spec` 스킬 템플릿과 같다. 제목 줄 `# DEV-123 <이슈 제목>`(파일이 곧 이슈라 `##`→`#`), 이슈·브랜치·기능·인수 조건·상태, 목표·범위(수정 허용 경로)·비범위·결정 사항·작업·완료 조건·기록. 분리로 옮긴 옛 절은 `## ` 제목을 그대로 둔다(바이트 보존).
3. **`spec.md`는 그대로**: 오래 남는 구현 결정은 계속 폴더 `spec.md`에 둔다. 머지 때 이슈 파일의 결정 사항을 `spec.md`로 옮기는 규칙도 같다. check.py의 "바뀐 구현 파일의 가장 가까운 상위 `spec.md`를 읽는" 동작도 그대로다.
4. **옛 `tasks.md`**: 머리말 + 원래 `## ` 제목 줄 + 새 파일 링크 한 줄씩만 남긴다. 제목 줄이 같으므로 GitHub 앵커(`tasks.md#dev-12-…`)와 `.github/spec.md`의 `spec-check/tasks.md#dev-40` 같은 옛 링크가 계속 맞는 자리로 간다. 이후 아무도 이 파일을 고치지 않는다.

## 이전 (`scripts/split-tasks.py`)
- 기본 dry-run. `--apply`로 쓴다. 절을 `## ` 줄부터 다음 `## ` 직전까지 바이트 그대로 옮긴다(코드 블록 안 `## `는 무시). 같은 폴더 같은 키 절이 여럿이면 원래 순서대로 한 파일에 이어 붙인다. 키 없는 `## ` 절과 머리말은 목록에 남긴다. 키 있는 절이 하나도 없는 파일은 건드리지 않는다.
- 검증: 임시 clone에 적용해 옛 절 269개가 모두 새 파일에 그대로 들어 있음을 확인했고, 두 번 돌려도 바뀌는 것이 없다.
- 2026-11-04 `origin/main`(87792b7) dry-run:

| 폴더 | 줄 | 옮길 절 | 새 파일 | 같은 키 합침 |
| -- | --: | --: | --: | -- |
| `server` | 2,220 | 64 | 48 | DEV-4×5, DEV-58×13 |
| `apps/producer` | 1,419 | 48 | 27 | DEV-3×7, DEV-58×16 |
| `server/app/source_analysis` | 953 | 13 | 11 | DEV-182×3 |
| `apps/consumer` | 908 | 34 | 26 | DEV-3×9 |
| `packages/ui` | 644 | 26 | 14 | DEV-3×6, DEV-57×8 |
| `.github/spec-check` | 439 | 11 | 11 | |
| `packages` | 426 | 11 | 8 | DEV-3×4 |
| `docs/submission` | 375 | 12 | 6 | SWPP-34×4, SWPP-112×4 |
| `docs/spec` | 357 | 9 | 6 | DEV-3×4 (머리 SWPP-18 기록의 키 없는 절 7개는 목록에 남음) |
| 나머지 9곳 | 1,351 | 41 | 35 | `packages/api` DEV-3×6, DEV-58×2 |
| 합계 17곳 | 9,092 | **269** | **192** | 14개 키 |

  `docs/planning/source-analysis/tasks.md`(`# DEV-53` 단일 이슈 형식)는 그대로 둔다. 분리 뒤 목록 17개는 합쳐 1,184줄(`server/tasks.md` 260줄).
- 히스토리: 새 파일은 `git log --follow`로 옛 `tasks.md` 이력을 따라가지 못한다(한 파일이 190개로 갈라진 것은 rename으로 잡히지 않음). 대신 목록에 제목 줄이 남아 있고, 옛 내용은 `git log -S "<문장>" -- <폴더>/tasks.md`나 분리 커밋 직전 `git show <커밋>^:<폴더>/tasks.md`로 찾는다. ADR에 분리 커밋 해시를 적는다.

## 도구·규칙 변경 (적용 PR)
`tasks.md`를 가리키는 곳: 지정 범위 grep 78곳/16파일. 이 중 `docs/wiki` 6곳은 과거 기록이라 두고, **고칠 곳 72곳/14파일 + `check_table.py` 판정 1곳**.
- `check.py` `author_mapping`: `작업 기록:` 값으로 `…/tasks/DEV-123.md`를 받는다(앵커 생략, 키는 파일 이름에서). 옛 형식 `…/tasks.md#dev-xx`도 받는다. `collect()`: 이슈 파일이면 절 대신 파일 전체를 `documents[...]`로 보낸다. 옛 형식인데 같은 폴더에 `tasks/<키>.md`가 있으면 그 파일을 읽는다(분리 뒤 갱신 안 한 PR 본문 대비). 표의 다른 `tasks/*.md`도 파일 전체. `test_check.py`에 두 형식 케이스 추가. `figma_line.py`는 tasks.md를 보지 않아 그대로.
- `check_table.py`: 이슈 파일이면 "파일이 있고 첫 제목 줄에 키가 있음"을 본다.
- 스킬: `spec`(절 추가 → 파일 생성, 템플릿 `templates/task.template.md`로 교체, "같은 폴더에 진행 중 절이 있으면 멈춤" 규칙 삭제), `pr-context`(`작업 기록:` 예시 `server/tasks/DEV-60.md`), `pr-review`(읽을 곳 문구).
- `AGENTS.md` 파일 구조(`tasks.md` 줄 → `tasks/<이슈 키>.md`, "같은 폴더 동시 작업 금지"는 범위가 겹칠 때만으로 완화), Spec-Anchored 원칙 5줄, 작업 순서 3·5, 리뷰 줄, 스킬 표. `CLAUDE.md` 1줄, `.agents/examples` 3줄, PR 템플릿 4곳, `docs/spec/README.md` 3곳, `stack.md` 1곳, `README.md` 2곳(영문), `.github/spec-check/README.md` 4곳.
- PR #400: 글롭 러너는 그대로 둔다. `.gitattributes`의 `tasks.md merge=union`은 분리 PR에서 **지운다**. 얼린 목록에는 필요 없고, 분리 커밋처럼 파일 전체가 바뀌는 병합에서는 union이 옛 내용과 새 목록을 섞어 오히려 망가뜨린다.

## 적용 순서
- 한 PR로 17곳을 한 번에 나눈다(폴더별로 나누면 두 형식이 오래 섞이고 스킬 문구가 두 갈래가 된다). 스크립트 커밋과 문구·체커 커밋을 나눠 리뷰를 쉽게 한다.
- 열린 PR(오늘 기준 #387 xozier, #400, #401, #402, #406, #410, #411, #412)이 tasks.md에 절을 더한다. 기본은 **이들이 머지된 뒤 분리 PR을 main에 맞춰 스크립트를 다시 돌려 머지**한다(스크립트라 재실행 비용이 작다). 분리가 먼저 들어가면 남은 PR 작성자는 main 병합 **전에** `python3 /tmp/split-tasks.py --only DEV-216 --apply`(스크립트는 `git show origin/main:scripts/split-tasks.py`로 받음)를 돌려 자기 절만 `tasks/DEV-216.md`로 꺼내고 커밋한 뒤 병합한다. 임시 clone에서 이 순서로 충돌 없이 병합됨을 확인했다. PR 본문 `작업 기록:` 줄은 새 경로로 고친다.

## 위험
- spec-check 과거 보고서·EVIDENCE의 `tasks.md#dev-xx` 경로는 그대로 두며, 앵커가 목록 제목 줄로 계속 이어진다.
- wiki 동기화는 `docs/wiki/`만 보므로 영향 없다. `docs/wiki` 본문의 tasks.md 언급은 과거 서술이라 두되, 다음 AI 보고서부터 새 경로를 쓴다.
- 습관: 팀원·에이전트가 옛 tasks.md 끝에 절을 계속 덧붙일 수 있다. 목록 머리에 경고 주석을 두고, 후속으로 CI에서 "얼린 tasks.md에 `## ` 줄 추가" 를 경고할 수 있다(이번 범위 밖).
- `docs/spec/tasks.md` 머리(SWPP-18 기록)는 키 없는 절이라 목록에 남는다. 손으로 `tasks/SWPP-18.md`로 옮길지는 PM 결정.

## 팀 공지(한 줄)
"11/○부터 작업 기록은 폴더의 `tasks/<이슈 키>.md` 새 파일로 씁니다(tasks.md 끝에 덧붙이지 않음). 분리 전에 연 PR은 main 병합 전에 `split-tasks.py --only <키> --apply` 한 번만 돌려 주세요 — ADR 0014."
