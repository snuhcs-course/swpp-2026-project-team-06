## DEV-57 상세 템플릿 시각 통합 보완 (2026-10-17)

- 이슈: https://linear.app/sswp6/issue/DEV-57
- 브랜치: `jinumeral/dev-56-dev-build-producer-source-upload-evidence-review-and-private`
- 기능·인수 조건: FEAT-03/04/07, AC-SRC-7/9, AC-TPL-4/5/10, M-11/12
- 상태: 리뷰 중. 사용자 요청으로 기존 PR #113에 포함, 머지/배포 금지.

### 목표
자료 검토·적용은 연결됐지만 DEV-52 최종 단일 상세 템플릿의 구역 구성, ImageGen 아이콘과 사진 테두리가 ModuleStory에 누락됐다. 생산자 미리보기와 구매자 상세에 같은 시각 디자인을 적용한다.

### 범위
- `packages/ui/src/ModuleStory.tsx`, `packages/ui/src/SourcePhoto.tsx`, `packages/ui/assets/source/**`, `packages/ui/package.json`, `package-lock.json`
- `packages/ui/spec.md`, `packages/ui/tasks.md`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`
- `scripts/e2e/source-analysis.spec.ts`, `scripts/e2e/source-detail-design.spec.ts`

### 결정 사항
- 기존 `docs/design/sales-templates/all-sections.*`와 자산 기록을 원본으로 사용한다. HTML 작업실의 예시 상품·미입력 자리 표시·선택 패널은 공개 본문에 이식하지 않는다.
- 18개 저장 모듈은 그대로 두고 표지/구성/맛·크기/품질·과정/포장·배송/보관/구매 전 확인/농가/소식으로 표시한다. 빈 구역은 숨기며 문구·숫자·사진은 보존한다.
- 소제목 아이콘7종·종이 사진 테두리·손 위 일러스트를 재사용한다. 최종 디자인에서 되돌린 생성 구획선은 복원하지 않는다. 사진은 원본 비율을 유지하고 테두리는 사진 밖에 둔다.
- 출처 없는 원산지/품종 요약값과 수확→선별→출하 문구를 자동 채우지 않는다. 공정 아이콘은 장식으로만 사용하고 새 사실·순서를 주장하지 않는다.
- 이미지 URI는 Expo의 이미 설치된 expo-asset 57.0.19를 공통 패키지의 명시적 의존성으로 선언해 개발/웹 export 양쪽에서 해석한다. 웹의 종이 테두리는 원본과 같은 border-image 9%/14px; 네이티브 사진은 기존 비율 렌더러를 유지한다.
- 기존 API/저장 스키마·OCR/모델·다중 후보 선택 UX·AI CS는 변경하지 않는다. 기존 다른 worktree의 미커밋 수정은 건드리지 않는다.

### 작업
- [x] 공통 렌더러와 생성 자산 이식
- [x] 가상 전체18개/빈 모듈/긴 문구/사진 비율/일러스트 및 실제 로컬 결과 화면 확인
- [x] 타입·mock·실제 API 및 브라우저 회귀·웹 빌드
- [x] spec/wiki 갱신 및 커밋 전 스캔
- [ ] 원격 CI 확인 — PR #113에서 추적


### 검증 기록
- `npm run typecheck`: 4 workspace 통과. `npm run test:mock`: 12개 통과.
- `npx playwright test scripts/e2e/source-detail-design.spec.ts`: 3개 통과(360/390/430px 전체18개·빈 항목·긴 원문·실제 사진 비율·7아이콘·일러스트·원문 HTML 비실행).
- `npm run test:integration:full`: 실제 API7개 통과, 브라우저22개 통과/신규 문구 동일성 assertion3개 실패. 미리보기 innerText와 소비자 textContent를 비교한 테스트 오류였다. 양쪽 innerText로 비교하도록 수정한 후 `.artifacts/run-source-design-validation.mjs`로 같은 실제 스택의 API7개 및 해당3개를 재실행하여 전부 통과했다. 실패를 숨기거나 검증 조건을 제거하지 않았다.
- 두 앱 각각 `EXPO_PUBLIC_API_MOCK=0 ... expo export --platform web`: 성공. export 산출물에 원본과 동일한 장식11개 SHA-256이 포함됨을 확인했다.
- 원본 소제목7종/테두리1종/공정3종을 바이트 변경 없이 복사한 것을 확인했다. 새 이미지 생성/모델 호출 없음.
- 로컬 저장 Gemini OCR/source-v4 결과를 재사용한 별도 DB의 실제 앱 화면에서 공정·품질·보관 구획과 아이콘을 확인했다. 다중 맛/보관 문장은 기존 편집기의 생산자 수정으로 원문 그대로 합쳐 저장한 결과이며 자동 병합 기능을 추가하지 않았다.
- scan-before-commit: 변경 전체·신규 파일·ModuleStory 호출부2곳·자산 출처·lock 변경·범위/공백/비밀값 검토, 최종 이슈 없음. 레거시 호환 후보0건/지적0건/커밋된 구조0건. 서버/OCR/AI CS 변경 없음.
- 초반 npm 범위 설치는 최신 Expo peer를 선택하려다 충돌했다. 현재 앱과 같은 Expo57 peer 및 기존 expo-asset57.0.19를 명시해 버전 업그레이드 없이 해결했다. 초기 시각 검사는 오래 실행된 CI 모드 Metro가 이전 렌더러를 제공해 실패했고, 서버 재시작 후 통과했다.

## DEV-57 당도계 일러스트 (2026-10-17)

- 사용자 요청: 기존 아이콘·귤과 같은 채색 종이 질감의 평면 ImageGen 당도계 그림을 실제 당도 영역에 표시하고 현재 PR #113에 포함한다. FEAT-07 / AC-07-2, M-11.
- 범위: `packages/ui/assets/source/brix-meter.png`, `packages/ui/assets/source/brix-meter-prompt.md`, `packages/ui/src/BrixReading.tsx`, `packages/ui/src/index.ts`, `packages/ui/{spec,tasks}.md`, `apps/consumer/src/app/(tabs)/products/[productId].tsx`, `apps/consumer/{spec,tasks}.md`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`, `scripts/e2e/source-detail-design.spec.ts`.
- 결정: 내장 ImageGen으로 기존 귤·맛·냉장고·선별 아이콘4종을 직접 참조해, 채워진 종이 질감과 크림·세이지·주황 색감의 평면 디지털 당도계1종을 생성한다. 손의 윤곽선만 참조했던 초기안은 사용자 피드백에 따라 교체한다. 원근·옆면·음영은 넣지 않는다. 그림의 LCD에는 수치를 넣지 않는다. 실제 수치/측정일은 기존 API값으로 렌더한다. 실측값이 있을 때 그림을 표시하고 미측정일 때 예상값·안내를 유지한다. 0도 유효한 실측값으로 표시하고 날짜 없음을 임의 측정일로 대체하지 않는다.
- 상태: 리뷰 중. 머지·배포 없음.
- 최종 배치·형태 결정: 사용자가 다시 지정한 윤곽 당도계의 외형·측정부·액정·버튼1개 위치를 보존하고 기존 귤/냉장고/선별 아이콘의 채색 종이 질감을 적용했다. 사용자가 최종 이미지를 확인했다. 실측일 때 그림을 최대280px 정사각 영역 중앙에 놓고 값·날짜를 아래 중앙 정렬한다. 미측정 안내는 기존 작은 행 배치를 유지한다.
- 상세 통합 후속 범위: `packages/ui/src/ModuleStory.tsx`의 설명 없는 공정 장식3종 행을 제거한다. 섹션 제목 아이콘과 원문 내용은 유지한다.
- [x] 생성·투명도/가독성 검토 및 앱 연결
- [x] 실측/미측정/0/날짜 없음·모바일 표시 검증, 타입·빌드
- [x] 문서·PR 갱신 및 커밋 전 스캔
- [ ] 최신 push의 원격 CI 확인 — PR #113에서 추적

