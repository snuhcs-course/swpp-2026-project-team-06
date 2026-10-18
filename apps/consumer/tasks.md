# apps/consumer tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 화면 자리: SCR-01~05, SCR-10~17 / FEAT-01, 02, 06~13, 15, 19
- 상태: 진행 중

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
- 10/18 SCR-14 입금 대기: 제목 「입금 확인 중」, 4단계 막대 비움, 입금 카드 재표시, 취소는 환불 없이 즉시. 만료 취소·환불 송금(입금했던 계좌로) 문구.
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
