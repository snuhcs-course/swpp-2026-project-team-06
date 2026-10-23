# packages\ui tasks

## DEV-3 로컬 프로토타입 통합 작업 (2026-10-07)

- 이슈: https://linear.app/sswp6/issue/DEV-3
- 브랜치: `jinwoo/dev-3-frontend`
- 상태: 로컬 실행 완료, 사용자 수정 대기
- 기준: screens.md 1.1, docs/design, ADR 0009·0010, 사용자 승인 계획

### 목표
Hyun Park 작성 farmclub-proto-ref.zip을 기준으로 두 앱을 Mock 모드로 실행하고 사용자 피드백을 반영한다.

### 범위
- packages/ui/**

### 결정 사항
- 기존 두 작업 폴더를 보존하고 최신 main의 별도 clone에서 작업한다.
- ZIP의 소스·자산을 이식하되 main의 spec.md·tasks.md는 보존한다.
- 하나의 DEV-3 브랜치를 사용한다. 사용자 지시로 push·PR·배포는 보류한다.
- scripts/local.mjs가 Windows에서도 Mock 환경과 두 앱의 로컬 URL을 설정한다.
- 이전 DEV-12·DEV-14의 진행 중 표시는 main에 반영된 과거 기록으로 보존한다.
- Mock 상태는 ZIP과 같이 앱별 브라우저 저장소이며 두 앱 사이에 동기화되지 않는다.

### 작업 및 로컬 완료 조건
- [x] ZIP 이식, 옛 중복 라우트 제거, 의존성 설치
- [x] 소비자·생산자·API·UI 타입 검사 통과
- [x] 두 앱 웹 export 통과, git diff --check 통과
- [x] 소비자 8081·생산자 8082 로컬 개발 서버 실행
- [x] 소비자 로그인 복귀·동의 전 결제 비활성·Mock 결제·예약 완료·주문 내역 확인
- [x] 생산자 로그인·현황·상품 편집 입력값·질문함·출하 목록 표시 확인
- [x] 모바일 390px 화면과 PC 1440px 중앙 정렬 육안 확인
- [ ] 사용자 요청 수정 반영 (후속 작업)

### 기록 및 검증 한계
- 2026-10-07: Linear DEV-3 목표·완료 조건 확인. 이 기록은 DEV-3 전체 완료·리뷰 승인·main 머지를 뜻하지 않는다.
- 브라우저에서 확인한 화면의 콘솔 오류 0건. 상품 저장 테스트는 자동 승인 검토 거절로 미실행; 출하 상태 변경·모든 생산자 계정 상태·전체 인수 조건은 미검증.
- npm install 보고: 의존성 취약점 28건(중간 10, 높음 18). ZIP 버전 유지; 임의 major upgrade·audit fix 미실행.
- Git 작성자 이메일은 기존 설정 유지. GitHub 이메일 조회 권한이 없어 등록 일치 여부는 미확인.
- 서버 로그/PID는 루트 .expo/local-dev.*에 저장. 사용자에게 로컬 주소 안내 후 화면 수정부터 이어간다.


## DEV-3 소식방 및 공유 로컬 Mock (2026-10-07)

- 상태: 로컬 구현·검증 완료 (커밋·push·PR 없음)
- 목표: 농가별 소식방, 소비자 본인 답장만 노출, 생산자 전체 수신, 기존 1:1 채팅 유지.
- 승인: 사용자가 계획 승인 후 구현 요청. push·PR·배포 없음.
- 범위: apps/consumer/**, apps/producer/**, packages/api/**, packages/ui/**, scripts/**, package.json, package-lock.json, README.md, docs/spec/**, docs/design/README.md, docs/wiki/Requirements-and-Specifications.md, docs/wiki/Design-Documentation.md, docs/wiki/Testing-Documentation.md.
- 결정: 서버 응답에서 역할·농가·팔로우별 필터링. 2초 foreground polling. 소식방 AI 답변 없음. 생산자 답변은 방 전체 공개.
- 결정: 기존 Mock를 로컬 Node 서버에서 공유하고 .expo에 지속 저장. 기존 브라우저 데이터 보존·인증 키 분리. 신규 데모는 공유 시드로 시작.
- 검증: A/B 소비자·생산자 격리, 목록·페이지네이션 누출 방지, 동기화·재시작·첨부·실패 및 중복 전송, 타입 검사·웹 빌드·UI.

### 구현·검증 기록
- 농가별 목록/소식방, 생산자 전체 방송과 소비자 본인 답장, 기존 1:1 채팅 이름 분리 완료.
- 공유 Mock 상태·미디어 영속 저장, 앱별 인증 키 분리, 멱등 재전송, 승인·소유·팔로우 검사 완료.
- API 격리 테스트 통과: 두 소비자/생산자, 요약·cursor 누출 차단, 연락처 가림, 중복 키·본문 충돌, 방송·좋아요·첨부, 재시작·초기화·Origin 검사.
- 브라우저: 두 소비자 세션에서 상대 답장 미노출, 생산자에서 모두 표시, 2초 동기화 확인. 네트워크 실패 시 글 보존·재시도 1회 저장 확인.
- 브라우저: 과거 읽기 위치 0 → 신규 메시지 후 0 유지, 새 소식 버튼으로 하단 이동. PC 1440px·모바일 390px 육안 확인.
- 타입 검사 4개 workspace 및 소비자/생산자 웹 export 통과. 의도적 네트워크 차단 테스트 외 새 UI 콘솔 오류 없음.
- 제품·디자인 원본 및 영어 wiki에 소식방 계약/검증을 함께 기록.
- 범위 한계: 새 API는 로컬 Mock 구현이다. FastAPI 서버·실서비스 저장소 반영 및 PR은 이번 작업에 포함하지 않았다. 기존 전체 주문/생산자 기능의 검증 범위는 이전 기록 참조.

## DEV-3 스펙 1.2 로컬 구현 계속

- 상태: 로컬 구현·검증 완료. 기준 main PR #38(068f756), docs/spec/contracts-1.2.md.
- 사용자 승인: 기존 단일 브랜치에서 프론트 구현·로컬 실행 계속. 프론트 push/PR/배포는 요청 전 보류.
- 범위: apps/consumer/**, apps/producer/**, packages/api/**, packages/ui/**, scripts/**, README.md. FastAPI·원본 제품 명세는 수정하지 않는다.
- 결정: 기존 dirty 작업 전체를 레포 밖 ZIP으로 백업한 뒤 docs만 승인된 main으로 교체·fast-forward한다. 공유 Mock 데이터는 백업 후 새 계약으로 명시적 1회 변환한다.
- [x] 판매 총 한도·중지·날짜 가격·공개 승인값 보존
- [x] 생산자 전체 1:1·소식방·AI 모드·읽음·설정
- [x] 주문 문맥·비공개 사진 문의
- [x] 공용 대화/레이아웃 개선, 360/390/430/1440 화면 검증
- [x] 타입 검사·웹 export·Mock 계약 테스트·브라우저 검증

### 스펙 1.2 구현·확인
- 총 한도/주문 한도/판매 중지·재개, 날짜 기간 편집, 승인 판매값 분리. UI 프리셋/단계 번호 제거.
- 생산자 채팅 탭: 소식방/1:1·모든 대화·답변 필요·읽음·HUMAN/AUTO, 농가 AI 설정/미리보기.
- 주문 문제 문의·비공개 사진 업로드/권한 조회, 소비자/생산자 대화 연결. 공개 방송 미디어와 분리.
- 기존 주문 43건·대화 5개 유지. .expo/shared-mock/state-before-spec12-* 로컬 백업 후 변환.
- Mock 테스트: 전역 마지막 1박스 동시 결제, 중복 결제/취소, 설정 버전/멱등 충돌, 기간 잠금/미승인 가격 미노출, 앱 권한, AI OFF/직접 응대, 미리보기 무변경, cursor·첨부 격리, 미팔로우 본인 결제 문의.
- 별도 브라우저 Mock: 중지/재개가 소비자 예약 CTA에 반영, 사진 문의→생산자 실제 이미지 로딩→생산자 답변→소비자 polling 반영, AI 설정 저장/필수 전달 미리보기 확인.
- 360/390/430/1440px 입력/버튼 가로 넘침 없음, 검증 구간 pageerror 없음. 390px 판매 설정/1:1 화면 육안 확인.
- 백엔드 구현·실제 AI·실결제·배포 검증은 범위 밖. 프론트는 미커밋 상태로 로컬 조정 계속.

- 최종 검증: 4개 workspace 타입 검사, 두 앱 web export, 두 Mock 계약 테스트 suite 통과. 추가 오류 표시 개선에서 누락된 import는 생산자 타입 재검사로 수정·확인.


## DEV-3 스펙 1.3 로컬 구현

- 상태: 로컬 구현·검증 완료. 기준 main PR #39(d3aed0d), navigation-1.3.md.
- 범위: apps/consumer/**, apps/producer/**, packages/ui/**, packages/api/**, scripts/**. 명세·서버·배포 설정은 변경하지 않는다.
- 목표: AC-02-3·04-7·10-5·12-9·12-10 구현, 양쪽 세 번째 채팅 고정.
- 결정: 기존 프론트 브랜치 유지, 프론트 push/PR/배포 없음. 이전 변경·공유 Mock 상태는 외부 ZIP 백업 완료.
- 결정: 목록 컴포넌트는 API 독립형, 전체 cursor 수집·활성 화면 polling 시 오래된 응답 폐기. 탭 전환/방 왕복 스크롤 유지.
- [x] 주문·채팅·설정 경로와 진입 갱신
- [x] 상품 상태 그룹·전체 개수, 원형 프로필 메신저
- [x] 타입·Mock·웹 export·브라우저 흐름 및 레이아웃 검증

### 스펙 1.3 확인 기록 (2026-10-08)
- 소비자 발견/내 주문/채팅/내 정보, 생산자 현황/상품/채팅/환경설정. 소식방/1:1 전환, 여러 농가 원형 프로필, 방 왕복 목록 위치 유지.
- 상품 5개 상태별 전체 cursor 집계, 판매 중지·재개 시 그룹 갱신, 수정안 심사 중 배지와 반려 사유. 단계 이름 대신 날짜 범위 표시.
- 별도 Mock 브라우저: 주문 상세 로그인 복귀, 주문 문제 문의→1:1, 소식 작성→방→목록, 프로필/AI 설정 복귀, 판매 중지·재개 확인. 실제 사용 중인 공유 Mock 상태는 유지.
- 360/390/430/1440px 소식방·환경설정 가로 넘침 없음. 390px 채팅 목록·상품·설정·소식방 육안 확인.
- 검증: 전체 workspace typecheck, 소비자·생산자 web export, 기존 Mock 계약 2개 suite, test-navigation.mjs 3개 테스트 통과(상품 우선순위, 123행 페이지, 취소/실패/반복 cursor). 최종 생산자 동선 수정 후 타입·export 재확인.
- FastAPI·실결제·배포는 검증 범위 밖. 프론트는 기존 단일 브랜치의 미커밋 변경으로 유지하며 push/PR 없음.


## DEV-3 스펙 1.4 물량 승인 및 전체 프론트 PR
- 상태: 구현·로컬 검증 완료. PR #41 자체 리뷰 및 CI 확인. 명세 PR #40 머지 기준.
- 사용자 승인: 명세 먼저 머지, 프론트 누적 전체 PR 자체 리뷰·CI 후 머지.
- 범위: apps/**, packages/**, scripts/**, README.md, package.json, package-lock.json, .github/workflows/ci.yml(새 Mock 검증 연결). 서버 구현은 제외.
- 결정: 상품별 kg 승인, 내부 g. 단일 판매값·주문 중량 스냅샷, 승인/판매 한도 분리, 최초/증액 신청·철회·운영자 심사. 기존 개인정보·채팅 격리 유지.
- 결정: 로컬 중간 저장 구조는 외부 백업·1회 데이터 전환 후 제거, 런타임 호환 분기를 추가하지 않는다.
- [x] 타입·Mock·권한·수량·가격 계약
- [x] 생산자 신청/판매 설정·소비자 중량 품절·문구/필터
- [x] 누적 전체 diff 리뷰·테스트·빌드·브라우저 검증
- [ ] 프론트 PR·CI·머지·실행 확인

- 리뷰 보완: 소수점 kg의 부동소수 오차, PATCH 응답 유실 재시도 키, 배송 기간 동의 요청 누락, 오래된 비동기 응답/계정 변경 상태, 독립 Mock 동영상 렌더링을 수정했다. R-21·1.001kg·동일 PATCH 재시도 회귀 사례를 추가했다.
- 브라우저: 증액 신청/철회/이력, 소비자 미확정 주문 문구, 360/390/430/1440px 물량 설정 가로 넘침 없음. 실제 로컬 주문 43건·채팅 5개는 외부 백업 후 명시적 1회 변환으로 보존.
- 데모 프로토타입(Hyun Park 작성)을 참고. FastAPI·실결제·실제 AI 구현은 포함하지 않음.

- 최종 로컬 검증: 8개 Mock 회귀 테스트 통과, 4개 workspace 타입 검사, 두 앱 Mock web export 통과. R-21 테스트 첫 실행은 테스트 배송일이 예약 종료 전인 잘못된 fixture였고 유효한 배송일로 바로잡았다.
- 레거시 호환 점검: /news 목록 redirect는 main 이력에 없는 브랜치 중간 경로여서 제거. liveStages/liveOptions 승인값 선택 래퍼도 단일 판매값으로 통합하며 제거. 스키마 불일치는 명시적 오류로 처리.

- PR #41 최종 리뷰 보완: 판매 재개 시 옵션 중량 비교도 Math.round 정수 g를 사용. 4.001kg 정확한 잔여량 경계 회귀 검증 추가.

## DEV-3 스펙 1.5 상세·공개 소식방
- 범위: apps/consumer/**, apps/producer/**, packages/api/**, packages/ui/**, scripts/test-*.mjs, package.json, docs/spec/**, docs/wiki/**.
- 기준: 명세 PR #44, storefront-1.5.md / AC-02-4, AC-03-4, AC-07-5, AC-12-10, AC-15-6.
- 결정: 구조화 text/image 블록, 명시적 저장, 기본 설명 보존, 공개 조회만 확장하고 답장 권한 유지. 서버 구현 제외. 4탭 유지.
- 작업: 상세 렌더·편집/Mock 계약, 공개 소식방·복귀, 승인 문구 교정, 테스트·웹검증·자체리뷰·PR·머지.
- 시각 검토 보완: 상품 행의 예약 인원이 absolute여서 다음 예약 안내와 겹침. 일반 세로 흐름으로 옮기고 긴 가격/상태는 줄바꿈 허용.
- 구현·검증 완료: Mock 회귀 11건, 4 workspace typecheck, 두 앱 web export 통과. 별도 Mock 브라우저에서 농가/상품 생성→편집→저장→공개 조회, 생성/저장 실패와 취소 보존, 로그인 복귀·팔로우 후 답장, 모바일 넘침 확인.
- 자체 리뷰 보완: 직접 진입한 상세 편집 뒤로 가기 확인·복귀, 권한 변경 후 늦은 메시지 응답 차단, optional 필드 응답과 멱등 재시도 모양 일치. 실제 데이터 백업·보존.
- 레거시 호환 점검: 후보 1건 — 지적 0건 / 정당 1건 (intro/description: base 3cc2332). PR CI 후 머지 예정.

## DEV-51 대화 중심 Figma v6 프론트 반영

- 이슈: https://linear.app/sswp6/issue/DEV-51 · GitHub #97
- 브랜치: `jinumeral/dev-51-dev-implement-conversation-centered-figma-frontend-and`
- 기능: FEAT-02/06/07/09/12/14/15/17, R-17/18/19, M-14, N-02
- 상태: 구현·로컬 검증·AI 리뷰 완료, PR CI/사람 리뷰 대기

### 목표
확정 Figma v6를 양 앱에 구현하고 활성 제품 명세·구현 명세·영문 wiki를 동기화한다.

### 범위 (수정 허용 경로)
- `apps/consumer/**`, `apps/producer/**`, `packages/ui/**`
- `packages/api/src/**`, `packages/api/spec.md`, `packages/api/tasks.md` (기존 API를 사용하는 표현/조회 도우미만)
- `scripts/**`, `docs/spec/**`, `docs/wiki/**`, `docs/design/README.md`, 루트 `README.md`

### 비범위
서버/API 계약, 실제 주문 전이, Figma 원본, 기존 PR #72의 주문 목록 리팩터링, .cache 사용자 자료. 머지하지 않는다.

### 결정 사항
- 10/13 사용자 승인 계획 기준. 홈은 소식/상품 독립 가로 목록, 농가 URL은 소식방 직접 진입, 상세는 고정 구매/4개 탭이다.
- 10/13 판매 품목은 소비자 펼침·생산자 접힘. 소비자 답장 안내 제거, 생산자 공개 안내는 본문 시스템 메시지.
- 10/13 비교 가격은 동일 옵션의 마지막 기간 가격이 현재보다 높을 때만 표시. 시안 금액 하드코딩 및 품절 할인 금지.
- 10/13 수확 시작 프론트 동작만 제거. 예약 주문 조회/기존 출하 준비 주문 처리는 유지하고 자동 전이는 추가하지 않는다.
- 10/13 실제 detailContent를 보존한다. AI 농가 이야기 샘플은 해당 Mock 시드 상품에만 사용하며 일반 상품 fallback으로 넣지 않는다.
- 10/13 기존 paging/polling/권한/계정 변경 폐기/멱등 재시도는 보존한다.

### 작업
- [x] 소비자 홈·농가 소식방·상품 상세·예약 완료
- [x] 생산자 대시보드·채팅·출하 UI
- [x] 공통 토큰·가격·접이식 상품 목록·숫자 한 줄
- [x] 활성 명세·FEAT/IA/screens·앱 spec·영문 wiki 갱신
- [x] 타입 검사·Mock·웹 빌드·360/390/430 UI E2E (실서버 통합은 PR CI로 검증)
- [x] AI 리뷰 반영 및 PR 작성 (CI 확인 후 리뷰 요청)

### 기록
- 10/13 main 9d6b42e에서 시작. 확정 시안과 API/기존 구현 대조 완료, 구현 착수.

- 10/13 구현·명세/영문 wiki 동기화. 타입 검사, Mock 12/12, 양 앱 web export 통과. 소비자 360/390/430 가로 목록·방 진입·고정 구매/탭, 같은 방 답장, 생산자 방 기본 접힘·전송 검증. 최종 이미지/긴 이름 검사 진행 중.
- 10/13 리뷰 보완: 웹 aria-expanded/aria-selected, 팔로우 요청의 농가·계정 변경 가드, 품절 옵션 비교 가격 숨김, 소식방 안전 영역, 짧은 농가 정보의 로그인·팔로우 안내 복귀를 보완.
- 10/13 Docker 엔진 미실행으로 실서버 로컬 통합은 실행하지 않았다. PR CI의 전용 PostgreSQL에서 실서버 API/E2E 검증 예정. 사용자 DB는 변경하지 않았다.

- 10/13 최종 리뷰 추가: 최초 생산자 room 응답 전 입력이 지워지는 경합을 재현해 ready 후 입력 활성화로 수정. 긴 이미지 원비율·고정 구매/탭 및 긴 농가명 테스트 통과. 커밋 0ada553 PR 앱 CI 통과, 실서버 통합 진행 중.
- 레거시 호환 점검: 후보 2건 — 지적 0건 / 정당 2건 (`/news/:farmId`, `description` fallback: origin/main 3cc2332 및 12251d2에 존재). 브랜치 중간 구조 호환 없음.

- 최종 로컬 UI 검증: `npx playwright test scripts/e2e/conversation-ui.spec.ts` 6/6 통과. 커밋 전·브랜치 diff 검사와 명세 대조 완료. 소수 중량 옵션도 정수 g로 판정하고 생산자 상품 편집 복귀 시 판매 품목을 다시 읽는다.
- PR: https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/98 (머지하지 않음). 최신 실서버 CI 결과와 AI 리뷰는 PR에 기록. Linear MCP는 읽기 전용이며 브라우저 연결도 실패해 이슈 상태 직접 수정은 미완료.


## DEV-56 / DEV-57 / DEV-58 자료 기반 상세 생성 통합

- 상태: 진행 중. 사용자 2026-10-16 구현 승인. FEAT-03/04, AC-SRC-1~8.
- 브랜치: jinumeral/dev-56-dev-build-producer-source-upload-evidence-review-and-private
- 목표: 업로드→가림→근거 검토→18개 모듈 초안→명시적 상품 적용, Gemini 연결 및 가상 자료 검증.
- 범위: apps/producer/src/**, apps/consumer/src/app/**/products/**, packages/api/src/**, packages/ui/src/**, server/app/{source_analysis,ai,core,catalog}/**, server/app/main.py, packages/ui/assets/source/**, server/migrations/**, server/tests/**, server/.env.example, scripts/**, docs/spec/**, docs/wiki/**, docs/design/sales-templates/** 및 해당 폴더 spec/tasks.
- 비범위: AI CS/채팅·로그인·결제·배포. 기존 사용자 worktree 수정 금지.
- 결정: OpenRouter google/gemini-3.1-flash-lite, OCR 기본/선택 페이지 시각 분석. 고가 모델/OpenAI fallback 비활성. 평가 $1/누적 $5 영속 예약·정산. 기존 detailContent 유지, 별도 moduleDetail 및 상품 version으로 적용. 공개 사진 독립 저장.
- [x] DEV-56 업로드·개인정보·근거·재진입 UI 및 계약
- [x] DEV-57 공통 렌더러·사진 공개 복사·버전/멱등 적용
- [ ] DEV-58 제공자·예산·가상20세트·평가 및 회귀
- 완료 조건: 중요 사실/출처/개인정보 오류0, 명확한 필드95%, 테스트·타입·빌드·브라우저 통과. 실호출 미실행은 구분 기록.
- 기록: 신규 이슈 DEV-56→57→58 생성. 기존 DEV-51/53/54 정정, DEV-52 최신 단일 템플릿 진행 중.

- 범위 보충: 공통 렌더러가 사용하는 packages/ui/assets/source/** (기존 로컬 원본 일러스트와 출처 기록).

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.

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


## DEV-58 카드 직접 입력·대표사진 필수 (FEAT-03/04/07, AC-SRC-11)
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,SourceBasicInfo,SourceDetailsEditor,ProductPageEditor,PageCanvas}.tsx, packages/api/src/{sourceAnalysis,productWorkspace}.ts, packages/ui/src/{Icon,content}.tsx, server/app/source_analysis/{representative,service,schemas,router,publish,workspace}.py, 관련 source/workspace pytest 및 scripts/e2e 테스트, 관련 spec/tasks/wiki, 로컬 검토 영상.
- 결정: 텍스트 추가 즉시 첨부함에 카드·포커스 생성. 카드 내 편집, blur/분석 전 저장, 빈 신규 카드는 업로드하지 않음. 저장 실패 입력 유지. 기존 텍스트를 비우면 입력 또는 × 삭제 안내로 분석 차단.
- 결정: 첫 성공 상품사진을 상품별 대표로 자동 지정, × 왼쪽 별로 변경. 대표 삭제 시 다음 첫 사진으로 대체, 마지막 삭제 가능하나 새 분석/공개에 대표사진 필수. 자료 이미지는 불가. 대상/초안 JSON에 대표 ID, 기존 상품 작업 JSON에 대표 URI를 저장하며 공개 반영 시 product.photos 첫 사진과 동기화. 섹션 숨김과 별개 대표 커버 유지.
- 결정: 원본 사진 공개 경로는 상세 사진뿐 아니라 현재 상품 대표사진으로 참조되는지도 검사한다. 공용 Photo의 서버 상대 미디어 경로를 API 주소로 해석해 앱 간 동일하게 표시한다.
- [x] 구현 및 스펙 반영
- [x] backend/typecheck/mock/browser 검증·영상 갱신
- [x] 커밋 스캔; PR113/Linear에 이 기록 반영, Draft·미머지 유지

- 검증: server/에서 `DATABASE_URL=… .venv/bin/pytest -q --tb=short tests/test_source_*.py tests/test_product_workspace.py` 99 passed. `npm run typecheck` 4 workspace, `npm run test:mock` 13 passed. 격리 API/DB Playwright 4 spec 17 passed. Ruff 및 git diff --check 통과.
- 스캔: 공개 대표사진 접근 판정, 자동 지정 전 DB flush, 카드 sibling key 중복, 신규 카드 삭제/blur 경합 보완. 미해결 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 3건 — 지적 0건 / 커밋된 구조 3건 (SourceTarget:388d956, Batch.targets:4d7eece, PageSnapshot:839503e).
- 화면: 기존 영상 페이지 `.artifacts/in-app-v4/page-editor-review/index.html` 갱신, 36.24초/12.28초 재생 확인. 카드 입력/대표사진 캡처 포함. headless 브라우저 종료, 추가 유료 호출 0. 실제 데모 DB 보존 후 로컬 API 갱신. Agent 시간/Tokens 미측정.


## DEV-85 Apply approved Farmclub logo variants

- 이슈: [DEV-85](https://linear.app/sswp6/issue/DEV-85/apply-approved-farmclub-logo-variants-to-app-headers-and-producer)
- 브랜치: `jinumeral/dev-85-apply-approved-farmclub-logo-variants-to-app-headers-and`
- 기능·인수 조건: FEAT-01 / AC-01-3·6, FEAT-06 / AC-06-6, FEAT-14 / AC-14-4, N-02
- 상태: 완료

### 목표
사용자가 최종 검토한 로고 원본과 화면 배치를 실제 앱에 반영하고 별도 PR로 올린다.

### 범위 (수정 허용 경로)
- `packages/ui/assets/brand/**`, `packages/ui/src/BrandLogo.tsx`, `packages/ui/src/{Storefront,index}.tsx` 또는 `index.ts`, `packages/ui/{spec,tasks}.md`
- `apps/consumer/src/app/(tabs)/index.tsx`
- `apps/producer/src/app/(tabs)/index.tsx`, `apps/producer/src/app/login.tsx`, `apps/producer/src/lib/views.tsx` (더 이상 쓰지 않는 Wordmark 제거)
- `docs/design/brand-review/**`, `docs/spec/conversation-ui-1.6.md`, `docs/wiki/Design-Documentation.md`
- `scripts/e2e/brand-logo.spec.ts`

### 비범위
인증·API·DB·배포 설정·잠금파일·기존 다른 작업, 미검토 랜딩/파비콘/공유이미지 재설계.

### 결정 사항
- 10/19 소비자 홈은 글자형으로 통일, 검색 버튼 유지. 생산자 현황은 확대 전 36×40px·좌우 12px·제목 간격 12px로 복원.
- 10/19 로그인 상단의 글자형 제거, ‘계정을 골라/시작하세요’ 오른쪽에 조합형. 172×129px, 제목 30/32px, gap 8px, 조합형 translate(-16,-10) 승인. 카카오 환경의 ‘농가로/시작하세요’에도 동일 배치.
- 10/19 보이는 FARM/CLUB 두 줄을 제목 두 줄과 맞춘 광학 정렬이며 원본 알파와 비율은 보존. 원본 4종을 저장하고 실제 화면은 3종만 사용한다.
- 10/19 사용자 ‘다 푸쉬’ 요청을 승인된 범위의 커밋·push 및 draft PR 생성 승인으로 적용. 별도 worktree로 기존 미커밋 작업을 보존한다.

### 작업
- [x] 공용 로고 및 승인된 세 화면 적용
- [x] 원본 4종·최종 정적 미리보기 보존
- [x] 스펙·영문 디자인 문서 반영
- [x] typecheck, Mock 테스트, 양 앱 웹 export, 실제 화면 검증
- [x] 커밋 전·브랜치 스캔, push 및 draft PR 갱신

### 완료 조건
- [x] 360/390px에서 제목 두 줄·로고 정렬·검색/로그인 버튼이 유지된다.
- [x] 카카오/테스트 로그인과 상태별 접근 제어를 보존한다.
- [x] 관련 로컬 검증 통과 및 draft PR 생성 (원격 CI 별도 확인)
- [x] 사용자 시각 검토 및 최종 승인 확인 (2026-10-19 명시적 머지 지시)

### 기록
- 10/19 origin/main 79eaea7에서 격리 worktree 생성, npm ci 완료. 사용자 승인 배치를 구현 전 기록.
- 10/19 `npm run typecheck`: 4 workspace 통과. `npm run test:mock`: 15 passed, 0 failed. 각 앱의 `npx expo export -p web`: consumer/producer 통과. Node 24.15.0, CI와 동일 major.
- 10/19 `npx playwright test scripts/e2e/brand-logo.spec.ts`: 실제 앱과 격리 Shared Mock에서 360/390px 2 passed. 검색 진입, 생산자 계정 선택·로그인, 현황 심볼 확인. 첫 실행은 기존 공용 helper가 카카오·테스트 버튼을 동시에 선택해 실패했고, 이 spec에서 선택 계정의 정확한 버튼을 쓰도록 수정 후 통과했다.
- 10/19 export 산출물의 카카오 전용 화면: config 응답만 enabled=true로 고정, 360/390px 제목·조합형·카카오 버튼 1개·테스트 계정 숨김·JS 오류 없음 확인. 외부 인가 서버는 호출하지 않았다.
- 10/19 새 Playwright spec 별도 타입 검사(`tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --types node`) 통과. 원본 PNG 4개의 SHA-256 일치 및 미리보기 로컬 링크 검증 완료.
- 10/19 커밋 전 스캔 지적 없음. BrandHeader에서 logo 미지정 시 기존 헤더를 유지하는 것은 main 6343b24의 공개 API 사용처를 보존한다. 레거시 호환 점검: 후보 0건 — 지적 0건 / 커밋된 구조 0건.
- 10/19 PR #173 draft 생성. 로컬은 관련 앱 검증만 수행했다. 전체 실제 서버/DB 통합은 최신 push의 원격 CI 결과로 구분해 확인한다. Agent 시간/Tokens 미측정.
- 10/19 origin/main 79eaea7 대비 최종 diff 스캔: 범위 이탈·새 버그·미사용 Wordmark 잔재 없음. 원본 4종 외 이전 시안·중간 캡처는 제외했다. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건. 최신 원격 CI는 이전 실행 뒤 대기 중이며 통과로 표시하지 않는다. Draft·미머지 유지.
- 10/19 head eb84fce의 원격 CI 39225825560에서 apps/server/integration 모두 success 확인. server는 변경 없음으로 실제 서버 검사 생략이며 integration은 실제 서버/DB/Chromium 검사다. 유료 spec-check는 승인 대기로 호출하지 않았다.
- 10/19 사용자가 로고 시각 검토 후 명시적으로 main 머지를 지시했다. 이를 최종 사람 승인으로 기록하며 GitHub의 별도 Approve 리뷰를 대신 작성하지 않는다. 기존 비범위였던 main 머지를 이번 지시에 따라 허용한다.
- 10/19 최신 origin/main abe28df를 충돌 없이 병합했다. 이후 typecheck 4 workspace, Mock 15 passed, 로고 화면 E2E 2 passed 재확인. 최종 브랜치 스캔 이슈 없음. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건. 실제 squash merge 결과는 PR #173에서 확인한다.

## DEV-109 LargeTitle 오른쪽 슬롯 (생산자 도움말 버튼)

- 이슈: https://linear.app/sswp6/issue/DEV-109 · 상세 기록은 `apps/producer/tasks.md` DEV-109
- 범위: `packages/ui/src/bars.tsx`의 `LargeTitle`에 선택 prop `right` 추가. 넘기지 않으면 지금과 똑같이 그린다.
- 결정: 버튼은 기존 `IconButton` + `Icon` `"question"`을 쓰고 새 컴포넌트는 만들지 않는다.
- 10/21 후속(투어): `IconButton`·`Fab`·`TabItem`·`ConversationRow`에 선택 prop `testID`를 추가했다. `HeaderBar`(닫기 모드는 `header-close`)와 `ConversationHeader`의 뒤로 가기에는 `header-back`, `ChatChoices`에는 `chat-choice-news`/`chat-choice-private`를 달았다. 보이는 모습과 동작은 바뀌지 않는다.
- 10/22 후속: 투어에서 새 상품 화면 단계를 빼서 `HeaderBar` 뒤로 가기 testID(`header-back`/`header-close`)를 되돌렸다. `ConversationHeader`의 `header-back`은 그대로 둔다.

## DEV-111 farmclub 문의 대화방

- 이슈: https://linear.app/sswp6/issue/DEV-111 · 목표·범위·결정·기록은 `server/tasks.md` DEV-111 섹션에 모은다.
- 10/22 DEV-111: `ConversationRow`·`ConversationHeader`에 선택 prop `avatar`(사진 대신 그림), `ChatThread` 말풍선에서 `OPERATOR`의 이름을 'farmclub'으로 표시. 넘기지 않으면 지금과 같다.

## DEV-113 사이트 하단 사업자 정보와 개인정보 처리방침·이용약관 페이지

- 이슈: [DEV-113](https://linear.app/sswp6/issue/DEV-113)
- 브랜치: `nemodleo/dev-113-dev-사이트-사업자-정보-표시`
- 기능·규칙: R-16(법정 표시), policy.md 1·2·5·6장, R-01·02·05·07~12·14·17·20·21·23·24·28, M-02·06·07·08·16·18·21, FEAT-01 SCR-05·06·19
- 상태: 리뷰 중

### 목표
카카오 비즈 앱 전환 심사가 "사이트에서 사업자 정보가 확인되지 않음"으로 반려됐다. 두 앱 첫 화면 하단에 사업자 정보를 보이고, 개인정보 처리방침(`/privacy`)·이용약관(`/terms`) 전문을 로그인 없이 읽히게 한다.

### 범위 (수정 허용 경로)
- `packages/ui/src/{legalContent.ts,Legal.tsx,index.ts}`, `packages/ui/{spec,tasks}.md`
- `apps/consumer/src/app/{privacy,terms,login}.tsx`, `apps/consumer/src/app/(tabs)/{index,me/index}.tsx`, `apps/consumer/src/app/onboarding/index.tsx`, `apps/consumer/src/lib/onboarding.ts`, `apps/consumer/vercel.json`, `apps/consumer/tasks.md`
- `apps/producer/src/app/{privacy,terms,login}.tsx`, `apps/producer/src/app/(tabs)/settings.tsx`, `apps/producer/src/lib/{session.tsx,gate.ts}`(공개 경로·동의 관문), `scripts/test-producer-gate.mjs`, `apps/producer/vercel.json`, `apps/producer/tasks.md`
- `scripts/legal-pages.mjs`, `scripts/local.mjs`(export 후 정적 페이지), `scripts/test-legal.mjs`, `scripts/e2e/legal-pages.spec.ts`, `package.json`(test:mock에 추가)
- `.github/workflows/deploy-vercel.yml`(사업자 정보 변수 전달·정적 페이지 생성)
- `docs/farmclub-consumer.html`, `docs/farmclub-producer.html`(약관·처리방침 링크)
- `docs/spec/{ia,policy}.md`, `docs/wiki/` 영문 한두 줄, `README.md`(배포 변수 표)

- (10/22 추가, 재동의) `server/app/accounts/{schemas,service,router}.py`, `server/app/core/security.py`, `server/tests/test_accounts.py`, `packages/api/src/{types.ts,mock/db.ts,mock/auth.ts,mock/router.ts}`, `apps/consumer/src/app/onboarding/{index,address}.tsx`, `apps/producer/src/app/consent.tsx`, `docs/spec/functional/FEAT-01-login.md`, `docs/spec/screens.md`

### 비범위 (건드리지 않음)
- 탈퇴 기능, DB 스키마 변경, 결제 전 동의(R-03, `consentVersion`), Figma v6, 생산자 입점 동의 화면(SCR-20 동의 체크), 법률 검토 자체, 사업자 정보 값

### 결정 사항
- 10/22 같은 요청으로 이전에 만들어진 DEV-113(GitHub #224)이 있어, 이 세션이 만든 DEV-115를 중복 처리하고 DEV-113으로 진행한다. DEV-113의 빈 브랜치(main과 같은 커밋)를 지우고 작업 브랜치 이름을 DEV-113 것으로 바꿨다.
- 10/22 사업자 정보 값(상호·대표자·사업자등록번호·통신판매업 신고번호·주소·연락처·이메일·개인정보 보호책임자)은 레포·이슈·PR에 쓰지 않는다(AGENTS.md 금지). 빌드 때 `EXPO_PUBLIC_BUSINESS_*`·`EXPO_PUBLIC_PRIVACY_OFFICER`로 읽고, 값 없는 항목은 빼고 그린다. 하나도 없으면 policy.md 6장대로 ‘테스트 서비스’만 표시한다.
- 10/22 앱 빌드는 Vercel이 아니라 GitHub Actions(`deploy-vercel.yml`, production Environment)가 `expo export`로 하고 결과물만 Vercel에 올린다. 그래서 값은 Vercel 환경 변수가 아니라 GitHub Actions 변수(`BUSINESS_*`, `PRIVACY_OFFICER`)에 넣는다. 넣은 뒤 워크플로를 수동 실행해야 반영된다.
- 10/22 두 앱은 SPA(`web.output: single`)라 JS 없이 읽히지 않는다. 문안은 `packages/ui/src/legalContent.ts` 한 곳에 두고, 앱 화면(`/privacy`·`/terms` 라우트)과 export 뒤 생성하는 정적 HTML(`dist/privacy.html`·`dist/terms.html`, vercel.json에서 catch-all보다 먼저 rewrite)이 같은 데이터를 쓴다. `dist/index.html`의 `<noscript>`에도 사업자 정보와 링크를 넣는다.
- 10/22 생산자 앱 관문(session.tsx)은 비로그인을 `/login`으로 보내므로 `/privacy`·`/terms`를 모든 상태에서 열리게 예외로 둔다.
- 10/22 주문 배송 정보의 농가 전달은 PQ-07(‘처리 위탁’)이 아니라 DEV-68 이후 policy.md 5장 문단(‘판매자에게 제공’)을 따라 ‘제3자 제공’으로 쓴다(사람·법률 확인 필요).
- 10/22 가입 동의 문구 버전(`SIGNUP_CONSENT_VERSION` 2026-10-18)은 올리지 않는다. 동의 시트 요지는 그대로이고 전문 링크만 붙인다. 서버는 버전과 상관없이 항목만 검사해 올려도 기존 회원 재동의가 일어나지 않는다. 법률 검토로 내용이 바뀌면 그때 올린다(사람 확인 필요).
- 10/22 PQ-06(보유 기간) 미정 부분은 현재 동작 기준으로 쓴다: 앱 안 탈퇴 기능이 없어 이메일로 요청받아 처리, 소식·채팅은 탈퇴 시까지, 거래 기록은 전자상거래법 기간. 사람·법률 확인 필요.
- 10/22 Sentry·Langfuse는 스택 문서(stack.md)에는 있지만 코드에 연결돼 있지 않다. 국외 이전 표에 ‘도입 예정’으로 적는다. Railway 서버 지역·Langfuse 지역(TQ-01 미정)·수탁사 연락처(공식 웹사이트로 적음)는 사람 확인 필요.
- 10/22 rules.md R-08(“환불은 카드 승인 취소로만”)은 DEV-68 뒤 policy.md 1장·R-28(농가가 입금 계좌로 송금)과 다르다. 약관은 R-28·policy를 따른다. R-08 정정은 이 PR 범위 밖이라 PR 질문으로 남긴다.

- 10/22 (사용자 지시) 배포 전에 이미 가입한 회원과 새 회원 모두 현재 약관·처리방침(시행 2026-10-22)에 동의해야 쓸 수 있게 한다. 동의 문구 버전을 `2026-10-22`로 올리고, 서버가 필수 동의의 버전까지 검사한다(서버 `accounts.schemas.CONSENT_VERSION`, 앱·Mock은 같은 값, `test-legal.mjs`가 셋이 같은지 본다).
- 10/22 소비자: 필수 동의(약관·개인정보·만 14세)가 없거나 버전이 다르면 `needsOnboarding=true` → 기존 403 `ONBOARDING_REQUIRED` 관문(주문·팔로우·좋아요·채팅)과 온보딩 화면을 그대로 쓴다. 프로필이 이미 채워진 회원은 같은 화면이 ‘약관이 바뀌었어요’ 재동의 모드로 열리고 배송지 단계는 건너뛴다. 동의 시트 요지의 "탈퇴하면 지워요"는 법정 보관 기간과 맞게 고친다.
- 10/22 생산자: 필수 동의는 약관·개인정보 2개(만 14세는 소비자만). 없거나 버전이 다르면 `consentRequired=true`, 생산자 API(가입 신청·내 농가·사진 올리기·승인 농가 API 전부)는 403 `CONSENT_REQUIRED`. 생산자 앱 관문은 로그인 다음에 `/consent`(새 화면)만 연다. 새 생산자는 동의 → 가입 신청 순서가 된다.
- 10/22 테스트 계정(`is_test_account`, 관리자 페이지 ‘테스트로 표시’ 포함)은 지금처럼 동의 검사에서 빠진다(시드·E2E가 그대로 돈다).
- 10/22 `GET/POST /api/auth/me/consents`를 소비자 전용에서 소비자·생산자로 연다. 저장 버전은 앱이 보낸 값 그대로 남긴다(R-03과 같은 방식).

### 작업
- [x] `legalContent.ts`(문안·사업자 정보) + `LegalFooter`·`LegalDocument`
- [x] 두 앱 `/privacy`·`/terms` 라우트, 생산자 관문 예외
- [x] 푸터 배치: 소비자 홈·로그인·마이, 생산자 로그인·환경설정. 가입 동의 시트에 전문 링크
- [x] `scripts/legal-pages.mjs` 정적 페이지·noscript, local.mjs·deploy-vercel.yml 연결, vercel.json rewrite
- [x] 랜딩 링크, README 변수 표, ia·policy·wiki 동기화
- [x] `npm run typecheck`, `npm run test:mock`, Playwright `legal-pages.spec.ts`, 브라우저 확인

- [x] 재동의: 서버 버전 검사·생산자 동의·`CONSENT_REQUIRED`, Mock 동일 규칙, 소비자 재동의 모드, 생산자 `/consent` 화면, FEAT-01 AC-01-17·18, pytest

### 완료 조건
- [x] 두 앱 첫 화면(소비자 홈, 생산자 로그인) 하단에 사업자 정보(값 있는 항목)와 약관·처리방침 링크
- [x] `/privacy`·`/terms`가 로그인 없이 열리고, 배포 산출물에 정적 HTML로 있다
- [x] 처리방침 필수 항목, 약관의 중개자 고지·선주문·취소·환불 규칙이 R-xx와 일치
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/22 origin/main 1f1a243에서 브랜치 생성, `npm ci`·`uv sync --frozen` 완료.
- 10/22 `npm run typecheck` 4 workspace 통과. `npm run test:mock` 23 passed / 0 failed(새 `test-legal.mjs` 4개 포함).
- 10/22 Mock 스택(`npm run dev`)에서 `npx playwright test scripts/e2e/legal-pages.spec.ts` 2 passed. 같은 Mock에서 discovery-and-gates·producer-help-guide 7개가 실패했는데, Mock 트래픽 금지·카카오+테스트 버튼 동시 노출 때문인 실서버 전용 spec이라 아래 실서버로 다시 돌렸다.
- 10/22 `DATABASE_URL=…/farmclub_dev115 npm run test:integration:full`(같은 Postgres 컨테이너의 임시 DB, 끝나고 DROP): 실서버 시나리오 7 passed, Chromium 61 passed / 2 skipped / 0 failed(legal-pages 2개 포함).
- 10/22 가짜 사업자 값으로 `node scripts/local.mjs export consumer` → `dist/privacy.html`·`terms.html`·index.html noscript 생성, 값이 JS 번들에 들어간 것 확인. 로컬 정적 서버 375px에서 홈 하단 푸터, 앱 안 `/privacy`, 정적 `terms.html`을 눈으로 확인. 산출물은 지웠다.
- 10/22 재동의 추가 후: `uv run pytest` 424 passed(격리 DB), `uv run ruff check` 통과, `npm run typecheck` 통과, `npm run test:mock` 24 passed / 0 failed, Mock 스택 `legal-consent.spec.ts` 2 passed(소비자 재동의 모드·생산자 /consent → 가입 신청), 실서버 `test:integration:full` 61 passed / 4 skipped(카카오가 없는 실서버에서 Mock 전용 2개 포함) / 0 failed. 생산자 `/consent` 375px 화면 확인. 임시 DB는 지웠다.
- 10/22 GitHub Actions 변수: BUSINESS_NAME·OWNER·REGISTRATION_NO·ADDRESS·PHONE·EMAIL·PRIVACY_OFFICER 입력됨(값은 여기 쓰지 않음). 통신판매업 신고번호는 신고 후 입력 예정.
- 10/22 origin/main(691949e, DEV-108·112·114 등) 병합. 충돌: 생산자 관문이 `lib/gate.ts`로 옮겨져 동의 규칙·`PUBLIC_PATHS`를 그쪽으로 옮기고 `test-producer-gate.mjs`에 AC-01-18 관문 테스트를 더했다. package.json test:mock은 두 쪽 스크립트를 모두 둔다. 병합 뒤 `npm run typecheck` 통과, `npm run test:mock` 28 passed / 0 failed, Mock `legal-*` 4 passed, 실서버 `test:integration:full` 67 passed / 4 skipped / 0 failed(새 카카오 복귀 spec 포함).
- 10/23 법률 검토(law.go.kr 현행본: 개인정보보호법 2026.9.11, 전상법 2026.7.21, AI기본법, 원산지표시법 2026.10.22 시행) 반영. 문안: 하단·회사 정보에 호스팅서비스 제공자(전상법 제10조, 시행령 제11조의4), 처리방침 제2조 처리 근거 칸(제22조 ③), 제4·9조의 실제와 다른 문장(배송 후 가림, 역할별 권한) 정정, 제6조 이전받는 자 이메일 연락처·Anthropic 30일·OpenRouter 미저장, Sentry·Langfuse(미연결) 삭제, 생성형 AI 조항 신설(제11조, 이후 번호 +1). 약관: 하자 24시간은 권고(제17조 ③·제35조), 관할 소비자 주소지(제36조), 분쟁 3·10영업일(제20조 ③), 생성형 AI 고지(AI기본법 제31조), 지연배상 연 15%, 이용 제한 사전 통지, 게시물 이용 허락, 미성년자 취소권, 서비스 중단 고지, "공급 계약"→"입점 계약", 회사 명칭에 상호(빌드 변수). 제품 변경은 DEV-119(판매자 신원정보 청약 전), DEV-120(주문서 제3자 제공 동의), DEV-121(원산지 표시제도 고지), DEV-122(PostHog 국외 이전), DEV-123(관리자 계정·접속기록·계좌 암호화), DEV-124(재동의 설계), DEV-94(탈퇴, 코멘트), SWPP-124(법률 확인)로 분리.
- 10/23 Railway 리전 확인(`railway status --json`): farmclub-api·farmclub-source-worker·Postgres 모두 asia-southeast1(싱가포르). 처리방침 제6조 Railway 국가를 싱가포르로 고침.
- 10/23 사용자 지시: 시행일·동의 버전을 2026-10-23으로 바꿈(서버 CONSENT_VERSION, Mock, legalContent LEGAL_VERSION·시행일, test-onboarding, screens·policy·wiki).
- 10/23 머지 전 점검: 구매 확정 조항에 '확정 뒤에도 법정 청약철회·하자 권리는 그대로'를 더함. 8일 자동 확정(R-14)은 서버에 아직 없다(약관·앱 문구만 있음) — 수익화(수수료 정산) 전에 구현 필요.
