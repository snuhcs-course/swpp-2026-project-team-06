# 제출 문서 작업 기록

## SWPP-34 I1 요구사항·설계 제출본 보완

- 이슈: https://linear.app/sswp6/issue/SWPP-34
- 브랜치: `jinumeral/swpp-34-i1-p30-write-github-documentation`
- 상태: 문서 작성·자체 검토 완료, 사람 리뷰 대기
- 기준: main 747f588, FEAT-01~15·17·19·32·33, 스펙 1.2~1.5, 제공된 수업 가이드 PDF

### 목표
영문 요구사항·설계 문서의 빈 항목을 기존 스펙과 코드로 채우고, 개조식·표·그림 중심의 검토 가능한 Wiki 원본을 만든다. PDF는 후속 사용자 지시에 따라 보류한다.

### 범위 (수정 허용 경로)
- `docs/submission/**`
- `docs/wiki/Requirements-and-Specifications.md`
- `docs/wiki/Design-Documentation.md`
- `docs/wiki/Testing-Documentation.md` (오래된 상태 문구만)
- `docs/wiki/images/i1-*`

### 비범위
- 제품 코드·API·스펙 동작 변경, AI 협업 보고서, 일정표, main 머지, PDF 출력·빌더, 제출 ZIP

### 결정 사항
- 10/09 사용자가 계획 실행을 승인함. 별도 확인 없이 근거로 채울 수 있는 부분을 구현한다.
- 10/09 개별 FEAT의 기존 AC ID를 유지하고 주요 정상·실패 조건을 본문에 수록한다. 전체 인수 조건 원본도 기능별로 연결한다.
- 10/09 기존 1.2~1.5 추가 문단을 주제별 본문에 통합한다. 미구현 외부 연동은 완료로 표현하지 않는다.
- 10/09 공식 자료를 확인한 Wadiz와 Local Line을 비교한다. 기능 부재를 근거 없이 X로 단정하지 않는다.
- 10/09 PDF 파일명: team6-iter1-reqspec.pdf, team6-iter1-design.pdf. 모든 페이지를 렌더링·검수한다.
- 10/09 후속 지시: "pdf로는 일단 안 뽑아도됨". PDF 작업을 중단하고 작성한 빌더는 PR에서 제외한다. 기존 출력 초안은 저장소 밖 임시 폴더로 옮기며 납품본으로 제공하지 않는다. Wiki 그림은 유지한다.

### 작업
- [x] 문서와 구현 근거 대조
- [x] 요구사항 본문 및 사용자 흐름·화면 보완
- [x] 설계 본문·아키텍처·DB 모델·API 보완
- 보류: PDF 생성 및 페이지별 시각 검수 (사용자 후속 지시)
- [x] 문서 범위·링크·AC·그림 점검 및 PR 자체 리뷰

### 완료 조건
- [x] 두 영문 Wiki 원본과 참조 그림 제공 (PDF는 보류)
- [x] 근거 없는 제품·테스트·AI 사용 주장 없음
- [x] 리뷰용 PR 준비 (사람 승인·main 머지는 후속)

### 기록
- 10/09 최신 main과 가이드/우수사례 확인. DEV-6 실행 결과는 기존 기록을 인용하며 재실행으로 표현하지 않는다.
- 10/09 Abstract 200단어, 19개 Connextra 스토리와 Given/When/Then, 기존 AC ID, 이미지·소스 링크, 본문 API 경로를 자동 대조했다. 오류 응답 reason을 실제 STALE_VERSION으로 수정하고 첨부 업로드·조회 경로를 구분했다.
- 10/09 다이어그램 5개, 화면 패널 3개를 시각 검수했다. 결제 순서도의 긴 라벨 잘림을 수정했다. 수정 경로는 허용 범위 안이며 AI 보고서·일정표·제품 코드 변경은 없다. CI는 docs-only 변경의 앱·서버 실행 단계를 건너뛰므로 제품 테스트 재실행으로 해석하지 않는다.
- 10/09 scan-before-commit / scan-before-merge 및 저장소 pr-review 자체 검토: 남은 must 없음. 레거시·호환 코드 후보 0건; 그림의 fallback 문구는 기존 AI 동작 설명이며 호환 구현이 아니다.
