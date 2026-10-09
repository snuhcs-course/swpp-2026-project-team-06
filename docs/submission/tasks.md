# 제출 문서 작업 기록

## SWPP-34 I1 요구사항·설계 제출본 보완

- 이슈: https://linear.app/sswp6/issue/SWPP-34
- 브랜치: `jinumeral/swpp-34-i1-p30-write-github-documentation`
- 상태: 진행 중
- 기준: main 747f588, FEAT-01~15·17·19·32·33, 스펙 1.2~1.5, 제공된 수업 가이드 PDF

### 목표
영문 요구사항·설계 문서의 빈 항목을 기존 스펙과 코드로 채우고, 개조식·표·그림 중심의 검토 가능한 Wiki/제출 PDF를 만든다.

### 범위 (수정 허용 경로)
- `docs/submission/**`
- `docs/wiki/Requirements-and-Specifications.md`
- `docs/wiki/Design-Documentation.md`
- `docs/wiki/Testing-Documentation.md` (오래된 상태 문구만)
- `docs/wiki/images/i1-*`

### 비범위
- 제품 코드·API·스펙 동작 변경, AI 협업 보고서, 일정표, main 머지, 제출 ZIP

### 결정 사항
- 10/09 사용자가 계획 실행을 승인함. 별도 확인 없이 근거로 채울 수 있는 부분을 구현한다.
- 10/09 개별 FEAT의 기존 AC ID를 유지하고 주요 정상·실패 조건을 본문에 수록한다. 전체 인수 조건 원본도 기능별로 연결한다.
- 10/09 기존 1.2~1.5 추가 문단을 주제별 본문에 통합한다. 미구현 외부 연동은 완료로 표현하지 않는다.
- 10/09 공식 자료를 확인한 Wadiz와 Local Line을 비교한다. 기능 부재를 근거 없이 X로 단정하지 않는다.
- 10/09 PDF 파일명: team6-iter1-reqspec.pdf, team6-iter1-design.pdf. 모든 페이지를 렌더링·검수한다.

### 작업
- [ ] 문서와 구현 근거 대조
- [ ] 요구사항 본문 및 사용자 흐름·화면 보완
- [ ] 설계 본문·아키텍처·DB 모델·API 보완
- [ ] PDF 생성 및 페이지별 시각 검수
- [ ] 문서 범위·링크·AC·그림 점검 및 PR 리뷰

### 완료 조건
- [ ] 두 영문 문서와 정확한 파일명의 PDF 제공
- [ ] 근거 없는 제품·테스트·AI 사용 주장 없음
- [ ] 리뷰용 PR 준비 (사람 승인·main 머지는 후속)

### 기록
- 10/09 최신 main과 가이드/우수사례 확인. DEV-6 실행 결과는 기존 기록을 인용하며 재실행으로 표현하지 않는다.