- 검증: 내장 ImageGen 원본1254×1254 RGBA/알파0~255 및 무수치 LCD 확인. 타입4 workspace, mock12개, source-detail-design Playwright4개 통과(360/390/430px + 실측13.5/0/미측정/날짜없음/예상값없음). 소비자 API모드 웹 export 성공 및 생성 PNG 해시 포함 확인. API 수치/측정일 수정 없음.
- 커밋 전 스캔: 전체 diff·신규 컴포넌트/자산/프롬프트·호출부·서명/타입/범위·문서 확인, 이슈 없음. 레거시 호환 후보0/지적0/커밋된 구조0. API/서버 변경이 없어 전체 서버/결제 흐름은 이번 작은 표시 변경에서 재실행하지 않았다.
- 스타일 수정 검증: 기존 아이콘4종을 직접 참조한 평면 PNG로 교체 후 Playwright 당도 표시1개 통과(360/390/430px 및 실측/0/미측정), 소비자 웹 export 성공. 실제 로컬 상품11.8Brix 표시와 냉장고 아이콘의 색·질감을 화면에서 함께 확인했다. 이미지·프롬프트·spec/tasks만 변경했으며 재스캔 이슈 없음, 레거시 호환 후보0/지적0/커밋된 구조0.

- 최종 검증: 사용자 확정 당도계 형태/채색 및 중앙280×280 배치, 공정 장식 행 제거 후 typecheck4 workspace·Playwright4개·소비자 웹 export 통과. 원본 이미지 높이가 웹 레이아웃에 반영되는 문제를 명시적 표시 높이로 수정하고 360/390/430px 크기/중앙/값의 세로 배치를 검증했다. 커밋 전 스캔 최종 이슈 없음. 레거시 호환 후보0/지적0/커밋된 구조0.

