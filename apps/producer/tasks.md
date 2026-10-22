# apps/producer tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 화면 자리: SCR-05, SCR-20~30 / FEAT-01~05, 12~15, 17, 19
- 상태: 진행 중

### 목표
DEV-3(프론트) 구현을 바로 시작할 수 있게, ia.md 2장 경로대로 화면 자리가 있는 빈 생산자 앱(Expo Router 웹 출력)을 만든다.

### 범위 (수정 허용 경로)
- `apps/producer/**`

### 비범위 (건드리지 않음)
- 화면 기능·디자인, 카카오 로그인, 승인 전 잠금(SCR-21만 열림, AC-01-3) 처리 (DEV-3·DEV-4)
- Vercel 배포·rewrite(DEV-8), CI(DEV-9)
- `apps/consumer/**`, `packages/**`(각자 tasks.md)

### 결정 사항
- 10/07 라우트는 `src/app/`, 탭은 `(tabs)` 그룹(상품 탭은 Stack). 상세 경로표는 spec.md
- 10/07 create-expo-app이 만든 `.git`, `.claude`, `LICENSE`, `AGENTS.md`는 지운다. Expo 규칙 한 줄은 spec.md "구현 결정"으로 옮김
- 10/07 생성물에 `CLAUDE.md`(`@AGENTS.md` 한 줄)도 있어 함께 지움. AGENTS.md를 지우면 import가 깨지므로
- 10/07 create-expo-app은 빈 폴더에만 만들어서, spec.md·tasks.md를 잠시 옮겨 두고 생성한 뒤 되돌림
- 10/07 Expo SDK 57(expo ~57.0.27, expo-router ~57.0.25, react-native 0.86.3). package name은 `@farmclub/<앱>`, `typecheck` 스크립트 추가

### 작업
- [x] `spec.md` 작성
- [x] `npx create-expo-app@latest apps/producer --template blank-typescript --no-install`, 생성물 정리
- [x] `npx expo install` expo-router 등, `main: expo-router/entry`, `App.tsx`·`index.ts` 삭제
- [x] `app.json`: name·slug `farmclub-producer`, scheme, `experiments.typedRoutes`, `web.output: "single"`
- [x] `src/app/` 화면 12개 Placeholder, 하단 탭 4개(현황·상품·질문함·농가)
- [x] `npx tsc --noEmit`, `npx expo export -p web` 성공

### 완료 조건
- [x] Expo Router 웹 출력으로 실행되는 빈 앱(탭 4개 자리, 로그인 자리)
- [x] `spec.md`(구현할 FEAT·규칙, 구조, 계약)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 뼈대 완료: `npx tsc --noEmit`, `npx expo export -p web` 성공

## DEV-3 [I1-P23] Implement frontend (prototype)

