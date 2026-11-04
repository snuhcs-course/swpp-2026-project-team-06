## SWPP-123 Testing Documentation — 10/20 운영 서버 재시험 기록 복구

- 이슈: [SWPP-123](https://linear.app/sswp6/issue/SWPP-123)
- 브랜치: `zahra/swpp-123-testing-doc-1020-retest`
- 상태: 진행 중

### 목표
10/22 정리(SWPP-112, `ae153e9`)에서 빠진 10/20 운영 서버 운영자 점검(SWPP-118) 결과를 workbook 집계와 분리해 다시 보이게 하고, 사실과 달라진 A-17·A-04 후속 문구를 고친다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md` — 3.4 뒤 소절 추가, A-04·A-17 후속 문구, Appendix B 한 행.
- `docs/submission/tasks.md`의 이 절.

### 결정 사항
- 10/23 77건 workbook 상태·집계(66/6/3/2)는 바꾸지 않는다. PM의 "10/20 결과를 같은 집계에 섞지 않는다" 결정을 따른다.
- 10/23 원문 20단계 표는 다시 붙이지 않고 `b7d3417` 커밋 링크로 보존한다. 요약 표에는 원문에 기록된 것만 쓰고, 기록되지 않은 F-07 UI 진입·F-08 재로그인은 "이 실행에 없음"으로 남긴다.

### 작업
- [x] 3.4 뒤 "Follow-up retest on 20 October (SWPP-118)" 소절
- [x] A-04 issue #126, A-17 후속 문구, Appendix B 행
- [ ] PM 확인 후 머지

### 기록
- 10/23 문서만 변경이라 실행할 테스트 없음. `git diff --check` 통과.