## DEV-57 상세 이미지 배경·소식 아이콘 (2026-10-17)

- 사용자 승인 계획: 큰 섹션 제목 중 농가 소식만 36px 아이콘을 추가한다. 작은 제목은 텍스트, 공정 장식 행은 제거 상태를 유지한다. FEAT-03/04/07, AC-SRC-7/9, AC-TPL-4/5/10.
- 범위: `packages/ui/src/{ModuleStory,SourcePhoto,BrixReading}.tsx`, `packages/ui/assets/source/headings/{updates.png,updates-prompt.md}`, `packages/ui/{spec,tasks}.md`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`, `scripts/e2e/source-detail-design.spec.ts`.
- 결정: 사진은 프레임 대신 크림 #F6F1E7 배경/16px 여백에 캡션까지 포함한다. 손 비교는 세이지 #EEF1E8/20px 여백, 실측 당도는 살구 #FBF0E3/상하28px 배경 안에 기존280×280 그림·값·날짜를 중앙 배치한다. 직사각 면이며 테두리·그림자·둥근 카드는 없다. 본문은 흰색, 이미지 원본 비율·텍스트·API 계약을 보존한다. 미측정에는 배경을 넣지 않는다.
- 상태: 리뷰 중. 현재 PR #113에 반영하고 머지·배포하지 않는다.
- [x] 소식 아이콘 생성 및 배경 구현
- [x] 360/390/430px 전체/빈 항목/사진 비율/당도 상태 검증, 타입·mock·양쪽 앱 빌드
- [x] 문서/PR 최신화 및 커밋 전 스캔
- 정리 범위 추가: 프레임 제거로 사용처가 사라진 UI의 직접 `expo-asset` 의존성을 `packages/ui/package.json`·`package-lock.json`에서 제거한다. Expo 자체의 전이 의존성과 설치 버전은 유지한다.
- 자산 기록 범위: `packages/ui/assets/source/README.md`의 프레임/공정 아이콘 사용 설명을 현재 상태로 갱신한다.
- 검증: typecheck4 workspace·mock12개·source-detail-design4개 통과, 생산자/소비자 웹 export 성공. 실제 저장11개 값과 양 앱 원문 동일 확인. 전체18개 옵션 데모의 사진/손/당도/소식 배경을 캡처해 육안 확인했다. 브라우저는 headless로 실행·종료했다.
- 수정: 손 그림의 원본 높이가 행 높이를 늘리는 문제를 정사각 래퍼로 해결하고 세 모바일 폭에서 비율/높이를 검증했다. 이미지 원본/내용/API는 변경하지 않았다.
- scan-before-commit: 전체 diff·새 아이콘/프롬프트·호출부·의존성/lock·문서 범위 점검, 최종 이슈 없음. 레거시 호환 후보0건/지적0건/커밋된 구조0건. 원격 CI는 최신 push 후 별도 추적한다.

## DEV-57 주황 질감 배경·사진 프레임 복원 (2026-10-17)

- 사용자 요청: 사진은 기존 종이 프레임으로 복원하고 손·당도계 영역만 버튼과 같은 짙은 주황색으로 전체 폭을 채운 ImageGen 배경을 적용한다. FEAT-03/04/07, AC-SRC-7/9, AC-TPL-4/5/10.
- 범위: `packages/ui/src/{SourcePhoto,ModuleStory,BrixReading,IllustrationBackdrop}.tsx`, `packages/ui/assets/source/decor/{orange-paper.png,orange-paper-prompt.md}`, `packages/ui/assets/source/README.md`, `packages/ui/{package.json,spec.md,tasks.md}`, `package-lock.json`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`, `scripts/e2e/source-detail-design.spec.ts`.
- 결정: 버튼 토큰 accent #C94F0C를 바탕색으로 사용하고 기존 아이콘과 어울리는 과슈/종이 질감 배경을 생성한다. 배경은 장식으로만 사용하며 그림·수치·문구는 기존 컴포넌트로 유지한다. 손 영역은 섹션 안쪽 여백 밖까지 배경을 확장하고 당도계는 기존 전체 폭을 사용한다. 텍스트는 밝은 색으로 대비를 확보한다. 작은 제목과 농가 소식 아이콘은 유지한다. 미측정에는 주황 배경을 넣지 않는다.
- 상태: 리뷰 중. PR #113 Draft 유지, 머지/배포 없음.
- [x] 배경 생성·사진 프레임 복원·전체 폭 배치
- [x] 모바일/빈 자료/당도 상태·타입/mock/양 앱 export 검증
- [x] spec/wiki/PR·커밋 전 스캔
- 검증: typecheck4 workspace, mock12개, 디자인 Playwright4개(360/390/430px 전체폭·정사각 손·사진 프레임/비율·8아이콘·빈 항목·당도0/미측정/날짜없음) 통과. 양 앱 API모드 웹 export 성공. 실제 생산자/소비자 원문11개 값 동일 확인. 전체 옵션 데모의 손·당도 배경을 headless 캡처·육안 확인했다.
- 최초 타입 검사에서 현재 RN 타입에 없는 absoluteFillObject를 확인해 지원하는 StyleSheet.absoluteFill로 수정하고 타입·화면 검증을 다시 통과했다. 배경은 버튼 토큰 위에 생성 원본35%로 겹쳐 원본 변형 없이 색조를 맞춘다.
- 커밋 전 스캔: 변경 전체·새 공통 배경/자산/프롬프트·호출부·inset 전달·lock·문서 확인, 이슈 없음. 레거시 호환 후보0/지적0/커밋된 구조0. 원격 CI는 최신 push 후 별도 추적한다.

