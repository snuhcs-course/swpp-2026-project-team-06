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

