---
name: pr-context
description: tasks.md 이 이슈 섹션, 관련 FEAT·AC ID, git diff를 바탕으로 PR 본문을 작성하고 draft PR을 열거나 갱신한다. spec 첫 커밋 직후 draft PR을 열 때, 리뷰 요청 전 PR 본문을 최신화할 때 사용.
---

# pr-context — PR 본문 작성과 draft PR

PR 본문은 리뷰어가 코드를 열기 전에 "무엇을, 왜, 어디까지" 알게 하는 문서다.

## 입력
- 작업 폴더 `tasks.md`의 이 이슈 섹션과, 거기 적힌 관련 FEAT·AC ID(`docs/spec/functional/FEAT-xx-*.md`)
- `git log main..HEAD --oneline`, `git diff main...HEAD --stat`, 필요한 부분의 `git diff main...HEAD`

## draft PR 열기 (spec 첫 커밋 직후)
1. 브랜치 이름이 영어 슬러그(`<github 아이디>/<이슈 키 소문자>-<영어 요약>`, 한글 없음)인지 확인하고 push한다. PR을 연 뒤에는 이름을 바꾸지 않는다.
2. `.github/pull_request_template.md`를 채워 본문을 만든다. "Spec"에는 이 이슈의 `tasks.md` 섹션(경로#이슈 키)과 관련 FEAT·AC ID를 적는다. 변경 요약은 `tasks.md`의 작업 목록으로 대신해도 된다. "Spec ↔ Code 확인" 표는 아래 "Spec ↔ Code 확인 표" 절에 따라 채우고 자가 점검을 통과시킨다.
3. `gh pr create --draft --base main --title "[DEV-12] <English summary>" --body-file <본문 파일>`
4. 관련자 알림 문구를 만들어 사용자에게 보여준다. **에이전트가 직접 메시지를 보내지 않는다.**
   - 예: `[DEV-12] draft PR 열었습니다: <PR 링크> — <한 줄 요약>. spec: <tasks.md 경로>`

## 본문 갱신 (리뷰 요청 전)
1. diff를 `tasks.md` 이 이슈 섹션과 대조해 변경 요약을 **파일·기능 단위로** 다시 쓴다. diff에 없는 것은 쓰지 않는다.
2. "리뷰 포인트"에는 리뷰어가 특히 봐야 할 곳(설계 선택, 확신 없는 부분)을 1~3개 적는다.
3. "테스트"에는 실제로 실행한 명령과 결과만 적는다. 안 한 것은 "안 함"이라고 쓴다.
4. "AI 사용"에 도구·모델, Agent 시간, Tokens, AI가 틀려서 사람이 고친 점을 한 줄씩 적는다.
5. 새로 바뀐 파일을 "Spec ↔ Code 확인" 표에 더하고 자가 점검을 다시 돌린다.
6. `gh pr edit <번호> --body-file <본문 파일>`

## Spec ↔ Code 확인 표 (spec-check 형식)
CI의 spec-check(`.github/spec-check/check.py`)가 이 표를 기계적으로 읽는다. 형식이 틀리면 모델 호출 전에 INCOMPLETE가 난다. draft PR을 열 때와 본문을 갱신할 때마다 아래대로 채운다.

- 절 제목은 템플릿 그대로 `## Spec ↔ Code 확인`이다. 바꾸지 않는다.
- `작업 기록:` 줄에 이 이슈 섹션을 backtick으로 적는다: `` - 작업 기록: `server/tasks.md#dev-60` ``. 경로는 `…/tasks.md`로 끝나고 `#` 뒤는 이슈 키(`dev-12`, `swpp-34`)로 시작한다. 그 tasks.md에 `## DEV-60 …` 섹션이 있어야 한다.
- 표는 3열이다. checker는 **1열(요구사항)과 2열(구현)에 둘 다 backtick 경로가 있는 줄만** 읽는다. 3열(근거)은 읽지 않는다.
  - 1열: 기준 문서 경로. 예: `docs/spec/functional/FEAT-06-farm-search-follow.md`, 폴더 `spec.md`. 바뀌지 않았지만 판단에 필요한 파일(workflow, 프롬프트 등)도 여기에 적는다.
  - 2열: 바뀐 코드·테스트·문서 경로.
- `git diff --name-only main...HEAD`의 **모든 파일**이 1열이나 2열 중 한 곳에 있어야 한다. 테스트 파일도 2열에 적는다. 작업 기록의 tasks.md는 자동으로 포함된다.
- backtick 안의 값은 전부 repo 상대 **파일 경로**로 읽힌다. 함수·클래스·상수 이름, 폴더, glob, URL은 backtick 없이 쓴다. 예: `` `server/app/farms/service.py` (list_farms) `` (O), `` `list_farms` `` (X). `경로#앵커`는 써도 된다.
- 문서만 바꾼 PR도 같은 형식이다: 1열에 기준 문서, 2열에 바뀐 문서.
- `.env*`, `node_modules`, `.venv`, `dist`, 키 파일(`.pem` 등)이 바뀌면 checker가 읽지 않아 INCOMPLETE가 된다. 표에서 빼지 말고, PR 본문에 사람 리뷰로 대신한다고 적는다.
- checker는 표의 파일을 통째로 보내므로 큰 파일이 많으면 입력 한도(`check.py`의 `MAX_INPUT`)를 넘을 수 있다. 문맥을 줄이려고 바뀐 파일을 빼지 않는다. 넘으면 PR을 나누거나 사람 리뷰로 대신한다고 적는다.

PR을 열거나 본문을 고치기 전에 자가 점검을 돌린다. 모델·키·네트워크가 필요 없다. 레포 루트에서 실행하고, `OK`가 나올 때까지 표를 고친다.

```bash
python3 .agents/skills/pr-context/check_table.py <본문 파일>
```

## 규칙
- 제목의 요약은 영어로 쓴다(예: `[DEV-12] Add order cancel API`). 본문은 한국어로 써도 된다.
- 제목·브랜치·본문에 이슈 키가 있어야 Linear와 연결된다. `Closes #<GitHub 이슈 번호>`로 GitHub 이슈도 닫는다.
- base는 기본적으로 `main`이다. 다른 작업 브랜치 위에 쌓을 때는 아래 "PR 쌓기"를 따른다.
- 범위 밖 변경이 diff에 있으면 본문에 숨기지 말고 "범위 밖 변경"으로 밝히거나 커밋을 분리한다.
- draft 해제(`gh pr ready`)는 `pr-review` 스킬의 AI 1차 리뷰를 마친 뒤에 한다.

## PR 쌓기 (A ← B)
**DEV-126 전까지는 쌓지 않는다.** 지금은 base가 작업 브랜치인 PR에서 CI·spec-check가 돌지 않는다(`branches: [main]`).

- 먼저 쌓지 않을 방법을 찾는다. B가 A의 일부(모델·마이그레이션·API 스키마)만 필요하면 그 부분을 작은 PR로 먼저 머지하고, A·B 모두 `origin/main`에서 딴다.
- 쌓을 때는 한 단계(A ← B)까지만 한다. B는 A에서 따고 PR base를 A로 둔다. spec-check·CI는 base 대비 diff, 즉 B의 변경만 본다.
- 최신화는 위에서부터 base를 병합한다: A에 `origin/main`, 그다음 B에 A. 아래 브랜치만 main을 받으면 B의 diff에 main 변경이 섞인다.
- Linear 브랜치 규칙(DEV-126)이 없으면 B를 A에 머지할 때 B 이슈가 Done으로 바뀐다. 그때는 B 이슈를 In Review로 되돌린다.

### 기본: B → A, 그다음 A → main
1. B를 A에 squash merge한다.
2. A PR 본문에 `Fixes DEV-<B>`와 `Closes #<B의 GitHub 이슈>`를 추가한다. GitHub는 main에 머지될 때만 이슈를 닫는다.
3. A는 평소대로 `origin/main` 병합 → 확인 → main에 squash merge. main에 들어가는 단위(A+B)로 CI·spec-check가 한 번 더 돈다. A 리뷰어는 B 부분도 본다.

### 대안: A → main, 그다음 B (B가 크거나 따로 배포할 때)
1. A를 main에 squash merge한다. A 브랜치는 직접 지우지 않는다. 머지 뒤 자동 삭제될 때만 GitHub가 B의 base를 main으로 바꿔 주고, 먼저 지우면 B PR이 닫힐 수 있다.
2. B는 merge가 아니라 rebase로 A의 옛 커밋을 뺀다. merge하면 B가 고친 A의 줄에서 충돌한다.
   ```bash
   git fetch origin
   FORK=$(git merge-base HEAD $(gh pr view <A번호> --json headRefOid -q .headRefOid))
   git rebase --onto origin/main "$FORK"
   git push --force-with-lease origin HEAD
   ```
3. base가 `main`인지 확인하고, push 뒤 CI·spec-check가 다시 돌았는지 본다.
