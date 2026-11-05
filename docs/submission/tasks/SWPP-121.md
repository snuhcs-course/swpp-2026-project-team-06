## SWPP-121 I2 AI 협업 보고서 — 장진우 절

- 이슈: [SWPP-121](https://linear.app/sswp6/issue/SWPP-121)
- 브랜치: `jinumeral/swpp-121-ai-report-i2-jinwoo`
- 상태: 완료

### 목표
I2 AI 협업 보고서에 장진우 절을 근거(로컬 세션 export, PR 본문 "AI 사용")가 있는 사실만으로 채우고, Prompt Log에 장진우 입력 프롬프트를 덧붙인다.

### 범위 (수정 허용 경로)
- `docs/wiki/AI-Collaboration-Report---Iteration-2.md` — 진우 행·문단 추가만. 다른 사람 절과 공용 placeholder는 지우지 않는다.
- `docs/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log.md` — 맨 아래 `## Jinwoo Jang` 절 추가만.
- `docs/submission/tasks.md`의 이 절.

### 결정 사항
- 10/23 Session Exporter 0.1.0(`3251f63`), `--repo`는 레포를 담은 프로젝트 폴더. 레포 경로로는 세션이 레포 밖과 오가서 4개 모두 제외됐다. 10개 세션(Codex 3, Claude Code 7), 입력 376건 검토.
- 10/23 자동 가림이 팀 API 키 1건을 놓쳤다. 그 프롬프트는 어디에도 싣지 않고, 검토 뒤 ZIP·압축 해제본·추출본을 지웠다.
- 10/23 Prompt Log는 전체가 아니라 선별. 비밀값, 팀 문서 링크, 운영 데이터·명령 출력, 거친 표현이 든 프롬프트는 뺐다. 실은 프롬프트는 원문 그대로(오타 포함) 두고 영어 번역을 괄호로 단다.
- 10/23 본인(진우)이 초안의 내용·문체를 검토하고 승인한 뒤 커밋했다.
- 10/23 Hyun 절(#234)과 같은 파일이라 placeholder 바로 앞에 진우 내용을 넣었다. 먼저 머지되는 쪽 기준으로 충돌을 푼다.

### 작업
- [x] 세션 export·검토, PR 11건 "AI 사용" 확인
- [x] 보고서 진우 절, Prompt Log 진우 절
- [x] AI 1차 리뷰 반영(사실 정정) → 진우 지시로 사람 Approve 없이 머지

### 기록
- 10/23 문서만 변경이라 실행할 테스트 없음. `git diff --check` 통과.

- 10/23 사용자가 지정 브랜치 push 및 main 대상 PR 생성을 명시 승인했다. 최신 main c884e90의 Makefile 안내, DEV-118 생산자 별도 coverage 결과, SWPP-121 AI 보고서 기여를 보존하며 병합한다. 변경된 테스트 도구를 10/22 측정에 소급 적용하지 않으며 새 제품 테스트를 실행했다고 주장하지 않는다. PR은 draft로 만들고 main 머지는 수행하지 않는다.


