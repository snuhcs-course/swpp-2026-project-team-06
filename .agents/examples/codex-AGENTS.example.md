<!--
Codex 개인 규칙 예시.
사용법: 전역 위치에 복사 → `mkdir -p ~/.codex && cp .agents/examples/codex-AGENTS.example.md ~/.codex/AGENTS.md`
Codex는 ~/.codex/AGENTS.md(전역)를 먼저 읽고, 그 다음 레포의 AGENTS.md(공용)를 이어서 읽는다. 그래서 개인 규칙이 공용 규칙 "앞에 덧붙는" 구조가 된다.
레포 안에 AGENTS.override.md를 만들면 공용 AGENTS.md를 대체하므로 만들지 않는다(gitignore됨).
전역 파일이라 다른 프로젝트에도 적용된다. Farmclub 전용 내용은 "Farmclub에서는"으로 범위를 적는다.
-->

# 개인 규칙 (홍길동)

## 응답
- 설명은 한국어로, 코드·명령·경로는 원문 그대로.
- 변경 전 무엇을 바꿀지 파일 목록부터 보여준다.

## 작업 방식
- 큰 작업은 먼저 계획을 제시하고 확인받은 뒤 구현한다(바로 구현하지 않는다).
- 구현 후 `git diff --stat`과 요약을 보여주고, 커밋은 내가 지시할 때만 한다.
- 같은 에러로 2번 실패하면 멈추고 원인 가설을 제시한다.

## Farmclub에서는
- 작업 전 해당 폴더 `tasks.md`를 읽고, 범위 밖 파일은 고치지 않는다(공용 규칙 재확인).
- 스킬은 `.agents/skills/`의 `spec`, `pr-context`, `pr-review`를 쓴다.
