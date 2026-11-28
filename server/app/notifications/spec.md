# server/app/notifications spec

> 구현하는 기능: FEAT-18(알림, 1차는 농가에 가는 주문 알림톡) · 지키는 규칙: R-28, R-15, N-05, M-16 · 인수 조건: AC-18-1~7(AC-18-8은 사람 운영 확인)
> 동작·규칙·인수 조건 원본: docs/spec/functional/FEAT-18-notifications.md (여기에 다시 쓰지 않는다)

## 역할
업무 모듈이 남긴 알림을 outbox 행으로 받아, 주문 트랜잭션 밖에서 외부 발송 업체(카카오 알림톡, 실패 시 대체 문자)로 보낸다.

## 구조
- `models.py` — `Notification`(outbox 행, `notifications`), `NotificationSettings`(농가별 끄기, `notification_settings`, 행이 없으면 켜짐)
- `service.py` — `order_awaiting_deposit(db, order, farm)`·`deposit_reported(db, order)`: 같은 트랜잭션에 savepoint로 행을 넣는다(`dedupe_key` UNIQUE + `ON CONFLICT DO NOTHING`). `skip_reason`(테스트 계정·승인·끄기·번호), 관리 API용 조회·재시도
- `sender.py` — 발송자 인터페이스(`sent`·`retry`·`failed`·`skipped`)와 no-op 발송자(`NOTIFY_PROVIDER=none`)
- `solapi.py` — 솔라피 클라이언트(HMAC-SHA256 서명, 주입 가능한 httpx transport). 확인한 사실과 미확인은 파일 머리 주석
- `worker.py` — API 프로세스 안 발송 루프(lifespan이 `solapi`일 때만 시작). 임대·재시도·상태 재확인·6시간·한도
- `router.py` — 관리 API `GET /admin/notifications`, `POST /admin/notifications/{id}/retry`

## 계약
- 업무 모듈은 `service`의 두 함수만 부르고 외부 호출을 하지 않는다. 함수는 예외를 올리지 않는다 — 넣기가 실패하면 savepoint만 되돌리고 경고 로그(예외 종류만)를 남긴다. 업무 트랜잭션은 그대로 커밋된다.
- 알림 행에는 받는 사람 이름·주소·전체 전화번호를 저장하지 않는다. 번호는 보낼 때 `Farm.contact_phone`에서 읽고 끝 4자리만 남긴다. `SKIPPED`로 넣는 행에는 변수도 남기지 않는다.
- 로그·관리 응답에는 알림 id·주문 id·이벤트·상태·사유·업체 상태 코드·끝 4자리(`masking.phone_tail`)만 남긴다. 업체 코드는 영숫자 몇 개만 남기고 7자리 넘는 숫자는 지운다.
- 테스트 계정·승인·끄기·번호는 넣을 때와 보내기 직전에 두 번 본다.
- 테스트는 외부 네트워크로 나가지 않는다(`conftest`가 `NOTIFY_PROVIDER=none`을 고정하고 `solapi.com` 연결을 막는다, 솔라피 테스트는 `httpx.MockTransport`).

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-11-27 | 1차 알림은 입금 대기 진입·'입금을 마쳤어요' 두 가지, outbox + 프로세스 안 발송 루프 | `tasks/DEV-495.md` 설계·결정 1·4(PM 11/28 확정) | AC-18-1, AC-18-2 |
| 2026-11-28 | `NOTIFY_PROVIDER=none`이면 넣을 때 바로 `SKIPPED`(`provider_disabled`)로 남기고 발송 루프는 시작하지 않는다. 재시도 API도 409 `NOTIFY_DISABLED` | 업체 계정 전에 머지·배포해도 PENDING 행이 쌓이지 않고, 테스트·로컬에서 백그라운드 스레드가 돌지 않는다. `solapi`에서 `none`으로 바꾸면 남은 PENDING은 그대로 있다가 다시 켤 때 6시간 규칙으로 정리된다 | AC-18-3 |
| 2026-11-28 | 재시도는 첫 시도 뒤 1분·5분·30분, 네 번째 시도까지 안 되면 `FAILED`. 임대가 끝난 `SENDING`도 다시 보낸다(시도 횟수를 다 썼으면 `FAILED` `lease_expired`) | 결정 7(시간 초과·프로세스 중단도 놓치는 것보다 두 번이 낫다) | AC-18-6 |
| 2026-11-28 | 행에 `lease_token`·`retried_at`을 더했다(설계 표에 없던 칸). 결과는 임대 토큰이 맞을 때만 쓰고, 6시간은 운영자 재시도 시각부터 다시 센다 | 늦게 끝난 옛 루프가 새 결과를 덮어쓰지 않게. 운영자가 다시 보내라고 한 알림이 바로 `stale`이 되지 않게 | AC-18-6, AC-18-7 |
| 2026-11-28 | 한도는 보내기 직전에 센다(농가: 최근 1시간 `SENT`+`SENDING`, 전체: KST 오늘 `SENT`+`SENDING`) | 실제로 나가는 건수로 비용을 막는다. 두 프로세스가 동시에 세면 한두 건 넘을 수 있다 | AC-18-4 |
| 2026-11-28 | `notifications.order_id`·`farm_id`는 FK + `ON DELETE CASCADE` | 시드 초기화·`purge_except`·테이블 삭제 순서가 깨지지 않게(`purge_except` RULES: 알림 전부 지움, 설정은 남는 농가 것만) | — |
