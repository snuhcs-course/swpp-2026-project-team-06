@AGENTS.md

## Claude Code 메모
- 위 `AGENTS.md`가 공용 규칙이다. 이 파일에는 Claude Code 전용 내용만 둔다.
- 공용 스킬은 `.claude/skills` → `.agents/skills` 심링크로 불러온다: `/spec`, `/pr-context`, `/pr-review`.
- 큰 작업은 plan mode로 시작하고, 확정된 계획은 `tasks.md`에 반영한다.
- 개인 규칙은 `CLAUDE.local.md`(gitignore)에 덧붙인다.
- 커밋·PR에 `Co-Authored-By: Claude` 표기를 붙이지 않는다(`.claude/settings.json`의 `attribution`, SWPP-115). AI 사용은 PR 본문 "AI 사용"에 적는다. 개인 `settings.local.json`에서 다시 켜지 않는다.
