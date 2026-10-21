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
| 2026-10-20 | 테스트 농가 정리는 행을 지우지 않고 HTTP API가 아닌 `python -m app.admin.retire_test_farm`(기본 시험 실행, `--commit`, `--restore`)으로 농가를 `SUSPENDED`로 바꿔 숨긴다. 공개 경로가 모두 `APPROVED` 농가만 보여 주므로 상품 상태는 그대로 둔다. 승인 농가가 아니거나 테스트 계정이 아닌 소비자 주문이 있으면 거부(R-24 환불은 사람이 처리). 정지 사유는 고정 문구이고 `--restore`는 그 문구로 정지된 농가만 되돌린다. `--commit`마다 `ManagerEvent`(`test_farm_retired`·`test_farm_restored`, actor 없음, `SUCCEEDED`)를 남기고, 출하 전 테스트 주문과 '입금했어요' 입금 대기 개수를 보여 준다(DEV-93) | 테스트 농가를 숨길 경로가 없었다. 삭제 방식은 실사용자 팔로우·대화와 감사 기록까지 지워 대체했다(커밋 `929225b`). 영구 삭제는 PQ-06 결정 뒤 DEV-94 |
| 2026-10-21 | 관리자 페이지(`/farms`)에서도 테스트 농가를 숨기고 되돌린다. `GET /admin/farms`(공개 중 + 이 기능으로 숨긴 농가), `GET /admin/farms/{id}/preview`(시험 실행), `POST /admin/farms/{id}/retire`·`restore`. 조건·정지 사유·주문 개수는 `retire_test_farm`과 같은 함수를 쓰고, 거부는 409 `TEST_FARM_REFUSED`. 실행은 `run_manager_action`이라 멱등 키가 필요하고 `ManagerEvent`(`test_farm.retire`·`test_farm.restore`, actor `u-admin`, 거부는 `REJECTED`)를 남긴다. 명령(CLI)은 그대로 둔다(DEV-98) | 테스트 농가를 숨기려면 `railway ssh`로 서버 셸에 들어가야 해서 운영자가 직접 할 수 없었다. 삭제는 여전히 열지 않는다(DEV-94) |
| 2026-10-21 | 관리자 페이지 사용자 화면용 읽기 API `GET /admin/users/{userId}`·`GET /admin/users/by-order/{orderIdOrNo}`(`app/admin/user_detail.py`). 처리(입금 확인 대행·환불·배송 완료)는 새 API 없이 기존 `/admin/orders/...`를 부른다. 받는 사람은 앞 글자만, 전화·주소·이메일은 내려 주지 않는다. 주문은 최근 100건, 버튼 표시는 상태만 보고 실제 허용은 기존 API가 다시 검사한다(DEV-106) | 문의 대응에 Swagger로 주문을 찾아야 했다. 규칙을 두 곳에 두지 않으려고 쓰기 경로는 늘리지 않았다 |
