# apps/consumer tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 화면 자리: SCR-01~05, SCR-10~17 / FEAT-01, 02, 06~13, 15, 19
- 상태: 리뷰 중

### 목표
DEV-3(프론트) 구현을 바로 시작할 수 있게, ia.md 2장 경로대로 화면 자리가 있는 빈 소비자 앱(Expo Router 웹 출력)을 만든다.

### 범위 (수정 허용 경로)
- `apps/consumer/**`

### 비범위 (건드리지 않음)
- 화면 기능·디자인, 카카오 로그인(`/auth/kakao`), 로그인 관문 (DEV-3·DEV-4)
- Vercel 배포·rewrite(DEV-8), CI(DEV-9)
- `apps/producer/**`, `packages/**`(각자 tasks.md)

### 결정 사항
- 10/07 라우트는 `src/app/`, 탭은 `(tabs)` 그룹(농가·메시지·주문은 탭별 Stack). 상세 경로표는 spec.md
- 10/07 create-expo-app이 만든 `.git`, `.claude`, `LICENSE`, `AGENTS.md`는 지운다. Expo 규칙 한 줄은 spec.md "구현 결정"으로 옮김
- 10/07 생성물에 `CLAUDE.md`(`@AGENTS.md` 한 줄)도 있어 함께 지움. AGENTS.md를 지우면 import가 깨지므로
- 10/07 create-expo-app은 빈 폴더에만 만들어서, spec.md·tasks.md를 잠시 옮겨 두고 생성한 뒤 되돌림
- 10/07 Expo SDK 57(expo ~57.0.27, expo-router ~57.0.25, react-native 0.86.3). package name은 `@farmclub/<앱>`, `typecheck` 스크립트 추가

### 작업
- [x] `spec.md` 작성
- [x] `npx create-expo-app@latest apps/consumer --template blank-typescript --no-install`, 생성물 정리
- [x] `npx expo install` expo-router 등, `main: expo-router/entry`, `App.tsx`·`index.ts` 삭제
- [x] `app.json`: name·slug `farmclub-consumer`, scheme, `experiments.typedRoutes`, `web.output: "single"`
- [x] `src/app/` 화면 13개 Placeholder, 하단 탭 4개(농가·메시지·주문·내 정보)
- [x] `npx tsc --noEmit`, `npx expo export -p web` 성공

### 완료 조건
- [x] Expo Router 웹 출력으로 실행되는 빈 앱(탭 4개 자리, 로그인 자리)
- [x] `spec.md`(구현할 FEAT·규칙, 구조, 계약)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 뼈대 완료: `npx tsc --noEmit`, `npx expo export -p web` 성공. `expo start --web`에서 `/`, `/farms/123`, `/checkout/1/pay`, `/orders/9/done` 화면과 탭 4개 확인, 콘솔 오류 없음

## DEV-3 [I1-P23] Implement frontend (prototype)

