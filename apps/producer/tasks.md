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
