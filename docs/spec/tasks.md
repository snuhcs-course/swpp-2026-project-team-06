# tasks.md — I1 프로토타입 스펙 (P14~P22)

- 이슈: SWPP-18(P14) · SWPP-19(P15) · SWPP-20(P16) · SWPP-21(P17) · SWPP-22(P18) · SWPP-23(P19) · SWPP-24(P20) · SWPP-25(P21) · SWPP-26(P22)
- 브랜치: `nemodleo/swpp-18-i1-p14-p22-prototype-spec`
- 상태: 진행 중 (단계별로 PM 결정 반영)

## 목표
10/04 유저스터디 분석 회의 결정과 proposal을 바탕으로 I1 프로토타입 스펙(개요·IA·기능 요구사항·정책·확정 스펙·기술 스택·와이어프레임·화면 명세)을 확정해, 프론트(DEV-3)·백엔드(DEV-4)가 바로 구현을 시작할 수 있게 한다.

## 범위 (수정 허용 경로)
- `docs/spec/**` — 한국어 스펙 원본 (팀 내부)
- `docs/wiki/Requirements-and-Specifications.md`, `docs/wiki/Design-Documentation.md` — 영문 평가 문서 (P22 확정 후 반영)

## 비범위
- 앱 코드, `AGENTS.md`의 기술 스택 섹션(스택 확정 후 별도 PR)
- BM·법인·정산 등 사업 사항 (레포에 쓰지 않음)

## 입력
- Proposal (팀 프로젝트 설명), 회의록 `docs/wiki/meetings/2026-10-04-user-study-analysis-target.md` 외
- 가설·기능 후보: 팀 Notion Problems / Feature DB 사본
- Tech Stack 사본 (Linear 문서)

## 작업
- [x] P14 프로토타입 개요 → `prd.md`
- [x] P15 IA·사용자 흐름 → `ia.md`
- [x] P16 기능 명세 → `functional/` (`README.md`, `rules.md`, `FEAT-xx-*.md`)
- [x] P17 서비스 정책 → `policy.md`
- [ ] P18 프로토타입 스펙 확정 → P14~P17 문서 간 정합성 확인, `README.md` 갱신
- [x] P19 기술 스택 → `tech-design/stack.md`, 결정 기록은 `tech-design/adr/`
- [ ] P20 와이어프레임 → `wireframes.md`
- [ ] P21 화면 명세 → `screens.md`
- [ ] P22 검토·확정 → 전체 스펙 검토, 영문 wiki 반영

## 결정 사항
- 10/06 I1 결제는 Mock 결제 (주문 상태 전이만 구현, 실결제는 I2 이후)
- 10/06 P20·P21은 PM이 새로 작성 (기존 Figma·docx는 접근 불가 → P22에서 대조)
- 10/07 스펙 원본 위치를 `docs/specs/i1/`에서 `docs/spec/`으로 통합, 파일 이름에서 P 번호를 뺀다 (안내는 `docs/spec/README.md`)

## 기록
- 10/06 브랜치·spec 생성
- 10/07 P14~P17 `docs/spec/`으로 이관 완료, 이 파일을 `docs/spec/tasks.md`로 이동

## DEV-13 데이터 모델에 ShippingAddress 추가

