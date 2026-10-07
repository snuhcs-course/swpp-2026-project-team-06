# server/app/accounts spec

> 구현하는 기능: FEAT-01(Mock 로그인), FEAT-08(저장 배송지) · 지키는 규칙: R-22, N-05, N-06, N-07 · 인수 조건: AC-01-1~5, AC-08-5
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-01-login.md, rules.md (여기에 다시 쓰지 않는다)
> API 원본: docs/spec/screens.md 7.2 accounts · 흐름: docs/spec/tech-design/stack.md 5장 "Mock 로그인", ADR 0009(I1), ADR 0003(카카오, I2)

## 역할
사용자와 역할, I1 Mock 로그인(시드 테스트 계정) → JWT 발급, 생산자 가입 신청과 운영자 승인·반려, 사용자별 저장 배송지(내 정보 SCR-17). 카카오 로그인은 I2.

## 구조
- `router.py` — prefix `/auth`(앱에서는 `/api/auth`). `GET /api/auth/test-accounts`, `POST /api/auth/test-login`, `GET /api/auth/me`, 생산자 신청 `POST`·`GET /api/auth/producer-application`, 배송지 `/api/auth/me/addresses`. 관리 API `/admin/producers/...`는 DEV-4. (I2) `POST /api/auth/kakao`.
- `models.py` — 담당 엔티티: `User`, `ShippingAddress`
- `schemas.py` — 테스트 계정·로그인 응답, 내 정보, 가입 신청, 배송지 입출력
- `service.py` — 테스트 계정 조회·로그인(플래그·`isTestAccount` 확인), 사용자 조회, JWT 발급, 가입 신청·승인, 배송지 저장. (I2) 카카오 토큰 교환(httpx)

## 계약
- `User`: id, kakaoId?(I2), isTestAccount, roles(CONSUMER·PRODUCER·ADMIN 복수), name, phone (tech-design/README.md).
- Mock 로그인은 설정 `MOCK_LOGIN_ENABLED`가 켜져 있을 때만 동작하고, 꺼지면 두 엔드포인트 모두 404다. `isTestAccount = true`인 시드 계정만 로그인되고 새 계정은 만들지 않는다(AC-01-4·5). 테스트 계정에는 `ADMIN`을 주지 않는다(ADR 0009).
- 시드: 소비자 2, 승인된 생산자 1, 승인 대기 생산자 1(N-07). 이름·연락처·주소는 가짜 값.
- JWT 검증·현재 사용자 조회는 `core/security.py`가 제공하고, 토큰 발급은 이 모듈이 한다.
- 다른 모듈과의 경계
  - farms: 가입 신청이 만드는 `Farm`(approvalStatus=PENDING)과 승인 상태는 farms가 가진다. 이 모듈은 farms의 service 함수로 농가를 만들고 승인 상태를 바꾼다.
  - orders: 주문서 기본값으로 `ShippingAddress`를 이 모듈 service로 읽는다. 주문은 배송지를 참조하지 않고 주문 시점 값을 `Order`에 복사한다(배송지를 바꿔도 지난 주문은 그대로).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 저장 배송지는 accounts의 `ShippingAddress`(사용자별) | 사용자 정보와 함께 관리, 주문과 분리(팀 결정) | AC-08-5 |
| 2026-10-07 | 라우터 prefix는 `/auth` | stack.md 5장 | — |
| 2026-10-07 | I1 로그인은 시드 테스트 계정 Mock 로그인(플래그), 카카오는 I2 | P22 결정, ADR 0009 | AC-01-4, AC-01-5 |
