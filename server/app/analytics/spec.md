# server/app/analytics spec

> 구현하는 기능: PRD 4장 지표의 서버 이벤트 · 지키는 규칙: N-05
> 이벤트 이름·속성 원본: docs/spec/tech-design/README.md "트래킹 플랜", ADR 0005 (여기에 다시 쓰지 않는다)

## 역할
확정된 사실(결제·취소·구매 확정 등)을 PostHog에 서버 이벤트로 보낸다. 화면 이벤트는 앱이 보낸다(stack.md 5장 "지표").

## 구조
- `router.py` — prefix `/analytics`. 앱에 여는 경로는 두지 않을 예정. 등록만 해 둔다.
- `models.py` — 담당 엔티티: 없음
- `schemas.py` — 이벤트 이름·속성 형식
- `service.py` — `track(event, distinct_id, properties)` 자리

## 계약
- 이벤트 이름은 트래킹 플랜 표만 쓴다(`order_paid`, `order_canceled`, `farm_followed`, `broadcast_sent`, `reply_sent`, `ai_replied`, `escalated`, `draft_created`, `draft_published` 등).
- 사용자 구분은 내부 ID만. 이름·연락처·주소·메시지 본문은 넣지 않는다(N-05).
- 이벤트 전송 실패가 업무 처리(결제·취소)를 실패시키지 않는다.
- 다른 모듈과의 경계: orders·farms·messaging·catalog가 업무 처리 성공 뒤 이 모듈 service를 부른다.
- 의존성 `posthog`는 기능 이슈에서 추가한다(DEV-12에는 없음).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 이벤트 전송은 업무 트랜잭션과 분리(실패 무시·로그) | 지표 장애가 거래를 막지 않게 | — |
