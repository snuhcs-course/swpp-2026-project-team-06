# server/app/messaging spec

> 구현하는 기능: FEAT-12, FEAT-13(대화·전달 쪽), FEAT-15 · 지키는 규칙: M-01, M-02, M-03, M-04, M-05, M-06, M-07, M-08, M-09, M-14, M-16, M-17, N-04, N-05, N-06 · 인수 조건: AC-12-1~3, AC-13-1~5, AC-15-1~2
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-12·13·15, rules.md (여기에 다시 쓰지 않는다)

## 역할
농가의 전체 메시지(공개·팔로워), 소비자 답장, 농가 대화, AI 응답 저장, 농가에 전달(질문함), 생산자 답변, 연락처 가림, 농가 소식 목록. 운영자의 메시지 삭제.

## 구조
- `router.py` — prefix `/messaging`(앱에서는 `/api/messaging`). 관리 API `/admin/messages/...`는 기능 이슈에서 추가.
- `models.py` — 담당 엔티티: `Broadcast`, `Thread`, `ThreadMessage`, `Escalation`
- `schemas.py` — 메시지·답장·대화·질문함·소식 입출력
- `service.py` — 발송, 답장 → AI 응답 시도 → 전달, 연락처 가림(M-16), ‘틀렸어요’ 처리(M-17)

## 계약
- `Thread`는 (Farm, Consumer)당 1개. `ThreadMessage.senderType`은 CONSUMER/PRODUCER/AI, AI 응답은 `senderType = AI`와 근거(`sourceRefs`)를 가진다(M-08).
- 소비자 답장은 그 소비자와 농가만 본다(M-02). 답장은 팔로우한 농가에만(M-04).
- 첨부: 생산자 메시지 사진 최대 5장(장당 10MB)·영상 1개(60초, 100MB), 소비자 답장 사진 최대 3장(장당 10MB). 서버에서 다시 검사(stack.md 6장 FQ-05). 저장소(R2)는 기능 이슈에서.
- 다른 모듈과의 경계
  - ai: 답장이 오면 ai 어댑터에 문의 응답을 요청한다. 시간 초과·실패·답할 수 없음은 `Escalation`(전달)으로 처리한다(N-04, M-06). 연락처 가림은 이 모듈, AI 전송 전 개인정보 제거는 ai 모듈이 한다.
  - farms: 팔로워 목록(M-01), 공개 소식은 농가 페이지에서 쓴다.
  - catalog: AI 근거용 상품 정보는 catalog service에서 받는다.
  - analytics: `broadcast_sent`, `reply_sent`, `ai_replied`, `escalated` 서버 이벤트(본문 없이, N-05).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 라우터 prefix는 `/messaging` | 메시지·대화·소식을 한 모듈이 맡음 | — |
