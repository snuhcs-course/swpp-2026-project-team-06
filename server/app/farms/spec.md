# server/app/farms spec

> 구현하는 기능: FEAT-02, FEAT-06, FEAT-19 · 지키는 규칙: R-22, R-24, N-06 · 인수 조건: AC-02-1~2, AC-06-1~3, AC-19-1~3
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-02·06·19, rules.md (여기에 다시 쓰지 않는다)
> 흐름: docs/spec/tech-design/stack.md 5장 "공유 링크", ADR 0006

## 역할
농가 프로필, 농가 목록·검색, 팔로우, 농가 공유 링크(OG 페이지), 운영자의 농가 정지.

## 구조
- `router.py` — prefix `/farms`(앱에서는 `/api/farms`). 공유 링크 라우터 `/s/farms/<id>`와 관리 API `/admin/farms/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Farm`, `Follow`
- `schemas.py` — 농가 카드·프로필·팔로우 입출력
- `service.py` — 목록 정렬(예약 마감 임박순, ia.md 3장), 검색, 팔로우, 승인 상태 변경
- `templates/` — 공유 링크 OG HTML(Jinja2). 기능 이슈에서 만든다.

## 계약
- `Farm.approvalStatus`(PENDING/APPROVED/REJECTED)는 이 모듈이 가진다. 생산자 권한 검사(`core/security.require_approved_producer`)가 이 값을 읽는다.
- 공유 링크 `/s/farms/<id>`: OG 태그(농가 이름·소개·대표 사진) HTML → 소비자 앱 `/farms/<id>`. 승인 취소된 농가는 OG 없이 ‘찾을 수 없는 농가’로(ADR 0006).
- 다른 모듈과의 경계
  - accounts: 가입 신청·승인은 accounts가 이 모듈 service로 `Farm`을 만들고 바꾼다.
  - catalog: 농가 목록 정렬에 필요한 현재 단계 마감일·가격은 catalog service에서 받는다.
  - orders: 농가 정지(R-24) 때 출하 전 주문 전액 환불은 orders service를 부른다.
  - messaging: 팔로워 목록(M-01)은 이 모듈 service가 준다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우터 prefix는 `/farms`, 공유 링크는 별도 라우터 `/s` | ADR 0006 주소를 앱 API와 분리 | AC-19-1 |