- 이슈: [DEV-3](https://linear.app/sswp6/issue/DEV-3)
- 상태: 시작 전 — 아래는 SWPP-26(P22 스펙 확정)에서 넘어온 할 일만 미리 적었다. 시작할 때 `spec` 스킬로 목표·범위·완료 조건을 채운다
- 기준 문서: `docs/spec/screens.md`(화면·API), Must 범위는 screens.md 4장

### SWPP-26에서 넘어온 할 일
- [ ] SCR-27 Placeholder 제목 ‘메시지 보내기’ → ‘소식 올리기’
- [ ] SCR-05를 테스트 계정 선택 화면으로(ADR 0009). 로그인 후 상태별 이동: 농가 없음 → SCR-20, 승인 대기·반려 → SCR-21, 승인 → SCR-22
- [ ] SCR-29 출하 처리: 수확 시작 + 주문별 송장 번호 입력·출하로 바꾸기. 자연어 입력은 만들지 않음(I2)
- [ ] 승인 전 잠금(AC-01-3): SCR-22~30 → SCR-21

## DEV-3 로컬 프로토타입 통합 작업 (2026-10-07)

- 이슈: https://linear.app/sswp6/issue/DEV-3
- 브랜치: `jinwoo/dev-3-frontend`
- 상태: 로컬 실행 완료, 사용자 수정 대기
- 기준: screens.md 1.1, docs/design, ADR 0009·0010, 사용자 승인 계획

### 목표
Hyun Park 작성 farmclub-proto-ref.zip을 기준으로 두 앱을 Mock 모드로 실행하고 사용자 피드백을 반영한다.

### 범위
- apps/producer/**

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
- 추가 점검: 가입 신청의 입점 정책에도 반복 가격 심사 문구가 남아 있어 현행 policy.md에 맞춰 교정. 소비자 로그인 제목은 예약 외 소식방 진입에도 맞는 중립 문구로 변경.
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


## DEV-29 생산자 I2 핵심 흐름 및 DEV-34·DEV-38 보완

- 이슈: [DEV-29](https://linear.app/sswp6/issue/DEV-29), [DEV-34](https://linear.app/sswp6/issue/DEV-34), [DEV-38](https://linear.app/sswp6/issue/DEV-38)
- 브랜치: `jinumeral/dev-29-i2-t11-finish-the-main-producer-onboarding-product-sales-and`
- 기능·인수 조건: P01–P07 / FEAT-03 AC-03-1/3, FEAT-04 AC-04-1, FEAT-17 AC-17-2/5, FEAT-19 AC-19-1
- 상태: 구현·로컬 검증·AI 1차 리뷰 완료. PR #109의 최종 CI와 머지 결과는 PR 및 Linear에서 확인한다.

### 목표
기존 생산자 흐름의 실제 구현을 확인하고 초안 복구·필수 입력·공유 실패·수동 출하의 빈틈을 수정한다.

### 범위 (수정 허용 경로)
- `apps/producer/src/app/(tabs)/products/new.tsx`, `apps/producer/src/app/(tabs)/products/[id]/edit.tsx`
- `apps/producer/src/app/(tabs)/farm/index.tsx`, `apps/producer/src/app/ship.tsx`
- `apps/producer/spec.md`, `apps/producer/tasks.md`
- `scripts/e2e/producer-and-privacy.spec.ts`, `scripts/e2e/producer-i2.spec.ts`
- `docs/spec/functional/FEAT-03-ai-product-draft.md`, `docs/spec/functional/FEAT-04-product-edit.md`, `docs/spec/functional/FEAT-17-shipping.md`, `docs/spec/functional/FEAT-19-farm-link.md`
- `docs/wiki/Testing-Documentation.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
로그인·결제 구현, AI 채팅, 배포, 운영자 API, 실제 농가 검증. 기존 미커밋 디자인 자료는 보존한다. DEV-43/46/49의 실제 자료 및 발견 결함 기반 완료를 이번 코드 검사로 대신하지 않는다.

### 결정 사항
- 10/16 사용자 지시에 따라 기존 PR #98/#104를 머지하며 본인 할당 범위만 계속한다. 별도 확인 없이 진행하라는 지시를 이번 구현 계획에도 적용한다.
- 10/16 초안의 null뿐 아니라 빈 문자열·빈 옵션 배열을 미확인 항목으로 표시한다. 초안 생성과 상품 생성은 동시에 실행하지 않는다.
- 10/16 원산지·보관 방법 누락을 편집 화면 필드 및 공급 신청 버튼에 반영한다. API 계약은 변경하지 않는다.
- 10/16 Web Share 사용자 취소는 유지하고 다른 공유 실패는 링크 복사로 복구한다.
- 10/16 출하 후 목록 갱신 실패를 화면에 표시하고 재시도할 수 있게 한다. 출하 처리 중 확인창을 닫거나 다시 요청할 수 없게 하며 기존 PREPARING→SHIPPED 전이만 유지한다.

### 작업
- [x] 기존 P01–P07 구현과 검증 근거 대조
- [x] DEV-34 초안 실패·누락 표시·필수 입력 보완
- [x] DEV-38 공유 및 수동 출하 오류 복구
- [x] 타입 검사·실서버 Chromium 회귀 검사
- [x] 스펙·영문 wiki와 PR 검증 근거 동기화

### 기록
- 10/16 PR #98 검증 브랜치를 작업 기준으로 사용하고 머지 후 main 위로 이번 커밋만 옮긴다. 별도 일회용 PostgreSQL 컨테이너(55436)에서 검증하며 사용자 DB를 사용하지 않는다. Agent 시간/Tokens는 미측정.

- 10/16 회귀 검사에서 실서버 공유 페이지가 없고 상대 shareUrl이 생산자/소비자 앱 호스트로 해석되는 미구현을 확인. DEV-38의 AC-19-1/2/3을 위해 범위를 `server/app/farms/router.py`, `server/app/farms/share.py`, `server/app/farms/templates/farm-share.html`, `server/app/farms/spec.md`, `server/app/main.py`, `server/tasks.md`, `server/tests/test_farms.py`, `server/tests/test_farm_share.py`로 확장한다. 요청 URL의 서버 origin으로 절대 공유 URL을 만들고 Jinja2 자동 이스케이프 HTML·승인 확인·비승인 404·캐시 금지를 적용한다. 새 AI 호출이나 배포는 없다.

- 10/16 PR #98(6343b24), #104(4d7eece) 머지 후 main 위로 이번 커밋만 재배치. 전체 pytest 162개·Ruff, 4 workspace 타입 검사, 실서버 API 7개·Chromium 19개 통과. 실제 AI/카카오톡 크롤러/농가 자료 검증과 배포는 미실행. 첫 공유 회귀 실패가 드러낸 서버 페이지 누락을 구현한 뒤 전체 통합을 재실행했다.
- 10/16 커밋 전/브랜치 자체 점검: 범위 이탈·미커밋 중간 구조 호환 없음. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건.


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

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.
- 최종 리뷰 보완: 요청 처리 중 상품명·붙여넣기·근거 문구 입력을 잠가 진행 중 입력 손실을 방지했다. 생산자 타입/웹 빌드 및 자료 E2E 3개 재검증 통과. 추가 커밋 스캔: 레거시 후보0건, 회귀 지적 없음.

### DEV-58 통합 회귀 중 초기 입력 손실 (2026-10-17)
- 범위: 기존 producer src 및 scripts/e2e 범위. 세션 확인 중 Tabs가 guest에서 user key로 다시 만들어져 입력이 사라지는 재현을 수정한다. 로그인/API/AI 채팅 동작은 변경하지 않는다. Tabs는 ready 이후에만 표시하고 기존 초안 E2E에 지연된 auth/me 응답 검증을 추가한다.
- 소비자 배송지 E2E는 주소 응답 전 임시 화면을 isVisible로 판단하던 경쟁을 제거한다. 서버 주소 목록을 받은 뒤 동일한 주소 입력/결제/출하 검증을 수행한다.
- [x] 타입/전체 브라우저 회귀 및 커밋 스캔

- 검증: 4 workspace 타입 검사, 실제 API7개 및 Chromium22개 통과. 세션 응답을 명시적으로 지연시켜 입력창이 준비 후에만 열리는 것을 확인했다. 초기 실패 기록은 .artifacts/main-sync-failure에 보존했다. 추가 커밋 스캔 이슈 없음, 레거시 호환 후보0건.

## DEV-58 Gemini OCR 제품 연결 안내 (2026-10-17)
- 사용자 채택 버전을 실제 경로에 연결. 범위: src/lib/SourceWorkspace.tsx, spec.md, tasks.md.
- 이미지/PDF는 가림 승인 후 문자인식에 전송됨을 알리고 기존 선택적 추가 시각 분석 안내와 구분한다. API 계약은 유지한다.

- [x] 전송 안내 반영, 타입4 workspace/mock12개 및 실제 제공자 UI 전체 흐름 검증. 사용자 직접 인수는 대기.

## DEV-58 자료 작업 화면 정리 (2026-10-17)
- 사용자 요청: 분석 상태를 눈에 띄게 표시하고 업로드 사진/파일 썸네일, 기존 생산자 규격의 컴팩트한 화면으로 정리.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, scripts/e2e/{source-workspace-ui,source-analysis}.spec.ts, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: 공용 토큰(20px 좌우/16px 카드/64px 썸네일/48px 터치)을 사용. 진행 상태는 탭 위에서 표시하고 개인정보 승인 대기는 구분한다. 이미지 업로드 직후 로컬 미리보기, 준비 후 권한 보호된 가림 페이지 썸네일. PDF는 준비 후 첫 쪽, TXT는 파일 타일. 연결/삭제·추가 시각 설정은 펼쳐보기로 보존한다. 키/원문을 공개 저장하지 않는다.
- [x] 상태·썸네일·컴팩트 UI 반영 및 브라우저 확인

- 검증: 타입4 workspace/mock12개 통과. 격리 mock API·DB의 source-analysis/source-workspace-ui Playwright6개 통과(360/390/430px 업로드·편집·저장·공개, 진행 상태 전환, 준비 전/후 썸네일, 가로 넘침/콘솔 오류 없음). 최초 격리 환경은 테이블 미생성과 별도 포트 CORS 누락으로 실행 실패해 환경을 수정한 뒤 최종6개 통과. 실제 데모 DB와 유료 호출은 변경하지 않았다.
- scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. object URL 해제·가림 이미지 전환·기존 조작 경로 및 신규 테스트 전체 확인.
## DEV-58 새 상품 진입 연결 (2026-10-17)
- 사용자 요청: 새 상품 버튼에서 자료 업로드 화면으로 바로 진입.
- 범위: apps/producer/src/app/(tabs)/products/{new,manual}.tsx, apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, scripts/e2e/{source-workspace-ui,producer-i2,producer-and-privacy}.spec.ts, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md.
- 결정: 새 비공개 상품 생성 후 연결된 자료 작업을 생성해 업로드 화면을 연다. 기존 입력 경로는 manual로 유지. 같은 effect의 생성 Promise를 공유하고 작업 재시도는 기존 상품과 멱등 키를 사용한다. 상품 정보/판매 설정 이동을 제공한다. 공개/승인은 기존 계약을 유지한다.
- [x] 경로 연결 및 회귀 검증
- 검증: 타입4 workspace, mock12개, 격리 API/DB의 producer-i2/producer-and-privacy/source-analysis/source-workspace-ui Playwright16개 통과(46초). 새 상품 버튼→업로드 직접 진입·동일 상품 기본 정보 편집, batch 실패 시 상품1회 생성·멱등 키 유지 확인. 기존 manual 폼은 이전 커밋 파일과 바이트 동일. 추가 AI 호출 없음.
- scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 신규 진입·재시도·unmount·기존 직접 입력 경로/호출부 확인. PR #113 머지 보류 유지.

### DEV-58 중복 진입 버튼 제거
- 사용자 요청: 상품 목록의 자료로 상세 만들기 버튼 삭제, 새 상품 진입으로 통일.
- 범위 추가: apps/producer/src/app/(tabs)/products/index.tsx. 기존 상품의 저장 작업 편집 경로는 유지한다.
- 검증: 생산자 타입 검사 및 새 상품 진입/재시도 Playwright2개 통과. 앞선 관련 전체16개 통과 이후 버튼 삭제만 반영. scan-before-commit 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.

## DEV-58 생산자 전체 UI·상품 편집 동선 (2026-10-17)
- 승인 계획/범위: server/tasks.md의 상품별 편집 작업·생산자 흐름 안정화와 동일. apps/producer/**, packages/ui/src의 생산자 공용 구성, packages/api/**, scripts/e2e/**, 관련 spec/wiki/tasks.
- 기존4탭 유지. 상품 목록의 판매페이지 수정은 해당 상품의 초안/공개 내용을 직접 연다. 현황·주문/출하·농가·설정·상태 안내 공통 규격과 뒤로가기/오류/입력 보존을 점검. AI 채팅 기능은 제외.
- [x] 구현·회귀·완료 영상3개

- 구현 완료: 상품별 현재 내용 재개·비공개 저장·명시적 적용, 18모듈 추가/숨김/문구 편집 및 기존 블록 보존, 새 상품 원자 생성/응답 유실 멱등 재시도. source 적용과 수정본 충돌 보호, 삭제된 원본 작업과 독립 편집, 본인 전용 사진 조회를 포함한다.
- 검증: 전체 `pytest -q` 281개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 API/DB의 생산자/자료 Playwright18개 통과, 사진 권한 보완 후 상품 편집·자료 적용4개 및 응답 유실 재시도2개 추가 통과. migration0011 upgrade/downgrade0010/re-upgrade 통과.
- 화면 점검: 현황의 제목/여백, 상품 목록 카드/판매페이지 진입, 환경설정 카드, 농가 프로필/출하 간격을 공통 토큰에 맞췄다. 기존4탭·URL 상품 필터/출하 상태 및 기존 송장 오류 보존 계약을 유지한다. 로그인/승인/정지 안내는 기존 공용 컴포넌트 유지, AI 채팅 동작은 수정하지 않았다.
- scan-before-commit: 새 상품 effect의 미커밋 중간 코드 제거, 잠금 대기 후 workspace 재조회, 비공개/숨김 사진 접근 보완. 최종 이슈 없음. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (detailContent: b464eba, moduleDetail: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지 유지. 추가 AI 호출/배포 없음. Agent 시간/Tokens 미측정.

- 영상: `.artifacts/in-app-v4/flow-review/index.html` 및01-create/02-edit/03-navigation.webm. 새 상품 사진 준비·개인정보 확인·사진 연결·초안 저장은 격리 mock 제공자, 기존 판매페이지 편집은 실제 Gemini 저장 결과 재사용. 녹화 환경의 모델 SHA 누락을 고쳐 사진 준비/썸네일/초안 포함까지 재녹화했다. 테스트 브라우저는 모두 닫았다.

## DEV-58 상세 편집 통합·항목별 ON/OFF
- 사용자 승인: 근거 검토 별도 탭/개별 확정 제거, 기존18항목별 스위치, 자동 채움·직접 편집·선택적 원문 보기.
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceDetailsEditor,ProductPageEditor}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/**, server/tests/**, scripts/e2e/**, 해당 spec/tasks 및 docs/spec/source-integration.md/docs/wiki/Source-Analysis.md.
- 결정: 유효한 단일 후보만 자동 채움(UNREVIEWED 유지), 충돌/과거/오래된/불명확한 후보 제외. 기존 저장 내용/선택 우선, OFF내용 보존. 편집값+모듈 선택 원자 저장 API와 기존 API 병행. 사진 승인/버전/명시적 공개 유지. 추가 AI 호출·머지·배포 없음.
- [x] 구현/회귀/영상/커밋 스캔

- 범위 추가: docs/spec/source-analysis.md의 예전 개별 확인 필수 문구를 승인된 자동 채움·항목별 선택 계약에 맞춘다. OFF된 오래된 사진은 비공개 보존하고 다시 켤 때 준비/연결 검증을 수행한다.

- 완료: 근거 검토 탭/개별 확정 제거, 자동 채움·18항목 스위치·직접 편집·접히는 원문, 문구/선택 원자 저장. 자동 값은 UNREVIEWED 유지, OFF 값/사진 보존, 충돌·오래된 항목은 선택적 해결. 기존 상품 편집도 같은 스위치로 통일했다.
- 검증: 전체 pytest284개 통과 후 오래된 OFF 사진 케이스 추가/보완을 포함한 최종 관련22개 통과. Ruff, 타입4 workspace, mock13개 통과. 기존 생산자·자료 Playwright18개 + 저장 실패/동일 요청 재시도1개 통과; 직접 탭 진입/분석 완료 갱신 보완 후 관련9개 재검증 통과.
- scan-before-commit: 상세 편집 탭 직접 진입 시 최신 결과를 읽지 않던 경로와 분석 중 열린 편집 화면의 초기 선택 갱신을 보완. 미저장 입력은 기존 버전에 고정해 충돌 시 보존한다. 최종 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (기존 review/drafts CONFIRMED 계약: 4d7eece).
- 영상: .artifacts/in-app-v4/toggle-review/index.html. 새 상품 mock 분석의 자동 채움/OFF저장/재진입/ON복원, 기존 실제 Gemini 생성 상품의 수정/반영을 녹화. 추가 유료 AI 호출0, PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

### DEV-58 스위치 시각 정리
- 사용자 요청: 주황/초록이 섞인 ON/OFF 표시를 단순하게 정리.
- 범위 추가: apps/producer/src/lib/SectionSwitch.tsx. 두 편집 화면에 동일한 둥근 트랙/흰 손잡이를 사용하며 ON은 accent, OFF는 border로 고정한다. 기존 접근성 switch 역할·키보드 조작·disabled·값 보존을 유지한다.
- 추가 사용자 요청: 상세 사진 아래 캡션 제거. 범위 추가: packages/ui/src/SourcePhoto.tsx. 이미지 대체 텍스트는 유지하고 미리보기/공개 페이지의 시각 캡션만 제거한다.
- 검증: 타입4 workspace 통과, 스위치 ARIA 수정 후 관련 Playwright9개 통과(40.1초). Space/Enter 키보드 토글 및 실제 공개 페이지 사진 캡션 제거를 별도 headless 확인. 기존 accessibilityState가 웹에서 checked로 전달되지 않는 문제와 switch의 Space 조작을 보완했다. 커밋/머지/배포 없음.

## DEV-58 분석 완료 표시·업로드 개인정보 안내 전환
- 사용자 지시: 실행별 완료 n/n 제거, 최신 분석 상태 하나만 표시. 개인정보 가리기/승인 기능 대신 업로드 전 직접 가리기 안내.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, server/app/source_analysis/{worker,service}.py, server/tests/test_source*.py, scripts/e2e/source*.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 개인정보는 업로드 전에 사용자가 직접 제거. 새로 준비된 자료는 자동 가림 없이 분석 가능 상태로 전환한다. 기존 가림본과 버전 취소/예산/권한 보호는 유지한다. 기존 대기 작업은 취소 후 새 분석으로 이어갈 수 있도록 안내한다. 추가 유료 호출·머지·배포 없음.
- [x] 구현·관련 회귀 검증

## DEV-58 두 첨부함·설명 기반 사진 배치·페이지 직접 편집
- 사용자 승인 계획: 자료/상품사진 별도 썸네일 박스, 텍스트 자료 수정, 상품사진 한 줄 설명으로만 AI 위치 분류, 완료 후 편집 진입, 실제 페이지에서 문구/사진/ON-OFF 편집.
- 범위: apps/producer/src/lib/**, packages/{ui,api}/src/**, server/app/{source_analysis,ai}/**, server/migrations/versions/**, server/tests/test_source*.py, scripts/e2e/source*.ts, 관련 spec/tasks 및 docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 사진 설명은 캡션/상품 사실로 사용하지 않는다. 상품사진은 OCR 없이 준비하고 위치 분류에 이미지 전송하지 않는다. 미배치 사진 수동 선택, 수동 수정 우선. 기존 초안/가림본 보존. 추가 유료 검증/배포/PR113 머지 없음.
- [x] 백엔드·직접 편집기·통합 검증·영상

- DEV-58 scope addition: docs/spec/source-editor.md; current source-editor contract supersedes the previous UI/approval flow.

- 완료: 자료/상품사진 두 박스·텍스트 수정·설명만 이용하는 사진 배치, 분석 완료 후 페이지 직접 편집, 사진 추가/제외/이동/순서 및 원래 위치의 OFF 접기. 최신 상태 하나와 업로드 전 개인정보 제거 안내로 전환. 비공개 저장/명시적 적용·버전·권한 보호 유지.
- 검증: 전체 `pytest -q` 291개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 DB/API의 source-analysis/source-editor/source-workspace-ui/product-page-workspace Playwright 11개 통과. migration0012 upgrade/downgrade0011/re-upgrade 통과.
- 영상: `.artifacts/in-app-v4/page-editor-review/index.html` (새 자료→직접 편집→저장/공개, 기존 상품 사진 추가/제외/복원/순서→저장/공개). mock 제공자 및 기존 저장 결과만 사용, 추가 유료 호출 0. 사진 설명 분류의 실제 모델 품질 평가는 별도 미실시.
- scan-before-commit: 사진 업로드 중 중복 조작·사진 풀 중복·분류 재시도 중복·버전 충돌 보호 보완 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보3건 — 지적0건 / 커밋된 구조3건 (privacy_approved: 4d7eece, modules/blocks: 839503e, SourceRun inputs 없는 실행: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 첨부 카드·사진 추가·눈 아이콘 편집 UX
- 사용자 승인: 파일명 제거, 텍스트 요약 타일의 연필/×, 카드 내 사진 설명 즉시 편집, 얇고 작은 조작부, 점선 둥근 사진 추가 칸, 눈 아이콘으로 끄면 접고 흐리게/켜면 펼침. 켜진 항목만 별도 접기 가능.
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,PageCanvas,SectionSwitch}.tsx, packages/ui/src/Icon.tsx, scripts/e2e/source*.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 설명은 blur 및 분석 직전 저장, 실패 입력 보존/재시도. 기존 API/DB 유지. 접기 상태는 로컬 전용, 공개는 enabled만 사용. 기존 판매페이지 본문 디자인 유지. PR113 Draft/미머지/미배포, 유료 검증 없음.
- [x] 구현·타입/관련 브라우저 회귀·영상·커밋 스캔
- 범위 추가: packages/ui/src/Button.tsx — 편집 도구에만 opt-in compact(13px regular/44px/얇은 테두리)를 제공하며 기존 버튼 기본 규격은 유지한다.

- 범위 추가: SourceDetailsEditor.tsx의 미배치 사진 안내를 기존 편집 버튼에서 새 + 사진 추가 칸으로 갱신한다.

- 검증: 최종 격리 DB/API Playwright12개(52.3초) 통과. 360/390/430px, 파일명 미노출·텍스트 연필/삭제, 사진 설명 저장 실패/재시도·분석 직전 최신 입력, 눈 아이콘 Space/Enter·접기/복원·공개 화면 확인. 타입4 workspace 및 mock13개 통과. 이번 변경은 프론트만 수정하여 서버 전체 테스트는 재실행하지 않음(직전291개 및 CI 통과).
- 스캔: 설명 저장 중 추가 입력·삭제/업로드 순서 보호, 사진 이동 중 목록 변경 보호, 충돌 항목 확인 경로 유지. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.
- 검증 중 기존 파일명 선택자와 실행 입력 스냅샷 테스트 필드를 실제 계약에 맞췄다. 의도한503 테스트를 정상 네트워크 검사와 분리했다. 키보드 테스트는 확인창 닫기 애니메이션 종료를 기다린 뒤 검사한다. 웹 눈 아이콘은 기본 button의 Space/Enter 동작을 사용한다.

- 영상2개를 새 카드 설명/눈 아이콘/접기/점선 사진 추가 UX로 재녹화했다: `.artifacts/in-app-v4/page-editor-review/index.html`. 격리 mock 제공자만 사용, 추가 유료 호출0. 녹화 브라우저 종료. 사용자 확인 전 PR113 Draft·미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 첨부 오버레이·접기 제거
- 승인: 첨부 내용이 카드 전체를 채우고 연필/×는 우측 상단 오버레이. 별도 접기 화살표/상태 제거, 기존 눈 ON/OFF만 유지. 큰 섹션 제목 접기 추가 없음.
- 범위: apps/producer/src/lib/{SourceAttachments,PageCanvas}.tsx, scripts/e2e/{source-analysis,source-workspace-ui}.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 첨부 이미지는 정사각 썸네일 cover, 공개 사진 원본 비율/프레임 유지. 텍스트는 최소 안쪽 여백과 아이콘 겹침 방지. 카드 아래 사진 설명 inline 유지. API/DB 변경 없음. PR113 미머지·미배포 유지.
- [x] 구현·타입/브라우저·영상·커밋 스캔
- 검증: 타입4 workspace 통과 후 미리보기 오류 안내 추가에 대해 생산자 타입 재검사 통과. 격리 mock API/DB Playwright12개(52.6초) 통과: 360/390/430px 카드 경계·오버레이 위치, 텍스트 수정/삭제, 설명 저장/재시도, 눈 Space/Enter·내용 복원·저장/공개. 첫 실행의 이미지 선택자가 SVG 아이콘까지 찾던 문제는 미리보기 영역으로 범위를 좁혔다.
- scan-before-commit: 미리보기 이미지 오류 안내/URL 변경 복원, 아이콘 클릭 분리·44px 영역, 별도 접힘 상태 완전 제거 및 공개/충돌 처리 유지 확인. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 추가 유료 호출 없음.

- 영상2개를 오버레이 카드/눈 아이콘만 있는 화면으로 갱신: `.artifacts/in-app-v4/page-editor-review/index.html`. 녹화 브라우저 종료. PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

## DEV-58 텍스트 카드 클릭 편집
- 사용자 요청: 첨부 텍스트 연필 제거, 카드 본문 클릭으로 전체 내용 수정. 우측 상단 삭제 × 유지.
- 범위: apps/producer/src/lib/SourceAttachments.tsx, scripts/e2e/source-analysis.spec.ts, apps/producer/{tasks,spec}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 기존 카드 onEdit/API 사용. 상세페이지 충돌 해결의 연필은 별도 기능이므로 유지. 머지·배포 없음.
- [x] 구현·타입·기존 흐름 검증·커밋 스캔

- 생산자 타입 검사 통과, 기존 source-analysis Playwright3개(360/390/430px,23.9초) 통과. 카드 본문 클릭으로 전체 텍스트를 열고 삭제 시 편집 화면이 열리지 않는 동작, 저장/공개까지 확인. scan-before-commit 이슈 없음. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. 추가 AI 호출/머지/배포 없음.

## DEV-58 큰 섹션 눈 아이콘·항목 제외
- 승인 계획: 큰 제목 왼쪽 눈으로 섹션 전체 제어, OFF 제목/장식 흐림, 하위 항목·사진 우측 상단 ×, 연한 placeholder. 별도 회색 조작 줄/접기 없음.
- 범위: apps/producer/src/lib/{PageCanvas,SourceDetailsEditor,ProductPageEditor}.tsx, packages/{ui,api}/src/**, server/app/source_analysis/**, server/tests/{test_source*,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: hiddenSectionIds는 JSON 초안/API에 저장하며 기존 enabled와 분리. 숨김은 공개/활성 근거 검증에서 제외, 재활성화 시 재검증. 기존 초안은 빈 배열 기본값. ×는 비파괴 제외, 항목 추가/사진 풀에서 복원. SQL 마이그레이션 없음. PR113 Draft/미머지/미배포, 유료 AI 호출 없음.
- [x] 구현·저장/공개 회귀·타입·브라우저·커밋 스캔

- 완료: 큰 제목 바로 왼쪽 눈·OFF 제목/장식/구분선 흐림, 하위 항목/사진 ×와 복원, 연한 placeholder, 섹션 숨김/개별 제외 독립 저장·공개 필터 적용.
- 검증: server/에서 `pytest -q tests/test_source_editor.py tests/test_product_workspace.py tests/test_source_integration.py tests/test_source_analysis.py` 57개 통과(12.72초), 타입4 workspace 및 최종 생산자 타입 검사 통과, mock13개 통과. 격리 DB/API Playwright15개 최종 통과(1.0분), 360/390/430px 정렬·흐림·제외/복원·placeholder·새로고침·미리보기/공개 확인. Ruff/diff 검사 통과.
- 스캔: 여러 저장본 중 최신 hiddenSectionIds 선택 및 활성 충돌 항목 확인 경로 보완. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (Draft snapshot:4d7eece, PageSnapshot:839503e).
- 검증 과정의 루트 cwd 실행은 전처리 subprocess 환경 때문에 실패하여 server/에서 정상 재검증. 브라우저 fixture 모델 등록 및 실제 사진 선택자를 수정했다. 화면 캡처 `.artifacts/section-editor-{360,390,430}.png` 확인. 기존 영상은 이번 조작 변경 전 기록으로 남김. 로컬 API 재시작만 수행, 기존 데이터 재시드/AI 호출 없음. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 빈 항목 직접 입력·오버레이 정렬
- 사용자 승인: 항목 추가 버튼/목록 제거. 모든 빈 항목은 제자리의 연한 `내용을 입력해주세요`, 빈 섹션은 제목/장식/구분선도 흐림. 내용 입력/사진 추가 시 자동 반영, 빈 내용은 공개 제외. 눈은 섹션 머리 맨 오른쪽으로 이동.
- 범위: apps/producer/src/lib/{PageCanvas,SourceAttachments,SourceDetailsEditor}.tsx, packages/ui/src/ModuleStory.tsx, server/app/source_analysis/{service,workspace}.py, server/tests/{test_source_editor,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, 관련 spec/tasks 및 docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: × 제외는 값 보존/흐림, 클릭 편집으로 다시 반영. 빈 항목 × 숨김. 숨김 눈은 수동 상태 유지. 첨부 텍스트/항목 ×를 첫 줄에 겹쳐 배치하고 오른쪽 공간만 확보. API/DB 필드 추가 없음. 격리 mock 영상2개 갱신, PR113 머지·배포 없음.
- [x] 구현·검증·영상·커밋 스캔

- 검증 완료: 타입4 workspace, mock13개, Ruff/diff 검사 통과. server/에서 관련 source-editor/product-workspace/source-integration/source-analysis pytest58개(13.86초), 격리 DB/API Playwright15개(1.1분) 통과. 빈 항목 입력/사진 활성화, 공백 제외, 빈 섹션 제목 흐림, 오른쪽 눈/× 정렬, 제외 후 클릭 복원·저장/공개 확인.
- scan-before-commit: 호출부·전체 diff·빈 상태/충돌 경로 검토 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 신규 후보0건 — 지적0건 / 커밋된 구조0건. 기존 hiddenSectionIds 기본값은 기존 커밋의 변경 없는 동작.
- 영상2개 최신 녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 항목 추가 없이 직접 입력, 빈 섹션 흐림/오른쪽 눈/× 제외·클릭 복원, 사진 추가/제외/순서 및 저장/공개. 격리 mock만 사용, 추가 유료 호출0. 로컬 API 갱신, 실제 데모 데이터 유지. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 편집/미리보기 정렬·사진 제안 제거
- 승인: 공개 페이지와 편집/미리보기의 가운데 정렬 일치. 사진 추가 제안 UI 제거.
- 범위: apps/producer/src/lib/{PageCanvas,SourceWorkspace}.tsx, packages/ui/src/ModuleStory.tsx, scripts/e2e/{source-analysis,source-editor}.spec.ts, apps/producer/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: 상품명/소개 문구는 공통 스타일의 중앙 정렬, 이름 눈은 오른쪽 오버레이와 균형 잡힌 좌우 공간. 본문은 기존 좌측 정렬 유지. 사진 요청 API/원본 데이터는 유지하고 UI/토글 상태만 제거. PR113 미머지·미배포.
- [x] 구현·검증·커밋 스캔

- 검증: 타입4 workspace 및 최종 생산자 타입 검사 통과. 격리 DB/API Playwright15개(1.1분) 통과, 모바일3폭 상품명 중심 좌표·소개 중앙 정렬·사진 요청이 있는 응답의 제안 UI 미노출·저장/공개 확인. 이번 UI 변경은 서버/mock 동작 변경 없어 직전 서버58개/mock13개 결과 유지(이번 재실행 아님).
- scan-before-commit: 삭제된 토글 상태/호출부, 편집·공개 공통 스타일 및 조작부 중심 간섭 검토. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건.
- 기존 영상2개를 최신 중앙 정렬 화면으로 재녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 추가 유료 호출0, 녹화 브라우저 종료. PR113 Draft/미머지·미배포. Agent 시간/Tokens 미측정.


## DEV-58 기본 정보 입력과 빈 항목 안내 (AC-SRC-11, FEAT-03/04/07)
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceBasicInfo,PageCanvas}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/{schemas,service,router,editor}.py, server/tests/test_source*.py, scripts/e2e/source*.spec.ts, 관련 spec/tasks/wiki 및 로컬 검토 영상.
- 결정: 품종 필수, 사이즈·예상 당도 선택. 대상별 basicInfo JSON 저장, 기존 상품 기본값 복사, 분석 전 저장/필수 검증. 직접 편집 CONFIRMED/EXCLUDED > 기본 정보 > 추출 결과. 실측값으로 변환하지 않음. 기본 정보 저장만으로 공개 상품 변경 없음.
- 결정: 기본 정보만 변경할 때 추출 근거는 무효화하지 않으며 reviewVersion을 증가시켜 오래된 편집 저장을 막는다. 기본 정보에서 만든 미확정 제안은 변경 시 새로 만들고 직접 편집은 유지한다.
- [x] 구현·API/mock 타입·관련 문서 갱신
- [x] backend/typecheck/mock/브라우저 검증 및 headless 영상 갱신
- [x] 커밋 전 스캔, PR #113 갱신 (미머지)

- 검증: server/에서 관련 pytest 61개 통과(15.39초). npm run typecheck 4 workspace, npm run test:mock 13개, 격리 DB/API Playwright 16개(1.1분), 변경 Python Ruff 및 git diff --check 통과.
- 스캔: 기본 정보 우선순위가 오래된 사진 검증을 생략하던 경로를 보완하고, 화면 전환 후 늦은 응답/flush 참조 수명을 수정했다. 수정 후 관련 검증 통과. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 2건 — 지적 0건 / 커밋된 구조 2건 (SourceTarget:388d956, Batch.targets:4d7eece).
- 화면 확인: .artifacts/basic-info-390.png. 기존 영상 페이지 .artifacts/in-app-v4/page-editor-review/index.html에 기본 정보 입력부터 분석·편집·저장·공개 영상(32.68초)과 기존 상품 사진 편집(12.4초)을 갱신하고 재생 확인. headless 브라우저 종료, 추가 유료 호출 0. 기존 실제 데모 DB를 보존해 로컬 API만 갱신했다.
- PR113 Draft/미머지/미배포 유지. Agent 시간/Tokens 미측정.


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

## DEV-58 PR113 최종 머지 리뷰 (FEAT-03/04/07, AC-SRC-9/11)
- 범위: apps/producer/src/lib/ProductPageEditor.tsx, packages/api/src/productWorkspace.ts, server/app/source_analysis/workspace.py, server/tests/test_product_workspace.py, scripts/e2e/product-page-workspace.spec.ts, 관련 spec/tasks/wiki.
- 결정: main에 없던 PageSnapshot 중간 형식의 대표사진 보충·누락 요청 보존 분기를 제거한다. 현재 snapshot은 대표 URI를 명시한다. 로컬 기존 검토 데이터는 필요 시 별도 보정하고 제품 호환 분기를 두지 않는다.
- 결정: 사진 업로드 직후 대표 지정과 모듈 배치가 연속 실행돼도 이전 snapshot으로 덮어쓰지 않도록 함수형 상태 갱신한다.
- [x] 구현·회귀 검증·최종 리뷰 완료. 최신 CI 확인 뒤 squash merge 결과는 PR/Linear에 기록.

- 검증: 전체 pytest 300 passed(37.17초), typecheck 4 workspace 통과, Ruff 전체 통과, 격리 Playwright 4 spec 18 passed. 변경하지 않은 mock 계약 13 passed 결과 재사용. 마이그레이션 0008→0009→0010→0011→0012 단일 체인 확인.
- 리뷰 수정: 첫 사진 업로드의 대표 지정 덮어쓰기 수정, PageSnapshot 브랜치 전용 호환 제거, 현재 스펙 우선순위/마이그레이션 설명 정정. 새 첫 업로드·저장·재접속 및 누락/다른 상품 사진/null 대표 계약 회귀 테스트 추가. 커밋 전 스캔 이슈 없음, 신규 호환 후보 0건.
- 머지 스캔: 후보 7건 — 지적 1건(수정 완료) / 정당 6건. ProductWorkspace.snapshot은 origin/main 이력 0건(브랜치839503e→b36fe10)이라 제거. Batch.targets·Draft.snapshot·Run.inputs·Page.spans·Asset.privacy_approved는 base4d7eece, Product.detail_content는 baseb464eba에 존재해 유지. 새 사진 저장 이후 공개 참조·소유권·버전·예약/취소 경로 검토.
- 사용자 승인: Draft 해제·리뷰 수정 후 머지 명시 요청. 기존 사람 승인 병목 없이 각자 충돌 해소 후 머지하는 팀 방침에 따라 진행. Agent 시간/Tokens 미측정, 추가 유료 AI 호출 0.

## DEV-68 무통장 입금: 입금 계좌(SCR-30 하위)·입금 대기 탭·입금 확인·환불 송금(SCR-29)·현황 할 일(SCR-22)
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-14, FEAT-17 AC-17-7·8, FEAT-09 AC-09-8 · 상태: 진행 중

### 목표
생산자가 입금 계좌를 등록하고, 주문 현황에서 통장과 대조해 「입금 확인」을 누르며, 환불은 송금 뒤 「송금 완료」로 닫는다. 디자인: https://claude.ai/artifact/Pfj8bHERB3FXqH4iD1D6HL

### 범위 (수정 허용 경로)
- `apps/producer/src/app/(tabs)/farm/index.tsx`, `apps/producer/src/app/(tabs)/farm/edit/[field].tsx`, (필요 시) `apps/producer/src/app/(tabs)/farm/account.tsx`
- `apps/producer/src/app/ship.tsx`, `apps/producer/src/app/(tabs)/index.tsx`
- `apps/producer/src/app/(tabs)/products/[id]/edit.tsx` (409 `NO_FARM_ACCOUNT` 안내 한 곳)
- `apps/producer/spec.md`, `apps/producer/tasks.md`

### 비범위
- 가입 신청(SCR-20)에는 계좌를 넣지 않는다. 계좌조회 자동 매칭. 채팅·소식.

### 결정 사항
- 10/18 계좌 입력은 별도 화면 `/farm/account`(은행·계좌번호·예금주 세 칸 한 화면, 미리보기, 저장 56). 프로필 줄 「입금 계좌」에서 진입.
- 10/18 SCR-29 탭: 전체·입금 대기·예약·출하 준비·출하·환불할 것. 입금 대기 줄은 배송지를 보여 주지 않는다(R-15). 「입금 확인」 → 시트 → `confirmDeposit`. 환불할 것 줄은 「송금 완료」 → `refundSettled`.
- 10/18 SCR-22: 제목 아래 할 일 목록(ListRow: 입금 확인 n건 / 환불 송금 n건 / 계좌 등록). 전체 주문 수에 입금 대기 포함.

### 작업
- [x] 농가 프로필 「입금 계좌」 줄 + `/farm/account` 화면
- [x] 현황 할 일 목록
- [x] 주문 현황 입금 대기·환불할 것 탭, 확인 시트, 송금 완료
- [x] 상품 편집 승인 요청 409 `NO_FARM_ACCOUNT` 안내
- [ ] `npm run typecheck`, e2e 통과

### 완료 조건
- [ ] 이슈 완료 조건(생산자 항목) · 테스트 통과 · 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 범위 수정: 409 `NO_FARM_ACCOUNT` 안내는 `products/[id]/edit.tsx`가 아니라 승인 요청이 있는 `products/[id]/sales.tsx`에 넣었고, 상태 문구 표 `src/lib/views.tsx`(AWAITING_DEPOSIT) 추가.
- 10/18 AI 1차 리뷰 반영: 취소·입금 안내 재요청 시 만료 검사, 환불 송금 완료는 REFUNDED만, 입금했어요 잠금 순서(상품 → 주문), 입금 안내 화면 만료 리다이렉트를 useEffect로.
- 10/18 구현 완료, typecheck 통과. 결정: 계좌 화면은 `/farm/account`(세 칸 한 화면), SCR-29 탭 6개(전체·입금 대기·예약·출하 준비·출하·환불), 입금 확인 시트는 주황 56 버튼.
- 10/18 박현 피드백 반영: 환불 탭 「환불했어요 ›」 → 확인 시트(아니요 : 환불 완료)로 농가가 환불 완료를 기록, 계좌 화면의 소비자 미리보기 제거, 입금 확인 시트 버튼을 기존 시트처럼 가로 배치.
- 10/18 박현 피드백: 입금 대기·환불 줄의 확인 시트를 없애고 줄 안 ‘미승인’ 1 : ‘승인’ 2로 바꿈. 미승인은 줄 안에 펼침(입금: 입금 대기로 두기/주문 취소, 사유 바로 고르기 3개 + 사유 입력 필수). 줄에 ‘미승인 사유: …’ 표시. AC-09-9·AC-17-8.
- 10/18 박현 피드백: 사유 바로 고르기를 ‘미승인 사유’ 아래 토글(사유 3개 + ‘직접 입력’)로 옮김. 직접 입력을 켜야 입력 칸이 열림. Mock 생산자 앱(크롬)에서 환불 줄 미승인 → 직접 입력 → 보내기 → 줄에 ‘미승인 사유: …’ 확인.
- 10/18 박현 피드백: 사유 선택이 입력 칸과 똑같아 보여 헷갈림 → 사유 선택은 기존 Radio 줄(로그인 계정 고르기 부품), 입력 칸은 ‘직접 입력’을 켰을 때만 ‘사유 직접 쓰기’ 라벨과 함께. Mock 앱(크롬)·Figma에서 확인.
- 10/18 입금 대기 줄 기한이 지나면 ‘· 기한 지남’(입금했다고 알린 주문은 취소되지 않고 남음).

## DEV-74 생산자 앱 카카오 로그인(SCR-19)과 가입 신청 연결

- 이슈: [DEV-74](https://linear.app/sswp6/issue/DEV-74)
- 브랜치: `nemodleo/dev-74-dev-생산자-앱-카카오-로그인scr-19과-가입-신청-연결`
- 기능·인수 조건: FEAT-01 I2 / AC-01-10(서버 계약은 DEV-32), AC-01-16(신규) · ADR 0003·0010
- 상태: 진행 중

### 목표
실제 농가가 카카오로 생산자 앱에 가입·로그인한다. 처음이면 생산자 계정이 생기고(농가 없음) 기존 관문이 가입 신청(SCR-20)으로 보낸다.

### 범위 (수정 허용 경로)
- `apps/producer/src/app/login.tsx`, `apps/producer/src/app/auth/kakao.tsx`(새 화면), `apps/producer/src/lib/kakao.ts`(새 파일), `apps/producer/src/lib/session.tsx`(관문에 `/auth/kakao` 허용만)
- `packages/api/src/mock/auth.ts`(Mock 생산자 카카오 계정), `server/tests/test_accounts.py`(생산자 카카오 → 가입 신청 테스트)
- `apps/producer/spec.md`, `apps/producer/tasks.md`, `packages/api/tasks.md`, `server/tasks.md`
- 문서: `docs/spec/functional/FEAT-01-login.md`, `docs/spec/screens.md`(SCR-19), `docs/spec/ia.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
- 서버 카카오 로그인 로직(DEV-32에서 `app: producer` 이미 지원), 소비자 온보딩(생산자는 SCR-20이 대표자 이름·연락처를 받음), 탈퇴·리프레시 토큰(DEV-75·76), Figma

### 결정 사항
- 10/18 실서버에서 카카오가 켜져 있으면 테스트 계정 목록과 ‘처음이세요? 농가로 가입 신청’을 숨기고 ‘카카오로 시작하기’만 둔다(소비자 앱과 같은 규칙). 처음 온 농가도 카카오로 시작하면 관문이 SCR-20으로 보낸다.
- 10/18 Mock 모드는 카카오와 테스트 계정 목록을 함께 둔다. 승인·확인 중·반려·정지 계정을 시연·디자인 검토에 계속 써야 하기 때문. Mock 카카오 로그인은 농가 없는 새 생산자 `u-kakao-farm`으로 들어가 가입 신청 흐름을 보여 준다.
- 10/18 복귀 정보는 sessionStorage `farmclub-producer:kakao-return`에 `state` 일회용 값만 둔다. 생산자 앱은 이어서 할 행동(resume)이 없고, 갈 곳은 세션 관문이 농가 상태로 정한다.

### 작업
- [x] `lib/kakao.ts`, `auth/kakao.tsx`, `login.tsx`, 관문
- [x] Mock 생산자 카카오 계정
- [x] pytest(생산자 카카오 → 농가 없음 → 가입 신청 → PENDING, 대표자 이름 반영)
- [x] 스펙·wiki
- [x] typecheck, test:mock, Mock 화면 확인, 통합 테스트

### 완료 조건
- [x] 카카오로 생산자 앱 로그인 → 농가 상태별 화면(가입 신청·대기·대시보드·정지)
- [x] 테스트 통과
- [x] 카카오 콘솔에 생산자 앱 `<PRODUCER_APP_URL>/auth/kakao` 등록(사용자, 10/18)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 main 56ac959에서 시작.
- 10/18 구현·검증: Ruff·pytest 364/364(신규 1), `npm run typecheck` 4개, `npm run test:mock` 15/15, 통합(카카오 꺼짐, 별도 DB) 실서버 7/7 + Playwright 43/43. Mock 화면: 카카오와 테스트 목록 함께 → 카카오로 시작 → `/apply`, 잘못된 state → 만료 안내, 콘솔 오류 0. 로컬 실서버(카카오 켜짐): 테스트 계정 0개·‘농가로 시작하세요’·카카오 버튼만, 누르면 카카오 로그인 화면(redirect_uri `http://localhost:8082/auth/kakao`). 실제 카카오 계정 생산자 로그인은 카카오 콘솔에 생산자 복귀 주소 등록 뒤 확인(아래).
- 10/18 실제 카카오 계정(로컬 실서버 + 생산자 앱, 별도 DB): 카카오로 시작하기 → 새 생산자 계정(자리 이름 ‘카카오 사용자’, 이메일 저장) → `/apply` → 테스트 값으로 신청 → `/pending`(확인 중), 계정 이름이 대표자 이름으로 바뀜. 로그아웃 뒤 다시 카카오 → 같은 계정으로 `/pending`. 카카오 계정 1개만 생성.
- 10/19 Figma P02 반영(DEV-74 수정 프레임). 비범위로 넘긴 Figma를 사후에 맞춤. 같은 일이 반복되지 않게 DEV-88에서 PR 본문 `Figma:` 줄과 CI 검사를 추가.

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


## DEV-92 기본 정보 저장 중 즉시 첨부 경합

- 이슈: https://linear.app/sswp6/issue/DEV-92
- 브랜치: `jinumeral/dev-92-bug-source-upload-can-race-basic-info-blur-save-and-return`
- 기준: FEAT-03, AC-SRC-1/5/11, M-11/13, docs/spec/source-editor.md
- 상태: 진행 중

### 목표
사용자 수동 입력을 우선 보존하면서 기본 정보 blur 저장과 새 파일/텍스트 업로드의 버전 경합을 제거한다. DEV-90 최종 운영 증빙/발표자료를 수정 배포 후 촬영한다.

### 범위
- `apps/producer/src/lib/{SourceWorkspace,SourceAttachments}.tsx`, `apps/producer/{spec,tasks}.md`
- `scripts/e2e/source-workspace-ui.spec.ts`
- `docs/spec/{README,source-editor,source-integration}.md`, `docs/wiki/Source-Analysis.md`
- `server/{tasks,README}.md`, `docs/spec/validation/source-production-2026-10-19.json`: DEV-90 최종 배포/기록 정합성만
- ignored `.artifacts/dev90/**`, 사용자 승인 Railway/Vercel 배포와 기존 Drive PPTX/영상, Linear DEV-90/92

### 결정 사항
- 10/19 사용자 후속 지시: 손으로 쓴 값의 우선순위를 유지한다. 기본 정보 flush를 첨부 컴포넌트에 주입해 파일/새 텍스트의 버전 조회 전에 저장 완료를 기다린다. 버전 검사를 제거하거나 다른 편집자의 입력을 덮어쓰지 않는다. 실패 시 파일/입력은 보존하고 명시적으로 재시도한다.
- 화면·레이블·모양은 변경하지 않는다(Figma N/A). 유료 모델 재시도/자동 업로드 재시도는 추가하지 않는다.
- DEV-90 당시 13장 상한은 이후 사용자가 만든 슬롯/팀원 추가 장을 삭제한다는 뜻이 아니다. 최신 공유 장 수를 유지하고 우리 작업은 새 장을 추가하지 않는다.

### 작업
- [x] 저장 완료 대기 연결 및 실패/수동 입력 보존
- [x] 지연 PUT을 넣은 파일/텍스트 회귀, 모바일3폭, 기존 관련 묶음
- [ ] spec/wiki/Linear 및 DEV-90 배포 증빙 마무리
- [ ] CI/AI 리뷰, main 머지와 배포 후 재녹화·원본 발표자료 갱신

### 기록
- 10/19 main2ed8b28(API/worker 배포 성공, source367 pytest/API7/브라우저45 통과2건너뜀)에서 시작. 기존 운영 UI도 새 상품부터 private save/reload/apply 성공했으나 즉시 업로드 경합은 별도 재현되므로 수정 후 최종 기록으로 교체한다. Agent 시간/Tokens 미측정.

- 10/19 검증: typecheck4 workspace/mock15/관련 Playwright24(신규7 포함) 및 소비자·생산자 web export 통과. SourceBasicInfo 기존 충돌 보호와 직접 입력 우선순위는 그대로 유지한다. 최종 운영/자료 완료 상태는 Linear DEV-90/92에서 후속 갱신한다.
- 10/19 수정 전 코드를 일시 복원한 동일 지연 PUT 검사1건은 예상대로 실패(저장 완료 전 source uploaded). finally에서 수정 코드를 바이트 동일하게 복원했으며, 수정본 전체24 통과 결과와 대조했다. 커밋/브랜치 스캔 지적0, 레거시 호환 후보0.

## DEV-109 생산자 앱: 오른쪽 위 도움말(?) 버튼과 온보딩 튜토리얼

- 이슈: https://linear.app/sswp6/issue/DEV-109
- 브랜치: `jinumeral/dev-109-생산자-앱-오른쪽-위-도움말-버튼과-온보딩-튜토리얼`
- 기준: docs/spec/screens.md 6장 "공통: 도움말", SCR-22/23/28/33, FEAT-03·12·13·32(안내 문구가 가리키는 기능)
- 상태: 진행 중

### 목표
생산자들이 앱을 이해하기 어렵다는 피드백이 있어서, 하단 탭 네 화면의 헤더 오른쪽 위에 동그라미 물음표 버튼을 둔다. 누르면 13단계 스포트라이트 투어를 시작한다. 화면을 어둡게 하고 대상만 밝게 보이며, 생산자가 직접 눌러 앱 흐름을 이동한다. 다루는 내용은 새 상품 등록, AI 판매페이지 초안, 채팅방, AI 자동 안내, AI 응답 설정, 문의다. 현황에 처음 들어오면 한 번 자동으로 시작한다.

### 범위 (수정 허용 경로)
- `apps/producer/src/lib/Tour.tsx`(새 파일, 처음 만든 `HelpGuide.tsx`를 대체), `apps/producer/src/app/_layout.tsx`, `apps/producer/src/app/(tabs)/{_layout,index,settings}.tsx`, `apps/producer/src/app/(tabs)/{products,chats}/index.tsx`, `apps/producer/src/app/(tabs)/chats/[consumerId].tsx`, `apps/producer/src/app/(tabs)/farm/ai-settings.tsx`, `apps/producer/tasks.md`
- `packages/ui/src/bars.tsx`(`LargeTitle`의 `right` 슬롯, `IconButton`·`Fab`·`TabItem` testID), `packages/ui/src/Storefront.tsx`(`ChatChoices` testID), `packages/ui/src/Messenger.tsx`(`ConversationRow` testID, `ConversationHeader` 뒤로 가기 testID), `packages/ui/tasks.md`
- `packages/api/src/index.ts`(`readStore`·`writeStore` 내보내기), `packages/api/tasks.md`
- `scripts/e2e/helpers.ts`, `scripts/e2e/{brand-logo,producer-help-guide}.spec.ts`
- `docs/spec/screens.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위 (건드리지 않음)
- 작업 화면(HeaderBar, 뒤로 가기 있는 화면)의 ? 버튼, 투어가 서버 상태를 바꾸는 버튼('새 상품' 열기·초안 만들기·분석 시작·AI 전환·설정 저장)을 누르게 하는 것
- `suspended.tsx`의 `[운영팀 연락처]` 자리표시자, 서버·API 변경, 새 의존성
- Figma v6 반영(후속 이슈로 PR `Figma:` 줄에 남김)

### 결정 사항
- 10/21 사용자 결정: 버튼은 탭 네 화면에만 둔다. 처음 한 번 자동으로 띄운다. 문의 단계는 "운영자에게 편하게 문의해 주세요"만 쓰고 연락처는 적지 않는다(생산자들이 운영자 연락처를 이미 알고 있음).
- 10/21 본 기록은 사용자별이 아닌 앱별 localStorage 키 `help-guide-seen`(`farmclub-producer:` 이름공간)으로 둔다. 생산자는 각자 기기를 쓰고 언제든 버튼으로 다시 볼 수 있어서다. 마지막 '알겠어요', X, Esc 모두 본 것으로 기록한다.
- 10/21 자동 표시는 승인된 생산자(`farmStatus === "APPROVED"`)일 때만 한다. 관문이 리다이렉트하기 전에 투어가 깜빡이지 않게 하려는 것이다. 새 기능이라 별도 AC가 없어서 테스트 이름에는 DEV-109를 쓴다.
- 10/21 자동으로 시작한 투어 오버레이가 기존 e2e 클릭을 가리지 않게, `loginProducer`는 기본으로 본 기록을 미리 심는다(`{ helpGuide: true }`일 때만 끔). brand-logo spec도 `skipHelpGuide`를 쓴다.
- 10/21 사용자 후속 지시: 하단 시트 대신 스포트라이트 투어로 바꾼다. 화면을 어둡게 하고 대상만 밝게 보이며, 화살표로 가리키고, 생산자가 실제로 눌러 앱 흐름을 이동한다. 13단계 흐름은 docs/spec/screens.md "공통: 도움말"에 적었다.
- 10/21 사용자 결정: 채팅방 '직접 응대로 전환'은 서버 상태가 바뀌므로 강조와 설명만 한다.
- 10/21 대상은 testID(웹 `data-testid`)로 찾는다. DOM에서 가장 뒤에 있으면서 보이는 요소를 쓰고, `aria-hidden` 안의 요소는 뺀다. 위치는 100ms마다 다시 잰다. 어둡게 하는 막은 구멍 주위 4장으로 깔아서, 누르기 단계에서는 실제 버튼이 그대로 눌린다. 설명 단계에서는 구멍도 막는다. 다음 단계로 넘어가는 판단은 클릭을 가로채지 않고 경로(`usePathname`·`useGlobalSearchParams`)로 한다.
- 10/21 ?는 어느 탭에서 눌러도 현황으로 이동한 뒤 1단계부터 시작한다. 1:1 대화가 없으면 대화 단계 세 개(7~9)를 건너뛴다. 대상을 3초 동안 찾지 못하면 가운데 카드에 '다음'을 띄운다.
- 10/22 '새 상품'은 설명만 하고 넘어간다(눌러도 들어가지 않음). 실제 서버에서는 새 상품을 여는 순간 작성 중 상품이 생기기 때문이다. AI 초안 설명(분석 자료·상품사진)은 이 카드에 합친다. 운영 서버는 자료 분석이 켜져 있어 그 화면 기준으로 쓴다. 키보드 Tab 차단(`inert`)은 하지 않는다(사용자 결정). 그래서 키보드로는 뒤쪽 버튼을 누를 수 있다는 한계가 있다.

### 작업
- [x] `LargeTitle` `right` 슬롯, `readStore`·`writeStore` 내보내기
- [x] `HelpGuide.tsx`(버튼·6단계 시트·자동 표시)와 탭 네 화면 연결
- [x] e2e helper와 새 spec `producer-help-guide.spec.ts`
- [x] screens.md·wiki 반영
- [x] typecheck·mock·실제 스택 Playwright 통과 확인
- [x] 커밋 전 스캔, draft PR
- [x] 스포트라이트 투어로 전환(Tour.tsx, testID, spec·wiki, e2e)
- [x] 투어가 작성 중 상품을 만들지 않게 13단계로 축소, 본문 ? 아이콘
- [ ] AI 리뷰(`pr-review`)

### 완료 조건
- [x] 탭 네 화면 오른쪽 위에 '도움말' 버튼이 보이고, 누르면 현황으로 가서 1단계부터 시작한다.
- [x] 첫 현황 진입 때만 자동으로 시작하고, 끝내거나 건너뛴 뒤 새로고침하면 다시 시작하지 않는다.
- [x] 13단계를 실제 클릭으로 진행하고 어두운 곳은 눌리지 않는다. 마지막 단계에 문의 안내가 있다.
- [x] 기존 Playwright spec이 그대로 통과한다.

### 기록
- 10/21 origin/main adef22b에서 새 worktree를 만들고 npm ci, server uv sync를 실행했다.
- 10/21 로컬 공용 DB `farmclub`는 다른 브랜치 마이그레이션이 적용된 상태라 `alembic upgrade`가 DuplicateColumn으로 실패했다. 공용 DB는 그대로 두고 같은 컨테이너에 `farmclub_dev109`를 만들어 `DATABASE_URL`로 지정했다.
- 10/21 `npm run typecheck`: 4 workspace 통과. `npm run test:mock`: 19 passed, 0 failed.
- 10/21 `npm run test:integration:full`(전체): API 시나리오 7 passed, Playwright 54 passed, 2 skipped, 1 failed. 실패한 1건은 소비자 AC-10-6(checkout-and-fulfillment, getByText strict mode)이다. 이 테스트는 생산자 코드와 `loginProducer`를 쓰지 않고, main adef22b CI에서는 통과했다. 같은 명령으로 checkout-and-fulfillment, producer-help-guide, brand-logo만 다시 돌렸을 때 6 passed, 0 failed였다. 그래서 일시적 실패로 기록한다.
- 10/21 새 spec 스크린샷(375px)으로 현황 시트 2단계와 상품 헤더의 버튼 정렬을 확인했다. Agent 시간/Tokens 미측정.
- 10/21 커밋 전 스캔에서 WARNING 1건과 INFO 6건이 나왔고 모두 반영했다. 2·3단계 문구를 실제 흐름(빈칸 채우기 → 게시 요청 → 운영자 확인)에 맞췄고, 자동 표시는 승인된 생산자만 하도록 바꿨다. 쓰지 않는 export는 뺐다. 단계 표시는 눈에 보이는 "n / 6" 텍스트로 바꾸고 범위 파일명도 고쳤다. 다시 실행한 결과: typecheck 4 workspace 통과, mock 19 passed. `test:integration:full`에 생산자 관련 7개 spec을 지정해 돌린 결과 API 7 passed, Playwright 28 passed, 0 failed.
- 10/21 재스캔: CRITICAL·WARNING 0건, INFO 3건. e2e는 실제 API로만 돌고 `monitor()`가 Mock 트래픽을 실패로 처리하므로 shared-v1 키 심기는 다시 뺐다. bars.tsx의 긴 줄을 정리했다. 제목 줄이 48px 버튼 높이로 몇 px 커지는 것은 375px 스크린샷으로 확인했고 의도한 배치로 둔다.
- 10/21 투어 전환 검증: typecheck 4 workspace 통과. Mock 앱 390px에서 15단계를 실제 클릭으로 끝까지 진행했고 콘솔 오류는 0건이었다. 10단계 문구는 김민지 방이 '농가 직접 응대' 상태라 두 상태에 모두 맞게 고쳤다. `test:integration:full`(전체, `farmclub_dev109`): API 7 passed, Playwright 56 passed, 2 skipped, 0 failed. 새 spec 3개(전체 흐름·어두운 곳 클릭 차단, 건너뛰기와 탭별 재시작, 대화 0개일 때 건너뛰기)를 포함한다.
- 10/21 투어 스캔에서 WARNING 2건과 INFO 4건이 나와 모두 반영했다.
  - 재실행할 때 탭이 이전 하위 화면과 `view=private`를 복원하는 문제: 3·7·15단계에 진입 시 화면을 맞추는 처리를 넣었다. 누르기 단계는 들어올 때 이미 조건이 맞으면 한 번 벗어났다 다시 맞을 때만 넘어간다.
  - 카드가 작은 화면 밖으로 나가는 문제: 카드 높이를 재서 화면 안(16px 여백)에 둔다.
  - 대화 단계 건너뛰기는 시간 기준을 빼고, 빈 상태(`chat-empty`)가 보일 때만 건너뛴다.
  - `HeaderBar`가 닫기 모드일 때는 `header-close`를 쓴다. 웹 전용 가드를 넣고, 목표·비범위·완료 조건을 정리했다.
  - e2e에 재실행과 375×667 케이스를 추가했다.
- 10/21 사용자 후속 지시: 문구를 더 친절하고 구체적으로 바꿨다. AI가 해 주는 일을 예로 들어 설명한다(글·사진을 넣으면 품종·원산지·보관 방법을 채우고 판매페이지 초안을 만든다, '배송은 언제 와요?'에는 답하고 '농약' 질문은 넘긴다 — prd.md 시나리오). 마지막 단계 제목은 '다시 보고 싶으면 이 버튼을 누르세요!'이고 ? 버튼을 강조한다. 단계 수 15는 사용자 확인 후 유지했다.
- 10/21 검증: typecheck 통과. `test:integration:full` 전체 실행에서 API 7, Playwright 56 passed, 2 skipped, 1 failed가 나왔다. 실패는 새 재실행 spec 1건이었다. 대화방에서 뒤로 나오면 채팅 목록이 스택에 두 번 쌓이는데(기존 `router.navigate("/chats?view=private")` 동작), spec이 숨은 쪽 요소를 집은 것이 원인이었다. 앱은 보이는 쪽을 맞게 강조했다. spec 로케이터를 `:visible`로 고친 뒤 producer-help-guide 4 passed.
- 10/21 재스캔 반영과 사용자 후속 지시를 처리했다.
  - 4·5단계 본문을 실제 화면에 맞춰 고른다. 자료 분석 켜짐(`source-material-box`, `/products/source-analysis`)이면 분석 자료·상품사진 칸과 '작성 중' 안내를, 꺼짐·Mock(`ai-draft`, `/products/manual`)이면 문구 붙여넣기와 다시 시작 안내를 보여 준다. 4단계 제목은 'AI가 상품 정보를 채워 드려요'로 두 흐름에 공통으로 쓴다.
  - 쓰지 않는 `useTour` export를 뺐다.
  - 레이아웃: 카드는 좌우 gutter 20에 맞춰 가운데 두고, 넓은 화면에서는 최대 400px로 제한한다. 여백은 padding 24, 제목 16, 본문 8, 버튼 24로 정리했다. 진행 막대를 넣고, 누르기 안내도 버튼과 같은 높이의 칸으로 바꿨다. 강조 테두리는 radius 8이다.
  - 줄바꿈: react-native-web이 `wordBreak` 스타일을 넘기지 않아서, 카드 안에만 `word-break: keep-all` CSS를 넣었다(390/1280에서 computed keep-all 확인).
  - 모바일/PC 문구: '클릭'·Esc 안내 없이 '눌러 보세요'만 쓴다. PC에서도 앱이 같은 세로 열 배치라 '아래'·'오른쪽 위' 표현이 맞다(1280×800 스크린샷 확인).
- 10/21 사용자 결정: 새 농가 1:1 대화가 비는 문제는 별도 이슈로 다룬다. 농가가 승인되면 farmclub 환영 대화방을 자동으로 만들고, 생산자가 답장해 운영자에게 문의할 수 있게 하는 실제 기능이다. 이 PR에서는 지금처럼 빈 상태(`chat-empty`)일 때 9~11단계를 건너뛴다.
- 10/21 사용자 결정: 문의 창구도 그 farmclub 대화방으로 정한다. 투어 마지막 단계의 '운영자에게 편하게 문의해 주세요' 문구는 대화방이 생기는 후속 이슈에서 '채팅의 farmclub 대화방으로 물어봐 주세요'로 바꾼다. 이 PR에서는 아직 없는 곳을 가리키지 않도록 지금 문구를 유지한다.
- 10/21 레이아웃·문구 반영 뒤 검증: typecheck 4 workspace 통과. mock 19 passed. `test:integration:full`(전체, `farmclub_dev109`): API 7 passed, Playwright 57 passed, 2 skipped, 0 failed(투어 spec 4개 포함). 실제 서버(자료 분석 켜짐)에서 390×844와 1280×800으로 1·2·4·5·10·15단계 스크린샷을 확인했다.
- 10/21 최종 스캔: CRITICAL·WARNING 0건, INFO 8건. 반영한 것은 4단계 대기 중 다른 흐름 문구 깜빡임('화면을 여는 중이에요'), 10단계 문구를 AI·직접 응대 두 상태에 맞춤, `useWindowDimensions`로 창 크기 반영, 변수 이름(`hit`)과 `body` 선택 필드 정리다. 남긴 것은 두 가지다. 키보드 Tab 이동 차단(`inert`)은 후속으로 검토한다. 투어를 다시 볼 때마다 빈 작성 중 상품이 쌓이는 문제는 사용자 결정 동작이며 DEV-111 이후 빈 workspace 재사용을 검토한다.
- 10/22 INFO 반영 뒤 검증: typecheck 통과, mock 19 passed. 관련 spec(help-guide, brand-logo, producer-i2, conversation-ui)의 첫 실행은 밤사이 잠자기로 13.9h가 걸려 시간 초과 8건이 났다. 같은 명령을 다시 돌리니 19 passed, 0 failed(29.3s)였다.
- 10/22 재스캔: CRITICAL·WARNING 0건. 반영한 것은 세 가지다. 7단계는 대화방 경로에서 들어와도 `view=news`로 맞춘다. wiki 흐름에 환영 단계를 넣고 '작성 중' 안내에 조건을 붙였다. 결정 사항은 최종 동작 기준으로 정리했다. 키보드 Tab·스크린리더로 설명 단계의 뒤쪽 버튼에 갈 수 있는 문제(`inert`)는 후속으로 남긴다.
- 10/22 확인 스캔: CRITICAL·WARNING 0건. INFO 4건은 고치지 않고 남긴다. 업데이터 안의 `writeStore`(같은 값이라 동작은 같음), 네이티브에서 대상 단계가 멈추는 문제(웹 출력 전용), 투어 중 로그아웃 리다이렉트 시 오버레이가 남는 문제(X·Esc로 나갈 수 있음), e2e의 고정 대기 부정 확인이다. 후속에서 `inert`와 함께 정리를 검토한다.
- 10/22 사용자 후속 지시: 투어가 작성 중 상품을 만들지 않게 한다. 3단계 '새 상품'을 설명 단계로 바꾸고 AI 초안 설명(분석 자료·상품사진)을 합쳤다. 새 상품 화면 안의 두 단계(AI 초안 영역, 뒤로 가기)를 빼서 15단계가 13단계가 됐다. 이에 따라 `bodyFor`와 manual 화면의 `ai-draft` testID를 지웠다. 마지막 단계 본문의 '?'는 실제 도움말 아이콘으로 보여 준다(`withIcons`). 키보드 Tab 차단(`inert`)은 하지 않기로 했다(사용자 결정).
- 10/22 스캔 WARNING 반영: 목표·결정 사항·완료 조건을 13단계와 '새 상품은 설명만' 기준으로 고쳐 썼다. 아이콘에 접근성 이름 '도움말'을 붙이고, e2e에 본문에 `[?]` 글자가 남지 않는지 확인하는 검사를 넣었다.
- 10/22 재스캔 반영: 새 상품 화면 단계를 빼면서 쓰지 않게 된 `HeaderBar` 뒤로 가기 testID를 되돌렸다. 본문 아이콘에 `role="img"`를 붙이고, e2e는 이름('도움말')으로 아이콘을 확인한다.
- 10/22 13단계·아이콘 변경 검증: typecheck 4 workspace 통과. 띄워 둔 실제 스택(자료 분석 켜짐, `farmclub_dev109`)에서 producer-help-guide 4 passed. 투어 중 `/product-workspaces` POST가 0건인지도 확인한다. 3·13단계 스크린샷으로 카드와 아이콘 정렬을 확인했다. 확인 스캔 CRITICAL·WARNING 0건.

## DEV-111 farmclub 문의 대화방

- 이슈: https://linear.app/sswp6/issue/DEV-111 · 목표·범위·결정·기록은 `server/tasks.md` DEV-111 섹션에 모은다.
- 10/22 DEV-111 변경: farmclub 문의 대화방이 생겨 투어 대화 단계는 farmclub 방(`chat-row-farmclub`)을 열고 문의 방법(`support-intro`)을 안내한다. 빈 상태(`chat-empty`)로 건너뛰던 방식(`emptyIf`)은 지웠고, 방을 찾지 못하면 카드의 '다음'이 `skipTo`로 건너뛴다. 마지막 문의 문구는 farmclub 대화방을 가리킨다. 목록·방 화면과 `SupportAvatar`(views.tsx) 변경도 DEV-111에 있다.
