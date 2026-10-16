# server/app/admin spec

> 구현하는 기능: DEV-35 운영자 감사·예외 복구 · 지키는 규칙: M01~M03, M07, N-05, N-06
> API 원본: docs/spec/screens.md 7.2 운영자

## 역할
운영자 상태 변경을 기존 `IdempotencyRecord`와 함께 감사하고, 일시 실패를 조회·재시도·해결한다. `ManagerEvent`는 감사 전용이며 멱등 판단은 하지 않는다.

## 계약
- 원 요청 body는 같은 actor·scope·key로 재시도할 때만 쓰며 API나 로그에 내보내지 않는다. 목록·상세에는 정제한 요약만 반환한다.
- M01~M03의 일시 실패만 재시도한다. 원래 actor로 실행하고 재시도를 누른 운영자는 별도 기록한다.
- 비 API 실패는 요청 세션을 rollback한 뒤 새 세션으로 기록한다. 감사 기록 실패는 요청 내용 없이 로그만 남기고 원래 예외를 보존한다.
- 환불 요청 알림은 해결할 수 있지만 재시도할 수 없다. 알림은 `messaging.consumer_send`가 메시지와 같은 트랜잭션에서 `record_refund_request`로 저장하므로 rollback·멱등 경쟁 loser에는 남지 않고, 메시지 ID가 같은 알림은 하나만 저장한다.

## 구현 결정
| 날짜 | 결정 | 이유 |
| --- | --- | --- |
| 2026-10-16 | `ManagerEvent`와 `IdempotencyRecord`를 분리하고 후자만 멱등 원천으로 사용 | 감사와 실행 결과 재생의 책임 분리 |
| 2026-10-16 | 기본 예외 목록은 `OPEN`·`FAILED`만 표시 | 잘못된 요청 감사 행이 운영 대상을 가리지 않게 |
