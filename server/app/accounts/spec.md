# server/app/accounts spec

> 구현하는 기능: FEAT-01 · 지키는 규칙: R-22, N-05, N-06 · 인수 조건: AC-01-1~3
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-01-login.md, rules.md (여기에 다시 쓰지 않는다)
> 흐름: docs/spec/tech-design/stack.md 5장 "카카오 로그인", ADR 0003

## 역할
사용자와 역할, 카카오 로그인 → JWT 발급, 생산자 가입 신청과 운영자 승인·반려.

## 구조
- `router.py` — prefix `/auth`(앱에서는 `/api/auth`). 예: `POST /api/auth/kakao`. 관리 API `/admin/producers/...`는 DEV-4.
- `models.py` — 담당 엔티티: `User`
- `schemas.py` — 로그인 요청·토큰 응답, 내 정보, 가입 신청 입출력
- `service.py` — 카카오 토큰 교환(httpx), 사용자 찾기·만들기, JWT 발급, 가입 신청·승인

## 계약
- `User`: id, kakaoId, roles(CONSUMER·PRODUCER·ADMIN 복수), name, phone (tech-design/README.md). 카카오에서는 이름만 받는다(FQ-01).
- JWT 검증·현재 사용자 조회는 `core/security.py`가 제공하고, 토큰 발급은 이 모듈이 한다.
- 다른 모듈과의 경계
  - farms: 가입 신청이 만드는 `Farm`(approvalStatus=PENDING)과 승인 상태는 farms가 가진다. 이 모듈은 farms의 service 함수로 농가를 만들고 승인 상태를 바꾼다.
  - 배송지는 orders가 가진다(내 정보 SCR-17의 배송지 관리).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우터 prefix는 `/auth` | stack.md 5장 `POST /api/auth/kakao` | — |
