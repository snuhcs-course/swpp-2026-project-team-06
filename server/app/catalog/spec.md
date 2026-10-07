# server/app/catalog spec

> 구현하는 기능: FEAT-03(저장·편집 쪽), FEAT-04, FEAT-05, FEAT-07, FEAT-14(상품·단계 쪽) · 지키는 규칙: R-05, R-06, R-16, R-17, R-18, R-20, R-21, R-23, R-25, M-11, M-12, M-13, M-15, N-06 · 인수 조건: AC-03-1~3, AC-04-1~4, AC-05-1~3, AC-07-1~2, AC-14-1~2
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-03·04·05·07·14, rules.md (여기에 다시 쓰지 않는다)
> 데이터 불변 조건: docs/spec/tech-design/README.md "데이터 불변 조건" 3·5·6·7

> API 원본: docs/spec/screens.md 7.2 catalog

## 역할
상품, 중량 옵션, 단계·단계 가격·단계 물량, AI 상품 초안 저장, 운영자의 상품 승인·반려.

## 구조
- `router.py` — prefix `/products`(앱에서는 `/api/products`). 관리 API `/admin/products/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Product`, `ProductOption`, `Stage`, `StagePrice`, `StageAllocation`, `ProductDraft`
- `schemas.py` — 상품 상세·편집, 단계 설정, 초안 입출력
- `service.py` — 상품 상태 전이(DRAFT/PENDING_APPROVAL/PUBLISHED/CLOSED), 현재 단계 찾기, 기본값 단계 구성, 재승인 판단(R-25)

## 계약
- 현재 단계는 `Stage.startsAt ≤ 지금 < endsAt`인 단계 하나다. 한 상품의 단계 구간은 겹치지 않는다(불변 조건 3).
- `StageAllocation`은 이 모듈이 가지지만, 주문 때 차감은 orders가 자기 트랜잭션 안에서 이 모듈 service 함수(행 잠금 조회·차감·되돌리기)를 불러 한다(R-06). 직접 UPDATE하지 않는다.
- 다른 모듈과의 경계
  - ai: 초안 생성(FEAT-03)은 ai 어댑터가 하고, 이 모듈은 입력·결과를 `ProductDraft`로 저장하고 편집 화면 데이터로 바꾼다. 가격·단계는 AI 결과로 채우지 않는다(M-12).
  - orders: 주문 시 단계 가격 복사(R-17), 물량 차감·환불 시 되돌리기.
  - farms: 농가 목록 정렬과 홈 추천 상품용 현재 단계 마감일·가격을 제공한다.
  - messaging/ai: 문의 응답 근거(상품 정보·당도, M-15)를 제공한다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | `ProductDraft`는 catalog가 가진다. ai 모듈은 저장하지 않는다 | ai는 모델 호출 어댑터만 맡아 다른 모델로 바꾸기 쉽게(ADR 0004) | AC-03-1 |
| 2026-10-07 | 라우터 prefix는 `/products` | ia.md 경로와 같은 말 | — |
