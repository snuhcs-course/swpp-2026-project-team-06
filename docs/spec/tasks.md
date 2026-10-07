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
- `docs/wiki/Design-Documentation.md` (2.3 Data Model 영문 요약)
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

### 완료 조건
- [x] 데이터 모델 표에 `ShippingAddress`(id, userId, recipientName, recipientPhone, postalCode, address, addressDetail, isDefault, createdAt)
- [x] `Order` 행에 배송지 사본 필드와 "주문 시점 복사" 표시
- [x] stack.md의 배송지 소속이 accounts로 맞음
- [x] wiki 영문 요약 동기화
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 문서 반영 완료, AI 1차 리뷰 대기
