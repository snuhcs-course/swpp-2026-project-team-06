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
2. `.github/pull_request_template.md`를 채워 본문을 만든다. "Spec"에는 이 이슈의 `tasks.md` 섹션(경로#이슈 키)과 관련 FEAT·AC ID를 적는다. 변경 요약은 `tasks.md`의 작업 목록으로 대신해도 된다.
3. `gh pr create --draft --base main --title "[DEV-12] <English summary>" --body-file <본문 파일>`
4. 관련자 알림 문구를 만들어 사용자에게 보여준다. **에이전트가 직접 메시지를 보내지 않는다.**
   - 예: `[DEV-12] draft PR 열었습니다: <PR 링크> — <한 줄 요약>. spec: <tasks.md 경로>`

## 본문 갱신 (리뷰 요청 전)
1. diff를 `tasks.md` 이 이슈 섹션과 대조해 변경 요약을 **파일·기능 단위로** 다시 쓴다. diff에 없는 것은 쓰지 않는다.
2. "리뷰 포인트"에는 리뷰어가 특히 봐야 할 곳(설계 선택, 확신 없는 부분)을 1~3개 적는다.
3. "테스트"에는 실제로 실행한 명령과 결과만 적는다. 안 한 것은 "안 함"이라고 쓴다.
4. "AI 사용"에 도구·모델, Agent 시간, Tokens, AI가 틀려서 사람이 고친 점을 한 줄씩 적는다.
5. `gh pr edit <번호> --body-file <본문 파일>`

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
