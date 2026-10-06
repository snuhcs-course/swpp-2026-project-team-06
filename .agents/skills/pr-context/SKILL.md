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
1. 브랜치를 push한다.
2. `.github/pull_request_template.md`를 채워 본문을 만든다. "Spec"에는 이 이슈의 `tasks.md` 섹션(경로#이슈 키)과 관련 FEAT·AC ID를 적는다. 변경 요약은 `tasks.md`의 작업 목록으로 대신해도 된다.
3. `gh pr create --draft --base main --title "[DEV-12] <요약>" --body-file <본문 파일>`
4. 관련자 알림 문구를 만들어 사용자에게 보여준다. **에이전트가 직접 메시지를 보내지 않는다.**
   - 예: `[DEV-12] draft PR 열었습니다: <PR 링크> — <한 줄 요약>. spec: <tasks.md 경로>`

## 본문 갱신 (리뷰 요청 전)
1. diff를 `tasks.md` 이 이슈 섹션과 대조해 변경 요약을 **파일·기능 단위로** 다시 쓴다. diff에 없는 것은 쓰지 않는다.
2. "리뷰 포인트"에는 리뷰어가 특히 봐야 할 곳(설계 선택, 확신 없는 부분)을 1~3개 적는다.
3. "테스트"에는 실제로 실행한 명령과 결과만 적는다. 안 한 것은 "안 함"이라고 쓴다.
4. "AI 사용"에 도구·모델, Agent 시간, Tokens, AI가 틀려서 사람이 고친 점을 한 줄씩 적는다.
5. `gh pr edit <번호> --body-file <본문 파일>`

## 규칙
- 제목·브랜치·본문에 이슈 키가 있어야 Linear와 연결된다. `Closes #<GitHub 이슈 번호>`로 GitHub 이슈도 닫는다.
- 범위 밖 변경이 diff에 있으면 본문에 숨기지 말고 "범위 밖 변경"으로 밝히거나 커밋을 분리한다.
- draft 해제(`gh pr ready`)는 `pr-review` 스킬의 AI 1차 리뷰를 마친 뒤에 한다.
