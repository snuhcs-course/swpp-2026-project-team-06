## SWPP-120 I2 AI 협업 보고서 — 박현 절

- 이슈: [SWPP-120](https://linear.app/sswp6/issue/SWPP-120)
- 브랜치: `nemodleo/swpp-120-ai-report-i2-hyun`(#234 머지), 후속 `nemodleo/swpp-120-ai-report-i2-hyun-update`
- 상태: 리뷰 중

### 목표
I2 AI 협업 보고서에 박현 절을 근거(PR 본문 "AI 사용", Linear Effort 줄, 로컬 Claude Code 세션)가 있는 사실만으로 채우고, Prompt Log에 박현 입력 프롬프트를 덧붙인다.

### 범위 (수정 허용 경로)
- `docs/wiki/AI-Collaboration-Report---Iteration-2.md` — 박현 행·문단 추가만. 다른 사람 절과 공용 placeholder는 지우지 않는다.
- `docs/wiki/AI-Collaboration-Report---Iteration-2---Prompt-Log.md` — 맨 아래 `## Hyun Park` 절 추가만.
- `docs/wiki/Home.md` — I2 보고서 링크 한 줄.
- `docs/submission/tasks.md`의 이 절.

### 결정 사항
- 10/22 숫자는 PR 본문 "AI 사용"을 기준으로 한다. 머지 PR 25건 중 Agent 시간 기록 23건(약 25h), Tokens 기록 12건(약 14M, 하한). Linear와 다르면(DEV-32) PR 본문을 쓴다.
- 10/22 프롬프트는 로컬 세션 파일(10/18~22)에서 원문 그대로 옮기고 영어 번역을 괄호로 단다. 10/18 이전은 원문이 없어 PR 본문 "대표 요청"을 요약으로 표시한다(원문 아님 명시).
- 10/22 연락처·사업자 서류가 들어간 프롬프트는 싣지 않는다.
- 10/22 Session Exporter는 실행하지 않았다(보고서에 명시). Railway 비밀값 교체 사고는 레포·Linear·로컬 세션에서 근거를 찾지 못해 쓰지 않았다.

### 작업
- [x] 템플릿·I1 보고서·Prompt Log 형식 확인
- [x] 근거 수집(PR 37건 "AI 사용", Linear Effort, 로컬 세션 12개)
- [x] 보고서 박현 절, Prompt Log 박현 절, Home 링크
- [x] AI 1차 리뷰 → ready, #234 머지(10/23)
- [ ] 10/23 후속 갱신 PR 리뷰

### 기록
- 10/22 문서만 변경이라 실행할 테스트 없음. `git diff --check` 통과.
- 10/23 #234 머지 전 main 병합 커밋(69408da)의 충돌 해결에서 이 절이 빠져 다시 넣는다.
- 10/23 후속 갱신: 10/22~23 머지 PR 7건(#230·#231·#236·#253·#254·#256·#258) 반영. 합계는 이 보고서 PR 제외 32건 중 Agent 시간 30건 약 28h(DEV-120 #254·#256은 한 번만), Tokens 15건 약 15M. 오류 2건(#236 가드 메시지의 비밀번호 출력, #258 원인 오진), 수동 결정 1건(DEV-120 쌓기와 #254가 main에 안 들어간 일), Prompt Log 10/22~23 프롬프트 7개.