- 이슈: [DEV-13](https://linear.app/sswp6/issue/DEV-13)
- 브랜치: `nemodleo/dev-13-데이터-모델에-shippingaddress-추가`
- 기능·인수 조건: FEAT-08 / AC-08-5
- 상태: 진행 중

### 목표
DEV-12(PR #20) 리뷰에서 정한 저장 배송지 결정을 데이터 모델·기술 스택 문서에 반영해, DEV-4 구현 전에 문서와 코드 폴더 spec.md가 맞게 한다.

### 범위 (수정 허용 경로)
- `docs/spec/tech-design/README.md` (데이터 모델 표)
- `docs/spec/tech-design/stack.md` (3장 레포 구조, 4장 FEAT ↔ 코드 폴더)
- `docs/wiki/Design-Documentation.md` (레포 구조, 2.3 Data Model 영문 요약)
- `docs/spec/tasks.md` (이 절)

### 비범위 (건드리지 않음)
- 서버 코드·모델(DEV-4), 코드 폴더 spec.md(DEV-12에서 반영 완료)
- 다른 스펙 문서(prd·ia·functional·policy)

### 결정 사항
- 10/07 저장 배송지는 accounts 모듈의 `ShippingAddress`(사용자별, AC-08-5)
- 10/07 주문은 `ShippingAddress`를 참조하지 않고 주문 시점 주소를 `Order`에 복사한다(배송지를 바꿔도 지난 주문이 바뀌지 않게). `Order`에 `postalCode`·`addressDetail`도 둔다
- 10/07 데이터 모델 표의 필드 이름은 문서 관례대로 camelCase + 괄호 한국어로 쓴다. 코드(SQLAlchemy·DB 컬럼)는 snake_case

### 작업
- [x] tech-design/README.md에 `ShippingAddress` 행, `Order` 행 관계 칸에 배송지 사본 표시
- [x] stack.md 3장 `accounts/`·`orders/` 설명, 4장 FEAT-08 행 수정
- [x] tech-design/README.md `Order`에 배송지 사본 필드(받는 사람·연락처·우편번호·주소·상세 주소)
- [x] wiki Design-Documentation.md 2.3 `ShippingAddress`·`Order` 행
- [x] wiki Design-Documentation.md 레포 구조의 `accounts/`·`orders/` 설명(stack.md 3장 영문판, 리뷰에서 발견)

### 완료 조건
- [x] 데이터 모델 표에 `ShippingAddress`(id, userId, recipientName, recipientPhone, postalCode, address, addressDetail, isDefault, createdAt)
- [x] `Order` 행에 배송지 사본 필드와 "주문 시점 복사" 표시
- [x] stack.md의 배송지 소속이 accounts로 맞음
- [x] wiki 영문 요약 동기화
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 문서 반영 완료
- 10/07 AI 1차 리뷰: wiki 레포 구조의 orders "addresses"가 stack.md와 어긋나 수정. PR 본문 갱신

## SWPP-26 [I1-P22] Review & finalize specifications

- 이슈: [SWPP-26](https://linear.app/sswp6/issue/SWPP-26)
- 브랜치: `nemodleo/swpp-26-i1-p22-review-finalize-specifications`
- 기능·인수 조건: FEAT-01, 06, 08, 09, 10, 12, 13, 15, 17 (변경) / 새 AC와 I2로 미룬 AC는 `functional/README.md` 추적표
- 상태: 진행 중

### 목표
P21 화면 명세(초안, 제안서 기준)를 확정 스펙(`docs/spec`)과 합쳐 `screens.md`로 레포에 올리고, 바뀐 결정을 스펙 전체와 영문 wiki에 반영해 프론트(DEV-3)·백엔드(DEV-4)가 같은 화면·API 기준으로 구현하게 한다.

### 범위 (수정 허용 경로)
- `docs/spec/**` (새 파일 `screens.md`, `tech-design/adr/0009-mock-login.md` 포함)
- `docs/wiki/Requirements-and-Specifications.md`, `docs/wiki/Design-Documentation.md`, `docs/wiki/Testing-Documentation.md`
- `AGENTS.md` "프로젝트"의 기술 스택 한 줄(로그인)
- `server/spec.md`, `server/app/{accounts,farms,catalog,orders,messaging,ai}/spec.md`
- `apps/consumer/spec.md`, `apps/producer/spec.md`, `packages/api/spec.md`
- `apps/consumer/tasks.md`, `apps/producer/tasks.md`, `packages/tasks.md`(DEV-3 할 일), `server/tasks.md`(DEV-4 할 일)

### 비범위 (건드리지 않음)
- 앱 코드(탭 레이아웃, 라우트 파일), 서버 코드, `server/.env.example`의 KAKAO 변수 → DEV-3·DEV-4 tasks.md에 할 일로 적음
- `docs/wiki/Proposal.md`, 회의록, 랜딩 페이지(`docs/*.html`)
- BM·정산 수치, Notion 링크

### 결정 사항
1/2 결정 표 (I1 기준, 이 표가 최우선). P21 = P21 초안을 따름, docs = 기존 docs/spec을 따름.

| # | 결정 | 따르는 쪽 |
| --- | --- | --- |
| 1 | 로그인은 Mock(시드 테스트 계정 선택). 카카오 로그인은 I2 | P21 |
| 2 | 소비자 하단 탭: 발견 · 소식 · 채팅 · 내 정보. 주문 내역은 내 정보 안으로 | P21 |
| 3 | 첫 화면은 홈·발견(시즌 히어로, 추천 상품, 소식 미리보기) | P21 |
| 4 | 출하 처리는 주문별 상태 변경 + 송장 번호 입력. AI가 주문을 찾는 기능은 I2 | P21 |
| 5 | AI 답변은 AI 배지 + 어려우면 생산자 전달. ‘틀렸어요’(M-17)는 I2. M-18 유지 | P21 |
| 6 | 소식에 반응(좋아요) 버튼과 반응 수. I1 범위 | P21 |
| 7 | 화면 명세는 P21 형식(목적, 화면 요소·데이터, 입력·출력, 버튼 동작, 빈 상태·오류) + API 표, 공통 오류 형식, cursor 페이지네이션, 멱등 키, 입력값 보존 | P21 |
| 8 | 단계별 가격(이른 단계일수록 쌈)과 그 연출 | docs |
| 9 | 예약할 때 전액 결제(I1 Mock, I2 PortOne) | docs |
| 10 | 농가 페이지는 별도 화면, 탭 [상품 \| 소식] | docs |
| 11 | 생산자 가입·승인(SCR-20·21), 상품 게시 승인·재승인(R-25) | docs |
| 12 | 생산자 하단 탭: 현황 · 상품 · 질문함 · 농가 | docs |
| 13 | 용어·데이터 모델은 docs(Order, 주문 상태, ShippingAddress). P21 Reservation → Order | docs |
| 14 | API 경로는 `/api/<prefix>`, `/admin/...`, `/s/...` (P21 `/api/v1` 안 씀) | docs |

1/2 보고 뒤 추가 결정 (10/07)
- 10/07 P01 파일 업로드: I1은 텍스트 붙여넣기만. 파일·사진은 기존대로 P2(FEAT-29)
- 10/07 레이블: “채팅” = 소비자와 농가의 1:1 질문·답(AI 안내 포함), “소식” = 농가가 올리는 1:N 글. 소비자 화면에 “메시지”를 쓰지 않는다. SCR-27 “메시지 보내기” → “소식 올리기”. 생산자 탭 “질문함” 유지
- 10/07 소식 탭: 팔로우한 농가의 소식(공개 + 팔로워 전용) 시간순. 팔로우한 농가가 없으면 빈 상태에서 농가 둘러보기 안내. 채팅 탭은 1:1 질문·답만. 소식 카드 ‘질문하기’ → 그 농가 채팅. M-14 유지
- 10/07 팔로우 없이 ‘채팅하기’ → 자동 팔로우 후 대화 시작(“팔로우하고 대화를 시작해요”). M-04 유지
- 10/07 반응: FEAT-15 확장. 로그인 필요, 종류는 ‘좋아요’ 하나, 한 사람 한 번 토글, 볼 수 있는 소식이면 팔로워 전용에도 가능, 반응 수는 숫자
- 10/07 홈: 시즌 히어로는 시드 데이터(서버 설정 값), 운영자 관리는 I2. 추천 상품은 FEAT-06과 같은 마감 임박순 상위 N개. 홈은 FEAT-06 확장
- 10/07 SCR-01은 랜딩 → 홈·발견으로 재정의. ‘농가로 시작하기’는 내 정보(SCR-17)로. 레포 밖 마케팅 랜딩은 별개
- 10/07 Mock 로그인: 테스트 계정은 소비자 2, 승인된 생산자 1, 승인 대기 생산자 1. 운영자는 Swagger(관리 API). Mock 로그인 API는 설정 플래그로 켜고 끄며, I1 데모 배포에서는 켜되 시드 테스트 계정만 고를 수 있다(임의 계정 생성 불가). I2 카카오 전환 때 끈다. 위험은 ADR 0009. 둘러보다가 팔로우·예약·채팅·반응 때만 로그인하는 흐름은 유지
- 10/07 배송 상태는 docs 기준: 생산자는 출하 준비·출하(송장)까지, 배송 완료는 운영자
- 10/07 `Order.deliveryNote`(배송 메모, 선택, 짧은 글) 추가. 개인정보 취급은 주소와 같음
- 10/07 SCR-29 출하 처리는 별도 화면 유지
- 10/07 오류 형식은 P21의 `{code, message, details}`. packages/api도 함께
- 10/07 AGENTS.md 스택 한 줄은 “I1 Mock 로그인, I2 카카오”로. 앱 코드·`server/.env.example` KAKAO 변수는 DEV-3·DEV-4 tasks.md 할 일로. wiki Proposal.md는 그대로

### 불일치 목록 (P21 ↔ docs/spec)

| # | 항목 | P21 | docs/spec(이전) | 정한 쪽 |
| --- | --- | --- | --- | --- |
| 1 | 로그인 | 범위 밖(로그인된 계정 가정) | 카카오 로그인 | Mock 로그인(결정 1), 카카오 I2 |
| 2 | 소비자 탭 | 발견·소식·채팅·내 정보 | 농가·메시지·주문·내 정보 | P21(결정 2) |
| 3 | 첫 화면 | C01 홈·발견 | SCR-01 랜딩 | P21(결정 3), SCR-01 재정의 |
| 4 | 출하 처리 | 상태 변경 + 송장 | 자연어 입력 → AI가 주문 찾기 | P21(결정 4), AI는 I2 |
| 5 | AI 오답 신고 | 없음 | ‘틀렸어요’(M-17) | P21(결정 5), M-17·AC-13-5 I2 |
| 6 | 반응 | 선택(와이어프레임에 있으면) | 없음 | P21(결정 6), FEAT-15 확장 |
| 7 | 화면 명세 형식 | 5항목 + API 표 | 없음(작성 전) | P21(결정 7) |
| 8 | 단계별 가격 | 없음(단일 가격) | 단계 가격·물량 | docs(결정 8) |
| 9 | 결제 | 결제 없이 예약만 | 예약 때 전액 카드 결제 | docs(결정 9) |
| 10 | 농가·상품 상세 | C02 한 화면 | SCR-03·SCR-04 분리 | docs(결정 10) |
| 11 | 생산자 가입·승인 | 없음 | SCR-20·21, R-22 | docs(결정 11) |
| 12 | 상품 게시 | 생산자가 바로 게시 | 게시 요청 → farmclub 승인, 재승인(R-25) | docs(결정 11) |
| 13 | 생산자 탭 | 없음 | 현황·상품·질문함·농가 | docs(결정 12) |
| 14 | 주문 모델·상태 | Reservation, RESERVED→…→DELIVERED, 상품 DRAFT/OPEN/CLOSED | Order, 주문 상태 표, 상품 DRAFT/PENDING_APPROVAL/PUBLISHED/CLOSED | docs(결정 13) |
| 15 | API 경로 | `/api/v1/...` | `/api/<prefix>`, `/admin`, `/s` | docs(결정 14) |
| 16 | AI 초안 입력 | 파일·이미지 업로드 + 텍스트 | 텍스트 붙여넣기(M-10) | docs(추가 결정), 파일은 FEAT-29 P2 |
| 17 | AI 초안 가격 | 가격 추출 | 가격 채우지 않음(M-12) | docs |
| 18 | 상품 필드 | price, packageDescription, harvestStart/End | 중량 옵션, 단계 가격, 배송 예정 기간 | docs |
| 19 | 레이블 | 채팅 | ‘채팅’은 쓰지 않는 말 | 새 정의(추가 결정): 채팅 = 1:1, 소식 = 1:N |
| 20 | 소식·채팅 범위 | C05 생산자별 소식, C06 대화 | 메시지함에 1:N 메시지와 답장이 섞임 | 추가 결정: 소식 탭 = 팔로우 농가 소식, 채팅 = 1:1만 |
| 21 | 팔로우 없이 채팅 | 상품에서 바로 채팅 | 팔로우한 농가에만 답장(M-04) | 추가 결정: 자동 팔로우, M-04 유지 |
| 22 | 홈 데이터 | `GET /home`(출처 미정) | 없음 | 추가 결정: 히어로 = 시드 설정 값, 추천 = 마감 임박순 |
| 23 | 생산자 배송 상태 권한 | DELIVERED까지 | 출하까지, 배송 완료는 운영자 | docs(추가 결정) |
| 24 | 배송 메모 | deliveryNote | 없음 | P21(추가 결정), `Order.deliveryNote` |
| 25 | 상품·예약 관리 | P03 한 화면 | SCR-22·23·29 | docs(추가 결정, SCR-29 유지) |
| 26 | 오류 형식 | `{code, message, details}` | `{"error": {code, message}}`(DEV-4에서 확정 예정) | P21(추가 결정) |
| 27 | 대화 단위 | producer + 선택 product | (Farm, Consumer)당 Thread 1개 | docs (I1은 상품별 대화를 나누지 않음) |
| 28 | 소식 단위 | 상품 선택 가능 | 농가 단위 Broadcast | docs (I1은 상품 연결 없음) |
| 29 | 취소·환불 | P18에서 확정 | 출하 전 전액 환불(FEAT-11) | docs |
| 30 | 결제 전 동의 | 없음 | 동의 4개(R-03) | docs |

### 작업
- [ ] `screens.md`: 결정 표, P21 ↔ SCR 대응표, 화면별 명세(5항목 + ID + 우선순위), API 표, P21 5장 확정 항목 정리
- [ ] `ia.md`: 소비자 탭, 첫 화면, 화면 목록, 화면 간 이동, 레이블
- [ ] `functional/`: FEAT-01·06·08·09·10·12·13·15·17, rules.md(R-19·R-22·M-01·M-04·M-05·M-14·M-17), README 추적표·AC 수
- [ ] `prd.md`: I1 범위와 I2로 미룬 것, 용어집
- [ ] `policy.md`, `tech-design/README.md`(Reaction, Order 필드, 테스트 계정), `stack.md`, ADR 0003(I2로 연기)·0004·0009(새 파일), `README.md`(screens.md)
- [ ] 코드 폴더 spec.md(server, 모듈, 두 앱, packages/api), AGENTS.md 한 줄, DEV-3·DEV-4 할 일
- [ ] wiki 영문 반영
- [ ] ID·상대 링크 검사, draft PR, AI 1차 리뷰

### 완료 조건
- [ ] 스펙-화면 불일치 목록 정리 및 수정 반영 (이 절의 표, screens.md)
- [ ] 문서 안 FEAT·AC·R·M·SCR ID가 서로 맞고 깨진 상대 링크가 없음
- [ ] 프론트(P23)·백엔드(P24) 담당자 확인 후 스펙 동결
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 1/2·2/2 결정 받음. 불일치 목록 정리
