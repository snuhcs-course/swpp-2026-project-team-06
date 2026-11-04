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

## DEV-108 카카오 복귀 화면 멈춤·새로고침 오류와 로딩 화면 정리

- 이슈: [DEV-108](https://linear.app/sswp6/issue/DEV-108)
- 브랜치: `nemodleo/dev-108-dev-생산자-앱-카카오-복귀-화면-멈춤새로고침-오류와`
- 기능·인수 조건: FEAT-01 I2 / AC-01-3, AC-01-16 · 화면 SCR-19(`/auth/kakao`) · 관련 DEV-74, DEV-88(Figma 줄)
- 상태: 진행 중

### 목표
운영 생산자 앱에서 카카오 로그인 뒤 ‘카카오로 로그인하는 중’에 머무는 문제(승인 계정)와, 그 화면에서 새로고침하면 ‘로그인 요청이 만료됐어요’가 뜨는 문제를 고친다. 복귀 화면 모양을 로딩 표시 + 한 줄로 정리한다.

### 원인
- 관문 `homeFor`의 승인 분기가 `/login`·`/apply`·`/pending`·`/suspended`만 막고 `/auth/kakao`는 막지 않았다. 복귀 화면은 `refresh()` 뒤 이동을 관문에만 맡겨서, 승인 계정은 로그인이 끝나도 그대로 남았다. 다른 상태는 허용 주소가 하나라 정상으로 넘어갔다.
- 복귀 화면이 일회용 `state`를 지운 뒤라 다시 열면 대조가 실패해 만료 오류를 보였다. 실제로는 토큰이 있어 로그인된 상태였다.

### 범위 (수정 허용 경로)
- `apps/producer/src/lib/gate.ts`(새 파일, `homeFor`를 session.tsx에서 옮김), `apps/producer/src/lib/session.tsx`, `apps/producer/src/app/auth/kakao.tsx`
- 테스트: `scripts/test-producer-gate.mjs`(새 파일), `package.json`(test:mock에 추가), `scripts/e2e/producer-kakao.spec.ts`(새 파일)
- 문서: `apps/producer/spec.md`, `apps/producer/tasks.md`, `docs/spec/screens.md`(SCR-19), `docs/spec/functional/FEAT-01-login.md`(AC-01-16 한 문장), `docs/wiki/Requirements-and-Specifications.md`(SCR-19 줄)
- Figma 스크립트: 레포 밖 `figma-plugins/farmclub-dev108/`

### 비범위
- 소비자 앱 복귀 화면(같은 스켈레톤 모양이지만 직접 이동하므로 멈춤은 없음. 모양 맞추기는 후속), 서버, Mock 카카오 계정

### 결정 사항
- 10/21 관문: 로그인된 사용자는 농가 상태와 상관없이 `/login`·`/auth/kakao`를 허용하지 않는다(로그인 입구 목록 하나를 비로그인 허용과 로그인 차단에 같이 씀). `homeFor`는 React 없이 테스트하려고 `lib/gate.ts`로 뺐다.
- 10/21 복귀 화면은 로그인 뒤 `homeFor(user).home`으로 직접 `router.replace`한다(소비자 앱과 같은 방식). 관문도 같은 곳으로 보내므로 충돌하지 않고, 관문이 먼저 화면을 바꿨으면(언마운트) 다시 이동하지 않는다.
- 10/21 새로고침: `state`가 없거나 다른데 토큰이 있으면 이미 로그인된 것으로 보고 `refresh()` 뒤 상태별 화면으로 간다. 토큰이 무효면 지금처럼 만료 안내.
- 10/21 시간 제한 15초(카카오 로그인 + 사용자 조회). 넘으면 ‘로그인이 오래 걸리고 있어요. 다시 시도해 주세요.’ + ‘다시 로그인’. 요청은 취소하지 않으므로 늦게 성공하면 토큰이 생겨 관문이 상태별 화면으로 보낸다(성공한 로그인을 버리지 않음).
- 10/21 로딩 화면: 가운데 `ActivityIndicator`(large, 보조 글자색) + `T` body muted ‘카카오 로그인 중이에요’. `@farmclub/ui`에 스피너 부품이 없어 다른 생산자 화면처럼 React Native `ActivityIndicator`를 쓰고 새 부품은 만들지 않았다(쓰는 곳이 화면별로 크기·색이 달라 공용화는 따로 판단). 강조색은 쓰지 않는다(화면당 강조 하나 규칙, 이 화면엔 행동이 없음).
- 10/21 소비자 앱 복귀 화면도 같은 큰 제목 + 설명 + 스켈레톤 모양이지만 이 PR에서는 바꾸지 않는다. 소비자 앱은 직접 이동해서 멈춤이 없고, 바꾸면 소비자 Figma·e2e까지 범위가 커진다. 후속 이슈로 제안.

### 작업
- [x] 관문(`gate.ts`)과 session.tsx 연결
- [x] 복귀 화면: 직접 이동, 새로고침 처리, 15초 제한, 로딩 모양
- [x] 관문 단위 테스트(test:mock), Playwright(승인·확인 중·농가 없음 복귀 → 각 화면, 다시 열기 → 오류 없음)
- [x] 스펙(screens.md SCR-19, FEAT-01 AC-01-16, wiki)
- [x] Figma v6 P02 근처 카카오 복귀 로딩 화면
- [x] typecheck, test:mock, Playwright 통과 확인

### 완료 조건
- [x] 승인 계정이 카카오 로그인 뒤 멈추지 않는다
- [x] 새로고침해도 오류 없이 넘어간다
- [x] 로딩 화면 정리, 테스트·스펙·Figma가 같은 PR
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/21 origin/main adef22b에서 시작.
- 10/21 검증: `npm run typecheck` 5개 워크스페이스 통과, `npm run test:mock` 22/22(관문 3개 새로). 통합(`FARMCLUB_INTEGRATION_SKIP_DOCKER=1`, 별도 DB `farmclub_dev108`, `node scripts/run-integration.mjs scripts/e2e/producer-kakao.spec.ts scripts/e2e/discovery-and-gates.spec.ts`): 실서버 시나리오 7/7, Playwright 7/7. 새 spec을 origin/main의 session.tsx·kakao.tsx로 돌리면 승인 계정 1건만 실패(`/auth/kakao`에 남음)해 보고된 증상과 같음을 확인.
- 10/21 Playwright는 카카오 인가 화면을 열 수 없어 `POST /api/auth/kakao`만 가로채 시드 생산자의 test-login 토큰으로 답한다. 그 뒤 `/api/auth/me`·관문·화면은 실서버 그대로.
- 10/22 Figma v6 ‘현재 시안 · 생산자’에 `DEV-108 · P02-1 카카오 복귀 · /auth/kakao`(node 456:2115)와 명세 상자(456:2120)를 그렸다. 자리는 P02와 같은 줄, DEV-74 ‘수정 전 · P02’ 사본 오른쪽(x 3940). 스크립트는 레포 밖 `figma-plugins/farmclub-dev108/code.js`(이름으로 찾아 같은 노드를 다시 그림, 두 번 실행해 노드 2개·같은 id 확인). 사용자 Chrome의 Figma 웹 편집기 콘솔에서 실행.

## DEV-113 사이트 하단 사업자 정보와 약관·처리방침

- 이슈: https://linear.app/sswp6/issue/DEV-113 · 목표·범위·결정·기록은 `packages/ui/tasks.md` DEV-113 섹션에 모은다.
- 10/22 `/privacy`·`/terms` 라우트(관문 `lib/gate.ts`에서 모든 상태에 공개, 동의 전에는 `/consent`만), 로그인·환경설정 하단 `LegalFooter`, vercel.json에서 정적 HTML로 rewrite.

## DEV-132 카카오 가입 시 약관 동의 전에는 계정을 만들지 않기

- 이슈: https://linear.app/sswp6/issue/DEV-132 · 목표·범위·결정·기록은 `server/tasks.md` DEV-132 섹션에 모은다.
- 10/23 `/consent` 가입 모드(계정 없이 가입 토큰, 동의하면 계정 생성), 카카오 복귀·Mock 로그인, 관문 예외(`session.tsx`).

## DEV-94 회원 탈퇴

- 이슈: https://linear.app/sswp6/issue/DEV-94 · 목표·범위·결정·기록은 `server/tasks.md` DEV-94 구현 섹션에 모은다.
- 10/23 환경설정 ‘계정’과 승인 대기(SCR-21) 하단에 회원 탈퇴(공용 `WithdrawSheet`), 성공하면 로그아웃 → 로그인.

## DEV-184 새 상품 한 화면 편집 + 하단 AI 시트

- 이슈: https://linear.app/sswp6/issue/DEV-184
- 브랜치: `jinumeral/dev-184-new-product-ai-sheet`
- 기준: FEAT-03/04/07, AC-03-1/3, AC-SRC-9/10/11, docs/spec/source-integration.md(DEV-184 절), docs/spec/source-editor.md
- 상태: 진행 중

### 목표
새 상품 → 자료 화면(2탭) → 상품 정보 → 기간·가격 → 판매로 나뉜 흐름과 상품명·품종 이중 입력을 줄인다. 새 상품을 누르면 바로 한 화면 편집이 뜨고, 아래에서 올라온 시트에 사진·자료를 넣고 'AI로 채우기'를 누르면 칸이 채워진다(당근 'AI 글쓰기' 참고).

### 범위 (수정 허용 경로)
- `apps/producer/src/lib/{NewProductComposer,SourceWorkspace,SourceBasicInfo,SourceAttachments,SourceDetailsEditor,PageCanvas,Tour}.tsx`, `apps/producer/src/app/(tabs)/products/{new,source-analysis}.tsx`
- `packages/ui/src/{bars,index}.ts(x)` (PeekSheet)
- `packages/api/src/sourceAnalysis.ts`: SourceDraft.snapshot.batchVersion 타입만(서버가 이미 내려 주는 값)
- (v2) `apps/producer/src/app/(tabs)/products/[id]/sell.tsx`(신규), `apps/producer/src/lib/BuyerPreview.tsx`(신규), `packages/ui/src/{ProductPage,Button,web}.ts(x)`, `apps/consumer/src/app/(tabs)/products/[productId].tsx`(본문을 공용 ProductPageBody로 추출만), `scripts/e2e/new-product-two-step.spec.ts`(신규)
- (v2) `docs/spec/{ia,source-integration}.md`, `docs/spec/functional/{FEAT-04-product-edit,FEAT-05-stage-pricing,README}.md`, `docs/wiki/{Requirements-and-Specifications,Source-Analysis}.md`
- `scripts/e2e/new-product-composer.spec.ts`(신규), `scripts/e2e/source*.spec.ts`, `scripts/e2e/product-page-workspace.spec.ts`, `scripts/e2e/producer-i2.spec.ts`
- `docs/spec/{source-integration,source-editor,ia}.md`, `docs/wiki/Source-Analysis.md`, `apps/producer/{spec,tasks}.md`

### 비범위
- 서버·API 계약(apply가 기본 정보를 복사하도록 바꾸지 않음), 기존 상품 `판매페이지 수정`(ProductPageEditor), `/products/manual`, 기간·가격·판매 화면, Figma(후속)

### 결정 사항
- 10/31 서버는 바꾸지 않는다. AI 결과의 상품명·보관(30자 이하)은 화면에서 기본값 칸에만 미리 채우고 기존 상품 PATCH로 저장한다. 가격은 채우지 않는다(AC-03-1).
- 10/31 품종·사이즈·예상 당도는 기존 batch 기본 정보(SourceBasicInfo, blur 저장)를 그대로 쓰고, 상품 저장 때 품종·예상 당도를 상품에도 넣는다(한 번만 입력).
- 10/31 하단 시트는 `@farmclub/ui`의 새 `PeekSheet`(화면 아래 고정, 접힘/펼침, 펼칠 때만 뒤 화면 어둡게). 기존 모달 `Sheet`는 확인·이탈 시트에 그대로 쓴다.
- ~~10/31 '다음: 가격·판매'는 임시 저장 → 최신 초안이 있으면 확인 시트에서 명시적 적용 → SCR-25.~~ → 11/01 v2로 대체: 판매 전(DRAFT/REJECTED)은 확인 없이 반영 후 SCR-24b, 그 밖은 상태별 확인 후 SCR-25. 비공개 저장/명시적 적용 분리는 유지한다.
- 11/01 v2: 두 장(① 구매자 모양 채우기 ② 판매·가격→미리보기→판매 시작 요청), 중량 옵션은 ②로, 상품명 하나가 상세 맨 위 제목을 정함, 같은 초안(id:version) 재반영 금지(세션 저장소 기록, composer 세션 기준), 판매 시작은 운영자 승인 요청.
- 10/31 새 화면은 `lib/NewProductComposer.tsx`로 따로 두고 새 상품 버튼만 `composer=1`로 연다. 기존 `SourceWorkspace`(배치 없는 상품 선택·여러 상품 작업)는 그대로 두고 공용 도우미만 export한다. 기존 e2e가 그 경로로 기존 상품 작업을 만들기 때문이다. ~~중량 옵션은 3/5/10kg 체크로 이 화면에 두고~~(v2에서 ②로 옮김), 받는 시기·배송비·가격은 다음 화면에 둔다.
- 10/31 AI는 분석 자료만 읽고 상품사진 자체는 분석하지 않는다(기존 계약). 시트 문구도 이에 맞춘다.

### 작업
- [x] PeekSheet, 새 `NewProductComposer` 한 화면 편집(기존 SourceWorkspace는 유지, 공용 판정 `canEditBatch` export), SourceBasicInfo embedded, 편집기 저장 결과 반환·AI 표시, 첨부함 순서
- [x] spec/ia/wiki 갱신
- [x] new.tsx 로딩 문구·도움말 투어 문구
- [x] e2e 갱신(360/390/430px) 및 로컬 실화면 확인
- [x] v2 두 장 흐름: ① 채우기 재배치·점선 빈 칸 ② `sell` 화면·미리보기·판매 시작 요청, 공용 ProductPageBody 추출
- [x] scan-before-commit(v2 6회 반복, 마지막 CRITICAL/WARNING 0)
- [ ] draft PR, Figma 후속 이슈

### 기록
- 10/31 origin/main 2ab0c2f에서 시작. `npm run typecheck` 4 workspace 통과.
- 11/01 접힌 시트가 첨부 컴포넌트를 언마운트하면 업로드·입력 상태가 사라지므로, 접혀도 마운트하고 화면에서만 숨긴다. 저장 뒤 batch를 다시 읽어도 사진이 같으면 blob URL을 다시 만들지 않는다(표시 중 URL 해제로 콘솔 오류). AI 표시는 선택한 카드에서만 보이던 details 대신 PageCanvas의 새 `badge` 자리에 늘 보인다(SourceWorkspace·NewProductComposer에서만 보이고 ProductPageEditor는 badge를 넘기지 않아 그대로).
- 11/01 검증: `npm run typecheck` 4 workspace, `npm run test:mock` 43개 통과. 격리 DB(mock 제공자)의 Playwright new-product-composer/source-workspace-ui/source-analysis/source-editor/product-page-workspace 28개 통과(2.0분). 기존 source-workspace-ui·source-editor 중 새 상품 진입 테스트 2개는 새 화면에 맞춰 시작 버튼 이름·다음 버튼 경로·시트 펼치기만 바꿨다. Agent 시간/Tokens 미측정.
- 11/01 커밋 전 스캔 반영: 저장하지 않은 상세 수정이 재분석·첨부 변경 때 사라지던 문제(CRITICAL) → 'AI로 다시 채우기'는 먼저 편집기를 비공개 저장하고, 수정이 남아 있는 동안 편집기를 내리지 않으며 첨부 변경을 막고 안내한다. 상품 편집에서 돌아오면(focus)·적용 뒤 상품을 다시 읽어 버전 충돌·품종 되돌림을 막는다. 기본 정보에서 지운 예상 당도는 null로 반영. 하위 컴포넌트 busy 해제가 화면 작업 중 버튼을 켜지 않게 함. 배지 배경 `#FFF3EB`는 기존 `Choice`와 같은 값이라 토큰이 생길 때 함께 바꾼다.
- 11/01 같은 결과로 재분석하면 reviewVersion은 그대로이고 batch 버전만 올라 예전 초안을 최신으로 보고 적용하다 409가 났다. 초안 최신 판정에 snapshot.batchVersion도 비교한다. 기존 SourceWorkspace의 적용 버튼에도 같은 잠재 문제가 있으나(이번 범위 밖) 후속 이슈로 남긴다.
- 11/01 스캔 반영 후 재검증: `npm run typecheck` 4 workspace, `npm run test:mock` 통과, 격리 DB Playwright new-product-composer(재분석 후 수정 유지·미리 채우기·가격 미입력 포함)/source-workspace-ui/source-analysis/source-editor/product-page-workspace/producer-i2 34개 통과(2.4분).
- 11/01 재스캔 반영: 분석 뒤 기본 정보 저장이 reviewVersion을 올려 편집기 저장이 409로 막히던 문제(CRITICAL) → 기본 정보 저장 뒤 review를 다시 읽고, 임시 저장은 flush 뒤 서버의 batch·review·drafts로 초안 저장 필요 여부를 판단하며, 고친 내용이 없으면 편집기가 최신 review로 저장한다(`saveRef(fresh)`). 고친 상세가 있는 동안 기본 정보도 잠근다. '다음'은 분석 뒤 최신 초안이 없으면 이동하지 않고 안내한다. 초안 최신 판정은 서버와 같이 batchVersion 없으면 오래된 것으로 본다. 시트 바깥 영역은 보조기기에서 숨겨 손잡이와 이름이 겹치지 않게 했다. 배지는 카드 안 AI 값이 남아 있으면 보인다(spec 문구 정정).
- 11/01 재스캔 반영 후 재검증: typecheck 4 workspace, `npm run test:mock` 통과, 격리 DB Playwright 34개 통과(2.3분, 분석 뒤 사이즈 수정→임시 저장→적용 포함).
- 11/01 3차 스캔 반영: 새 e2e 파일을 범위에 추가. 미리 채우기는 EXTRACTED 값만 쓴다(생산자가 상세에 직접 쓴 상품명에는 'AI가 채웠어요'를 붙이지 않음). 취소된 분석만 있고 초안이 없으면 '다음'은 분석 전처럼 이동한다. 기본 정보 저장 뒤 review 재조회 실패를 화면 오류로 알린다. 첨부함 순서·AI 배지는 공유 컴포넌트라 기존 SourceWorkspace 화면에도 적용됨(PR 본문에 명시).
- 11/01 사용자 피드백: 시트 손잡이 줄을 누른 뒤 포커스 테두리(검은 사각형)가 남음 → 웹 `:focus-visible`일 때만 테두리를 그린다(키보드 이동 시만). 접힌 시트 화살표를 위(⌃)로. e2e에 터치 후 outline 없음 검사 추가, new-product-composer 3개 통과. 직전 전체 묶음 Playwright 34·mock 43 통과.
- 11/01 v2 결정(진우 님 피드백 "두 장으로"): ① 채우기 = 구매자 상품 페이지 모양 그대로, 빈 칸만 점선 네모(당근 글쓰기처럼) ② 판매·가격 한 화면 → 미리보기(네모 없음) → 판매 시작 요청. 판매 시작은 운영자 승인 요청(spec·서버 그대로), 가격은 기본 1기간 + 얼리버드 기간 추가. 중량 옵션은 ②로. '다음'은 판매 전 상품이면 확인 없이 apply 후 ②(apply를 PATCH·stages보다 먼저). 저장 때 상품명을 상세 맨 위 제목에도 맞춘다(미리보기에 이름이 둘로 보이던 문제).
- 11/01 소비자 상품 상세 본문을 `packages/ui` `ProductPageBody`로 추출(렌더 결과 동일)해 ② 미리보기와 공유. 공용 Button·바의 포커스 링은 키보드 이동 때만 그린다(`showFocus`, 사용자 피드백 '검은 사각형'). 다른 화면의 개별 focusRing 사용처는 이번 범위 밖.
- 11/01 v2 검증: typecheck 5 workspace, `npm run test:mock` 43개 통과. 격리 DB(mock 제공자)에서 Playwright 전체 90개 중 80 통과 · 0 실패 · 10 건너뜀(공유 Mock 등 환경 조건). new-product-two-step 360/390/430 통과(운영자 승인 API 후 공개 상세 일치 포함).
- 11/01 v2 스캔 반영: 기간이 하나일 때 받는 시기를 첫날 다음 날부터 고를 수 있게(앞당기기 가능, 판매 전 상품은 서버 PATCH가 기간·받는 시기 순서를 검사하지 않아 PATCH→PUT 순서 유지). PATCH 응답 즉시 반영(기간 저장 실패 뒤 버전 꼬임 방지). 서버 오류 메시지와 칸 이름을 함께 표시. 시작일>끝일 기간 검사. 계좌 판정을 서버와 같은 세 칸으로, 화면 복귀 시 농가 정보 재조회. 판매 시작 요청 뒤 채우기 화면이 뒤로가기에 남지 않게 dismissTo. 쓰지 않는 Fold export·도달하지 않는 확인 문구 정리.
- 11/01 v2 재스캔 반영: 같은 초안을 다시 apply하면 서버가 대표사진을 또 복사해 사진이 늘어나므로, 이 화면에서 반영한 초안(id:version)은 다시 반영하지 않고 이동만 한다. 판매 중 상품은 반영 뒤 기존 상품 편집(SCR-25)으로(②는 판매 전 상품 전용). 제외(EXCLUDED)한 상세 제목은 상품명 맞추기에서 되살리지 않는다. 네이티브는 포커스 링 기존 동작 유지(웹만 키보드 기준). 환불일 ≤ 받는 시기 끝 사전 검사. ②의 이탈 가드는 두지 않는다(저장 버튼·서버 저장 상태 기준, 채우기 화면과 달리 업로드 중 상태가 없음).
- 11/01 v2 3차 스캔 반영: 채우기 화면에서 상세 맨 위 제목 칸은 읽기 전용(상품명 칸 하나로만 고치고 저장 때 맞춤, 덮어쓰기로 사라지던 문제 방지). 같은 초안 재반영 판정을 서버 값(상품 moduleDetail이 초안 내용과 같으면 건너뜀)으로도 해 새로고침 뒤에도 사진이 늘지 않게. ②는 승인 대기 등 편집 불가 상태면 입력도 막고, 총 물량은 판매 시작 요청 때 보낸다는 안내 추가. ia F-1 흐름도·영문 wiki 옛 흐름 문구 정리.
- 11/01 최종 재검증: 느린 실행 환경(36.6분) 회차에서 producer-i2 P07 등 3건 시간 초과 → 해당 spec 4개 재실행 16/16 통과, 전체 재실행 80 통과 · 0 실패 · 10 건너뜀(3.5분). typecheck 5 workspace, `npm run test:mock` 43 통과.
- 11/01 v2 4차 스캔 반영(CRITICAL): 글 내용만 비교해 같은 초안으로 보던 판정이 대표사진·카드 사진만 바꾼 경우 반영을 건너뛰었다 → 내용 비교를 없애고 '이 상품에 마지막으로 반영한 초안 id:version'을 화면 ref와 sessionStorage에 두어 정확히 같은 초안만 건너뛴다(사진만 바꿔도 새 초안이라 반영). e2e에 대표사진 교체 후 상품 대표사진 변경 검사 추가. 읽기 전용 상세 제목 칸은 점선 대신 '위 상품명이 여기에 들어가요'. 확인 없이 반영은 DRAFT/REJECTED만, 그 밖은 확인 후 SCR-25. 상품명 맞추기는 대상이 하나인 작업에만. 채우기 화면 농가 이름 mock 가드 제거.
- 11/01 v2 5차 스캔 반영: 대표사진이 있으면 사진 자리를 실선으로(빈 칸만 점선). 확인 시트 문구를 상태별(판매 중·승인 대기·종료)로. 이미 반영한 초안이면 확인 없이 이동. 미리보기 참고가는 소비자와 같은 referencePrice 사용. 후속: 고정 TODAY 상수(기존 관례), apply 반복 시 서버가 대표사진 복사본을 photos에 쌓는 문제(서버 범위).
- 11/01 v2 6차 스캔: CRITICAL/WARNING 0. INFO 반영 뒤 최종 재실행: typecheck 5 workspace, test:mock 43, Playwright 80 통과 · 0 실패 · 10 건너뜀. INFO 반영(안 쓰는 currentDraft 제거, 오류 칸 이름 중복 표시 제거, spec.md·결정 사항 v2 반영). 후속: 반영 기록은 composer 세션 기준이라 다른 화면에서 같은 상품에 적용하면 한 번 더 반영될 수 있음(서버 대표사진 복사 문제와 같은 원인), 미리보기 사진 재요청 실패 시 처리.
- 11/01 v3(진우 님 피드백 "채우기를 그냥 미리보기 화면으로"): ① 본문을 `ProductPageBody` + 편집 슬롯으로 교체(`packages/ui` slots·SaleRows 분리, 소비자·미리보기 출력 동일). 기본 정보 입력은 `useSourceBasicInfo` 훅으로 분리해 품종(상품명 아래)·당도(당도 자리)·사이즈(상품정보 중량)에 배치, 기존 `SourceBasicInfo` 컴포넌트는 같은 훅 사용. 편집 캔버스는 미리보기 모양(조작·안내는 카드 선택 시만, 대표사진은 페이지 맨 위가 그림), 상세 제목은 입력 중인 상품명을 바로 표시.
- 11/01 v3 스캔 반영: 상품을 못 불러오면 오류 패널의 다시 시도가 상품도 다시 읽음, 예전 방식 batch(상품 없음·여러 상품)는 기존 자료 작업 화면으로 안내, 기본 정보 칸이 뜨기 전 'AI로 채우기' 막음, 표시용 상품명이 저장 값으로 새지 않게, 대표사진이 있으면(불러오는 중 포함) 실선, 농가 이름 없으면 줄 생략, 펼친 상품정보는 누름 무시, `SourceBasicInfo`는 origin/main 모양으로(embedded 제거). 결정: 채우기 화면에서 섹션 숨기기는 제공하지 않고 예전에 숨긴 섹션 다시 켜기만 남김.
- 11/01 v3 최종 스캔(CRITICAL 0): 상품을 못 불러온 동안 '임시 저장'·'다음'도 막음, 대표사진 불러오기 실패 시 사진 넣기 칸으로 복귀.
- 11/01 v3 최종 검증: typecheck 5 workspace, test:mock 43, Playwright 전체 80 통과 · 0 실패 · 10 건너뜀(최종 직전 회차), 최종 수정 뒤 new-product·source 관련 23개 통과.



## DEV-186 Two-stage product draft 제외 안내

- 기능·인수 조건: FEAT-03 · AC-SRC-1/2/3/5/11
- 상태: 커밋 전 검증 완료(샌드박스 밖) — typecheck 통과, test:mock **46 passed**, Playwright **35 passed**. 체크박스는 사람 확인 후 처리한다.
- 범위: `src/lib/{NewProductComposer,PageCanvas,SourceWorkspace,SourceDetailsEditor,SourceExclusions}.tsx`, `tasks.md`; API·workflow·mock·e2e·문서 허용 경로는 서버 DEV-186 범위 참조.

### 결정 사항
- 2026-11-01 owner 변경(R-19): 배송 방법은 상세에 보존하고 기간/금액/공통 정책을 별도로 안내한다. `sourceExclusionReasons.ts`를 범위에 추가해 reason별 문구와 그룹화를 mock 테스트에서 검증한다. period detector는 API의 공유 JSON을 사용한다. 반품 배송비는 price 안내를 적용한다. 커밋 허용, 실호출·push·PR·의존성 추가 금지는 유지한다.
- REFINED 자동 채움은 상품명/보관 기본값에도 사용한다. 후보 선택 버튼은 공유 금액/효능 detector로 숨기고 플랫폼 문구는 선택·경고를 유지한다.
- 제외 안내는 상품명 포함 chip/title과 화면당 단일 모달 큐로 표시한다. 실제 제외된 원문을 사유별로 모으고 확인은 batch/result별 sessionStorage에 남긴다. 구매자 preview/소비자 페이지에는 노출하지 않는다.
- 다음 단계 inline hint는 새 상품 PageCanvas story 입력의 opt-in으로 제한하며 기본 정보 FillInput에는 표시하지 않는다. 상품명·품종·당도·사이즈·원산지·보관 기존 구조 유지.
- 11/01 이번 리뷰 결정(코드 수정 전): API refinementResults를 optional로 선언하고 composer/workspace 모두 optional chaining을 적용한다. 구버전 응답에는 chip/modal 없이 기존 편집을 유지한다. FillInput의 불필요 View를 제거한다. SourceExclusions effect는 entries 키 문자열에만 의존해 부모 rerender 시 다시 실행하지 않는다.
- 실패 REFINE 안내는 파일명과 분리하고 성공 error 잔여값을 파일 실패로 취급하지 않는다. 사람의 serveReview exact endpoint routing·API payload와 기존 composer viewport 단언2개/스크린샷2개를 보존한다.
- Figma v6 상품명/단일 모달 큐·안내 범위 동기화는 사람 후속 이슈가 필요하다. 실호출·push·PR·새 의존성·커밋 없음.

### 작업
- [ ] 이번 UI 회귀까지 실행 통과 확인
- [ ] Figma 후속 담당자 확인

### 기록
- 11/01 이전 UI 검증 요약: typecheck5 workspace 통과, mock43→44→45 통과. Metro JSON 직접 import export 성공(940모듈). 이전 sandbox Playwright는 Chromium Mach port 권한으로 본문 미실행이었다. 서버 상세/검증 이력은 서버 tasks에만 보존한다.
- 11/01 최신 사람 제공 sandbox 밖 검증(이번 수정 전): ruff 통과·pytest734/734는 서버 기록, `npm run typecheck` 통과, `npm run test:mock` **45 passed / 0 failed**, Playwright **33 passed / 0 failed** — new-product-composer / new-product-two-step / source-detail-design / source-review-regressions(6/6) / source-editor / source-workspace-ui.
- 11/01 이번 회귀: 구버전 review 응답에서 composer/workspace 편집 가능·chip/modal 비노출2개, composer 상품명 입력의 직접 부모 gap 보존, 기존 다상품 큐에 부모 입력 변경 후 확인 결과 재노출 방지 검증 추가. workflow는 기존 mock 묶음에서 실제 배포 정규식과 CI apps/integration 경로를 검증한다.
- 11/01 최초 typecheck에서 composer의 target.id 접근 누락을 발견해 optional chaining을 적용했고 최종 명령을 다시 실행한다.
- 11/01 이번 수정 후 최종 검증(기존 의존성):
  - `npm run typecheck` → **5 workspace 통과 / 0 실패**(누락 optional guard 수정 뒤 재실행).
  - `npm run test:mock` → **46 passed / 0 failed**(28.36초, 기존45 + workflow 회귀1).
  - `SOURCE_ANALYSIS_ENABLED=true ./node_modules/.bin/playwright test scripts/e2e/source-review-regressions.spec.ts` → **0 passed / 8 failed**, 전부 Chromium MachPortRendezvousServer `bootstrap_check_in Permission denied(1100)` / SIGTRAP로 **본문 미실행**. 기존6 + 구버전 응답2이며 wrapper/큐 보완 단언도 sandbox 밖 확인이 필요하다.
  - `./node_modules/.bin/tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --types node scripts/e2e/source-review-regressions.spec.ts` → **통과**. UI 실행 통과를 대신하지 않는다.
  - `./node_modules/.bin/playwright test scripts/e2e/new-product-composer.spec.ts scripts/e2e/new-product-two-step.spec.ts scripts/e2e/source-detail-design.spec.ts scripts/e2e/source-review-regressions.spec.ts scripts/e2e/source-editor.spec.ts scripts/e2e/source-workspace-ui.spec.ts --list` → **6파일35개 발견**, 통과 아님. 사람 제공 수정 전 **33/33 통과**와 구분한다.
  - `serveReview` 함수 본문 SHA256 대조로 **사람 변경 byte-for-byte 보존** 확인. `git diff --check` 통과. 미커밋38경로 범위 감사는 서버 기록 참조. 현 UI 검증·Figma 후속이 남아 완료 체크 보류.
- 11/01 Agent 시간 / Tokens: 계측 미제공. 의도한 커밋 docs / server / producer+api+workflow는 서버 tasks 참조. 환경은 `<로컬 DB>`와 `<로컬 캐시>`를 사용한다.
- 11/01 최종 검증(샌드박스 밖): `npm run typecheck` 통과, `npm run test:mock` **46 passed**, Playwright 6개 spec **35 passed**(새 상품 화면 2종·소비자 상세·회귀·기존 편집기·작업 화면). 모달·칩 스크린샷은 `toBeInViewport`로 화면 안에 완전히 들어온 뒤 찍는다. 위의 sandbox 안 결과(0 passed / 8 failed 등)는 Chromium 시작 차단 때문이며 이 결과로 대체한다.

- 2026-11-01 owner 정책 후속: reason별 price/period/platform 안내와 AI 시트 배송 방법 보존 문구를 적용했다. 반품 배송비는 price로 묶고 health 안내는 유지한다. 공유 JSON 기간 detector를 API에서 export하며 story 입력에 기간 경고를 표시한다. mock에 택배 보존/도착 소요일 제외를 넣고 composer 제외 항목은5개, 다상품 큐 fixture는 상품당3개로 갱신했다.
- 2026-11-01 검증: 최종 `npm run typecheck` **5 workspace 통과 / 0 실패**, `npm run test:mock` **47 passed / 0 failed**(28.42초). 두 Playwright spec에 대한 `./node_modules/.bin/tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --types node scripts/e2e/new-product-composer.spec.ts scripts/e2e/source-review-regressions.spec.ts` 종료0. Chromium은 요청대로 미실행, UI 통과를 뜻하지 않는다. Figma v6 동기화는 디자인 담당자/owner 후속이다.
- 2026-11-01 pre-commit scan 추가 지적0, 범위 이탈0. `git add`가 worktree index.lock 권한 거부로 실패해 로컬 커밋0개. 의도한 docs/server/producer+api 커밋과 서버 검증은 서버 tasks.md DEV-186 후속 기록 참조. 실호출·push·PR·의존성 추가0회, Agent 시간/Tokens 계측 미제공.

- 2026-11-01 서버 최종 결과: ruff 통과, pytest **927 passed / 32 failed**(959개). 정제/scorer 신규 실패0이며 전처리32개는 psutil/sysctl 권한 오류 대표 재현으로 sandbox 밖 확인이 필요하다. 전체 검증·브라우저·Figma 후속이 남아 완료 체크를 보류한다.

## DEV-188 AI가 뺀 문구 모달·칩 다듬기

- 이슈: [DEV-188](https://linear.app/sswp6/issue/DEV-188)
- 브랜치: `jinumeral/dev-188-removed-text-modal-polish` (기준 `origin/main` 6c259ac, DEV-186 포함)
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/8/11 · M-12 · N-02
- 상태: 진행 중 — Playwright·390px 스크린샷은 사람 확인 대기

### 목표
제외 원문을 인용으로 구분하고 사유별 친근한 안내를 제공한다. 긴 목록에서도 마지막 항목을 스크롤로 확인하고 확인 버튼을 항상 볼 수 있게 한다.

### 범위 (수정 허용 경로)
- `apps/producer/src/lib/SourceExclusions.tsx`
- `apps/producer/src/lib/sourceExclusionReasons.ts`
- `apps/producer/tasks.md`
- `scripts/e2e/new-product-composer.spec.ts`
- `scripts/e2e/source-review-regressions.spec.ts`
- `scripts/test-spec12.mjs` (기존 사유 그룹 검증의 새 문구·메타데이터 기대값)
- `docs/spec/ia.md`
- `docs/spec/source-analysis.md`
- `docs/wiki/Source-Analysis.md`

### 비범위 (건드리지 않음)
- 서버·DB·정리 모델·검출 규칙·공용 UI API·새 의존성
- push·PR·머지·배포·Chromium 실행

### 결정 사항
- 11/01 사용자의 DEV-188 상세 지시를 구현 기준으로 적용한다. 단일 상품은 칩·제목에 상품명을 생략하고 여러 상품은 `products.length` 기준으로 상품명을 붙인다(제외 결과가 없는 상품도 상품 수에 포함).
- 11/01 사유별 pill/설명/선택적 정책 보조 문구를 타입이 있는 테이블로 관리하고 그룹 키는 reason으로 둔다. 개인정보·다른 상품·근거 없음·중복·미사용의 기존 설명은 유지하고 설명은 보통 굵기로 표시한다.
- 11/01 `packages/ui`의 T/Button/tokens/safe를 재사용한다. 연한 주황 배경·인용 막대는 기존 accent 토큰에 투명도를 적용하며 나머지 사유 pill은 surface/textMuted를 사용한다. 새 색상은 추가하지 않는다.
- 11/01 공용 Sheet는 전체 children을 ScrollView로 감싸므로 이 모달만 RN Modal에서 제목·본문 ScrollView·footer를 분리한다. 시트는 화면 높이 90% 이하, 본문은 최대400px와 flexShrink로 제한하고 footer는 줄어들지 않게 한다. safe-area 여백을 보존한다.
- 11/01 원문 testID와 textContent·후보 수·자동 표시/확인/sessionStorage 큐 계약을 유지한다. composer는 현재5개이므로 칩은 `AI가 뺀 문구 5개`다. Playwright는 기존 단언을 보존하며 새 제목·사유 pill·정책 보조 문구·스크롤 끝/고정 버튼을 검증한다.
- 11/01 사용자 지시로 로컬 커밋만 시도한다. Figma 도구가 없어 v6 동기화는 디자인 담당자/owner 후속으로 남기며 향후 PR의 Figma 줄에 기록해야 한다. 관련자 메시지·PR은 생성하지 않는다.

### 작업
- [ ] 모달·칩·사유 메타데이터 구현
- [ ] 테스트 기대값·제품 스펙·영문 위키 갱신
- [ ] typecheck·mock 통과 및 커밋 전 스캔
- [ ] 사람: Playwright 실행·390px 스크린샷 owner 확인·Figma v6 동기화

### 완료 조건
- [ ] DEV-188의 인용·사유별 안내·단일 상품 칩·고정 확인 버튼 확인
- [ ] 관련 테스트 묶음 실행 통과를 사람 포함 확인

### 기록
- 11/01 Linear 이슈가 In Progress이며 왜/인수 조건이 채워져 있음을 읽기 전용으로 확인했다. 기존 DEV-186 기록은 이전 작업 이력으로 보존한다. Chromium 실행은 사용자 지시로 생략하고 완료 체크는 사람 UI 검증까지 보류한다.
- 11/01 구현·문서·기대값 갱신 후 검증(기존 의존성): `npm run typecheck` → **5 workspace 통과 / 0 실패**. `npm run test:mock` → **47 passed / 0 failed / 0 skipped**(28.92초, 기존 테스트 수 유지).
- 11/01 `./node_modules/.bin/tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --types node scripts/e2e/new-product-composer.spec.ts scripts/e2e/source-review-regressions.spec.ts` → 종료0. Playwright/Chromium은 **미실행**이며 이 문법·타입 검사는 UI 통과를 뜻하지 않는다. 사람은 두 spec을 실행하고 390px 모달/칩 스크린샷과 마지막 항목·고정 확인 버튼을 확인해야 한다.
- 11/01 커밋 전 스캔: 회귀/신규 버그/불필요 코드 지적0. 레거시 호환 후보0·지적0(추가된 null 기본값은 두 구조를 받아주는 호환 분기가 아님). 그룹 함수의 모든 호출부(모달·mock)를 갱신했고 기존 큐/sessionStorage·원문 textContent·testID·후보 수를 보존했다.
- 11/01 범위 감사: `git diff main...HEAD`는 로컬 main(9d6b42e)이 오래되어 이번 작업 이전의 변경도 포함한다. 실제 기준 `origin/main`과 HEAD는 모두6c259ac으로 커밋 diff0이며, `git diff HEAD`의 이번 변경9경로는 위 허용 범위와 일치한다. `git diff --check` 통과, 새 파일0.
- 11/01 첫 기록 커밋을 위해 현재 브랜치를 확인한 뒤 `git add apps/producer/tasks.md` 및 `git commit`을 시도했으나 `.git/worktrees/farmclub-modal-polish/index.lock` 생성이 `Operation not permitted`로 차단됐다. 커밋0개, push·PR0회. 의도한 커밋: `docs(producer): FEAT-03 제외 안내 개선 범위 기록 (DEV-188)` / `fix(producer): FEAT-03 제외 문구 모달과 칩 다듬기 (DEV-188)`(구현·테스트·제품 스펙·위키 포함). Co-Authored-By는 넣지 않는다.
- 11/01 Figma v6는 디자인 담당자/owner 후속이다. UI 검증 전까지 체크박스·AC·Linear Done 처리는 보류한다. 대표 프롬프트: DEV-188의 인용 스타일·사유 pill·고정 footer·단일 상품 칩을 기존 토큰과 단언을 보존해 수정. Agent 시간 / Tokens: 계측 미제공.
- 11/01 Claude 확인: Playwright `new-product-composer`·`source-review-regressions`·`new-product-two-step` 14 passed(샌드박스 밖), 390px 모달·칩 스크린샷을 owner에게 보여 드렸다. 커밋 전 스캔(CRITICAL 0) 지적 반영: 연한 주황 배경 위 주황 글씨 대비가 WCAG AA에 못 미쳐 pill·칩 글씨를 `accentPressed`로 바꿨고, 표에 없는 사유는 근거 없음 안내로 대신하며, 개인정보 사유 원문은 `masked`로 세션 녹화에서 가린다. 공용 Sheet에 footer prop을 넣어 다시 쓰는 것은 공용 UI 변경이라 후속으로 남긴다.

## DEV-171 [I3-T12] Verify producer flow per format

- 이슈: [DEV-171](https://linear.app/sswp6/issue/DEV-171)
- 브랜치: `jinumeral/dev-171-i3-t12-producer-flow-verify` (base `6c259ac`)
- 기능·인수 조건: FEAT-03/04/07 · AC-SRC-1/2/5/6/7/9/11 · M-11/13
- 상태: 진행 중 — 사람 실행 mock 흐름 E2E 4/4 PASS, nosniff 수정 후 API 3/3 PASS; 추가 worker 통합1건 sandbox 밖 재실행·사람 리뷰 대기.

### 목표
텍스트·이미지·긴 이미지·PDF의 생산자 업로드부터 명시적 적용·소비자 렌더까지 검증하고 실행 여부와 증거를 분리한다.

### 범위 (수정 허용 경로)
- `apps/producer/tasks.md`
- `scripts/e2e/producer-format-flow.spec.ts`
- `server/tests/test_producer_format_flow.py`
- `server/app/core/seed.py` — 전체 시드와 E2E 복원에서 공유하는 단일 상품 시드 함수
- `server/tests/test_seed.py` — 상품 전체 열 복원·자료 그래프 정리·worker 재시작 회귀
- `server/app/source_analysis/router.py` — 자료 응답의 중복 nosniff 설정 제거
- `server/app/source_analysis/middleware.py` — 기존 커밋의 단일 nosniff 헤더 보장(이번 후속 수정 없음)
- `server/tests/test_source_analysis.py` — 기존 보안 헤더 검사에 단일 nosniff 회귀 추가
- `docs/evaluation/i3-t12-producer-flow.md`
- `Makefile`의 기존 `test-e2e` 안내(새 spec은 기본 discovery에 포함)

### 비범위
- 아래 nosniff 결함 수정 외 제품 동작·UI·스펙 변경, 새 의존성, mock provider/체크섬 규칙 변경, 실/유료 모델 호출, 에이전트 Chromium 실행, commit·push·PR·배포.

### 결정 사항
- 11/02 사용자 재현: 실패 후 worker 재시작의 beforeAll이 오염 상태를 다시 캡처하므로 스냅샷 방식을 폐기한다. `seed --reset`도 사용하는 단일 상품 시드 함수를 추출해 p-house의 모든 상품 열(모델 기본값·NULL 포함)을 복원한다. beforeAll 시작·실패를 포함한 afterAll마다 같은 복원을 실행하고, 시드가 생성하지 않는 대상 자료 그래프·refinement·workspace·공개 사진·멱등 요청 및 저장 파일을 제거한다. 기존 assertion과 timeout은 유지하며 Chromium은 기존 사람 실행 원칙을 따른다.
- 11/01 후속 사용자 지시: 실제 사람 실행 Playwright 4 passed(56.8s)를 근거로 mock의 human-controlled flow는 PASS로 기록한다. 시각 형식 성공 추출은 DEV-170 T11 live development 결과에 위임하며 이 E2E가 증명한다고 쓰지 않는다.
- 11/01 API 3 failed의 새 원인은 middleware와 endpoint의 중복 nosniff다. SourceRequestMiddleware가 /api/source-analysis 응답의 nosniff를 단독 설정하도록 router의 원본·페이지 이미지·작업 사진 설정만 제거한다. public source-media 등 middleware 밖의 헤더는 유지한다. 기존 보안 테스트를 강화하고 실제 시각 흐름의 엄격한 단언은 유지한다.
- 11/01 .artifacts/는 기존 루트 .gitignore에서 제외됨을 확인한다. 기존 JSON에는 gitSha/dirty/startedAt만 있으므로 종료 UTC는 trace의 wallTime+monotonic timing에서 복원하고, API·앱별 독립 배포 SHA가 없다는 한계를 명시한다.
- 11/01 Linear 본문과 관련 제품 spec·폴더 spec/tasks를 읽었다. 이전 이슈의 진행 중 표기는 main의 과거 기록이며 이번 작업은 사용자 지정 격리 worktree에서 테스트·기록만 변경한다.
- 11/01 기존 E2E 전체의 test 선언과 주요9 spec 본문을 감사한다. `public-media`는 공개 농가 사진만 검증하므로 자료 비공개 검증으로 계산하지 않는다.
- 11/01 `extract(mock)`는 MOCK_TEXT/MOCK_REFINE_TEXT 두 원본 SHA만 받는다. 시각 자료의 성공 mock fixture는 현 base에 없으므로 SHA를 위조하거나 추출기를 확장하지 않는다. UI에서 실제 업로드·분석 실패·수동 복구 후 편집/저장/재분석/적용/소비자 일치를 검증하고, 시각 형식의 성공 자동 추출/인용 검토는 이 mock E2E에서는 미검증으로 남긴다(후속 지시: 성공 추출은 DEV-170 T11 live development 결과 참조).
- 11/01 시각 전처리는 기존 pytest의 `_ocr` 대체 패턴과 PIL 합성 자료를 재사용해 API의 실제 원본 SHA 거절·인증·비캐시 계약을 별도 검증한다. OCR/모델 품질 측정이나 브라우저 인수 통과로 보고하지 않는다.
- 11/01 스크린샷은 `FARMCLUB_INTEGRATION_ARTIFACTS/t12-<format>-<step>.png`, trace는 실행 명령의 `--trace on`. 라이브 스택의 API/app/worker가 같은 SHA·격리 DB·mock인지 사람이 확인한다.

### 작업
- [x] 기존 커버리지 행렬과 형식별 누락 기록
- [x] UI mock 흐름 4 passed(사람), 시각 형식 API 회귀 3 passed(헤더 수정 후) 실행 확인
- [x] typecheck·test:mock 및 Playwright discovery 결과 기록
- [x] 사람의 mock 스택 실행·증거·빌드 ID·UTC 시각 기록
- [ ] 독립 사람 시각 리뷰 및 추가 source-photo worker 통합 검사 sandbox 밖 재실행

### 완료 조건
- [x] 네 형식의 human-controlled flow with mock PASS 기록; 시각 형식 성공 추출은 T11 live run에 위임(이 E2E로 성공 추출/인용 검토를 주장하지 않음)
- [ ] 관련 테스트 묶음 통과 및 사람 검토

### 기록
- 11/01 시작: base `6c259ac41b39f2d3112ef31e58b441fdff77e110`, 작업 트리 깨끗함. Linear In Progress 확인. Agent 시간 / Tokens: 계측 미제공.
- 11/01 검증: `npm run typecheck` **5 workspace 통과 / 0 오류**, `npm run test:mock` **47 passed / 0 failed / 0 skipped**. `npx playwright test scripts/e2e/producer-format-flow.spec.ts --list` **4개 발견 / 종료0**. 같은 spec의 `tsc --noEmit --module nodenext --moduleResolution nodenext --target es2022 --esModuleInterop --skipLibCheck --types node` **종료0**. 브라우저 실행 통과를 뜻하지 않는다.
- 11/01 API 회귀 실행: 제공 DEV-171 DB로 `cd server`에서 `SOURCE_ANALYSIS_PROVIDER=mock .venv/bin/python -m pytest tests/test_producer_format_flow.py -q --tb=short` → **0 passed / 3 failed**. `_ocr` fixture 후 실제 QR/privacy 전처리가 `IMAGE_PRIVACY_NOT_CONFIGURED`를 반환한다. `importlib.util.find_spec('cv2')` **False**로 원인 확인. 최초 작성 중 optional `moduleDetail` 누락 KeyError는 수정했으며, 이후 의존성 오류에서 재시도 중단. 기존 OCR extra가 있는 사람 환경에서 API 전체 단언 실행이 필요하다. QR 가드 우회·의존성 추가 없음.
- 11/01 `server/.venv/bin/ruff check tests/test_producer_format_flow.py` 및 `ruff format --check` **통과**, `git diff --check` **통과**. 새 파일3개 전체와 수정2개를 감사했고 허용 범위5경로 이탈0. `git diff main...HEAD` **672경로**는 오래된 로컬 main 대비 base의 차이이며 `git diff origin/main...HEAD` **0경로**(이번 변경은 미커밋). 기존 테스트/제품 코드/스펙 변경0.
- 11/01 현재 Linear 원문 대조: DEV-58 In Progress, DEV-84/90/92/172/184/186/187 Done. 과거 tasks의 진행 중 표기와 구분해 evidence doc에 제목·상태를 기록했다. 별도 메시지·상태 변경 없음.
- 11/01 pre-commit scan: 추가 지적0. 레거시 호환 점검: 후보0건 — 지적0건 / 커밋된 구조0건. optional moduleDetail은 이미 커밋된 응답 계약(d4efd6d)이며 이전 미커밋 구조 호환을 추가하지 않았다. Chromium은 사용자 지시대로 미실행, 전체 AC·스크린샷·trace·검증 build SHA는 사람 실행까지 미완료다.
- 11/01 의도한 로컬 커밋: (문서) `docs(producer): FEAT-03/04/07 형식별 검증 행렬과 기록 추가 (DEV-171)` — evidence doc·producer tasks. (테스트) `test(producer): AC-SRC-1/5/6/9/11 형식별 흐름 회귀 추가 (DEV-171)` — 새 Playwright·pytest·Makefile. push·PR·배포·라이브/유료 모델 호출·새 의존성0회.
- 11/01 로컬 커밋 시도 직전 `git branch --show-current`로 지정 DEV-171 브랜치 확인. `git add apps/producer/tasks.md docs/evaluation/i3-t12-producer-flow.md`가 공용 git 디렉터리의 `worktrees/farmclub-t12-flow/index.lock: Operation not permitted`로 종료128하여 commit 단계 미실행. **커밋0개**, 변경5경로 모두 작업 트리에 남김. 권한 우회·재시도·push·PR 없음. 다음 사람은 기존 OCR extra 환경에서 pytest 3건을 먼저 실행하고 Chromium 4건의 trace/단계 스크린샷·build SHA를 검토한 후 결과 행렬을 채운다.

- 11/01 후속 사람 실행: `npx playwright test scripts/e2e/producer-format-flow.spec.ts --workers=1 --trace on` → **4 passed / 0 failed (56.8s)**. `.artifacts/dev171/`의 build/run JSON 8개와 단계 PNG 67개, trace 4개를 확인. base SHA `6c259ac41b39f2d3112ef31e58b441fdff77e110` + dirty worktree, executor `Claude (agent) / human owner`, UTC 시작 `2026-11-01T12:53:22.268Z`, 종료 `2026-11-01T12:54:18.024Z`(JSON에 종료 필드가 없어 trace에서 복원). API/앱 SHA는 같은 checkout이라는 사람 보고이며 독립 서비스 SHA는 미기록.
- 11/01 사람 pytest는 **0 passed / 3 failed**: image·long-image·pdf에서 `nosniff, nosniff` 중복 응답. source router의 content/page-image/workspace-photo 헤더를 제거해 middleware만 nosniff를 설정한다. 기존 엄격한 테스트는 그대로 두고 기존 security 테스트에 metadata/content `get_list(...) == ["nosniff"]` 회귀를 추가했다.
- 11/01 수정 후 `cd server && uv run ruff check . && uv run --extra ocr pytest tests/test_producer_format_flow.py` → **ruff PASS, 3 passed / 0 failed (4.97s)**. 기본 uv cache는 sandbox 쓰기 금지로 첫 실행이 막혀, `UV_CACHE_DIR=/private/tmp/dev171-uv-cache`와 제공 격리 DB `farmclub_dev171`을 지정해 성공. 기존 OCR extra/OpenCV 사용 가능, 의존성 선언/lock 변경·테스트 약화·QR 우회 없음.
- 11/01 추가 검사: `cd server && uv run --extra ocr pytest tests/test_source_analysis.py::test_AC_SRC_8_read_body_limit_and_noncacheable tests/test_media.py tests/test_source_integration.py::test_AC_SRC_6_public_photo_is_independent_and_requires_preparation`(같은 cache/DB 설정) → **15 passed / 1 failed (4.02s)**. 단일 nosniff security 회귀1건·기존 media14건 PASS. source-photo 통합1건은 PREPARE PROCESSING_FAILED→후보0→review400. 별도 `preprocess.prepare(text, "text/plain")`가 `PermissionError [Errno 1] ... sysctl() malloc 1/3`를 재현했다. 추가 재시도/우회 없이 중단하며 사람 test executor가 해당 통합 검사를 sandbox 밖에서 재실행해야 한다. 전체 테스트 PASS/이슈 완료는 주장하지 않는다.
- 11/01 평가 문서: 실제 형식별 PASS·artifact 파일명·수정 전후 pytest·nosniff 이슈 fixed를 기록. **Overall DEV-171 status = PASS for the human-controlled flow with mock**. 시각 형식 성공 추출은 **covered by T11 live run, not by this E2E**. 사람은 DEV-170 live development에서 image/long-image/pdf 성공을 보고했으며 해당 브랜치 `docs/spec/validation/source-final-eval-i3-*`로 연결했다. 로컬 T11 보고서는 아직 mock dry-run snapshot이므로 실측 숫자를 꾸며 쓰지 않았다.
- 11/01 산출물/범위: 기존 `.gitignore:24`의 `.artifacts/`로 JSON8+PNG67 전부 ignore, 추적 산출물0. `git diff --check` 통과. 허용 변경은 기존5경로+source router+기존 security test=7경로, 그 외 변경 없음. `git diff main...HEAD`는 기존672경로 base 차이, `git diff origin/main...HEAD`는0경로이며 새 변경은 모두 미커밋이다.
- 11/01 의도한 커밋(실행하지 않음): `fix(source-analysis): AC-SRC-6/8 중복 nosniff 헤더 제거 (DEV-171)` — router·기존 security test; `test(producer): AC-SRC-1/5/6/9/11 형식별 흐름 회귀 추가 (DEV-171)` — Playwright·pytest·Makefile; `docs(producer): FEAT-03/04/07 T12 실행 결과와 T11 경계 기록 (DEV-171)` — 평가 문서·tasks. 현재 사용자 지시대로 commit·push·PR·배포 없음. Agent 시간 / Tokens: 계측 미제공.
- 11/01 Claude 스캔 반영(CRITICAL 2): 새 Playwright spec의 DB 이름 고정(`farmclub_dev171`) 단언을 지웠다(CI는 `farmclub` DB를 쓴다; localhost·mock·비-mock 0건 단언으로 격리를 확인). 새 pytest는 OCR extra의 OpenCV가 없으면 건너뛴다(`pytest.importorskip("cv2")`, CI 기본 설치에는 없음). 시각 형식 실패 원인을 `UNSUPPORTED_MOCK_SOURCE`로 좁혔다. 재발 방지로 미들웨어가 기존 `x-content-type-options`를 걸러 한 번만 붙이고, 페이지 이미지 응답도 단일 헤더를 단언한다.
- 11/01 CI 통합 오염 수정 결정·기록: T12 beforeAll에서 p-house 전체 상품 행(상세·이름/설명·사진·버전 등)·ProductWorkspace·기존 대상 배치의 자료/페이지/run/item(refinement 포함)/후보/검토/초안·공개 사진·관련 멱등 요청을 스냅샷하고 실패 시에도 afterAll에서 정확히 복원하며 새 행·저장 파일을 제거한다. 기존 단언·소비자 렌더 유지, 후속 product-page-workspace/public-media/source-* 및 독립 Mock storefront 의존성 감사. `npm run typecheck` 5 workspace 통과/0 오류, E2E 단독 tsc 종료0, SQLite 메모리 DB 보조 복원 검사(FK 활성, 기존 workspace 유/무) 2 passed/0 failed(초기 harness DDL·fixture 준비 오류 수정 후); PostgreSQL/Chromium 통합 검증 대체 아님. 사람은 fresh seed에서 `npx playwright test scripts/e2e/producer-format-flow.spec.ts scripts/e2e/product-page-workspace.spec.ts --workers=1` 실행 대기. 의도한 커밋: `test(producer): AC-SRC-9 T12 공용 시드 상품 상태 복원 (DEV-171)`; commit·push·PR·live 호출 없음.

- 11/02 후속 작업 시작: 사용자 지시에 따라 기존 worktree·미커밋 변경에서 이어간다. 범위를 seed 함수와 회귀 테스트로 확장했으며 commit·push·PR은 실행하지 않는다. cold-start text 실패는 단독 12초 통과라는 사용자 보고만 있으며 이번 정리 수정으로 해결됐다고 주장하지 않는다.
- 11/02 구현: worker별 pickle 스냅샷을 제거했다. `seed_product(session, product_id)`를 전체 `seed()`와 E2E가 공유하며 PostgreSQL upsert의 excluded 행으로 모든 상품 열을 시드 값·모델 기본값·NULL로 복원한다. beforeAll/afterAll은 파일이나 worker 메모리에 의존하지 않는다. source 그래프는 FK 역순으로 삭제하고 저장 파일은 DB commit 뒤 제거한다. 기존 상품 옵션·단계·주문 및 다른 상품의 자료/파일·비용 원장은 보존한다.
- 11/02 검증: `npm run typecheck` **5 workspace 통과 / 0 오류**. `UV_CACHE_DIR=/private/tmp/dev171-uv-cache uv run --project server ruff check server/app/core/seed.py server/tests/test_seed.py` **통과**, `git diff --check` **통과**. lint/정적 검사는 테스트 통과를 대신하지 않는다.
- 11/02 pytest 실행: `cd server && UV_CACHE_DIR=/private/tmp/dev171-uv-cache DATABASE_URL=<로컬 farmclub_dev171 DB URL> uv run pytest tests/test_seed*.py tests/test_core.py -q` → **0 passed / 0 failed / 10 setup errors (1.26s)**. localhost:5432 PostgreSQL이 Connection refused를 반환해 공통 `_schema` fixture의 DB 연결에서 중단됐다. 새 회귀 3건과 기존 core 7건 모두 본문 미실행이며 **미완료**다. AGENTS.md의 의존성 문제 중단 규칙에 따라 DB 우회·SQLite 대체·재시도 없이 중단한다. PostgreSQL 준비 뒤 같은 명령과 사람의 `npx playwright test scripts/e2e/producer-format-flow.spec.ts scripts/e2e/product-page-workspace.spec.ts --workers=1 --trace on` 재검증이 필요하다.
- 11/02 범위 감사: `git diff main...HEAD`는 로컬 main이 뒤처진 기존 675경로 차이이며, `git diff origin/main...HEAD`의 기존 8경로를 DEV-171 범위와 대조해 기존 middleware 경로 누락만 기록에 추가했다. 이번 미커밋 변경은 producer tasks·T12 E2E·seed helper·seed pytest 4경로다. 의도한 커밋: `test(producer): AC-SRC-9 T12 공용 시드 상품을 시드 기준으로 복원 (DEV-171)`. commit·push·PR·Chromium·운영 실행 없음. Agent 시간 / Tokens: 계측 미제공.


## DEV-179 [I3-T21] Producer workflow fixes from T16

- 이슈: 사용자 제공 DEV-179 지시서(2026-11-02)
- 브랜치: `jinumeral/dev-179-producer-flow-fixes`, base `7e88039`
- 기능·인수 조건: FEAT-04/07/08/09/17 · AC-SRC-5/9/11 · AC-09-8 · AC-17-5
- 상태: 진행 중 — 브라우저 검증은 사람 실행 대기

### 목표
T16 녹화 리뷰의 owner 결정 1~15를 반영하고 기존 저장·공개·권한·멱등 보호를 유지한다.

### 범위 (수정 허용 경로)
- `apps/producer/src/lib/**`, `apps/producer/src/app/ship.tsx`
- `apps/producer/spec.md`, `apps/producer/tasks.md`
- `server/app/source_analysis/service.py`, `server/app/source_analysis/editor.py`, `server/app/source_analysis/spec.md`, `server/tasks.md`
- `packages/api/src/sourceAnalysis.ts`
- `server/tests/test_source*.py`, `server/tests/test_orders.py`
- `scripts/e2e/*.spec.ts` — 관련 기존 spec의회귀 추가·기대값 갱신
- `docs/spec/source-editor.md`, `docs/spec/source-integration.md`, `docs/spec/source-analysis.md`, `docs/spec/screens.md`, `docs/spec/ia.md`, `docs/spec/functional/FEAT-07-*.md`, `docs/spec/functional/FEAT-09-*.md`, `docs/spec/functional/FEAT-17-*.md`
- `docs/wiki/Requirements-and-Specifications.md`

### 비범위
새 의존성·상세 주문 화면·운영/유료 호출·브라우저 실행·commit/push/PR·배포. Figma는 DEV-185 후속.

### 결정 사항
- 11/02 owner 지시가 기존 대표사진 분석 필수·AI 표시·근거 UI·즉시 입금 승인 명세를 대체한다. 대표사진 공개 적용 검사는 유지한다.
- 11/02 품종은 기존 basicInfo 훅의 단일 입력/blur/flush를 AI 시트에 배치한다. 미리보기 토글은 편집기를 마운트한 채 동일 상태의 공유18모듈 렌더러를 사용한다.
- 11/02 #11 보류: FEAT-17 입력·검증과 SCR-29는 PREPARING→SHIPPED만 정의하며 SHIPPED 송장 정정 권한·감사·버전 계약이 없다. R-19는 상태 변경 권한만 정한다. 명시적 허용 결정 전 새 API를 추측 구현하지 않는다.
- 11/02 #15 기존 UI 비용 확인은 REQUEST_UNCERTAIN에만 강제된다. owner 요구에 따라 표시하는 재시도는 모두 확인 전 비활성으로 통일하며 문서를 함께 갱신한다. 실패 페이지 번호만 응답에 추가하고 사유·원문 진단은 공개하지 않는다.
- 11/02 근거는 서버·review API에 보존한다. 충돌은 자동 정리/기본 정보 우선 처리로 가려지는지 원본 코드로 확인 후 수정한다.

### 작업
- [ ] 1~9, 13~15 편집·분석 흐름 수정 및 회귀
- [ ] 10, 12 입금 확인·주문 금액 수정 및 회귀
- [ ] 제품 스펙·영문 위키·구현 결정 갱신
- [ ] ruff·관련 pytest·typecheck·mock 실행 결과 기록
- [ ] 사람: 관련 Playwright 실행, Figma DEV-185

### 기록
- 11/02 시작: 지정 브랜치·깨끗한 작업 트리 확인. 사용자 지시서 기준으로 진행하며 외부 이슈 변경·메시지 없음. Agent 시간 / Tokens: 계측 미제공.

- 11/02 리뷰 결정: 자동 정리의 안전성 거절/의도적 생략은 missing을 유지한다. 현재 자동 제안이 존재하는 충돌만 확인 선택기로 전달하며 기존 안전성 단언은 유지한다. 기존 저장 회귀3건에는 충돌 값을 명시적으로 확인하는 단계만 추가했다. 미리보기 도구/EXCLUDED 필드 누출 및 배경 닫기를 영구 확인으로 기록하는 문제를 리뷰에서 찾아 수정했다.

- 11/02 반영 상태: #1 사진 없는 분석·공개 gate 유지, #2 시트 품종/단일 flush, #3 AI 배지 제거, #4 근거 UI만 제거, #5 상단 같은 화면 preview, #6 시작 오류 위치/초기화, #7 실제 run 진행, #8 자동 제안 충돌 상태 복구, #9 명시적 제외 확인 영속화, #10 입금 확인 시트, #12 기존 API 금액 표시, #13 잠금 이유, #14 공개 전 검토, #15 실패 번호·체크 전 재시도 비활성 구현. #11은 위 명세 결정까지 보류. 체크박스/전체 완료는 사람 Playwright와 PREPARE 재검증 전 보류한다.
- 11/02 실행: `cd server && UV_CACHE_DIR=/private/tmp/dev179-uv-cache DATABASE_URL=<제공 farmclub_dev179 URL> uv run ruff check . && ... uv run pytest tests/test_source_editor.py tests/test_source_integration.py tests/test_source_refine.py tests/test_orders.py -q --tb=short` → ruff PASS, **351 passed / 14 failed (63.35s)**. 처음 실행은 344 passed/21 failed였고 잘못된 새 테스트의 mode 입력1건과 충돌 상태에 따른 기존 저장 회귀6건을 수정한 뒤 재실행했다. 기존 기대값을 삭제/약화하지 않고 저장3건에는 명시적 충돌 확인 단계를 추가하고 안전성/생략3건은 기존 missing 보호를 복구했다.
- 11/02 PREPARE 환경 한계: 잔여14건은 기존 `test_source_editor`6건과 `test_source_integration`8건의 전처리 의존 경로다. `cd server && UV_CACHE_DIR=/private/tmp/dev179-uv-cache uv run python -c 'from app.source_analysis.preprocess import prepare; prepare(b"test text", "text/plain")'` → **PermissionError: sysctl() malloc 1/3**(psutil 자식 프로세스 조회). 가드 우회·테스트 skip·assertion 약화 없이 남겼다. sandbox 밖 동일 묶음 재실행 필요. 첫 재확인 명령은 cwd 오류(ModuleNotFoundError), 올바른 server cwd에서 위 환경 오류를 재현했다.
- 11/02 신규 계약 회귀만 별도 실행(사진 없는 분석1·품종3·공개 사진 필수2·진단1·충돌6·주문3) → **16 passed / 0 failed (5.52s)**. fail-first는 옛 사진 gate 임시 복원 시1 failed, 충돌 처리/실패 번호 mutation 시7 failed를 확인하고 finally로 복원했다. 이후 신규16건 green 및 ruff PASS. DB는 자동 `_test` 접미사를 쓰며 운영·유료 호출 없음.
- 11/02 앱 실행: `npm run typecheck` → **5 workspace PASS / 0 오류**; `npm run test:mock` → **47 passed / 0 failed / 0 skipped (27.57s)**. 기존 모듈 타입 경고는 그대로다. UI 테스트는 source-review-regressions에 신규18건과 관련 기존7 spec 기대값을 갱신했다. 관련7 spec에 `tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck --types node` → 종료0. 최초 Node16 검사 옵션 오류는 bundler/resolveJsonModule로 정정했다. **브라우저/Playwright 실행0회**이며 정적 검사는 UI 테스트 통과가 아니다.
- 11/02 리뷰: 구현을 보지 않는 별도 test-writer가 서버/UI 사양 회귀를 작성했고, 별도 diff 검토의 preview 도구·EXCLUDED 필드 누출 및 확인 없는 영속 기록4건을 수정했다. 재검토 추가 중대 지적0. 신규 테스트는 기존 테스트/권한/비용 보호를 유지한다.
- 11/02 범위 감사: `git diff main...HEAD`의681경로는 오래된 로컬 main 대비 기존 차이다. 지정 base `7e88039...HEAD`0경로이며 이번 변경은 모두 미커밋으로 허용 범위 안이다. 감사 시점 `origin/main`은 e66faef를 가리키지만 checkout/fetch/pull/리베이스하지 않았다. `git diff --check` PASS. 새 의존성/lock 변경·commit/push/PR·외부 전송·live/paid·배포 없음. Figma v6: DEV-185, 사람은 UI18건+관련 기존 spec와 PREPARE14건을 검증해야 한다.
- 11/02 의도한 커밋(실행 안 함): `fix(source-analysis): FEAT-04/07 분석 조건과 충돌 진단 수정 (DEV-179)`; `fix(producer): FEAT-04/07 편집과 분석 복구 흐름 개선 (DEV-179)`; `fix(orders): FEAT-09/17 입금 확인과 주문 금액 표시 (DEV-179)`; `docs(producer): FEAT-04/07/09 T21 결정과 검증 기록 (DEV-179)`. Agent 시간 / Tokens: 계측 미제공.


### DEV-179 리뷰 후속 · 2026-11-02 (사용자 추가 지시)

#### 범위 추가 (코드 수정 전)
- `server/app/orders/{models,schemas,service,router}.py`, `server/app/orders/spec.md`, `server/migrations/versions/0024_order_tracking_version.py`
- `packages/api/src/{types,endpoints}.ts`, `packages/api/src/mock/orders.ts`, `docs/spec/functional/rules.md`
- 기존 DEV-179 범위의 서버·앱·E2E·스펙·wiki와 `scripts/test-spec12.mjs`(Mock 송장 수정 계약 검증)

#### 결정 사항
- 앞선 SHIPPED 송장 정정 보류를 이번 owner 지시로 해제한다. 자기 농가 SHIPPED 주문만 `PATCH /orders/{id}/tracking`으로 수정하며 carrier 필수·송장 기존 50자 이하 형식을 적용한다. trackingVersion과 Idempotency-Key로 유실·중복 수정을 막는다.
- 기존 `ManagerEvent`에 정정 전후 값·actor·시각을 같은 트랜잭션으로 기록한다. 이력은 DB/관리 API에서만 볼 수 있고 생산자·소비자 응답/UI에는 포함하지 않는다. 새 migration은 주문 tracking_version 기본값 1을 추가한다.
- conflict는 specification/composition/weight/origin/brix에 해당하는 단일 사실 필드의 정규화 값이 다른 경우만 적용한다. summary/farmStory 등 병합 서술은 충돌로 만들지 않으며 outdated를 보존하고 현재 자동 값도 선택지에 포함한다.
- OCR 실패 쪽과 chunk 실패 쪽은 별도 응답 필드·각각의 안내로 구분한다. 사진 없는 분석은 허용하되 자료 0개는 서버와 같은 이유로 비활성화한다.
- 제외 내역 확인은 사용자·batch·target별 마지막 버전 1개를 덮어쓰며 과거 sessionStorage 키를 한 번 읽고 이관한다.
- 테스트 자동 확정 우회를 제거한다. 충돌 UNREVIEWED 저장은 409, 비충돌 자동 저장은 계속 검증한다. 전체 pytest 1239 통과는 사용자 제공 sandbox 밖 결과이며 이번 수정 후 결과와 구분한다.

#### 작업 / 기록
- 진행 중. no commit/push/PR/live 유지, tasks.md는 append-only. Figma는 기존 DEV-185 후속. 이번 세션에서 체크박스 완료 표시는 테스트 실행 결과 후에만 한다.

- 범위 추가: `packages/api/src/mock/{db,derive,router}.ts` — Mock 주문 버전 전달과 생산자 권한 경로 일치를 위해 필요. 기존 주문 시드/저장소는 trackingVersion이 없으면 1로 읽는다.

- 테스트 범위 추가: `server/tests/test_dev179_review.py` — spec-blind-test 전용 신규 회귀(배송 권한/감사/멱등, 사실 충돌/서술 자동 저장). 기존 관련 pytest 묶음과 함께 실행한다.

- 검증 중 기존 stale-refinement 회귀의 original_id 조회가 사진까지 임의 선택하는 비결정성을 발견했다. 원래 텍스트 자료만 선택하도록 fixture를 좁혀 기존 소유권 단언은 그대로 유지한다. 새 Mock 회귀도 테스트 로그인 가능한 소비자의 준비 주문을 출하한 후 수정하도록 준비한다.


### DEV-179 리뷰 후속 결과 · 2026-11-02

#### 항목별 반영
- #1 AI 배지 E2E는 정확히 0개를 검증한다. #2 사진 없는 자료 분석을 enabled로 검증하고 분석 후 대표사진 없는 적용의 구체적 메시지를 확인한다. 초기 자료 0개 검사는 #10의 별도 이유로 유지한다.
- #3 같은 사실의 정규화 값만 충돌로 처리하며 병합 서술 자동 저장·outdated를 보존한다. 규격의 보완 label, kg/g·소수 당도 동등값을 처리하고 같은 중량의 다른 품종·원산지·구성과 항목별 중량 교환도 구분한다. 현재 refined/basicInfo 값도 선택기에서 확정할 수 있다.
- #4 기존 자동 확정 우회 3곳 제거, 비충돌 UNREVIEWED 자동 저장과 충돌 저장409 EDITOR_CONFIRMATION_REQUIRED 회귀 추가. 기존 target/shared 충돌 fixture는 서술(storage)에서 사실(composition)로 이동하되 단언은 보존했다.
- #5 대표사진 공개 차단 2건은 details.fields.representativePhoto를 검증한다. #6 OCR/청크 실패 쪽을 별도 응답·안내로 분리하고 서버/UI 회귀를 보강했다.
- #7 미사용 DraftPreview 제거. #8 buyer preview subName/brix undefined. #9 SourceRunProgress는 시트/본문 한 곳만. #10 자료 0개 시작 비활성·서버와 같은 이유 표시. #11 토글 들여쓰기 정리·source service의 무관한 or/and 재포맷 원복. #12 대표사진 테스트명 수정. #13 확인 저장은 사용자·batch·target의 마지막 버전만 덮어쓰며 구 sessionStorage bare 키와 실제 HEAD의 namespaced 키를 읽고 제거한다.
- Owner 추가 결정 구현: 자기 농가 SHIPPED 송장 정정 API/UI, 필수 택배사·기존 번호 형식, 버전/멱등 검사, 소비자 최신 배송 조회. 실제 변경의 이전/새 값·시각·actor는 기존 ManagerEvent에 원자적으로 기록한다. 양쪽 UI에는 이력을 표시하지 않는다. FEAT-17 AC-17-9 / SCR-29 / R-19 / 구현 spec / 영어 wiki 반영.

#### 최종 검증 (실행한 결과만)
- `cd server && UV_CACHE_DIR=/private/tmp/dev179-uv-cache uv run ruff check .`: PASS.
- `cd server && UV_CACHE_DIR=/private/tmp/dev179-uv-cache DATABASE_URL=<격리 farmclub_dev179 URL> uv run pytest tests/test_source_editor.py tests/test_source_integration.py tests/test_source_refine.py tests/test_orders.py tests/test_dev179_review.py -q --tb=short`: **393 passed / 14 failed / 0 skipped**, 147.64s. 신규 사양 회귀42건은 모두 통과. 잔여14건은 앞선 세션의 기존 PREPARE 의존 editor6·integration8 경로와 동일하다. `prepare(b"test text", "text/plain")` 직접 실행도 psutil `sysctl() malloc 1/3` PermissionError를 재현했다. 안전 가드·테스트 skip·단언 우회 없음. 따라서 전체 완료 체크는 보류하며 sandbox 밖에서 같은 최종 묶음 재실행 필요.
- 사용자가 제공한 이전 sandbox 밖 전체 **1239 passed**는 이번 수정 전 결과이며 최종 결과로 대체 주장하지 않는다.
- `npm run typecheck`: 5 workspace PASS. `npm run test:mock`: **48 passed / 0 failed / 0 skipped**, 26.66s.
- `uv run alembic heads`: **0024 (head) 하나**. 별도 로컬 `farmclub_dev179_migration`에서 upgrade head → alembic check(변경 없음) → downgrade0023 → upgradehead 통과. tracking_version NOT NULL·기존 행 기본값1 스키마 확인.
- E2E source-editor/source-review-regressions/checkout-and-fulfillment/new-product-composer에 tsc bundler 정적 검사 PASS(실제 브라우저 테스트 통과가 아님). 새 회귀는 사진 없는 분석/공개 차단·진행1개·실패쪽 분리·확인 저장 덮어쓰기/구키 이관·현재 문구 provenance·출하 후 수정/최신 배송 조회를 검증한다. 배송 조회는 window.open을 가로채 외부 택배 요청을 보내지 않게 했다.
- 브라우저 실행 시도: 로컬 Mock dev 서버가 ::1:8081 EADDRINUSE로 종료. Chromium 직접 launch도 macOS bootstrap_check_in MachPortRendezvous Permission denied(1100)로 실패하여 **Playwright 실행0건**. sandbox 밖 관련 spec 실행 필요. Figma는 기존 DEV-185 후속 유지.
- 테스트 독립성: 구현을 읽지 않은 test-writer의 사양 회귀를 사용했다. 사실 충돌 제거 + 감사 기록 제거 in-process mutation은 **6 failed**로 red를 확인(소스 파일 변형 없음), 최종 정상 코드의 해당 회귀는 위42건에 포함해 green 확인. 독립 diff 검토가 찾은 동일 중량의 품종/구성 누락을 수정하고 원본 재현7건에서 확인했다.
- 테스트 준비 문제도 수정: 기존 stale-refinement 회귀의 original_id는 사진을 임의 선택할 수 있어 텍스트 자료로 좁혔다. Mock 신규 회귀는 테스트 로그인 불가능한 실물형 seed 소비자 대신 테스트 소비자의 준비 주문을 출하해 준비한다. 기존 단언은 삭제/약화하지 않았다.
- 최종 범위 감사: 미커밋/새 파일53경로가 기록 범위 안. `git diff --check` PASS. 지정 base `7e88039...HEAD` 변경0경로, 로컬 main 대비681경로는 기존 커밋 이력이다. tasks.md 삭제0줄(append-only). commit/push/PR/live/paid/배포 없음.

#### 의도한 커밋 분리 (실행하지 않음)
1. `fix(source-analysis): FEAT-04/07 conflicts and failure diagnostics (DEV-179)` — 서버 사실 충돌/페이지 진단 + 관련 서버 테스트·스펙.
2. `fix(producer): FEAT-04/07 editor recovery and previews (DEV-179)` — 편집/시트/미리보기/제외 확인 저장 + UI 회귀·스펙.
3. `feat(orders): FEAT-17 shipped tracking corrections and audit (DEV-179)` — API·migration0024·기존 감사 이벤트·Mock·재사용 UI + 권한/멱등/감사/소비자 조회 테스트·FEAT17/SCR29/R19/wiki.
4. `fix(orders): FEAT-09 deposit confirmation and order totals (DEV-179)` — 기존 미커밋 입금 확인 시트/주문 총액 + 관련 회귀·문서.
- Agent 시간 / Tokens: 이 하네스에서 정확한 계측 미제공.

- 최종 E2E 정적 검토 보완: 현재 제안 확정 회귀의 의도적503이 엄격한 monitor를 실패시키므로 정상 draft 응답으로 바꾸고 성공 안내·제출 provenance를 함께 검증하도록 수정했다. monitor나 단언을 약화하지 않았다. 구 sessionStorage는 사용자 지정 bare 형식과 실제 HEAD의 namespaced 형식을 모두 읽고 제거한다.


### DEV-179 재리뷰 수정 · 2026-11-02 (사용자 지시, append-only)

#### 범위 (코드 수정 전)
- 기존 DEV-179 범위를 유지하며 `packages/ui/spec.md`의 삭제된 미리보기 경로 설명을 수정한다.
- `server/tests/test_dev179_review.py`의 모든 테스트·단언을 `test_orders.py` / `test_source_editor.py`로 이동한다. 새 테스트 묶음은 만들지 않는다.

#### 결정 사항
- OCR/청크 혼합 실패는 각 안내 정확히 1개, 내부 오류·빈 결과 안내 0개로 검증한다. 알려진 오류는 비용 동의 후 재시도 enabled를 복구하고 REQUEST_UNCERTAIN은 HEAD의 disabled 기대를 유지한다.
- 현재 정리 결과가 없는 summary/storage/farmStory 복수 원문 후보는 선택 가능 상태로 유지한다. 병합 성공 서술은 선택기 없이 자동 저장하며 성공 정리에서 생략한 필드·안전성 필터·outdated·생산자 확정/제외는 보존한다. 원래 summary/storage 회귀와 composition 변형을 함께 검증한다.
- 유일하게 커밋된 sessionStorage `farmclub-producer:excluded-seen:${batchId}:${version}`만 로그인 사용자 키로 이관/제거한다. 사용자 없는 동안에는 이관하지 않는다. 미커밋 중간 bare/session·version/local 호환 및 정리 루프를 제거한다.
- Mock 송장 정정은 본문 400 검증 후 상태/버전 409 검사, 정정 테스트 ID는 AC-17-9로 맞춘다. 모든 이동 단언을 보존한다.

#### 기록
- 사용자가 제공한 sandbox 밖 전체 pytest **1281 passed**는 이번 수정 전 결과다. 이번 요청의 ruff·관련 pytest·typecheck·Mock 결과는 실행 후 별도 추가한다.
- 기존 미커밋 변경 유지. commit/push/PR/live/운영/유료 호출 금지. Figma 후속 DEV-185 유지。


#### DEV-179 재리뷰 반영 / 검증 결과 · 2026-11-02
- #1 DEV-190 혼합 실패 E2E는 OCR/청크 안내 각 1개 및 오류/빈 결과 0개를 검증하도록 수정했다.
- #2 현재 정리가 없는 서술 복수 후보의 conflict 선택기를 복구했다. 원래 summary 원자성 회귀와 storage target/shared 회귀를 복원하고 composition 변형을 유지했으며 summary/farmStory target/shared 사례도 추가했다. 성공 병합/생략·안전성·outdated·명시적 결정은 유지한다.
- #3 HEAD 확인 결과 REQUEST_UNCERTAIN disabled 기대를 유지했다. OCR_PAGES_FAILED·EXTRACT_CHUNKS_FAILED·혼합 알려진 오류는 비용 체크 전 disabled, 체크 후 enabled를 모두 검증한다.
- #4 6c259ac의 실제 sessionStorage namespaced 키만 이관한다. bare 읽기/삭제·version-suffixed local fallback·stale-key 정리 루프를 제거하고 사용자 없는 동안 entries를 만들지 않아 anonymous 이관을 막았다. E2E seed·제품/구현 spec·영문 wiki를 맞췄다.
- #5 UI spec은 PageCanvas → ModuleStory 미리보기 경로로 수정했다. Mock 정정은 본문400을 상태/버전409보다 먼저 검사하고 기존 Mock 회귀에 두 우선순위 단언을 추가했다. 정정 관련 테스트 ID를 AC-17-9로 맞췄다. test_dev179_review.py의17 테스트 함수를 모듈별로 이동했으며 helper 포함73 assert가 AST상 동일함을 확인했다.
- `cd server && UV_CACHE_DIR=/private/tmp/dev179-uv-cache uv run ruff check . && UV_CACHE_DIR=/private/tmp/dev179-uv-cache uv run pytest tests/test_source_editor.py tests/test_source_refine.py tests/test_orders.py`: ruff PASS. pytest **396 collected / 396 setup errors / 본문 실행0건**, 2.92s. sandbox가 localhost:5432 PostgreSQL 연결을 Operation not permitted로 차단했다. 기본 URL 대신 임의 DB/운영 DB로 연결하지 않았다. 초기 ruff2건(import 정렬·긴 함수 선언)은 수정 후 전체 ruff 재통과했다.
- `npm run typecheck && npm run test:mock`: 타입5 workspace PASS, Mock **45 passed / 3 failed / 0 skipped**, 26.49s. 잘못된 본문 우선순위 단언 추가 후 `npm run test:mock` 재실행도 **45 passed / 3 failed / 0 skipped**, 27.28s. DEV-179 AC-17-9 정정 회귀는 최종 실행 통과. 3실패는 test-news-rooms/test-onboarding/test-withdrawal의 Mock server exited이며 서버 직접 시작으로 `listen EPERM 127.0.0.1:18083` sandbox 제한을 확인했다. 기존 테스트/서버를 우회하거나 약화하지 않았다.
- 수정한 source-review-regressions/checkout-and-fulfillment E2E 2개 파일의 `npx --no-install tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck --types node ...` PASS. **브라우저 E2E 실행하지 않음**. 정적 검사를 E2E 통과로 간주하지 않는다.
- 사용자 제공 sandbox 밖 전체1281 통과는 수정 전 기준이며 이번 검증을 대체하지 않는다. 테스트 완료/AC 체크는 보류한다. sandbox 밖에서 지정 pytest와 Mock/E2E 재확인이 필요하다.
- 범위 감사: 이 세션 수정19경로(테스트 이동 포함)는 위 추가 범위 안. 기존 main...HEAD681경로는 기존 이력으로 유지했다. 기존 파일 스냅샷 대비 두 tasks.md prefix 동일(append-only), git diff --check PASS. 기존 미커밋 작업을 보존했다. commit/push/PR/live/운영/유료 호출 없음.
- 의도한 커밋 분리는 앞선4개를 유지(실행하지 않음): source-analysis FEAT-04/07 충돌·진단, producer FEAT-04/07 편집·미리보기·확인 저장, orders FEAT-17 정정·감사·Mock, orders FEAT-09 입금 확인·총액. Agent 시간 / Tokens: 정확한 계측 미제공.

#### DEV-179 E2E 실패 원인·수정 · 2026-11-02 (Claude Code, 브라우저 실행)
- 테스트 버그 `source-review-regressions`: 구성 필드 라벨이 `구성 내용`이었으나 실제 접근성 라벨은 `상품 구성 내용`(SOURCE_MODULES 제목 + " 내용") → 라벨 수정(선택지 2개·provenance 1개 통과).
- 테스트 버그 ETA 단언: `/예상.*(?:시간|분|초)/`가 형제 요소 텍스트를 이어 붙인 컨테이너("당도 예상 … 내용 분석")에 걸림. 한 문구 안의 ETA 표현(`예상 (소요) 시간`, `예상 N분`, `N분 남음/후`, `남은 시간`, `ETA`)만 잡도록 좁힘. 또 PDF 첨부 타일의 1쪽 썸네일 `/pages/1/image`가 스텁되지 않아 monitor 404 → `serveContractReview`에 1×1 PNG 스텁 추가.
- 테스트 버그 탭 간 제외 확인: 시드에 `강미숙` 계정이 없고(승인 생산자는 강영수뿐), 로그인 상태의 `/login`은 홈으로 보냄 → `/api/auth/me` 응답의 userId만 다른 생산자로 바꿔 사용자별 키를 검증.
- 제품 버그 `SourceExclusions.tsx`: 모달 배경 Pressable에 role이 없어 `닫기` 버튼으로 노출되지 않음 → `accessibilityRole="button"` 추가.
- 테스트 버그 `checkout-and-fulfillment`: 확인 시트·주문 줄은 SCR-29대로 주문 총액(상품가 + 배송/도서 비용, 32,000원)을 보이는데 테스트는 옵션가 29,000원을 하드코딩 → 생산자 API의 `totalAmount`로 기대값 계산. 또 이전 실행의 입금 대기 주문이 남으면 `.first()`가 다른 주문을 승인 → `${orderNo} 입금 승인`으로 이 주문만 누르고 confirm-deposit 응답을 기다림.
- `SOURCE_ANALYSIS_ENABLED=true`로 켜야 도는 테스트도 확인: `new-product-composer`의 빈 새 상품 `AI로 채우기` 기대를 enabled → disabled + "자료를 먼저 넣어 주세요."로 복구(사진 없이 분석 가능, 자료 없이는 불가 — DEV-179 계약 테스트와 일치). `source-workspace-ui` 새로고침 뒤 품종 칸은 AI 시트 안이라 `사진·자료 펼치기` 후 확인. `source-editor` 사진 필수 오류는 접힌 시트 안 사본이 숨겨져 있어 보이는 page alert로 범위 지정. 분석 완료 대기에는 로컬 mock worker(`python -m app.source_analysis.worker`)가 필요하다.
- 검증: `npm run typecheck` PASS. 매 실행 전 seed reset 후 `SOURCE_ANALYSIS_ENABLED=true npx playwright test` 7개 spec `--workers=1` 3회 연속 **70 passed / 0 failed / 0 skipped**. 서버 코드 변경 없음(pytest 미실행). commit/push 없음.


### DEV-179 최종 리뷰 후속 · 2026-11-02 (사용자 지시, append-only)

#### 범위 (코드 수정 전)
- `server/app/source_analysis/editor.py`, `server/tests/test_source_editor.py`
- `apps/producer/src/lib/{SourceWorkspace,NewProductComposer,SourceBasicInfo}.tsx`
- `packages/api/src/mock/orders.ts`, `scripts/test-spec12.mjs`
- `server/app/source_analysis/spec.md`, `apps/producer/spec.md`, `docs/spec/source-editor.md`, `docs/wiki/Requirements-and-Specifications.md`
- 작업 기록은 `apps/producer/tasks.md`·`server/tasks.md` 끝에만 추가한다.

#### 결정 사항
- 정리 결과가 없거나 pending(None)인 사실 필드는 안전한 현재 원문 후보를 정규화한다. 한 값이면 대표 후보를 ready/EXTRACTED로 제안하고, 여러 값이면 서술과 같이 conflict로 선택기를 제공한다. 성공 정리의 생략·안전 필터·outdated·생산자 확정/제외 우선순위는 유지한다.
- SourceWorkspace의 미사용 sourcePageImage import를 제거한다.
- Mock 송장 정정의 본문 검증을 idempotency/주문 조회보다 앞에 둔다(400 → 멱등 → 404 → 409). 기존 테스트를 약화하지 않고 우선순위 회귀를 보강한다.
- Composer는 로딩 전후 BasicInfo 래퍼를 유지하고 nullable batch를 기본 정보 훅에서 안전하게 처리한다. URL batchId로 key를 유지해 최초 로드의 하위 트리 remount를 없앤다.
- 사용자 지시에 따라 commit/push/PR/live 호출 없이 지정 서버·타입·Mock 검증을 실행한다. 신규 후보 테스트는 구현 블라인드 작성 및 수정 전 실패 확인을 수행한다.

#### 작업 / 검증 대기
- [ ] 위 네 리뷰 항목 수정 및 지정 명령 실행 후 결과를 아래에 추가한다.

#### 최종 리뷰 후속 추가 결정 (독립 diff 검토)
- 기존 12.0/12 Brix 동등성도 정리 없음/대기 상태의 대표 후보 정규화에 적용한다. 다른 텍스트는 보존하면서 Brix 단위 숫자만 정규화하고 absent/pending 회귀를 추가한다.


#### DEV-179 최종 리뷰 후속 결과 · 2026-11-02
- 네 항목 구현 적용: 정리 없음/대기(None)의 사실 후보는 정규화 후 한 값이면 대표 원문/candidateIds를 ready/EXTRACTED로 제안하고 여러 값이면 선택 가능 상태를 유지한다. SourceWorkspace 미사용 import를 제거했다. Mock 본문 검증은 멱등/주문 조회보다 앞에 두었다. Composer의 BasicInfo 래퍼·URL batchId key는 로딩 전후 유지하고 공용 훅은 null batch를 처리한다.
- `server/tests/test_source_editor.py`에 사양만 본 별도 작성자가 absent/pending 16개 사례를 추가했다(요청한 kg/g·보완 규격·Brix 없는 품질 근거, 네 사실 필드의 유니코드/공백 동등성, 12.0/12 Brix). 기존 테스트·단언은 삭제하거나 약화하지 않았다.
- 최종 명령: `cd server && uv run ruff check . && uv run pytest tests/test_source_editor.py tests/test_source_refine.py tests/test_orders.py` (UV_CACHE_DIR=/private/tmp/dev179-uv-cache, UV_OFFLINE=1, DATABASE_URL은 localhost의 격리 farmclub_dev179). Ruff PASS, pytest **0 passed / 0 assertion failures / 412 setup errors**, 2.88s. 공통 _schema의 localhost:5432 연결이 Operation not permitted로 거부되어 모든 본문이 실행되지 않았다. 로그: `/private/tmp/dev179-final-server-tests.log`. 신규 서버 회귀의 red/green도 같은 fixture 제한 때문에 입증하지 못했다. 전체 서버 검증은 미완료이며 sandbox 밖에서 위 명령 재실행 필요.
- `npm run typecheck && npm run test:mock`: 5 workspace 타입 검사 PASS; Mock **45 passed / 3 failed / 0 skipped**, 30.87s. 송장 정정 회귀는 통과했다. 실패는 test-news-rooms / test-onboarding / test-withdrawal의 Mock server exited이며, 로컬 socket 직접 확인도 `listen EPERM 127.0.0.1:18083`으로 실패했다. 테스트/fixture/서버 우회 없음. 로그: `/private/tmp/dev179-final-mock-tests.log`.
- Mock fail-first: HEAD의 orders.ts만 메모리에서 transpile해 생성된 Mock JS에 일시 적용한 뒤 기존 사양 테스트를 실행했다. **5 passed / 1 failed**, 회귀는 missing order의 400 기대에 기존 404로 실패했다. 생성 JS는 finally에서 원복했다. 정상 코드의 `node --test scripts/test-spec12.mjs`는 **6 passed / 0 failed / 0 skipped**, 31.08s. 로그: `/private/tmp/dev179-mock-baseline.log`, `/private/tmp/dev179-final-mock-focused.log`.
- 독립 diff 리뷰가 지적한 Brix 소수 동등성 누락을 수정했고 재검토 추가 지적 0. 문서도 정리된 보완 사실과 정리 전 원문 선택의 구분을 동기화했다. 브라우저 검증은 실행하지 않았다.
- 범위 감사: 이번 미커밋 변경 13개 경로가 사전 기록 범위 안이다. `git diff main...HEAD` 683개 경로는 기존 커밋 이력이며 HEAD는 `76ea0037ed5b4ecea635f52005871d30c62cc5e2`로 유지했다. `git diff --check` PASS, 두 tasks.md의 원본 바이트 전체 보존(append-only) PASS. 필수 검증이 막혀 완료 체크는 하지 않는다.
- 의도한 커밋(실행하지 않음): `fix(source-analysis): FEAT-04/07 preserve raw fact choices (DEV-179)`; `fix(producer): FEAT-04/07 preserve composer mount (DEV-179)`; `fix(mock): FEAT-17 validate tracking before idempotency (DEV-179)`. 각 코드의 회귀·관련 스펙·append-only 기록을 함께 묶는다.
- commit/push/PR/live 호출 없음. Agent 시간 / Tokens: 정확한 계측 미제공.

### DEV-179 데모 녹화 후속 · 2026-11-02 (사용자 지시, append-only)

#### 범위 (코드 수정 전)
- `apps/producer/src/lib/{NewProductComposer,SourceWorkspace}.tsx`, 공용 오류·비용 안내 `apps/producer/src/lib/sourceFeedback.ts`
- `scripts/e2e/{source-review-regressions,source-editor,new-product-composer}.spec.ts`
- `apps/producer/spec.md`, `apps/producer/tasks.md`, `docs/spec/{source-editor,source-analysis}.md`, `docs/wiki/Requirements-and-Specifications.md`

#### 결정 사항
- 기준은 지정 worktree HEAD `596d669394f5dfb514b6784a9f731bc012904223`. commit/push/PR/live 호출·브라우저 실행 없이 후속 수정한다.
- Composer의 `details.fields.representativePhoto` 사유 매핑을 공용 처리로 옮겨 Workspace에도 사용한다. Workspace 적용 확인 버튼 곁에 오류를 표시하며 새 시도·취소 시 지운다. 재조회는 네트워크/불확실 결과에만 제공하고 입력 검증에는 숨긴다.
- 재시도 대상 run에 REQUEST_UNCERTAIN 항목이 하나라도 있으면 기존 비용 문구를 유지하고, 아니면 ‘다시 분석하면 비용이 다시 들 수 있어요. 확인했어요.’를 사용한다. 비용 체크/해제·새 run 초기화 gate는 유지한다.
- Composer 분석 진행 영역의 220px 및 짧은 Skeleton 2개는 SourceRunProgress와 중복되는 로딩 자리이므로 제거한다. 최초 상품 로딩 Skeleton은 유지한다.
- 각 항목의 Playwright 회귀를 추가/보강한다. 브라우저 실행은 사용자 지정대로 sandbox 밖 Claude가 수행한다. 스펙/영문 wiki를 동기화하고 Figma v6는 기존 DEV-185 후속으로 남긴다. 구매자 미리보기 배너 내용은 변경하지 않는다.

#### 검증 대기
- [ ] `npm run typecheck`, `npm run test:mock` 실행 결과를 아래에 추가한다.
- [ ] Claude: 관련 Playwright spec 브라우저 실행.

#### DEV-179 데모 녹화 후속 결과 · 2026-11-02
- #1/#2: Composer의 representativePhoto 사유 매핑을 `sourceFeedback.ts`로 추출해 두 화면이 공유한다. Workspace 적용 확인 버튼 바로 앞에 사유를 표시하고 취소/재시도 시 이전 오류를 지운다. 검증 오류에는 서버 재조회 버튼을 숨기고 네트워크·timeout·서버 오류에는 유지한다.
- #3: REQUEST_UNCERTAIN 포함 여부로 비용 문구를 공유 선택한다. 기존 ack gate·새 run/성공 후 초기화는 유지했다. 제품 스펙·앱 구현 결정·영문 wiki를 동기화했다.
- #4: SourceRunProgress 아래의 220px 회색 Skeleton과 20px 줄 2개는 중복 로딩 표시임을 코드로 확인해 제거했다. 최초 상품 정보 로딩 Skeleton은 유지했다. 구매자 미리보기 배너는 변경하지 않았다.
- 회귀: `source-review-regressions.spec.ts`에 5개 추가(비공개 저장→검토→사진 누락 적용 오류/취소 초기화 1개, 화면별 네트워크 재조회 2개, 화면별 확정 OCR·청크/불확실/혼합 비용 문구 및 체크/해제/성공 후 초기화 2개). 기존 OCR/청크 문구 기대를 갱신하고 진행 테스트에 시트 열기/닫기 모두 중복 Skeleton 0개 단언을 추가했다. `source-editor.spec.ts`의 실제 composer 사진 누락 적용 회귀에는 재조회 버튼 0개 단언을 추가했다. 기존 테스트/안전 단언은 삭제·약화하지 않았다.
- `npm run typecheck` → 5 workspace PASS / 0 오류.
- `npm run test:mock` → **45 passed / 3 failed / 0 skipped**, 31.26s. 실패는 `test-news-rooms.mjs`, `test-onboarding.mjs`, `test-withdrawal.mjs`의 `Mock server exited`. `FARMCLUB_MOCK_PORT=18083 FARMCLUB_MOCK_DIR=/private/tmp/dev179-demo-mock node scripts/mock-server.mjs`로 `listen EPERM 127.0.0.1:18083` sandbox 제한을 직접 확인했다. 테스트/서버 우회 없이 남겼으며 sandbox 밖 재실행 필요.
- `./node_modules/.bin/tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --resolveJsonModule --esModuleInterop --skipLibCheck --types node scripts/e2e/source-review-regressions.spec.ts scripts/e2e/source-editor.spec.ts` → 종료 0. `./node_modules/.bin/playwright test scripts/e2e/source-review-regressions.spec.ts scripts/e2e/source-editor.spec.ts --list` → **49 tests / 2 files** 수집 성공. 이는 브라우저 테스트 통과가 아니다. 브라우저 실행 0회이며 Claude가 sandbox 밖에서 같은 두 spec을 실행해야 한다(`source-editor`는 SOURCE_ANALYSIS_ENABLED=true·로컬 worker 필요).
- 서버 코드 변경 없음: 조건부 ruff 실행 대상 아님. `git diff --check` PASS, `apps/producer/tasks.md`의 HEAD 원본 바이트 전체 보존으로 append-only PASS. 이번 변경 10개 경로는 사전 범위 안이며 `git diff main...HEAD`의 683개 경로는 기존 커밋 차이다. HEAD는 `596d669394f5dfb514b6784a9f731bc012904223` 유지. 전체 Mock·브라우저 검증 전 완료 체크는 보류한다.
- 의도한 커밋(실행 안 함): `fix(producer): FEAT-04/07 적용 오류와 재조회 안내 수정 (DEV-179)`; `fix(producer): AC-SRC-5 재분석 비용 확인 문구 구분 (DEV-179)`; `fix(producer): AC-SRC-4 중복 분석 스켈레톤 제거 (DEV-179)`. 각 변경에 관련 회귀·스펙·기록을 함께 묶는다.
- commit/push/PR/live 호출 없음. Figma v6는 기존 DEV-185 후속. Agent 시간 / Tokens: 정확한 계측 미제공.

### DEV-179 데모 후속 보완·검증 (Claude, sandbox 밖, 2026-11-02)
- 스캔 지적 반영:
  - `sourceActionError`는 입력 검증(400·필드 사유)만 재조회를 숨긴다. 409 충돌, 네트워크, 서버 오류에는 '서버 상태 다시 확인'을 유지한다.
  - 연결 실패(TypeError)는 한국어 안내를 보인다.
  - 앱 안에서 던진 한국어 검증 오류(예: 품종 누락)는 메시지를 그대로 보이고 재조회 버튼은 숨긴다.
- Workspace 적용 거절 사유는 `applyError`로 분리해 적용 확인 패널에만 한 번 표시한다(상단 중복·폴링 오류 혼입 제거). 409 적용 충돌 회귀 테스트를 추가했다.
- 테스트 보완:
  - 의도적으로 400/409를 반환하는 테스트의 브라우저 리소스 로그는 허용 목록에 넣었다.
  - `source-analysis.spec.ts`는 재시도 전에 비용 확인을 체크한다.
  - `source-editor.spec.ts:467`은 백그라운드 worker 대신 큐를 직접 비운다.
- Playwright(sandbox 밖, 새 번들, 백그라운드 worker 없음): source-review-regressions·source-editor·source-workspace-ui·new-product-composer·source-analysis·new-product-two-step·product-page-workspace에서 **76 passed / 0 failed**. `npm run typecheck` PASS.

### DEV-179 머지 전 스캔 반영 (Claude, 2026-11-02)
- owner 결정: 판매 설정 전 새 상품 구매자 미리보기에서 재고·마감·배송비 줄을 숨긴다(`sale` 슬롯을 빈 fragment로 전달, 판매 단계가 있으면 기본 표시).
- scan-before-merge 반영:
  - `factual_conflict`가 `normalize_fact_value`와 같은 당도 정규식을 써서 `12°Brix`/`15°Brix` 충돌을 잡는다.
  - review `conflicts.candidateIds`는 판정과 같은 비-historical 후보만 담는다.
  - `sourceActionError`는 400이면서 field 사유가 있을 때만 재조회를 숨기고, 첫 field 사유를 메시지로 쓴다.
  - Workspace는 `api.apply` 거절만 확인 패널에 두고, 적용 성공 뒤 재조회 실패는 페이지 오류로 보낸다.
  - 품종 메시지 중복을 제거했다.
  - 충돌 선택지는 정규화 값으로 묶는다.
  - Composer `render`의 basic 인자를 non-null로 정리했다.

## DEV-198 [I3] 평가 로그인 주소 (/login?evaluator=1)
- 이슈: https://linear.app/sswp6/issue/DEV-198
- 범위: 로그인 화면(`src/app/login.tsx`), `scripts/e2e/evaluator-login.spec.ts`, `docs/spec/ia.md`, `docs/spec/screens.md`, wiki 요약
- 결정
  - 11/4 수업 Heuristic Evaluation용이다. 운영은 카카오가 켜져 있어 테스트 계정 목록이 숨겨져 있다.
  - 주소에 `evaluator=1`이 있을 때만 카카오 버튼과 함께 목록을 보인다. 표시가 없으면 지금처럼 카카오만 보인다.
  - 서버 Mock 플래그(`MOCK_LOGIN_ENABLED`)는 바꾸지 않는다. 플래그가 꺼지면 목록은 오류 상태가 되고 로그인은 서버가 거절한다.
  - 일반(아이디·비밀번호) 로그인은 만들지 않는다(진우 결정).
- 검증(sandbox 밖 로컬 스택): `evaluator-login`·`consumer-kakao`·`producer-kakao` spec 10 passed. `mock-login` 2건은 공유 Mock이 없어 skip. typecheck 통과.
- 스캔 반영
  - 평가 모드는 처음 들어올 때 sessionStorage(`farmclub:evaluator`)에 기억한다. 같은 탭에서 로그아웃하거나 관문을 거쳐 맨 `/login`으로 와도 목록이 남는다.
  - "Mock:" 안내 문구는 앱 Mock 모드에서만 보인다. 운영 평가 모드에서는 원래 카카오 안내를 쓴다.
  - 회귀 테스트에 두 가지를 추가했다: Mock 문구가 없는지, 표시 없이 다시 들어와도 목록이 남는지. 10 passed.
- 평가 뒤 할 일(사람)
  - 시드 계정은 평가 동안 공용 계정이 된다.
  - 평가가 끝나면 '강씨네 귤밭'을 다시 숨긴다.
  - 필요하면 운영 `MOCK_LOGIN_ENABLED`를 끈다. 끄면 이 주소는 '지금은 로그인할 수 없어요'로 막힌다.

## DEV-33 생산자 앱 EAS 네이티브 빌드 전환

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 목표·결정·검증 기록은 `apps/consumer/tasks.md#DEV-33`에 모은다.
- 범위: `app.json`·`eas.json`·`vercel.json`·`public/{index.html,manifest.webmanifest,.well-known/**}`, `src/app/login.tsx`·`src/app/auth/kakao.tsx`, `src/lib/kakao.native.ts`·`kakaoAuth(.native).ts`(새 파일), `src/lib/pick.native.ts`·`sourceFiles.native.ts`(새 파일), `sourceFiles.ts`(`PickedFile` 타입)·`SourceAttachments.tsx`(`PickedFile`, 네이티브 미리보기 uri), `DetailEditor.tsx`·`ProductPageEditor.tsx`·`SourceWorkspace.tsx`(beforeunload는 웹에서만), `views.tsx`(copyText).
- 10/23 결정: 식별자 `kr.farmclub.producer`, 복귀 주소 `https://farm.farmclub.kr/auth/kakao`(서버 값 그대로), 앱 스킴 `farmclub-producer`. `kakao.ts`(웹)는 기존 export의 동작을 그대로 두고 앱 전달용 export(`appReturnUrl`·`forwardToApp`·`kakaoCallbackUri`·`parseKakaoReturn`·`appOrigin`)만 더해 `scripts/test-producer-kakao.mjs`가 그대로 돈다. 원본 자료 사진 picker 품질은 소비자와 같은 0.8. 원본 자료 PDF·텍스트 첨부는 웹 전용(네이티브는 사진만).
- [x] 설정·의존성 [x] 카카오 네이티브 복귀 [x] 사진·영상 선택 [x] beforeunload·복사 가드 [x] well-known·manifest

## DEV-200 [I3] Show evaluator test accounts in native internal builds for HE
- 이슈: https://linear.app/sswp6/issue/DEV-200 · 관련 DEV-198(웹 평가 주소), DEV-41(기기 확인)
- 브랜치: `zahra/dev-200-native-evaluator-login`
- 범위: 두 앱 `src/app/login.tsx`, `packages/api/src/{client.ts,index.ts}`, `scripts/e2e/evaluator-login.spec.ts`, `scripts/test-native-config.mjs`, `README.md`(EAS 절 한 줄), 두 앱 `tasks.md`, 평가 안내 `docs/evaluation/he-2026-11-04/README.md`
- 결정
  - 11/3 11/4 수업 HE 평가자는 팀 기기의 internal APK를 쓴다. 앱에는 주소창·sessionStorage가 없어 `?evaluator=1`(DEV-198)을 줄 수 없으므로, 빌드 변수 `EXPO_PUBLIC_EVALUATOR_LOGIN=1`이면 `evaluatorMode()`가 항상 참이다.
  - 변수는 EAS `preview` 환경에만 등록한다(internal APK가 따라가는 채널). `eas.json`·웹 배포에는 넣지 않는다(`test-native-config.mjs`가 검사). production 채널·운영 웹은 그대로 카카오만.
  - 서버 `MOCK_LOGIN_ENABLED`는 바꾸지 않는다(DEV-198과 같음).
- 검증(11/3, 로컬 실서버 `farmclub_i3`): `npm run typecheck` 통과 · `npm run test:mock` 63/63 · `run-integration.mjs evaluator-login.spec.ts` 플래그 없이 4 passed/2 skipped, `EXPO_PUBLIC_EVALUATOR_LOGIN=1`로 2 passed/4 skipped.
- 평가 뒤 할 일(사람): EAS `preview` 환경에서 `EXPO_PUBLIC_EVALUATOR_LOGIN` 삭제 → `eas update --channel preview --environment preview`로 일반 업데이트.

## DEV-209 [HE 후속] 정지·반려 화면의 "[운영팀 연락처]" 자리표시자와 운영팀 문의 경로

- 이슈: https://linear.app/sswp6/issue/DEV-209 · GitHub #392 · 근거: HE 사전 점검 `he-claude-2026-11-03.md` P2(심각도 3)·P9(심각도 2), PR #388
- 브랜치: `nemodleo/dev-209-suspended-contact`
- 기준: FEAT-01(E2·E3), FEAT-34(AC-34-1~3), 규칙 M-16·M-22·R-24, ia.md SCR-19 하위 정지 안내·SCR-21, docs/design/README.md(상태 화면 머리·강조색 규칙), Figma v6(보기 권한)
- 상태: 리뷰 중 — 11/04 PM 승인 뒤 2단계 구현

### 목표
정지된 농가와 반려된 농가가 화면 안에서 farmclub 운영팀에 닿을 수 있게 한다. 자리표시자 문구는 없앤다. 연락처 값을 화면 코드에 박지 않고 이미 있는 farmclub 대화방(FEAT-34)을 정지·반려 상태에서도 연다. 메일은 값이 있을 때만 보조로 보인다.

### 범위 (수정 허용 경로)
- 1단계(이번): `docs/design/proposals/dev-209-suspended-rejected-contact.html`(새 보드), `apps/producer/tasks.md`, `server/tasks.md`
- 2단계(승인 뒤): `apps/producer/src/app/suspended.tsx`, `apps/producer/src/app/pending.tsx`, `apps/producer/src/app/support.tsx`(새 파일), `apps/producer/src/lib/gate.ts`(관문 허용 경로, 처음 적은 session.tsx가 아니라 관문 규칙이 있는 gate.ts), `packages/api/src/endpoints.ts`, `packages/api/src/mock/{conversations.ts,db.ts,router.ts}`, `packages/ui/src/ChatThread.tsx`(입력칸 안내 문구 `placeholder` prop만), `scripts/test-producer-gate.mjs`, `scripts/test-producer-support.mjs`(새 파일), `package.json`(`test:mock` 목록에 한 줄), `scripts/e2e/producer-support-contact.spec.ts`(새 파일), `docs/spec/functional/{FEAT-01-login.md,FEAT-34-farmclub-support.md,rules.md}`, `docs/spec/{ia.md,screens.md}`, `docs/wiki/{Requirements-and-Specifications.md,Design-Documentation.md}`, `docs/design/screens/{s-19-suspended.html,s-21-rejected.html}`, `docs/design/proposals/dev-209-suspended-rejected-contact.html`. 서버 범위는 `server/tasks.md#DEV-209`.

### 비범위 (건드리지 않음)
- 확인 중(PENDING) 화면의 문의 경로(운영팀이 전화로 확인하는 단계)
- 관리자 반려 사유 최소 글자 수(후속 후보, 보드 "시드와 운영 데이터" 절)
- 운영 DB·운영 변수 변경(사람이 실행)
- Figma v6 반영(보기 권한뿐, 후속 요청)

### 결정 사항
- 11/04 제안(PM 승인 대기): 기본 수단은 farmclub 대화방이다. 새 주소 `/support`(탭 밖)에서 정지·반려 생산자가 자기 farmclub 방만 연다. 정지 화면은 '운영팀에 문의하기'가 주 버튼이고, 반려 화면은 '다시 신청하기'가 주 버튼이며 문의는 글자 버튼이다(화면당 강조 하나).
- 11/04 메일 줄은 이미 있는 빌드 변수 `EXPO_PUBLIC_BUSINESS_EMAIL`(`packages/ui/src/legalContent.ts`의 `business.email`)을 쓰고, 비면 줄을 그리지 않는다. 새 서버 설정은 만들지 않는다. 값은 레포에 쓰지 않는다.
- 11/04 오미숙(`f-wimi`)은 시드에서 PENDING이고 반려 사유가 없다. "테스트"는 운영 관리자 페이지에서 손으로 반려한 값이므로 시드는 그대로 두고, 운영 DB를 확인 중으로 되돌리는 명령을 준비한다(실행은 사람). 반려 예시는 박순자(`f-reject`)다.
- 문구·무브 6개·스펙 줄 목록은 보드에 있다.

- 11/04 PM 결정: Q1 대화방 + 메일 줄. Q2 반려 농가에도 방을 연다(AC-34-1 수정, AC-34-9 추가). Q3 메일은 기존 `EXPO_PUBLIC_BUSINESS_EMAIL`(`business.email`), 새 변수 없음. Q4 오미숙은 '확인 중'으로 되돌린다. 되돌리는 관리자 API는 없어 반려 농가 재신청 API(앱의 '다시 신청하기'와 같음)로 사람이 실행한다(PR 본문 "사람이 할 일"). Q5 정지 중 문의도 사진 첨부 허용.
- 11/04 구현: `/support`는 탭 밖 화면이고 지금 farmclub 방과 같은 `ChatThread`를 쓴다. 뒤로는 상태 화면으로 `replace`한다(정지 → `/suspended`, 반려 → `/pending`, 승인 → 채팅 목록). 승인 농가는 채팅 탭의 기존 방(`/chats/u-farmclub`)을 그대로 쓴다.
- 11/04 반려 화면의 '운영팀에 문의하기'는 하단 글자 버튼 줄(로그아웃·회원 탈퇴와 같은 줄, 줄바꿈 허용)에 둔다. 주 버튼은 '다시 신청하기' 하나다.
- 11/04 Mock 관문(`mock/router.ts`)은 `/api/messaging/producer/support/`를 승인 검사에서 빼고, 상태 검사는 그 라우트(`farmSupport`)가 서버와 같게 한다.

### 작업
- [x] 이슈·스펙·코드 읽기, Linear In Progress
- [x] before/after 디자인 제안 보드
- [x] PM 승인(Q1~Q5 답)
- [x] 2단계 구현·테스트·스펙/위키·지금 버전 보드 맞추기
- [ ] AI 1차 리뷰, draft 해제, 사람 리뷰

### 기록
- 11/04 검증(로컬, Docker PostgreSQL `farmclub_dev209`): `npm run typecheck` 5 workspace 통과. `npm run test:mock` 66 passed / 0 failed. `node scripts/run-integration.mjs producer-support-contact.spec.ts discovery-and-gates.spec.ts` 통합 시나리오 7 passed, Playwright 5 passed. 실행에는 `server/.env`의 카카오 키를 비웠다(켜져 있으면 테스트 계정 목록이 숨겨져 기존 spec도 실패한다).
- 11/04 보드는 `docs/design/proposals/`에 두었다. `docs/design/board.json`의 보드 키는 모두 `screens/` 안 파일 이름이라 다른 폴더의 파일을 어떻게 가리키는지 확실하지 않아 등록하지 않았다.
