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
| 2026-10-21 | 운영 검증용 실계정 표시는 새 열 `users.ops_tester`(마이그레이션 0017)로 한다. `is_test_account`는 Mock 로그인 대상·온보딩 생략·앱 '테스트 계정' 표시에 쓰이므로 건드리지 않는다. 테스트 농가 숨기기의 실사용자 주문 검사만 `is_test_account OR ops_tester`를 테스트로 본다. 관리자 API `GET /admin/users`(검색, 전화 끝 4자리만), `POST /admin/users/{id}/mark-tester`·`unmark-tester`(`run_manager_action`, `ops_tester.mark`·`ops_tester.unmark`, actor `u-admin`). 운영자·시드 테스트 계정은 409. 관리자 중계가 GET·POST만 넘기므로 PUT·DELETE 대신 POST 두 개(DEV-107) | 팀원이 카카오로 가입해 테스트한 계정(서울증류소 등)의 주문 때문에 테스트 농가 숨기기가 거부되고, 바꾸려면 운영 DB에 직접 써야 했다. `is_test_account`를 켜면 그 계정에 Mock 로그인(ID만으로 로그인)이 열린다 |
