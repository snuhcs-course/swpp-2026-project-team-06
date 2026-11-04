## DEV-84 운영 생산자 앱 새 상품 추가 불가: 자료 분석 꺼진 서버에서 기존 흐름으로 전환

- 이슈: [DEV-84](https://linear.app/sswp6/issue/DEV-84)
- 브랜치: `nemodleo/dev-84-dev-운영-생산자-앱-새-상품-추가-불가-자료-분석`
- 기능·인수 조건: FEAT-03(AC-03-3 문구 초안), FEAT-07 상세 편집, `docs/spec/source-integration.md` DEV-58 새 상품 진입·판매페이지 수정
- 상태: 완료

### 목표
운영 서버는 자료 분석이 배포 보류(`SOURCE_ANALYSIS_ENABLED` 꺼짐)라 `/api/source-analysis/**`가 모두 404다. DEV-58 이후 실서버 모드의 `/products/new`·판매페이지 편집이 이 API만 불러 새 상품을 추가할 수 없다. 꺼진 서버에서는 기존 문구/직접 입력·상세 편집으로 가게 한다.

### 범위 (수정 허용 경로)
- `server/app/source_analysis/router.py`(설정 조회 라우터), `server/app/main.py`(라우터 등록), `server/tests/test_source_analysis.py`
- `packages/api/src/sourceAnalysis.ts`(config 호출)
- `apps/producer/src/app/(tabs)/products/new.tsx`, `apps/producer/src/lib/ProductPageEditor.tsx`
- `scripts/run-integration.mjs`(SOURCE_ANALYSIS_ENABLED 덮어쓰기, 뒤 인자를 Playwright에 전달), `scripts/e2e/source-disabled.spec.ts`(새 파일)
- `apps/producer/spec.md`, `apps/producer/tasks.md`, `server/app/source_analysis/spec.md`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`

### 비범위
- 운영 서버에서 자료 분석 켜기(OpenRouter 키·R2·worker 필요, 배포 보류 결정은 별도), 자료 분석 기능 자체, Mock 흐름(이미 manual), Figma

### 결정 사항
- 10/19 사용 여부는 `GET /api/source-analysis/config` → `{ enabled }`로 알린다. 인증 불필요(카카오 `GET /api/auth/kakao/config` 선례), 기능 게이트(`enabled()`) 밖의 별도 라우터라 꺼져도 200. 404로 추정하지 않는 이유: 기존 상품 편집에서는 404가 "상품 없음"과 구분되지 않는다.
- 10/19 꺼진 서버: `/products/new` → `/products/manual`(Mock과 같은 기존 경로), 판매페이지 편집 → `DetailEditor`. 설정 조회 실패면 지금처럼 오류와 다시 시도 버튼을 보인다(추측으로 다른 경로로 보내지 않음).

### 작업
- [x] 서버 config 라우터 + pytest(꺼짐·켜짐)
- [x] api 클라이언트, new.tsx·ProductPageEditor 분기
- [x] 통합 하네스 덮어쓰기 + 꺼짐 Playwright spec
- [x] 스펙·wiki
- [x] Ruff·pytest, typecheck, test:mock, 통합(꺼짐/켜짐 관련 spec)

### 완료 조건
- [x] 자료 분석이 꺼진 서버에서 새 상품 → 문구/직접 입력으로 상품 추가, 판매페이지 편집 → 기존 상세 편집
- [x] 켜진 서버 흐름 그대로
- [x] 테스트 통과
- [x] 배포 후 실서버 재확인, 테스트 상품 정리(삭제 API 없음 → 비공개 DRAFT로 이름 표시)

### 기록
- 10/19 main 79eaea7에서 시작. 실서버 재현: u-kang `POST /api/products/drafts` 200, `POST /api/source-analysis/product-workspaces` 404 NOT_FOUND(인증 없이도 404 → 기능 게이트).
- 10/19 검증: Ruff 통과, pytest 366/366(신규 1), `npm run typecheck` 4개 통과, `npm run test:mock` 15/15. 통합(별도 DB `farmclub_dev84`) 꺼짐 `SOURCE_ANALYSIS_ENABLED=false`: API 7/7, Playwright 5/5(source-disabled 2 + producer-and-privacy 3). 켜짐: API 7/7, Playwright 18 통과·2 건너뜀(꺼짐 전용) — source-workspace-ui·product-page-workspace·source-editor·producer-and-privacy.
- 10/19 AI 1차 리뷰 반영: 판매페이지 수정의 설정 조회 대기·오류 화면에 뒤로 가기 헤더 추가. 재검증: typecheck 통과, test:mock 15/15, 통합 꺼짐 source-disabled 2/2, 켜짐 product-page-workspace 5/5.
- 10/19 #174 squash merge(abe28df) → main CI·Railway·Vercel 배포 성공. 운영 확인: `GET /api/source-analysis/config` → `{"enabled":false}` 200. farm.farmclub.kr에서 u-kang으로 새 상품 → `/products/manual` → AI 초안 200 → `POST /api/products` 200 → `/products/p-89186c4fe1/edit`, p-house 판매페이지 수정 → 기존 상세 편집, product-workspaces 호출 0, 콘솔 오류 0.
- 10/19 남긴 운영 데이터: 비공개 DRAFT 상품 p-89186c4fe1(이름 `DEV84 검증용(삭제 예정)`, 공개 조회 404)과 AI 초안 2건(d-2ba36f9f25 외 1). 상품 삭제 API가 없어 남겼다.
- 후속: 운영에서 자료 분석을 켜려면 R2·OpenRouter 키, OCR 포함 이미지, worker 서비스가 필요(별도 작업).


