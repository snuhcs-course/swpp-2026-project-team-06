# server/app/farms spec

> 구현하는 기능: FEAT-02, FEAT-06(홈 포함), FEAT-12(자동 팔로우), FEAT-19 · 지키는 규칙: R-22, R-24, N-06 · 인수 조건: AC-02-1~2, AC-06-1~5, AC-12-4, AC-19-1~3
> API 원본: docs/spec/screens.md 7.2 farms
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-02·06·19, rules.md (여기에 다시 쓰지 않는다)
> 흐름: docs/spec/tech-design/stack.md 5장 "공유 링크", ADR 0006

## 역할
홈·발견(시즌 히어로, 추천 상품, 소식 미리보기), 농가 프로필, 농가 목록·검색, 팔로우, 농가 공유 링크(OG 페이지), 운영자의 농가 정지.

## 구조
- `router.py` — prefix `/farms`(앱에서는 `/api/farms`). 홈 라우터 `/home`(`GET /api/home`), 공유 링크 라우터 `/s/farms/<id>`, 관리 API `/admin/farms/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Farm`, `Follow`
- `schemas.py` — 농가 카드·프로필·팔로우 입출력
- `service.py` — 홈 데이터, 목록 정렬(예약 마감 임박순, ia.md 3장), 검색, 팔로우, 승인 상태 변경
- `templates/` — 공유 링크 OG HTML(Jinja2). 기능 이슈에서 만든다.

## 계약
- `Farm.approvalStatus`(PENDING/APPROVED/REJECTED)는 이 모듈이 가진다. 생산자 권한 검사(`core/security.require_approved_producer`)가 이 값을 읽는다.
- 공유 링크 `/s/farms/<id>`: OG 태그(농가 이름·소개·대표 사진) HTML → 소비자 앱 `/farms/<id>`. 승인 취소된 농가는 OG 없이 ‘찾을 수 없는 농가’로(ADR 0006).
- 홈: 시즌 히어로는 서버 설정 값(시드), 운영자 관리는 I2. 추천 상품은 FEAT-06 정렬의 상위 N개(N은 설정 값), 소식 미리보기는 공개 소식 최신 3개(messaging service).
- 다른 모듈과의 경계
  - accounts: 가입 신청·승인은 accounts가 이 모듈 service로 `Farm`을 만들고 바꾼다.
  - catalog: 농가 목록 정렬에 필요한 현재 단계 마감일·가격은 catalog service에서 받는다.
  - orders: 농가 정지(R-24) 때 출하 전 주문 전액 환불은 orders service를 부른다.
  - messaging: 팔로워 목록(M-01)·팔로우 여부를 이 모듈 service가 주고, 채팅 시작 때 자동 팔로우도 이 service로 한다(AC-12-4).
  - catalog: 홈 추천 상품은 catalog service에서 판매 중 상품과 현재 단계 마감일을 받는다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우터 prefix는 `/farms`, 공유 링크는 별도 라우터 `/s` | ADR 0006 주소를 앱 API와 분리 | AC-19-1 |
| 2026-10-07 | 홈(`GET /api/home`)은 farms가 별도 라우터로 맡는다 | 홈은 FEAT-06 확장(P22 결정) | AC-06-4, AC-06-5 |
