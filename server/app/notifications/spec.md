# server/app/notifications spec

> 구현하는 기능: FEAT-18(알림, 1차는 농가에 가는 주문 알림톡) · 지키는 규칙: R-28, R-15, N-05, M-16
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (FEAT-18 기능 문서는 DEV-495에서 만든다. 여기에 다시 쓰지 않는다)

> 상태: 초안(DEV-495). 아직 코드가 없다. 아래 구조·계약은 `tasks/DEV-495.md` 설계를 PM이 확인한 뒤 구현하면서 고친다.

## 역할
업무 모듈이 남긴 알림을 outbox 행으로 받아, 주문 트랜잭션 밖에서 외부 발송 업체(카카오 알림톡, 실패 시 대체 문자)로 보낸다.

## 구조 (예정)
- `models.py` — `Notification`(outbox 행), 농가별 알림 설정
- `service.py` — `enqueue(db, event, order, ...)`: 같은 트랜잭션에 행을 넣는다(멱등 키, savepoint)
- `sender.py` — 발송자 인터페이스와 no-op 발송자(`NOTIFY_PROVIDER=none`)
- `solapi.py` — 솔라피 클라이언트(HMAC 서명, 주입 가능한 httpx transport)
- `worker.py` — API 프로세스 안 발송 루프(임대·재시도·상태 재확인·한도)
- `router.py` — 관리 API(조회·재시도)

## 계약 (예정)
- 업무 모듈은 `enqueue`만 부르고 외부 호출을 하지 않는다. `enqueue`가 실패해도 업무 트랜잭션은 커밋된다.
- 알림 행에는 받는 사람 이름·주소·전체 전화번호를 저장하지 않는다. 번호는 보낼 때 농가에서 읽고 끝 4자리만 남긴다.
- 로그에는 알림 id·주문 id·이벤트·상태·업체 상태 코드·끝 4자리만 남긴다.
- 테스트는 외부 네트워크로 나가지 않는다(no-op 발송자, `httpx.MockTransport`).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-11-27 | (PM 확인 전) 1차 알림은 입금 대기 진입·'입금을 마쳤어요' 두 가지, outbox + 프로세스 안 발송 루프 | `tasks/DEV-495.md` 설계·결정 1·4 | — |