## DEV-57 강조 숫자·흰 손·배경 페이드 (2026-10-17)

- 사용자 승인 계획: 주황 질감 위아래48px 흰색 그라디언트, 영역 상하64px 여백, 손3종 내부 흰색 채움, 하단 일러스트 설명 삭제. 손 옆 비교용 가정은 유지한다. 핵심은 본문과 대비되는 숫자 강조다. FEAT-03/04/07, AC-SRC-7/9, AC-TPL-4/5/10.
- 범위: `packages/ui/src/{IllustrationBackdrop,ModuleStory,BrixReading}.tsx`, `packages/ui/assets/source/{outline-small.png,outline-medium.png,outline-large.png,white-hand-prompts.md,README.md}`, `packages/ui/{package.json,spec.md,tasks.md}`, `package-lock.json`, `docs/spec/source-integration.md`, `docs/wiki/Source-Analysis.md`, `scripts/e2e/source-detail-design.spec.ts`.
- 결정: 손 안내120px/간격12px, 18cm와 실측 숫자는40/48 bold 흰색, 손 안내·당도 제목·측정일은17/26. 당도 제목→값→날짜로 분리하고 미측정 안내는 유지한다. 손 형태·귤·바깥 투명도는 보존하고 ImageGen으로 내부만 흰색 채움. 기존 expo-linear-gradient57.0.2를 UI에 명시한다. 사진 프레임·다른 구역·API/저장 계약은 유지한다.
- 상태: 리뷰 중. PR #113 Draft, 머지/배포 없음.
- [x] 손3종 편집·그라디언트·텍스트 강조
- [x] 360/390/430px 손3종·당도 상태·타입/화면/양쪽 빌드 검증
- [x] 문서/PR 갱신·커밋 전 스캔

### PR #113 마이그레이션 팀원 전달 사항 (2026-10-17)

- 사용자 전달: 팀원 DEV-39에서 0008을 main에 머지할 예정이므로, main 반영 뒤 #113의 충돌하는 0007을 0009로 변경하고 `down_revision = "0008"`로 연결해야 한다.
- 다음 main 동기화 때 실제 DEV-39 머지 상태와 revision 충돌·연결을 대조한다. 이번 전달만으로 main 병합이나 마이그레이션 변경을 실행하지 않는다.
- 기록 시점 로컬에는 이미 `0007_manager_exception_recovery` → `0008_source_integration` → `0009_source_preprocessing` 연결이 있다. 전달받은 번호만으로 재번호하지 않고 최신 main의 파일 내용과 비교하여 필요한 변경을 결정한다.