- 이슈: [DEV-3](https://linear.app/sswp6/issue/DEV-3)
- 상태: 시작 전 — 아래는 SWPP-26(P22 스펙 확정)에서 넘어온 할 일만 미리 적었다. 시작할 때 `spec` 스킬로 목표·범위·완료 조건을 채운다
- 기준 문서: `docs/spec/screens.md`(화면·API), Must 범위는 screens.md 4장

### SWPP-26에서 넘어온 할 일
- [ ] 하단 탭을 발견(SCR-01) · 소식(SCR-18) · 채팅(SCR-15) · 내 정보(SCR-17)로 바꾸기: `src/app/(tabs)/_layout.tsx`
- [ ] 라우트 옮기기(spec.md 경로표): `src/app/index.tsx`(랜딩) → `(tabs)/index.tsx`(홈·발견), `(tabs)/inbox/*` → `(tabs)/chats/*`, `(tabs)/orders/*` → `(tabs)/me/orders/*`, `(tabs)/me.tsx` → `(tabs)/me/index.tsx`, 새 `(tabs)/news.tsx`(SCR-18)
- [ ] Placeholder 제목·레이블을 ia.md 4장대로(소비자 화면에 ‘메시지’ 없음: 메시지함 → 채팅 목록, 농가 대화 → 농가 채팅)
- [ ] SCR-05를 테스트 계정 선택 화면으로(ADR 0009). 카카오 리다이렉트 `/auth/kakao` 라우트는 만들지 않음(I2)
- [ ] 로그인 관문: 팔로우·예약하기·채팅하기·좋아요, 소식·채팅·내 정보 탭 → SCR-05 → 원래 행동으로 복귀
- [ ] ‘틀렸어요’ 버튼은 만들지 않음(M-17, I2)

## DEV-3 로컬 프로토타입 통합 작업 (2026-10-07)

- 이슈: https://linear.app/sswp6/issue/DEV-3
- 브랜치: `jinwoo/dev-3-frontend`
- 상태: 로컬 실행 완료, 사용자 수정 대기
- 기준: screens.md 1.1, docs/design, ADR 0009·0010, 사용자 승인 계획

### 목표
Hyun Park 작성 farmclub-proto-ref.zip을 기준으로 두 앱을 Mock 모드로 실행하고 사용자 피드백을 반영한다.

### 범위
- apps/consumer/**

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


## DEV-3 소비자 주문 상태 탭
- 브랜치: jinwoo/dev-3-order-tabs. 상태: 구현·자체 검토 완료, PR CI 확인 예정.
- 목표: 생산자 상품 화면처럼 상단 상태 탭과 전체 건수를 제공한다(AC-10-6/7).
- 범위: apps/consumer/src/**, apps/consumer/spec.md·tasks.md, scripts/test-navigation.mjs, docs/spec/screens.md·capacity-1.4.md·functional/FEAT-10-order-history.md, 관련 docs/wiki/*.md.
- 비범위: 서버·API·DB 상태/계약, 생산자 화면. 기존 API에 없는 취소 주문을 새로 반환하지 않는다.
- 결정: 미확정은 RESERVED/PREPARING/SHIPPED/DELIVERED, 확정은 COMPLETED, 취소·환불은 CANCELED/REFUNDED/PARTIALLY_REFUNDED. PENDING_PAYMENT 제외.
- 결정: 순서 미확정/확정/취소·환불, 기본 미확정. filter=pending|confirmed|canceled. 미확정의 응답 필요 우선/최신순; 전체 페이지 집계. 선택은 상세 왕복·로그인 복귀에도 유지.
- [x] 구현·명세/영문 Wiki 동기화
- [x] 분류·정렬·전환·페이지 테스트, 타입·웹 빌드, 모바일 브라우저 확인
- [ ] 자체 리뷰·PR CI 후 머지, 로컬 실행 유지

- 검증: 소비자 typecheck·web export, Mock 9개 테스트 통과. 브라우저에서 구매 확정 시 건수 3/0/1→2/1/1, 상세 왕복/로그인 복귀 필터 유지, 빈 확정 탭, 360/390/430px 가로 넘침 없음 확인.
- 자체 리뷰 수정: 중첩 layout의 useLocalSearchParams는 직접 링크 query를 놓쳐 로그인 복귀가 pending으로 바뀜. useGlobalSearchParams로 수정하고 confirmed 복귀 재검증. 기존 상품 테스트의 의미는 유지. API/DB 변경 없음.
- 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건.

## DEV-3 주문 탭 표시 순서 수정
- 범위: 주문 그룹 배열과 관련 소비자 명세·영문 Wiki.
- 결정: 사용자 요청대로 확정 → 미확정 → 취소·환불 순서. 기본 선택은 미확정 유지.
- 브랜치: jinwoo/dev-3-order-tab-order. 자체 검토·검증 후 PR 및 머지.
- 검증 완료: 기존 navigation 테스트 4건 통과, 브라우저 표시 순서·미확정 기본 선택 확인. diff 검토 지적 없음.
- 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건.

## DEV-3 스펙 1.5 상세·공개 소식방
- 범위: apps/consumer/**, apps/producer/**, packages/api/**, packages/ui/**, scripts/test-*.mjs, package.json, docs/spec/**, docs/wiki/**.
- 기준: 명세 PR #44, storefront-1.5.md / AC-02-4, AC-03-4, AC-07-5, AC-12-10, AC-15-6.
- 결정: 구조화 text/image 블록, 명시적 저장, 기본 설명 보존, 공개 조회만 확장하고 답장 권한 유지. 서버 구현 제외. 4탭 유지.
- 작업: 상세 렌더·편집/Mock 계약, 공개 소식방·복귀, 승인 문구 교정, 테스트·웹검증·자체리뷰·PR·머지.
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

## DEV-57 당도계 일러스트 표시 (2026-10-17)
- 사용자 요청으로 당도 실측 영역의 기존 물방울 아이콘을 공통 BrixReading의 ImageGen 당도계 그림으로 보완한다. 작업 범위·결정·검증은 `packages/ui/tasks.md`의 DEV-57 당도계 일러스트 절을 따른다.
- 수정 허용: `src/app/(tabs)/products/[productId].tsx`, `spec.md`, `tasks.md`. API/당도 데이터 생성·채팅 변경 없음.

## DEV-67 소비자·생산자 앱 Vercel 자동 배포

- 이슈: [DEV-67](https://linear.app/sswp6/issue/DEV-67) · GitHub #134
- 브랜치: `nemodleo/dev-67-dev-소비자생산자-앱-vercel-자동-배포actions-export`
- 기능·인수 조건: 배포(DEV-65·66 후속). 제품 FEAT·AC 없음. 생산자 앱도 같은 워크플로라 기록은 여기 한 곳에 둔다
- 상태: 리뷰 중

### 목표
앱 코드가 main에 머지되면 사람이 로컬에서 export·업로드하지 않아도 두 앱이 Vercel에 배포되게 한다. 서버 주소·Mock 여부는 레포 설정으로 바꾼다.

### 범위 (수정 허용 경로)
- `.github/workflows/deploy-vercel.yml`(새 파일), `README.md` Apps on Vercel 절, `docs/spec/tech-design/stack.md` CI/CD 행, `apps/consumer/tasks.md`

### 비범위
- 앱·패키지 코드, `scripts/local.mjs`(`npm run build:web`은 로컬 Mock 빌드로 유지), Vercel 프로젝트 설정·GitHub 연결, 레포 시크릿·변수 등록(사람)

### 결정 사항
- 10/18 서버 배포(DEV-66)와 같은 방식: `workflow_run`(CI 성공, main push) → CI가 검사한 `head_sha` 체크아웃 → 그 커밋에 `apps/`·`packages/`·루트 `package*.json`·`.nvmrc`·워크플로 변경이 있으면 배포. 수동 실행은 항상 배포.
- 10/18 `VERCEL_TOKEN`이 없으면 실패가 아니라 건너뛰고 notice(옵트인). 라이브 앱이 바뀌는 시점을 토큰 등록이라는 사람의 행동에 묶는다. 서버(DEV-65)는 이미 켜져 있어 없으면 실패시키는 것과 다름.
- 10/18 모드는 레포 변수 `APP_API_URL`: 비면 `EXPO_PUBLIC_API_MOCK=1`, 있으면 `EXPO_PUBLIC_API_MOCK=0` + 그 주소. `EXPO_PUBLIC_CONSUMER_URL`·`PRODUCER_URL`은 Vercel 도메인으로 고정(로컬 `build:web`은 localhost를 넣음).
- 10/18 Vercel 식별자(조직·프로젝트 ID)는 비밀값이 아니라 워크플로에 직접 둔다. `vercel deploy <dist> --prod`는 `VERCEL_ORG_ID`·`VERCEL_PROJECT_ID` 환경 변수로 링크 없이 동작. CLI는 로컬과 같은 48.x.
- 10/18 배포 뒤 사이트 200 응답을 최대 2분 확인.

### 작업
- [x] 워크플로 [x] README·stack.md [x] actionlint [x] 로컬에서 서버 모드 export 확인

### 완료 조건
- [x] `actionlint` 통과
- [ ] 토큰 등록 뒤 수동 실행 1회로 두 사이트 200 확인(사람이 시점 결정)

### 기록
- 10/18 로컬 확인: `apps/consumer`에서 `EXPO_PUBLIC_API_MOCK=0 EXPO_PUBLIC_API_URL=https://farmclub-api-production.up.railway.app … npx expo export -p web` 성공, 번들에 서버 주소 포함, `localhost:808x` 참조 없음. 실제 Vercel 업로드는 토큰이 없어 실행하지 않음.

## DEV-68 무통장 입금: 입금 안내(SCR-11)·주문 접수(SCR-12)·입금 대기 상세(SCR-14)
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-09(개정) AC-09-2·3·7, FEAT-10 · 상태: 진행 중

### 목표
카드 결제 화면을 농가 계좌 입금 안내로 바꾼다. 계좌·입금자명(주문 번호)·기한·판매자 정보·중개자 고지·에스크로 안내를 보여 주고, 「입금했어요」 신호와 입금 대기 상태 표시·취소를 지원한다. 디자인: https://claude.ai/artifact/Pfj8bHERB3FXqH4iD1D6HL

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/checkout/[productId]/{index,pay}.tsx`
- `apps/consumer/src/app/(tabs)/orders/[orderId]/{done,index}.tsx`, `apps/consumer/src/app/(tabs)/orders/index.tsx`
- `apps/consumer/src/lib/{orderText,orderGroups}.ts`
- `apps/consumer/spec.md`, `apps/consumer/tasks.md`

### 비범위
- 카드 입력 화면(#120 DEV-37), PortOne(#124). 알림.

### 결정 사항
- 10/18 SCR-10 하단 버튼 「예약하기」. 성공 시 `orders.deposit(orderId, key)` 호출 후 SCR-11(입금 안내)로. 409는 기존처럼 주문서로 돌아감.
- 10/18 SCR-11 하단 「입금을 마쳤어요」(deposit-reported → SCR-12), 글자 버튼 「나중에 입금할게요」(SCR-12). 「결제」 단어 사용 금지.
- 10/18 SCR-14 입금 대기: 제목 「입금 확인 중」, 4단계 막대 비움, 입금 정보 Row 재표시, 취소는 환불 없이 즉시. 만료 취소·환불 송금(입금했던 계좌로) 문구.
- 10/18 주문 내역 그룹: 입금 대기는 '진행 중'(pending), 취소(CANCELED)는 '취소·환불' 탭.

### 작업
- [x] 주문서 버튼·deposit 호출
- [x] SCR-11 입금 안내 재작성(복사 2개, 기한, 판매자, 고지, 에스크로 접힘)
- [x] SCR-12 입금 확인 중 표(계좌·입금액·기한·복사)
- [x] SCR-14 입금 대기·만료·환불 송금 상태, 취소 시트 문구
- [x] 주문 내역 상태 문구·그룹
- [ ] `npm run typecheck`, e2e checkout 스펙 통과

### 완료 조건
- [ ] 이슈 완료 조건(소비자 항목) · 테스트 통과 · 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 구현 완료, typecheck 통과. 결정: DepositCard는 `src/lib/DepositCard.tsx`로 분리(라우트 파일은 default만 export). 입금 대기·취소(CANCELED)도 주문 내역에 보인다(Mock도 동일).
- 10/18 박현 피드백 반영: 입금 정보는 입금액·계좌번호·입금자명만 굵게, 복사는 계좌번호·입금자명 둘만, SCR-12 주문 번호 복사 제거·입금 대기 중 주문 번호/합계 줄 생략, 구매안전서비스 고지는 권유 없는 한 줄. 주문 번호 형식은 FC-MMDD-NNNN 유지(NNNN 무작위).
- 10/18 농가 미승인(AC-09-9·AC-17-8): 주문 상세에 Notice ‘농가가 입금을 확인하지 못했어요 · 사유’/‘환불 송금이 늦어지고 있어요 · 사유’, 내역 카드 ‘입금 확인 안 됨 · 사유를 봐 주세요’·‘환불 송금 늦어짐’.
- 10/18 기한이 지났지만 입금했다고 알린 주문: 주문 상세 문장 ‘입금했다고 알려 주셨어요. 농가 확인이 늦어져 farmclub이 농가에 연락하고 있어요. 주문은 취소되지 않아요.’

## DEV-32 카카오 로그인과 원래 행동으로 복귀

- 이슈: [DEV-32](https://linear.app/sswp6/issue/DEV-32) · GitHub #77
- 브랜치: `nemodleo/dev-32-i2-t14-implement-real-user-login-and-return-users-to-their`
- 기능·인수 조건: FEAT-01 / AC-01-1, AC-01-8, AC-01-9, AC-01-11, AC-01-12~15 · ADR 0003·0009·0010
- 상태: 리뷰 중

### 목표
테스트 참가자가 자기 카카오 계정으로 소비자 앱에 로그인하고, 로그인 전에 누른 화면·행동(예약·팔로우·채팅·좋아요)으로 그대로 돌아간다. 테스트 계정 로그인은 Mock 플래그가 켜진 동안 함께 둔다.

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/login.tsx`, `apps/consumer/src/app/auth/kakao.tsx`(새 화면), `apps/consumer/src/lib/kakao.ts`(새 파일), `apps/consumer/src/lib/session.tsx`(`restoreResume`, 10/18 온보딩 관문·`resume` 숨김)
- 10/18 온보딩 승인으로 추가: `apps/consumer/src/app/onboarding/{index,address}.tsx`(새 화면 SCR-06), `apps/consumer/src/lib/onboarding.ts`(새 파일), `apps/consumer/src/lib/AddressForm.tsx`(온보딩·연락처 기본값·50개 옵션), `apps/consumer/src/app/(tabs)/me/{index,profile}.tsx`, `apps/consumer/src/app/(tabs)/me/addresses/{index,edit}.tsx`, `apps/consumer/src/app/checkout/[productId]/{index,address}.tsx`
- `apps/consumer/spec.md`, `apps/consumer/tasks.md`
- 서버·API 패키지·문서는 `server/tasks.md`, `packages/api/tasks.md`의 DEV-32 절 참조

### 비범위 (건드리지 않음)
- 생산자 앱 로그인 화면(SCR-19). 서버 계약은 `app: producer`로 동작하지만 화면은 별도 이슈.
- 리프레시 토큰, 로그아웃 시 카카오 연결 끊기, 이름·전화번호 동의 항목(비즈 앱 심사 필요, 2단계).
- 우편번호 찾기(결정 27, I1처럼 직접 입력), 약관·처리방침 전문 페이지(‘보기’는 요지 시트), 탈퇴.
- Figma 시안 반영(머지 뒤 별도). 기존 `@farmclub/ui` 부품만 쓴다.

### 결정 사항
- 10/17 복귀 경로는 `/auth/kakao`(stack.md 5장). 카카오 리다이렉트로 페이지가 새로 뜨므로 돌아갈 화면(`next`)과 이어서 할 행동(`resume`)을 sessionStorage에 두고 `state`(일회용 값)로 대조한 뒤 한 번만 꺼내 쓴다. 세션에 `restoreResume`를 추가해 복귀 화면이 행동을 되살린다.
- 10/17 카카오에서는 카카오계정 이메일만 받는다(scope `account_email`, 콘솔에서 필수 동의로 설정, 사용자 결정 10/17). 처음엔 닉네임이었으나 동의 항목이 꺼져 있어 바꿈. 연락처는 주문서 배송지 입력으로 받는다. 내 정보 라벨은 `isTestAccount`에 따라 ‘테스트 계정’/‘카카오 계정’.
- 10/17 Mock 모드에서는 리다이렉트 없이 `POST /api/auth/kakao`를 바로 불러 김민지로 로그인한다(화면 흐름 확인용).
- 10/17 카카오 설정(`enabled`, `clientId`)은 서버 `GET /api/auth/kakao/config`에서 받는다. 앱 env에 키를 두지 않는다.
- 10/17 버튼 문구는 카카오 공식 변형 중 ‘카카오로 시작하기’. ‘…로그인’으로 끝나면 기존 e2e 도우미(`/로그인$/`)와 테스트 계정 버튼이 겹쳐 strict mode 위반이 나서 e2e를 건드리지 않고 문구로 피했다.

### 작업
- [x] `lib/kakao.ts`: 인가 주소 만들기·복귀 정보 저장/꺼내기
- [x] `login.tsx`: ‘카카오로 시작하기’ 버튼(설정 꺼짐이면 숨김), 테스트 계정 목록 유지
- [x] `auth/kakao.tsx`: 코드 교환·세션 갱신·행동 복원·복귀, 취소/만료/실패 안내
- [x] `session.tsx`: `restoreResume`
- [x] `npm run typecheck`, Mock 모드 화면 확인(버튼 → 로그인 → 복귀), 서버 pytest

### 완료 조건
- [ ] 로그인이 테스트 기기에서 되고 권한·복귀 경로가 통과하며 스펙과 코드가 맞는다(이슈 완료 조건). 실기기 확인은 카카오 키 등록 뒤.
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/17 main 34c9009에서 시작. 카카오 개발자 앱·REST API 키는 사용자가 발급해 `server/.env`에 넣는다(KAKAO_REST_API_KEY, 선택 KAKAO_CLIENT_SECRET). 콘솔 리다이렉트 URI: `<소비자 앱 주소>/auth/kakao`.
- 10/17 구현·문서 동기화 완료. `npm run typecheck` 4개 통과, Mock 화면 4장(관문 → 카카오 → 주문서 복귀, 만료·취소 안내) 콘솔 오류 0, 서버 pytest 217/217, `node scripts/run-integration.mjs` 실서버 7/7 + Playwright 19/19. 실제 카카오 계정 로그인은 콘솔에 `<소비자 앱 주소>/auth/kakao` 등록 뒤 사용자가 확인(미완). 완료 조건의 "테스트 기기에서 로그인"은 그때 체크.
- 10/17 실제 카카오 계정으로 로컬(실서버 + 소비자 앱) 로그인 확인: `POST /api/auth/kakao` 200, 소비자 계정 생성(`isTestAccount=false`), 홈 복귀, 복귀 정보 소거. 이름이 ‘카카오 사용자’로 저장됨 → 콘솔 동의 항목에 닉네임이 꺼져 있어 `kakao_account.profile`이 안 내려옴. 인가 요청에 `scope=profile_nickname`을 넣었고, 콘솔에서 ‘닉네임’ 동의 항목(필수)을 켜야 이름이 들어온다. 기존 버그 발견: 내 정보가 부르는 `GET /api/farms/following`이 서버에 없어 404(별도 이슈).
- 10/17 사용자 피드백: 로그인 화면에서 카카오와 테스트 계정 로그인이 같이 보여 충돌 → 카카오가 켜져 있으면 카카오만 기본으로 보이고 테스트 계정은 ‘테스트 계정으로 로그인’을 눌러야 펼쳐진다(하단 ‘○○로 로그인’ 버튼도 그때만). 카카오가 꺼진 CI·Mock 플래그 환경은 기존대로 바로 펼침이라 e2e 영향 없음. 로컬 실서버는 카카오 키가 있어 e2e `loginConsumer`가 접힌 목록을 못 찾으므로 통합 테스트는 `.env`를 치우고 돌린다.
- 10/17 사용자 결정: 카카오가 켜져 있으면 테스트 계정 로그인을 아예 없앤다(접기 아님). 꺼진 환경(CI e2e, Mock)에서는 테스트 계정 목록 유지. 로컬에서 테스트 계정이 필요하면 KAKAO_REST_API_KEY를 비우거나 Mock 모드.
- 10/18 사용자 승인(제안 아티팩트 v4 https://claude.ai/artifact/WfH3HbEMwhAmvLq5f57xEp): 카카오에서는 이메일만, 식별은 회원번호. 첫 가입 온보딩 2장(① 닉네임·이름·휴대폰·동의 4개 ② 기본 배송지, 건너뛰기 가능). 빠진 정보는 직접 입력. 배송지 관리 50개·수정·삭제, 주문서는 저장 목록에서 고른다.
- 10/18 결정: 온보딩 중 `resume`을 숨긴다. 숨기지 않으면 스택 아래의 상품 화면이 1장 저장 직후 예약을 이어 실행해 2장을 건너뛰거나 온보딩이 두 겹 쌓였다(Mock 실측). 끝나면 관문에서 왔을 때 `router.back()`으로 원래 화면에 돌아가 그 화면이 행동을 잇는다(로그인 화면과 같은 방식).
- 10/18 결정: 온보딩 닫기는 계정을 남기고 행동은 실행하지 않는다. 다음 관문(`requireLogin`)·주문서·내 정보 ‘가입 마치기’에서 다시 연다. 탭 열기(소식·채팅·내 정보)는 막지 않는다.
- 10/18 결정: ‘보기’는 정책 5장 요지를 담은 시트(전문 페이지는 정식 오픈 전). 동의 문구 버전 `2026-10-18`(`lib/onboarding.ts`).
- 10/18 결정: 로그인 하단 문구는 카카오가 켜져 있으면 ‘동의는 처음 가입할 때 받아요’, 꺼져 있으면(테스트 계정) 기존 안내.
- 작업(10/18): [x] 온보딩 1·2장 [x] 카카오 복귀·Mock 로그인 분기 [x] 세션 관문·`resume` 숨김 [x] 주문서 온보딩 분기·연락처 기본값·50개 안내 [x] 배송지 관리 50개 [x] 내 정보 닉네임·가입 마치기·`/me/profile`
- 검증(10/18): `npm run typecheck` 4개 통과, `npm run test:mock` 13/13. Mock 화면 흐름(관문 → 카카오 → 온보딩 1(다음 비활성 → 입력·모두 동의 → 다음) → 2(주소 저장) → 주문서 복귀(기본 배송지 채워짐) → 내 정보·고치기·배송지 → 로그아웃 뒤 다시 카카오 → 온보딩 없이 복귀) 콘솔 오류 0. 실서버 통합은 아래 기록.
- 10/18 AI 1차 리뷰 반영(must 1): 관문을 거치지 않는 소식 좋아요·답장·채팅 보내기가 403 `ONBOARDING_REQUIRED`를 받으면 세션이 온보딩을 연다(`onOnboardingRequired`). 주문서로 직접 들어와 온보딩을 닫으면 그 상품 화면으로(주문서 ↔ 온보딩 고리 제거). 10/17에 만든 계정의 이름 자리(이메일·‘카카오 사용자’)는 온보딩 이름 칸에 채우지 않음. 로그인 Mock 주석 갱신. Mock 확인: 관문에서 닫기 → 상품 화면, 주문서에서 닫기 → 상품 화면, 온보딩 전 좋아요 → 온보딩, 콘솔 오류 0. 범위에 `scripts/test-onboarding.mjs` 추가.
- 10/18 남긴 리뷰 항목: 온보딩 e2e(Playwright)는 실서버 통합이 카카오 키 없이 돌아 카카오 첫 가입을 만들 수 없어 넣지 않았다. 대신 Mock 계약 테스트(`test-onboarding.mjs`)와 서버 pytest가 규칙을 덮고, 화면 흐름은 Mock Playwright 스크립트로 확인했다. 소식방에서 본인 답장 이름이 실명으로 보이는 것은 기존 동작이라 그대로 둠.

## DEV-112 카카오 복귀 화면을 생산자 앱(DEV-108)과 맞추기

- 이슈: [DEV-112](https://linear.app/sswp6/issue/DEV-112)
- 브랜치: `nemodleo/dev-112-dev-소비자-앱-카카오-복귀-화면을-생산자-앱dev-108과`
- 기능·인수 조건: FEAT-01 I2 / AC-01-13 · 화면 SCR-05 하위 `/auth/kakao` · 관련 DEV-32, DEV-108
- 상태: 리뷰 중

### 목표
소비자 앱 카카오 복귀 화면을 생산자 앱처럼 로딩 표시 + 한 줄로 정리하고, 새로고침 오류(일회용 `state` 소진으로 ‘로그인 요청이 만료됐어요’)와 응답 지연(무한 대기)을 처리한다. 소비자 앱은 로그인 뒤 직접 이동하므로 생산자 앱 같은 멈춤은 없었다.

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/auth/kakao.tsx`
- 테스트: `scripts/e2e/consumer-kakao.spec.ts`(새 파일)
- 문서: `apps/consumer/spec.md`, `apps/consumer/tasks.md`, `docs/spec/screens.md`(SCR-05), `docs/wiki/Requirements-and-Specifications.md`(SCR-05 줄)
- Figma 스크립트: 레포 밖 `figma-plugins/farmclub-dev112/`

### 비범위
- 소비자 세션 관문(`lib/session.tsx`), `lib/kakao.ts` 저장 형식, 서버, 오류 화면 문구(‘테스트 계정 로그인으로도 계속할 수 있어요.’ 등)

### 결정 사항
- 10/22 새로고침 판단은 생산자와 같다: `state`가 없거나 다른데 토큰이 있으면 로그인된 것으로 본다. 소비자 세션의 `refresh()`는 사용자를 돌려주지 않아 `auth.me()`를 직접 불러 `needsOnboarding`을 본다. 돌아갈 화면(`next`)은 첫 복귀 때 이미 꺼내 지웠으므로 홈으로 보낸다.
- 10/22 시간 제한 15초, 문구는 생산자와 같다. 요청은 취소하지 않으므로 늦게 성공하면 토큰이 남고, ‘다시 로그인’·‘홈으로’ 어느 쪽을 눌러도 로그인된 채 이어진다.
- 10/22 로딩 화면: 닫기(`HeaderBar close`)는 남기고 그 아래를 가운데 `ActivityIndicator`(large, 보조 글자색) + `T` body muted ‘카카오 로그인 중이에요’로. 새 공용 부품은 만들지 않는다(DEV-108과 같은 판단).

### 작업
- [x] 복귀 화면: 모양, 새로고침, 15초 제한
- [x] Playwright(복귀 → 저장한 화면, 다시 열기 → 오류 없음, 로그인 안 된 채 state 불일치 → 만료 안내)
- [x] 스펙(screens.md SCR-05, wiki), `spec.md`
- [x] Figma v6 소비자 로그인 근처 복귀 로딩 화면
- [x] typecheck, test:mock, Playwright 통과 확인

### 완료 조건
- [x] 로딩 화면 정리, 새로고침해도 오류 없음
- [x] 테스트·스펙·Figma가 같은 PR
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/22 origin/main 1f1a243에서 시작.
- 10/22 검증: `npm run typecheck` 통과, `npm run test:mock` 19/19. 통합(`FARMCLUB_INTEGRATION_SKIP_DOCKER=1`, 별도 DB, `node scripts/run-integration.mjs scripts/e2e/consumer-kakao.spec.ts scripts/e2e/discovery-and-gates.spec.ts`): 실서버 시나리오 7/7, Playwright 5/5. 새 spec을 origin/main의 `kakao.tsx`로 돌리면 새로고침 테스트 1건이 실패(만료 안내에 남음)해 고친 증상과 같음을 확인.
- 10/22 Figma v6 ‘현재 시안 · 소비자’에 `DEV-112 · C02-1 카카오 복귀 · /auth/kakao`(node 460:4936, C02 닫기 머리 복제)와 명세 상자(460:4955). 자리는 C02와 같은 줄 x 4410(3940에는 다른 ‘수정 전’ 사본이 있어 한 칸 옆). 스크립트는 레포 밖 `figma-plugins/farmclub-dev112/code.js`(같은 노드 재사용, 두 번 실행해 확인).

## DEV-97 상품 페이지에서 연 채팅에 상품 전달

- 이슈: [DEV-97](https://linear.app/sswp6/issue/DEV-97) · 브랜치 `zahra/dev-97-chat-product-context` · 기준 절: `server/tasks.md#dev-97` · 상태: 완료(#197)
- 범위: `src/app/(tabs)/products/[productId].tsx`(채팅하기·확인 시트 ‘시작하기’ 경로에 `productId`), `src/app/(tabs)/chats/[farmId].tsx`(경로의 `productId`를 보내기에)
- 10/20 결정: 화면·문구 변경 없음(Figma 해당 없음). 주문 문맥이 있으면 서버가 주문을 우선한다.
- [x] 두 화면 수정, `npm run typecheck` 4개 통과

## DEV-113 사이트 하단 사업자 정보와 약관·처리방침

- 이슈: https://linear.app/sswp6/issue/DEV-113 · 목표·범위·결정·기록은 `packages/ui/tasks.md` DEV-113 섹션에 모은다.
- 10/22 `/privacy`·`/terms` 라우트, 홈·로그인·내 정보 하단 `LegalFooter`, 가입 동의 시트 ‘전문 보기’, vercel.json에서 정적 HTML로 rewrite.

## DEV-120 주문서 개인정보 제3자 제공 동의(판매자 농가)와 약관·처리방침 링크

- 이슈: [DEV-120](https://linear.app/sswp6/issue/DEV-120)
- 브랜치: `nemodleo/dev-120-checkout-third-party-consent` (DEV-113 브랜치 위에 쌓음, PR base = DEV-113 브랜치)
- 기능·규칙: FEAT-08 AC-08-1(·새 AC-08-9), R-03, R-15, policy.md 2·5장, 개인정보보호법 제17조 ①·②
- 상태: 리뷰 중

### 목표
주문하면 받는 사람 정보가 판매자 농가(제3자)에게 간다. 계약 이행(제15조 ① 제4호)은 제3자 제공 근거가 아니므로(제17조 ① 제2호) 주문서에서 별도 동의를 받고, 주문서의 약관·처리방침 문구를 링크로 바꾼다.

### 범위 (수정 허용 경로)
- `server/app/orders/{schemas,service}.py`, `server/tests/{test_orders,test_accounts,test_retire_test_farm}.py`
- `packages/api/src/{types.ts,mock/orders.ts}`, `scripts/{test-spec12,test-capacity,test-integration}.mjs`
- `apps/consumer/src/app/checkout/[productId]/index.tsx`, `apps/consumer/tasks.md`
- `packages/ui/src/legalContent.ts`(처리방침 제4조), `scripts/test-legal.mjs`, `scripts/e2e/checkout-and-fulfillment.spec.ts`(필요 시)
- `docs/spec/functional/FEAT-08-reservation-order.md`, `docs/spec/{policy,screens}.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
- DB 스키마(동의는 전부 필수라 주문의 `consent_at`·`consent_version`으로 기록), 판매자 신원정보 표시(DEV-119), 가입 동의 버전(`CONSENT_VERSION`)

### 결정 사항
- 10/23 R-03 동의 4개에 `thirdParty`(개인정보 제3자 제공)를 5번째 필수 항목으로 더한다. 5개 모두 필수라 주문이 있으면 동의한 것이고, 시각·문구 버전은 기존 `consent_at`·`consent_version`에 남는다(마이그레이션 없음). 제공받는 자는 주문 상품의 농가로 정해진다.
- 10/23 주문서 동의 문구 버전 `policy-2026-10-06` → `policy-2026-10-23`(문구가 바뀜).
- 10/23 고지 5가지(제17조 ②): 제공받는 자(농가명), 목적(상품 배송·주문 이행·주문 문의 응대), 항목(받는 사람 이름·연락처·주소·배송 메모, 주문 내용, 닉네임), 보유·이용 기간(주문 이행이 끝날 때까지, 판매자는 법령 보존 기간 동안 보관 가능), 거부 권리와 거부 시 예약 불가.

### 작업
- [x] 서버·Mock: `thirdParty` 필수(없으면 400 `consents`)
- [x] 주문서: 5번째 동의, ‘모두 동의’에 포함, 약관·처리방침 링크
- [x] 처리방침 제4조: 주문할 때 받는 별도 동의에 따라 제공
- [x] 스펙: FEAT-08 AC-08-1·새 AC, policy 2·5장, screens SCR-10, wiki
- [x] pytest, typecheck, test:mock, Playwright(실서버 integration)

### 완료 조건
- [x] 제3자 제공 동의 없이는 예약이 안 된다(서버·Mock·화면)
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지(DEV-113 먼저)

### 기록
- 10/23 DEV-113 브랜치 b533e8b 위에서 시작.
- 10/23 검증: `uv run pytest` 425 passed(새 AC-08-7), 손댄 3개 파일 재실행 79 passed, `uv run ruff check` 통과, `npm run typecheck` 통과, `npm run test:mock` 28 passed / 0 failed(Mock 주문 제3자 제공 동의 검사 추가), 실서버 `test:integration:full` 67 passed / 4 skipped / 0 failed(checkout E2E의 ‘모두 동의해요’가 5개를 모두 켬). 임시 DB 삭제.
- 10/23 screens.md API 표의 `/api/auth/me/consents` 대상을 소비자·생산자로 고침(DEV-113에서 빠졌던 것).

## DEV-127 vercel.app 기본 주소를 정식 도메인으로 리다이렉트

- 이슈: [DEV-127](https://linear.app/sswp6/issue/DEV-127) · 브랜치 `nemodleo/dev-127-vercel-app-redirect`
- 범위: `apps/consumer/vercel.json`, `apps/producer/vercel.json`, `README.md`(Domains), `docs/spec/tech-design/adr/0012-domains-cloudflare.md`, 이 섹션
- 결정: 서버 CORS·카카오 복귀 주소에 vercel.app을 더하지 않고, Vercel 기본 주소를 정식 도메인으로 308 리다이렉트한다(host 조건, 경로·쿼리 유지). 리다이렉트는 rewrite보다 먼저 적용돼 `/s/*` 공유 링크도 정식 도메인으로 간 뒤 프록시된다. 미리보기(배포마다 생기는 고유 주소)는 host가 달라 영향 없다.
- [x] 두 앱 vercel.json, README·ADR 0012
- [ ] 배포 뒤 `curl -I https://farmclub-consumer.vercel.app/login?next=%2Fme` → 308, Location `https://farmclub.kr/login?next=%2Fme`
- 10/23 화면·문구 변경 없음(Figma 해당 없음). 테스트할 앱 코드 변경 없음 — vercel.json JSON 검증만.

## DEV-132 카카오 가입 시 약관 동의 전에는 계정을 만들지 않기

- 이슈: https://linear.app/sswp6/issue/DEV-132 · 목표·범위·결정·기록은 `server/tasks.md` DEV-132 섹션에 모은다.
- 10/23 `/onboarding` 가입 동의 모드(계정 없이 가입 토큰), 카카오 복귀·Mock 로그인의 새 사용자 처리.

## DEV-94 회원 탈퇴

- 이슈: https://linear.app/sswp6/issue/DEV-94 · 목표·범위·결정·기록은 `server/tasks.md` DEV-94 구현 섹션에 모은다.
- 10/23 ‘내 정보’ 설정 목록 끝에 회원 탈퇴(공용 `WithdrawSheet`), 성공하면 로그아웃·홈.

## DEV-136 소비자 앱 Mock 로그인에도 시드 테스트 계정 목록 보이기(생산자와 통일)

- 이슈: [DEV-136](https://linear.app/sswp6/issue/DEV-136)
- 브랜치: `nemodleo/dev-136-consumer-mock-test-accounts`
- 기능·인수 조건: FEAT-01(SCR-05) / AC-01-1(테스트 계정 로그인), 카카오 로그인 절
- 상태: 리뷰 중

### 목표
Mock 모드에서 생산자 SCR-19는 카카오 버튼과 시드 계정 목록을 함께 보이는데 소비자 SCR-05는 카카오 버튼만 보여 시드 계정(김민지·이서준)을 고를 수 없다. 두 앱의 Mock 로그인 화면을 맞춘다.

### 범위 (수정 허용 경로)
- `apps/consumer/src/app/login.tsx`
- `apps/consumer/tasks.md`(이 섹션)
- `docs/spec/screens.md`(SCR-05), `docs/spec/functional/FEAT-01-login.md`, `docs/wiki/Requirements-and-Specifications.md`(SCR-05 요약)
- `scripts/e2e/mock-login.spec.ts`(새 파일, 10/23 추가: Mock 로그인 화면 회귀 테스트)

### 비범위 (건드리지 않음)
- 서버, 생산자 앱, Mock 응답(`packages/api/src/mock`의 카카오 `enabled: true`는 그대로)
- 실서버(카카오 켜짐)·카카오 꺼짐(CI) 화면

### 결정 사항
- 10/23 생산자 SCR-19와 같은 규칙: `showTest = 카카오 꺼짐 || isMock`. Mock은 카카오 버튼 + 소비자 테스트 계정 목록 + 버튼 아래 Mock 안내 한 줄. Mock 카카오는 지금처럼 새 카카오 사용자(가입 동의 → 온보딩)

### 작업
- [x] `login.tsx` showTest 조건과 Mock 안내 한 줄
- [x] screens.md SCR-05, FEAT-01 카카오 절, wiki SCR-05 요약
- [x] `npm run typecheck`, `npm run test:mock`, Playwright(`mock-login.spec.ts` 새로, `legal-consent.spec.ts`)

### 완료 조건
- [x] Mock 모드 소비자 로그인 화면에서 카카오 버튼과 시드 계정 목록이 함께 보이고, 시드 계정으로 로그인된다
- [x] 실서버·카카오 꺼짐 화면은 그대로(조건이 `isMock`일 때만 달라짐)
- [x] 테스트 통과(로컬). 실서버 integration은 CI
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/23 iteration-2-demo README 검토(DEV-133 세션)에서 발견. 같은 폴더의 DEV-120(리뷰 중)은 주문서만 건드려 겹치지 않음
- 10/23 검증: `npm run typecheck` 통과, `npm run test:mock` 40 passed / 0 failed, Mock(공유 Mock 8183, 앱 8181·8182 — 다른 세션이 8081·8082 사용 중이라 포트만 바꿈)에서 `npx playwright test scripts/e2e/mock-login.spec.ts scripts/e2e/legal-consent.spec.ts` 5 passed. 수정 전 조건으로 되돌리면 새 소비자 테스트가 실패(1 failed)하는 것 확인 후 복구, 다시 2 passed. 실서버 `test:integration:full`은 안 돌림(이 변경은 `isMock`일 때만 동작이 달라짐, CI integration job이 확인)
- 10/23 AI 1차 리뷰(PR 코멘트) must·should 없음, nit 1(e2e 건너뛰기 조건, legal-consent와 같은 방식이라 유지). CI server·apps·integration·figma-line 통과
- 10/23 main(397e5bf, DEV-116 로그인 하단 푸터) 병합: `login.tsx`·screens.md·wiki 자동 병합. 재검증 typecheck 통과, test:mock 40 passed, Mock에서 mock-login 2·legal-consent 3·legal-pages DEV-113 2 passed. legal-pages DEV-116 6개는 Mock 빌드에서 실패 — 카카오 켜진 실서버 화면(목록 없음)을 가정한 테스트라 Mock에서는 생산자도 원래 실패(이번 변경과 무관), 실서버 빌드인 CI integration에서 확인

## DEV-33 소비자·생산자 앱 EAS 네이티브 빌드 전환

- 이슈: [DEV-33](https://linear.app/sswp6/issue/DEV-33) · 결정 근거: [소비자·생산자 앱 스토어 배포 방식 결정](https://claude.ai/artifact/RMzRFujnLGCMvGB927ozKc) · 관련 DEV-128(계정, 사람), DEV-129(CI, 범위 밖), DEV-41(설치 확인)
- 브랜치: `nemodleo/dev-33-eas-native-builds`
- 기능·인수 조건: FEAT-01 AC-01-13·AC-01-16(카카오 로그인 복귀가 앱에서도 같은 화면으로), PRD N-01은 웹 그대로 유지 · 화면 변경 없음
- 상태: 리뷰 중
- 생산자 앱 쪽 기록: `apps/producer/tasks.md#DEV-33`, 공용 패키지: `packages/api/tasks.md#DEV-33`, `packages/ui/tasks.md#DEV-33`

### 목표
같은 Expo 코드로 iOS·Android 네이티브 앱을 EAS Build로 내고 JS는 EAS Update로 반영한다(결정 2026-10-23). 웹 출력·배포는 그대로 두고, 웹 전용 코드를 플랫폼별 파일로 나누며, 카카오 로그인이 앱에서도 돌아오게 한다. 계정(DEV-128)이 없어 빌드·제출은 사용자가 실행할 명령으로 남긴다.

### 범위 (수정 허용 경로)
- `apps/consumer/{app.json,eas.json,package.json,vercel.json,README.md}`, `apps/consumer/public/{index.html,manifest.webmanifest,.well-known/**}`
- `apps/consumer/src/app/login.tsx`, `src/app/auth/kakao.tsx`, `src/lib/kakao.ts`(웹), 새 파일 `src/lib/kakao.native.ts`, `src/lib/kakaoAuth.ts`·`kakaoAuth.native.ts`, `src/lib/views.tsx`(copyText)
- `apps/producer/**` 같은 경로(`apps/producer/tasks.md#DEV-33`), `apps/producer/src/lib/{pick,sourceFiles}.native.ts`, `sourceFiles.ts`(`PickedFile` 타입)·`SourceAttachments.tsx`(`PickedFile`, 네이티브 미리보기 uri), `DetailEditor.tsx`·`ProductPageEditor.tsx`·`SourceWorkspace.tsx`(beforeunload 가드), `views.tsx`(copyText)
- `packages/api/src/{client.ts,storage.ts,storage.native.ts,objectUrl.ts,objectUrl.native.ts,upload.ts,index.ts,productWorkspace.ts,sourceAnalysis.ts}`(뒤 둘은 업로드 함수의 파일 타입만), `packages/api/package.json`
- `packages/analytics/src/{index.ts,client.ts,client.native.ts}`, `packages/analytics/package.json`
- `packages/ui/src/{ChatThread.tsx,NewsRoom.tsx,useLiveList.ts,foreground.ts,PrivatePhotos.tsx,pickPhoto.ts,pickPhoto.native.ts,index.ts}`, `packages/ui/package.json`
- 루트 `package.json`·`package-lock.json`(의존성, `test:mock`), `scripts/test-native-config.mjs`(새 파일), `.gitignore`
- 문서: `docs/spec/tech-design/stack.md`, `docs/spec/tech-design/adr/0013-eas-native-builds.md`(새 파일), `docs/wiki/Design-Documentation.md`, `README.md`, 두 앱 `spec.md`·`tasks.md`, `packages/{api,ui,analytics}/spec.md`, `packages/{api,ui}/tasks.md`

### 비범위 (건드리지 않음)
- 서버(`server/**`): 카카오 복귀 주소 검증은 지금 값(`<앱 주소>/auth/kakao`)을 그대로 쓴다. 서버 변경 없음.
- `.github/workflows/**`(CI·배포 자동화는 DEV-129), 스토어·EAS 계정과 인증서(DEV-128), 스토어 심사 제출 정보(DEV-131), Sign in with Apple(DEV-130), 회원 탈퇴(DEV-75·94)
- 로컬 네이티브 빌드(`expo run:*`, `eas build --local`), prebuild 산출물(`ios/`·`android/`) — 커밋하지 않는다
- PR #164의 `apps/android-twa` 셸(닫기는 사용자 확인 뒤), Figma v6
- 푸시 알림(FEAT-18), 앱 딥링크(농가·상품 주소를 앱으로 열기)

### 결정 사항
- 10/23 식별자: iOS `bundleIdentifier`·Android `package` = `kr.farmclub.consumer` / `kr.farmclub.producer`(DEV-128 콘솔 앱 생성 값과 같게). `scheme`은 지금 값(`farmclub-consumer`·`farmclub-producer`) 유지.
- 10/23 플랫폼 분기는 Metro 확장자(`*.native.ts`)를 우선하고, 한 줄 차이는 `Platform.OS === "web"`으로 한다. 웹 파일(`kakao.ts` 등)은 런타임 import 없이 두어 기존 Node 테스트(`scripts/test-producer-kakao.mjs`)가 그대로 돈다. 공용 패키지의 `window`·`document`·`localStorage`·`sessionStorage` 직접 호출은 `*.web.ts`·`web.ts` 밖에서 금지하고 `scripts/test-native-config.mjs`가 검사한다(결정 문서 "웹 전용 코드 격리").
- 10/23 카카오 복귀(네이티브): 카카오 콘솔·서버의 복귀 주소는 그대로 `https://farmclub.kr/auth/kakao`(생산자 `https://farm.farmclub.kr/auth/kakao`)다. 앱은 `expo-web-browser` `openAuthSessionAsync`로 인가 화면을 열고 `state`를 `app-<nonce>`로 보낸다. 웹 복귀 화면(`/auth/kakao`)은 `state`가 `app-`으로 시작하면 코드를 그대로 앱 스킴(`farmclub-consumer://auth/kakao?code&state`)으로 넘기고, 앱은 그 결과로 `/auth/kakao` 화면을 열어 기존 흐름(state 대조 → `POST /api/auth/kakao` → 복귀)을 탄다. 서버가 받는 `redirectUri`는 웹과 같은 값이라 서버 변경이 없다. Universal Links·App Links 대신 커스텀 스킴을 쓰는 이유: 인증 세션(ASWebAuthenticationSession·Custom Tabs) 안의 302 리다이렉트는 앱 링크로 앱을 열지 않고, App Links 검증에는 DEV-128 뒤에야 생기는 서명 지문이 필요하다. `apple-app-site-association`·`assetlinks.json`은 두 앱 `public/.well-known/`에 자리표시자(Team ID·지문)로 두고 `vercel.json`이 `application/json`으로 응답하게 한다. 지문·Team ID를 채우면 같은 `/auth/kakao` 화면이 앱 링크 진입도 처리한다.
- 10/23 Android(AI 1차 리뷰): expo-web-browser 57은 Android에서 인증 세션을 폴리필로 돌려 복귀 스킴을 `Linking` ‘url’ 이벤트로 받고, 같은 이벤트를 expo-router도 받아 `/auth/kakao`로 먼저 이동한다. 로그인 화면이 다시 `router.replace`하면 화면이 리마운트돼 두 번째 인스턴스가 ‘만료’를 띄우므로, `kakaoAuth.native.ts`는 Android에서 결과를 돌려주지 않고(null) 딥링크 이동에 맡긴다. iOS는 ASWebAuthenticationSession이 스킴을 가로채 딥링크가 오지 않으므로 결과로 이동한다. DEV-41 확인 항목: Android 복귀 뒤 `next`·`resume` 유지.
- 10/23 iOS 키체인 값(토큰)은 앱을 지워도 남는다. 첫 실행에 지울지는 DEV-41·탈퇴(DEV-75) 때 결정한다(지금은 그대로).
- 10/23 복귀 정보(`next`·`resume`·nonce)는 네이티브에서 메모리에 둔다. 인증 세션이 열려 있는 동안 앱 프로세스가 살아 있고, 드물게 죽으면 홈으로 간다(기존 만료 안내).
- 10/23 토큰: 네이티브는 `expo-secure-store`(동기 `getItem`·`setItem`, 키의 `:`는 `.`로). 그 밖의 앱별 저장값(도움말 본 기록 등)도 2KB 이하면 SecureStore, 넘으면 메모리(Mock DB는 웹 전용). 웹은 지금처럼 localStorage.
- 10/23 PostHog: 네이티브는 `posthog-react-native`(화면 이벤트 `screen`, identify·reset 같음, 세션 녹화 끔). DEV-125 허용 호스트 검사는 웹에만. 키는 EAS 환경 변수 `EXPO_PUBLIC_POSTHOG_KEY`로 빌드 때 넣는다.
- 10/23 사진 선택: 네이티브는 `expo-image-picker`(비공개 사진 첨부, 생산자 사진·영상·소식). 업로드는 `{uri, name, type}`을 `FormData`에 붙인다(`UploadFile` 타입). 600px 축소는 웹에서만 하고 네이티브는 picker `quality: 0.8`로 보낸다. 생산자 원본 자료의 PDF·텍스트 첨부는 웹 전용으로 남긴다(네이티브는 사진만, 후속).
- 10/23 복사·공유: 복사는 `expo-clipboard`(지시 목록에 없던 의존성 하나. 주문 번호·계좌·운송장·링크 복사 버튼 5곳이 네이티브에서 조용히 실패하지 않게). 바깥 주소는 기존 `Linking`.
- 10/23 `eas.json`: `development`(dev client, internal) · `preview`(채널 `preview`, 스토어 형식 빌드라 TestFlight·Play 내부 테스트에 바로 제출) · `production`(채널 `production`). `autoIncrement`, `appVersionSource: remote`. 서버 주소 등 `EXPO_PUBLIC_*`는 프로필 env에 둔다(웹 배포 워크플로와 같은 값).
- 10/23 `internal` 프로필 추가(사용자 요청): `preview`를 상속하고 `distribution: internal`, Android APK, iOS 시뮬레이터 빌드. 스토어 유료 등록이 I3로 미뤄져 I2 내부 테스트는 Expo 무료 계정만으로 Android 실기기(APK 링크)·iOS 시뮬레이터에서 한다. README "Internal testing without store accounts".
- 10/23 `updates.url`은 EAS 프로젝트 ID가 있어야 하는 값이라 레포에 자리표시자를 두지 않는다(잘못된 URL로 빌드되면 앱이 시작 때 업데이트 설정 오류를 낸다). `eas init` → `eas update:configure`가 `extra.eas.projectId`·`updates.url`을 app.json에 쓴다(README). `runtimeVersion: { policy: "fingerprint" }`는 지금 넣는다.
- 10/23 두 앱 `index.html`에 PR #164의 manifest·홈 화면 메타를 가져온다(DEV-41 iOS 생산자 홈 화면 주소창 문제). `assetlinks.json`의 TWA 지문은 EAS 서명 키와 다르므로 자리표시자로 바꾼다.
- 10/23 웹 복귀 화면의 앱 전달은 `window.location.replace(앱 스킴)`이고, Android Chrome(Custom Tabs)이 스크립트로 시작한 커스텀 스킴 이동을 사용자 제스처 없이 막을 수 있어 ‘앱 열기’ 버튼(사용자 탭)을 같이 보인다. 실기기 확인은 DEV-41. 안 되면 서버 콜백이 302로 앱 스킴으로 보내는 방식(서버 변경)을 후속으로 검토한다.
- 10/23 `expo-doctor`가 알리는 기존 패키지 패치 버전 차이(expo·expo-router·expo-constants·expo-linking·@expo/metro-runtime)는 이번 변경과 무관해 올리지 않았다(의존성 일괄 변경 금지). 첫 빌드 전에 `npx expo install --check`로 맞추는 것을 권한다.

### 작업
- [x] 소비자 `app.json`·`eas.json`, 의존성(`npx expo install` expo-updates·secure-store·web-browser·image-picker·clipboard·file-system·application·device·localization, posthog-react-native)
- [x] `packages/api` 저장소 분리(SecureStore), `UploadFile`, 비공개 사진 주소
- [x] `packages/analytics` posthog-react-native 분기
- [x] `packages/ui` 포그라운드 판단(AppState), 비공개 사진 네이티브 선택
- [x] 소비자 카카오: 네이티브 인가 세션·메모리 복귀 정보·웹 복귀 화면의 앱 전달
- [x] 생산자 같은 방식 + 사진·영상 선택·beforeunload 가드·복사
- [x] `public/.well-known`·manifest·`vercel.json` 헤더(두 앱)
- [x] `scripts/test-native-config.mjs`(설정·JSON·웹 전용 코드 격리·카카오 상태 값) → `test:mock`
- [x] 검증: `npx expo-doctor`, `npx expo config --type public`, `expo export -p web|ios|android`(JS 번들만), `npm run typecheck`, `npm run test:mock`, Playwright 카카오 spec(아래 기록)
- [x] 문서: stack.md, ADR 0013, wiki 한 줄, README(사용자가 실행할 순서), spec.md

### 완료 조건
- [ ] 소비자·생산자 앱 EAS 전환(이슈 완료 조건 2·3): 설정·식별자·플랫폼 분리·토큰·카카오 복귀·PostHog. 웹 빌드·`test:mock`·Playwright 그대로 통과
- [ ] `eas build`·`eas submit`·설치 확인은 계정(DEV-128) 뒤 사용자가 실행 → 이슈 기록에 명령 체크리스트
- [ ] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/23 origin/main 9436171에서 시작. 디스크 여유 약 4GB라 루트 `npm ci` 한 번, 로컬 네이티브 빌드는 하지 않는다.
- 10/23 검증(모두 이 worktree에서 실행): `npm run typecheck` 5개 워크스페이스 통과 · `npm run test:mock` 51/51(새 `test-native-config.mjs` 11개 포함) · `npx expo config --type public` 두 앱 식별자·`runtimeVersion` 확인 · `npx expo export -p web`(두 앱, `dist/.well-known`·`manifest.webmanifest` 포함) · `npx expo export -p ios`·`-p android`(두 앱, Hermes 번들에 expo-secure-store·posthog-react-native·openAuthSessionAsync 포함, posthog-js 없음; 웹 번들은 반대) · `npx expo-doctor` 17/18(실패 1은 기존 패키지 패치 버전 차이) · 실서버 통합(`FARMCLUB_INTEGRATION_SKIP_DOCKER=1`, DB `farmclub_dev33`, `node scripts/run-integration.mjs scripts/e2e/consumer-kakao.spec.ts scripts/e2e/producer-kakao.spec.ts scripts/e2e/discovery-and-gates.spec.ts`): 실서버 시나리오 7/7, Playwright 9/9. 하지 않은 것: `eas build`·`eas submit`·실기기 설치(계정 DEV-128 뒤 사용자, README "Native apps with EAS" 순서).
- 10/23 origin/main(DEV-91·DEV-132) 병합: 충돌 3곳(두 tasks.md, 생산자 복귀 화면의 가입 토큰 분기 + `kakaoCallbackUri()`) 해결. DEV-132의 가입 대기 저장(`writeStore("kakao-signup")`)은 네이티브에서 SecureStore로 간다(작은 JSON, 2KB 이하). 병합 뒤 `npm run typecheck`·`npm run test:mock` 51/51·실서버 통합(시나리오 7/7, Playwright 카카오·관문·동의 spec 9/9) 다시 통과.
- 10/23 사용자와 함께: Expo 로그인(GitHub 연동 계정이라 `eas login --device`로), 조직 `snu-omm` 아래 `eas init`·`eas update:configure`(두 앱, `owner`·`extra.eas.projectId`·`updates.url` 커밋). `update:configure`가 `internal` 프로필에 `channel: internal`을 넣고 `associatedDomains`를 중복시켜 `channel: preview`로 고치고 중복을 지웠다(테스트에 추가). 다음: internal 빌드(Android APK는 첫 빌드에서 키스토어 생성 확인이 필요해 사용자 터미널에서, iOS 시뮬레이터는 자격 증명 없이).
