# tasks.md — DEV-10 공통 AI 규칙 파일 작성

- 이슈: [DEV-10](https://linear.app/sswp6/issue/DEV-10) (GitHub #11)
- 브랜치: `nemodleo/dev-10-i1-공통-ai-규칙-파일-작성-agentsskill-pr리뷰-규칙`
- 상태: 진행 중

## 목표
어떤 에이전트(Claude Code / Codex)로 작업해도 같은 워크플로(Spec-Anchored)와 PR·리뷰 규칙을 따르도록, 공용 규칙과 스킬을 레포에 둔다.

## 범위 (수정 허용 경로)
- `AGENTS.md`, `CLAUDE.md`, `.gitignore`
- `.agents/**`, `.claude/skills` (심링크)
- `.github/pull_request_template.md`

## 비범위 (건드리지 않음)
- `docs/wiki/**` (워크플로 wiki 문서화는 SWPP-56)
- `.github/workflows/**` (CI는 #10)
- 브랜치 전략(SWPP-58), GitHub 브랜치 보호 설정(관리자 수동)

## 결정 사항
- 공용 규칙만 git에 올림. 개인 규칙은 local 파일에 **덧붙여** 사용 (Claude: `CLAUDE.local.md`, Codex: `~/.codex/AGENTS.md`)
- spec은 작업 폴더에 `tasks.md` 하나
- 리뷰: AI 1차 리뷰 + 사람 1명 Approve
- 규칙 본문은 한국어
- `AGENTS.md`가 단일 원천, `CLAUDE.md`는 `@AGENTS.md` import
- 스킬 원본은 `.agents/skills/`, `.claude/skills`는 심링크

## 작업
- [x] Linear 이슈 본문(왜·완료 조건) 작성, In Progress
- [x] 브랜치 생성, tasks.md 작성
- [x] draft PR 생성
- [x] `AGENTS.md` / `CLAUDE.md` / `.gitignore`
- [x] 스킬: `spec`, `pr-context`, `pr-review` (`/review`는 Claude Code 내장 명령과 겹쳐서 피함)
- [x] `.claude/skills` 심링크
- [x] `.github/pull_request_template.md`
- [ ] AI 1차 셀프리뷰 → ready for review

## 완료 조건
- [ ] Claude Code에서 `/spec`, `/pr-context`, `/pr-review` 스킬이 보이고 AGENTS.md 규칙을 따름
- [x] Codex에서 AGENTS.md와 `.agents/skills` 인식 (팀원 확인)
- [x] `CLAUDE.local.md`가 git에 잡히지 않음
- [ ] 리뷰 1명 승인 후 main 머지

## 기록
- 10/06 spec 작성, draft PR #15
- 10/06 규칙·스킬·PR 템플릿 작성. Codex(`codex exec`)에서 AGENTS.md 규칙·3개 스킬 인식 확인. Claude Code headless 확인은 CLI 인증 만료로 못 함 → 리뷰어가 새 세션에서 확인
- 10/06 결정: 스킬명 `review` → `pr-review` (Claude Code 내장 `/review`와 충돌 회피)
- 10/06 ! 작업 중 워킹트리가 main으로 전환돼 규칙 커밋이 origin/main에 직접 push됨 → 브랜치로 옮김, main 원복 필요 → PM
