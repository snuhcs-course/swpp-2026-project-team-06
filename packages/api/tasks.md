# packages\api tasks

## DEV-3 로컬 프로토타입 통합 작업 (2026-10-07)

- 이슈: https://linear.app/sswp6/issue/DEV-3
- 브랜치: `jinwoo/dev-3-frontend`
- 상태: 로컬 실행 완료, 사용자 수정 대기
- 기준: screens.md 1.1, docs/design, ADR 0009·0010, 사용자 승인 계획

### 목표
Hyun Park 작성 farmclub-proto-ref.zip을 기준으로 두 앱을 Mock 모드로 실행하고 사용자 피드백을 반영한다.

### 범위
- packages/api/**

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
- 구현·검증 완료: Mock 회귀 11건, 4 workspace typecheck, 두 앱 web export 통과. 별도 Mock 브라우저에서 농가/상품 생성→편집→저장→공개 조회, 생성/저장 실패와 취소 보존, 로그인 복귀·팔로우 후 답장, 모바일 넘침 확인.
- 자체 리뷰 보완: 직접 진입한 상세 편집 뒤로 가기 확인·복귀, 권한 변경 후 늦은 메시지 응답 차단, optional 필드 응답과 멱등 재시도 모양 일치. 실제 데이터 백업·보존.
- 레거시 호환 점검: 후보 1건 — 지적 0건 / 정당 1건 (intro/description: base 3cc2332). PR CI 후 머지 예정.

## DEV-51 상품 표시 가격 조회
- 상태: 구현·로컬 검증·AI 리뷰 완료, PR CI/사람 리뷰 대기. 이슈 https://linear.app/sswp6/issue/DEV-51
- 범위: packages/api/src/productPresentation.ts, src/index.ts, spec.md, tasks.md; 기존 API 계약 변경 없음.
- 결정: 마지막 기간의 동일 옵션 가격과 현재 가격을 비교하며 품절/누락/동일 금액은 취소선을 생략한다. 목록은 기존 상품 상세 API를 제한된 동시 요청으로 조회하고 실패 시 비교 금액만 생략한다.
- 작업: [ ] 조회 도우미와 가격 기준 테스트; [ ] 검증 기록.
- 10/13 범위 확장: packages/api/src/mock/db.ts의 p-house 신규 시드 detailContent에 기존 승인된 단일 AI 농가 이야기 이미지를 지정한다. 소비자/생산자 public/photos에 같은 원본을 복사한다. 기존 저장 데이터는 재설정하거나 마이그레이션하지 않는다.

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

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.

## DEV-58 상품별 판매페이지 작업
- 범위: src/productWorkspace.ts, src/index.ts 및 spec/tasks. productWorkspace open/save/apply/인증 사진 클라이언트. 신규 생성은 단일 원자 API, 기존 상세는 비공개 수정본으로 보존. 타입4 workspace/mock13개 및 생산자 브라우저18개 통과.

## DEV-58 상세 편집 통합·항목별 ON/OFF
- 사용자 승인: 근거 검토 별도 탭/개별 확정 제거, 기존18항목별 스위치, 자동 채움·직접 편집·선택적 원문 보기.
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceDetailsEditor,ProductPageEditor}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/**, server/tests/**, scripts/e2e/**, 해당 spec/tasks 및 docs/spec/source-integration.md/docs/wiki/Source-Analysis.md.
- 결정: 유효한 단일 후보만 자동 채움(UNREVIEWED 유지), 충돌/과거/오래된/불명확한 후보 제외. 기존 저장 내용/선택 우선, OFF내용 보존. 편집값+모듈 선택 원자 저장 API와 기존 API 병행. 사진 승인/버전/명시적 공개 유지. 추가 AI 호출·머지·배포 없음.
- [x] 구현/회귀/영상/커밋 스캔

- 완료: 근거 검토 탭/개별 확정 제거, 자동 채움·18항목 스위치·직접 편집·접히는 원문, 문구/선택 원자 저장. 자동 값은 UNREVIEWED 유지, OFF 값/사진 보존, 충돌·오래된 항목은 선택적 해결. 기존 상품 편집도 같은 스위치로 통일했다.
- 검증: 전체 pytest284개 통과 후 오래된 OFF 사진 케이스 추가/보완을 포함한 최종 관련22개 통과. Ruff, 타입4 workspace, mock13개 통과. 기존 생산자·자료 Playwright18개 + 저장 실패/동일 요청 재시도1개 통과; 직접 탭 진입/분석 완료 갱신 보완 후 관련9개 재검증 통과.
- scan-before-commit: 상세 편집 탭 직접 진입 시 최신 결과를 읽지 않던 경로와 분석 중 열린 편집 화면의 초기 선택 갱신을 보완. 미저장 입력은 기존 버전에 고정해 충돌 시 보존한다. 최종 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (기존 review/drafts CONFIRMED 계약: 4d7eece).
- 영상: .artifacts/in-app-v4/toggle-review/index.html. 새 상품 mock 분석의 자동 채움/OFF저장/재진입/ON복원, 기존 실제 Gemini 생성 상품의 수정/반영을 녹화. 추가 유료 AI 호출0, PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

## DEV-68 무통장 입금 API·Mock
- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68) · 브랜치 `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌` · FEAT-09(개정)·14·17 · 상태: 진행 중

### 목표
서버와 같은 계약으로 types·endpoints·Mock을 바꾼다. 결제(`pay`, `mockResult`)를 입금 안내(`deposit`)·입금 확인(`confirmDeposit`)으로 교체한다.

### 범위 (수정 허용 경로)
- `packages/api/src/types.ts`, `packages/api/src/endpoints.ts`
- `packages/api/src/mock/{db,derive,orders,farms,sales}.ts`
- `scripts/test-capacity.mjs`, `scripts/test-spec12.mjs`, `scripts/test-navigation.mjs`, `scripts/test-integration.mjs`, `scripts/e2e/checkout-and-fulfillment.spec.ts`

### 비범위
- PortOne 클라이언트(#124). 소식·채팅 Mock.

### 결정 사항
- 10/18 `OrderStatus`에 `AWAITING_DEPOSIT`. `Order`에 `depositAccount`(bankName·accountNumber·accountHolder)·`depositDueAt`·`depositReportedAt`·`cancelReason`·`refundSettledAt`·`sellerInfo`(farmName·ownerName·region·phone). `ProducerOrder`에 `totalAmount`·`depositDueAt`·`depositReportedAt`·`refundSettledAt`. `Dashboard.todo`에 `awaitingDeposit`·`refundsToSettle`·`hasAccount`. `MyFarm`에 `bankName`·`accountNumber`·`accountHolder`.
- 10/18 Mock 시드: 농가 4곳 계좌, 입금 대기 주문 1건(김민지). Mock 테스트 스크립트는 `deposit` → 생산자 `confirm-deposit`으로 예약 완료를 만든다.

### 작업
- [x] types·endpoints 교체(`orders.deposit`·`depositReported`·`confirmDeposit`·`refundSettled`, `farms.updateMine` 계좌)
- [x] Mock orders: deposit·confirm·expire(지연)·reported·refund-settled, 목록 필터·대시보드
- [x] Mock farms: 계좌 GET/PATCH 검증, 초기 승인 요청 409 `NO_FARM_ACCOUNT`
- [x] Mock 테스트·통합 테스트·e2e 스크립트 갱신 후 `npm run test:mock`·`npm run typecheck` 통과

### 완료 조건
- [ ] 소비자·생산자 앱이 Mock과 실서버에서 같은 흐름으로 동작
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 섹션 작성.
- 10/18 범위 추가: `packages/api/src/mock/{auth,capacity,catalog}.ts`(가입 농가 레코드 계좌 칸, NO_FARM_ACCOUNT, holdsStock 집계).
- 10/18 `npm run typecheck`·`npm run test:mock`(13 통과) 확인. 범위 추가: `packages/ui/src/{format,index}.ts`(deadline 포맷).
- 10/18 농가 미승인: `orders.rejectDeposit(id, reason, cancel)`·`orders.refundIssue(id, reason)`, `Order`·`ProducerOrder`에 `depositIssue`·`refundIssue`, Mock 핸들러 같은 규칙(사유 필수 400, 409). Mock DB 필드는 선택이라 DB_VERSION 유지. test-capacity에 AC-09-9/AC-17-8.
- 10/18 Mock도 서버와 같게: 입금했다고 알린 주문은 기한이 지나도 취소하지 않음, 생산자 목록에서 `paidAt` 없는 취소 제외·`paidAt` 없으면 배송 정보 숨김.

## DEV-32 카카오 로그인 클라이언트

- 이슈: [DEV-32](https://linear.app/sswp6/issue/DEV-32) · GitHub #77
- 브랜치: `nemodleo/dev-32-i2-t14-implement-real-user-login-and-return-users-to-their`
- 기능·인수 조건: FEAT-01 / AC-01-8, AC-01-9, AC-01-12~15 · ADR 0003·0010
- 상태: 리뷰 중

### 범위 (수정 허용 경로)
- `packages/api/src/types.ts`(`KakaoConfig`, 10/18 `User` 온보딩 필드·`MeUpdateInput`·`Consent*`·`ONBOARDING_REQUIRED`·`ADDRESS_LIMIT`), `packages/api/src/endpoints.ts`(`auth.kakaoConfig`, `auth.kakaoLogin`, 10/18 `auth.updateMe`·`consents`·`saveConsents`), `packages/api/src/mock/{auth,db,router,conversations,rooms}.ts`, `packages/api/spec.md`, `packages/api/tasks.md`

### 결정 사항
- 10/17 Mock 모드의 `POST /api/auth/kakao`는 인가 코드와 무관하게 그 앱의 첫 테스트 계정(소비자 김민지)으로 로그인한다. 카카오 리다이렉트 없이 화면 흐름만 확인하기 위함.
- 10/18 위 결정을 바꿈: 소비자 앱 Mock 카카오 로그인은 카카오 계정 `u-kakao`(처음엔 이메일만, 온보딩 남음)를 만들어 들어간다. 온보딩 화면을 Mock에서도 확인하기 위함. 생산자 앱은 그대로 강영수. 테스트 계정(`kakao` 없음)은 온보딩 대상이 아니다.
- 10/18 Mock도 서버와 같은 규칙: `needsOnboarding`(db.ts), 관문 경로 403 `ONBOARDING_REQUIRED`(라우터 표의 `gated`), 동의 저장, 배송지 50개 409·수정 검증·기본 삭제 시 최근 것이 기본, 농가에 보이는 이름은 `publicName`(닉네임 우선). 저장소 `DB_VERSION`은 올리지 않음(새 필드는 모두 선택이라 기존 Mock 데이터와 호환).

### 작업
- [x] 타입·엔드포인트·Mock 추가, `npm run typecheck` 통과
- [x] 10/18 온보딩·동의·배송지 50개 타입·엔드포인트·Mock, `npm run typecheck` 4개 통과, `npm run test:mock` 13/13
- [x] 10/18 AI 리뷰 반영: 클라이언트가 403 `ONBOARDING_REQUIRED`를 받으면 `onOnboardingRequired` 구독자에게 알림(토큰은 유지). Mock 관문 표의 좋아요를 실제 경로대로 `PUT`으로 고침, Mock 주문 ‘기본 배송지로 저장’도 50개면 건너뜀. Mock 계약 테스트 `scripts/test-onboarding.mjs` 추가(범위에 `scripts/test-onboarding.mjs`, 루트 `package.json`의 `test:mock` 한 줄 추가). `npm run test:mock` 14/14

## DEV-74 생산자 앱 카카오 로그인 — Mock

- 이슈: [DEV-74](https://linear.app/sswp6/issue/DEV-74) · 기준 절: `apps/producer/tasks.md#dev-74`
- 범위: `packages/api/src/mock/auth.ts`(Mock 생산자 카카오 계정 `u-kakao-farm`), `scripts/test-onboarding.mjs`(생산자 카카오 → 가입 신청 확인)
- 10/18 결정: Mock 생산자 카카오 로그인은 강영수(승인) 대신 농가 없는 `u-kakao-farm`(이름 ‘카카오 사용자’)으로 들어가 가입 신청 흐름을 보여 준다. 상태별 시연은 테스트 계정 목록으로 계속 한다.
- [x] Mock 계정과 계약 테스트, `npm run test:mock` 15/15

## DEV-97 채팅 보내기 `productId`

- 이슈: [DEV-97](https://linear.app/sswp6/issue/DEV-97) · 기준 절: `server/tasks.md#dev-97`
- 범위: `src/endpoints.ts`(`messaging.send` 마지막 인자 `productId?`), `src/mock/conversations.ts`(`send`: 그 농가의 판매 중 상품이 아니면 404, 주문이 없을 때만 AI 근거로 넘김), `scripts/test-ai-feedback.mjs`
- [ ] 엔드포인트·Mock, `npm run test:mock`
