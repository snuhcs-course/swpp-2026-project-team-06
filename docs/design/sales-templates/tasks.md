## DEV-52 판매페이지 템플릿 3종
- 이슈: https://linear.app/sswp6/issue/DEV-52 · GitHub #100
- 브랜치: jinumeral/dev-52-dev-build-three-source-only-sales-page-templates
- 상태: 구현·검증 완료, PR 리뷰 준비
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
- [x] 세 레이아웃과 작업실 편집·파일 입력·내보내기
- [x] imagegen 배경 및 폰트 원본·라이선스
- [x] 반응형·입력 보존·안전한 텍스트 렌더 검증
- [x] 한글 명세·영문 요약·AI 리뷰·PR

### 기록
- 10/14 사용자의 구현 지시로 시작. Linear 이슈는 GitHub #100과 동기화됨. MCP에 상태 변경 도구가 없어 In Progress 전환은 미완료.

### 검증 결과 (2026-10-14)
- AC-TPL-1: 같은 입력으로 3종 전환·비교, 사진 설명·순서 변경·삭제 확인.
- AC-TPL-2: 사진 0/1/3장, 긴 농가명/상품명, 여러 문단, 빈 선택 정보 확인. 레포 기존 예시 사진은 로컬 QA에만 사용하고 제품 사진 아님을 명시했으며 배포물에는 포함하지 않음.
- AC-TPL-3: HTML 태그 문자열이 텍스트로 표시됨. 손상 JPG·10MB 초과 PNG 오류 안내 후 기존 사진 유지. JSON 다운로드에서 템플릿·글·사진 파일명/설명만 포함하는 것 확인.
- AC-TPL-4: 360/390/430px × 3종의 9개 조합에서 페이지·프레임 넘침 없음. 사진 원본 비율 유지, 키보드 Space 선택, 모바일 편집/미리보기 이동 확인.
- AC-TPL-5: Pretendard 1.3.9 원본/OFL 동봉, 추상 장식 출처 기록. 렌더 경로에 외부 전송·AI 호출 없음.
- node --check: studio.mjs, templates.mjs 통과. git diff --check 통과. 브라우저 콘솔 오류 없음.
- CI 경로 필터상 docs 변경은 apps/server/integration 실제 테스트를 건너뛰므로 위 수동 브라우저 검증과 문법 검사를 별도 수행함.
- 전체 새 코드와 origin/main 대비 범위 검토. 레거시 호환 후보 0건. 어두운 매거진의 빈 소개 안내 대비를 보정함.
- 후속: 사용자 시안 검토 후 AI 추출·원문 대조·판매 저장·앱 통합 범위를 별도 확정.
