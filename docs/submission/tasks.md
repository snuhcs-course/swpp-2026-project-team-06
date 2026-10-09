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
- `docs/wiki/Proposal.md` (사용자 후속 요청: 개조식 정리·스펙 부록 통합·경쟁 설명 수정)
- `docs/spec/prd.md` (Proposal과 중복된 경쟁 대안의 근거 없는 단정만 수정)
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
- 10/09 사용자 후속 요청으로 농사펀드(Nongsafund)를 경쟁 비교에 추가한다. 공식 사이트와 대표의 2025-12-28 글을 근거로 선구매·농부 관계·과정 공유의 공통점을 인정하고, Farmclub의 감귤 품질 정보·예약 규칙·생산자 업무 흐름을 비교한다.
- 10/09 PDF 파일명: team6-iter1-reqspec.pdf, team6-iter1-design.pdf. 모든 페이지를 렌더링·검수한다.
- 10/09 후속 지시: "pdf로는 일단 안 뽑아도됨". PDF 작업을 중단하고 작성한 빌더는 PR에서 제외한다. 기존 출력 초안은 저장소 밖 임시 폴더로 옮기며 납품본으로 제공하지 않는다. Wiki 그림은 유지한다.
- 10/09 사용자가 Proposal의 긴 스펙 추가 문단과 경쟁 설명 수정을 요청했다. spec 1.3~1.5 요약을 주요 기능·MVP 항목에 통합하고 상세 계약은 Requirements/Design에 연결한다. 한국어 PRD의 동일한 경쟁 단정도 출처 기반 설명으로 맞춘다. 빈 팀·기기·데모 항목은 저장소에서 확인되는 범위로만 채운다.

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
- 10/09 Proposal 후속 정리: 개요·동기는 짧은 문단, 기능·권한·목표·범위는 목록과 표로 정리하고 버전별 부록을 제거했다. 한국어 PRD는 경쟁 대안 문단만 수정했다. 문서 내부 링크·빈 제목·스펙 부록 제거·기존 요구사항 검증과 diff 검사를 통과했으며 제품 테스트는 재실행하지 않았다.

## SWPP-34 I1 팀 역할 표

- 기준: main 706d70d. 기존 PR #58은 머지되어 후속 브랜치에서 작업한다.
- 목표: Wiki 메인에 사용자가 지정한 I1 역할을 기록한다.
- 범위: `docs/wiki/Home.md`의 팀 표, `docs/submission/tasks.md`의 이 섹션.
- 결정: 열 제목은 `Roles(I1)`; 기존 영문 이름·행 순서를 유지한다. Hyun Park = PM, Minsun Kim = Frontend & Consumer Survey, Jinwoo Jang = Frontend & Producer Survey, Zahra = Backend & Database.
- 비범위: 다른 Home 본문, 제품 코드, PDF, main 머지.
- [x] 표 수정, 지정한 값과 diff 검증, 후속 PR #59 제출.
- 검증: 지정한 역할·열 제목·기존 이름과 행 순서 일치, `git diff --check` 통과. 문서 변경만 있어 제품 테스트는 실행하지 않았다.

## SWPP-34 Design Documentation 가이드라인 맞춤

- 기준: main 8f2b8a5(747f588 이후 제품 코드 변경 없음). 브랜치 `nemodleo/swpp-34-design-documentation`.
- 목표: 수업 가이드라인(3 - Design Documentation Guidelines)과 예시 4개(2025 team 16·07·09·04) 형식에 맞춰 Wiki 설계 문서를 보완한다.
- 범위: `docs/wiki/Design-Documentation.md`, `docs/wiki/images/i1-*-class.png`, `docs/wiki/images/i1-ai-answer-sequence.png`, `docs/submission/class-diagrams.mmd`, 이 섹션.
- 비범위: Requirements and Specifications(별도 브랜치), 테스트 내용(Testing Documentation), 제품 코드, 그림 새로 만들기.

### 결정 사항
- 10/09 목차와 개정 이력 1.1을 추가한다.
- 10/09 가이드라인 권장·예시 공통인 프론트엔드·백엔드 클래스 다이어그램을 Mermaid로 추가한다. 백엔드는 함수형 서비스 모듈이라 모듈 단위로 그린다.
- 10/09 API는 주문 생성·결제와 AI 초안의 요청·응답 예시를 실제 스키마(`orders/schemas.py`, `catalog/schemas.py`)와 시드 ID로 넣는다.
- 10/09 GitHub가 클래스 다이어그램 Mermaid를 렌더링하지 못해(`startsWith` 오류, mermaid 11에서는 정상) PNG로 넣고 원본은 `docs/submission/class-diagrams.mmd`에 둔다.
- 10/09 AI 질문 응답 시퀀스 다이어그램과 로그인·채팅·출하 API 예시를 추가한다(실제 스키마·시드 ID 기준).
- 10/09 디자인 패턴은 I5 항목이라 후보 목록만 둔다.
- 10/09 문체는 개발팀이 직접 쓴 평이한 문장으로 맞추고, 미구현 범위는 4장 표로 정리한다.

### 작업
- [x] 가이드라인·예시와 현재 문서 차이 정리
- [x] 목차, 클래스 다이어그램, API 예시, 패턴 자리, 문체 정리
- [ ] GitHub 렌더링 확인, 사람 리뷰