- 화면 검증 수정: 104px 안내 폭에서 18cm가 줄바꿈되어120px로 확장했다. 숫자40px를 유지하고 한 줄 높이48px를 회귀 검증한다.

- 검증: typecheck4 workspace·mock12개·디자인 E2E4개 통과. 18cm 줄바꿈 수정 뒤 E2E4개 재통과. 양 앱 웹 export 성공, 저장된11개 값 및 양 앱 상세 원문 일치 확인. 실제 데모 손/당도 화면 headless 캡처·육안 확인.
- scan-before-commit: 전체 diff·자산/새 프롬프트·호출부·의존성/lock·문서 점검 완료. 무관한 제목 간격 변경은 되돌렸다. 최종 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.

## DEV-57 이미지 자체의 종이 경계 (2026-10-17)

- 사용자 요청: 코드 그라디언트를 제거하고 배경 이미지 자체가 흰 페이지에 자연스럽게 이어지도록 편집한다.
- 범위: packages/ui/src/IllustrationBackdrop.tsx, packages/ui/assets/source/decor/{orange-paper.png,orange-paper-prompt.md}, packages/ui/assets/source/README.md, packages/ui/{spec.md,tasks.md,package.json}, package-lock.json, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md, scripts/e2e/source-detail-design.spec.ts.
- 결정: 기존 종이 질감을 직접 참조해 위아래에 흰 종이와 불규칙한 안료 경계를 생성한다. 이미지 전체 경계를 보존하도록 stretch 표시, 흰색 바탕/원본100% 사용. 숫자·손·여백은 유지한다. UI 직접 gradient 의존성만 제거하며 앱 의존성은 유지한다.
- 상태: 진행 중. PR #113 머지·배포 없음.

- 결과: 이미지 자체의 종이 경계 적용, 그라디언트와 UI 직접 의존성 제거. typecheck4 workspace 및 디자인 E2E4개 통과. 실제 데모 손·당도 headless 캡처 확인. 커밋 전 스캔 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.

## DEV-57 매끈한 벡터형 배경 경계 (2026-10-17)

- 사용자 요청: 거친 붓질을 제거하고 벡터 그래픽 스타일로 변경. 위아래 여백을 확보하고 끝부분만 약한 그라디언트 또는 투명 처리로 흰 페이지에 연결.
- 범위: packages/ui/assets/source/decor/{orange-paper.png,orange-paper-prompt.md}, packages/ui/assets/source/README.md, packages/ui/{spec.md,tasks.md}, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: built-in ImageGen으로 매끈한 주황 유기 곡선과 투명한 위아래 경계를 생성. 상하 경계는 이미지의 각10% 이내에 두어 기존64px 콘텐츠 여백과 겹치지 않게 한다. 기존 흰 바탕/stretch 렌더러 유지.

- 범위 추가: packages/ui/src/BrixReading.tsx, scripts/e2e/source-detail-design.spec.ts. 실제 화면에서 곡선과 그림/날짜가 가까워 실측 당도 상하 여백을96px로 확장한다. 손 영역64px는 충분해 유지한다.

- 결과: 깨끗한 곡선/알파 경계 PNG 적용. 여백 수정 뒤 디자인 E2E4개 통과. 실제 화면 headless 확인. 커밋 전 스캔 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.

## DEV-57 과일 사이즈 강조 (2026-10-17)

- 사용자 요청: 손 기준18cm는 작게, 과일 사이즈는 크게 표시.
- 범위: packages/ui/src/ModuleStory.tsx, scripts/e2e/source-detail-design.spec.ts, packages/ui/{spec.md,tasks.md}, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: 선택된 설명용 손 그림 small/medium/large에 맞춰 소과/중과/대과를40px bold로 표시. 기준 손 길이18cm와 비교용 가정은13px/20px 보조 문구로 유지. 실측 치수나 수치는 추정하지 않는다.
- 검증: typecheck4 workspace, 디자인 E2E4개 통과. 소과/중과/대과40px와 기준13px, 한 줄 표시 확인. 실제 데모 캡처 확인. 커밋 전 스캔 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.


