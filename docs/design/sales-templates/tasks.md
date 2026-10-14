## DEV-52 판매페이지 템플릿 3종
- 이슈: https://linear.app/sswp6/issue/DEV-52 · GitHub #100
- 브랜치: jinumeral/dev-52-dev-build-three-source-only-sales-page-templates
- 상태: 진행 중
- 기능: FEAT-03/04/07, M-11/12, AC-TPL-1~5 (spec.md)

### 목표
사용자 자료로 비교·편집 가능한 기본 상품형/매거진형/농가 편지형을 먼저 검토한다.

### 범위
- docs/design/sales-templates/**
- docs/spec/sales-templates-prototype.md
- docs/wiki/Sales-Page-Templates.md

### 비범위
앱·서버·추출 AI·판매 저장·PR #98·Figma 기존 화면. 생성 상품 사진과 광고 문구, 로고 제안 제외.

### 결정 사항
- 10/14 origin/main 9d6b42e에서 별도 worktree. DEV-51 리뷰와 충돌하지 않는 독립 실행 파일로 제작.
- 10/14 템플릿 수는 10개에서 3개로 축소. imagegen은 사전 추상 장식만, 폰트는 배포 허용 공식 원본만.
- 10/14 근거 없는 샘플 상품/사진을 기본 제공하지 않고 로컬 자료 입력으로 검토.

### 작업
- [ ] 세 레이아웃과 작업실 편집·파일 입력·내보내기
- [ ] imagegen 배경 및 폰트 원본·라이선스
- [ ] 반응형·입력 보존·안전한 텍스트 렌더 검증
- [ ] 한글 명세·영문 요약·AI 리뷰·PR

### 기록
- 10/14 사용자의 구현 지시로 시작. Linear 이슈는 GitHub #100과 동기화됨. MCP에 상태 변경 도구가 없어 In Progress 전환은 미완료.
