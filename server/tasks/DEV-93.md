## DEV-93 운영 서버 테스트 농가 정리 명령(retire_test_farm)
- 이슈: [DEV-93](https://linear.app/sswp6/issue/DEV-93)
- 브랜치: `zahra/dev-93-purge-test-farm`
- 기능·인수 조건: 운영 도구(제품 동작 변경 없음). 관련 규칙 R-24(농가 정지 시 출하 전 주문 환불), R-25(주문 보존), 정책 PQ-06(미정)
- 상태: 진행 중

### 목표
운영 검증에 쓴 테스트 농가를 모든 사용자에게서 숨기는 서버 명령을 만든다. 행은 지우지 않는다. 실제 삭제(테스트 데이터 영구 삭제, 회원 탈퇴)는 PQ-06 결정 뒤 DEV-94에서 한다.

### 범위 (수정 허용 경로)
- `server/app/admin/retire_test_farm.py`(새 파일), `server/app/admin/spec.md`
- `server/tests/test_retire_test_farm.py`(새 파일)
- `server/app/admin/purge_test_farm.py`, `server/tests/test_purge_test_farm.py`(이 브랜치에서 만든 파일 삭제)
- `server/tasks.md`, `README.md`(배포 절의 운영 명령 안내만)

### 비범위 (건드리지 않음)
- HTTP API·앱 화면·마이그레이션, 제품 스펙(`docs/spec/**`)
- 행 삭제, 실제 사용자·농가 삭제, 회원 탈퇴(DEV-75, DEV-94)
- 정지 때 출하 전 주문 자동 환불(R-24). 이 명령은 실사용자 주문이 있으면 거부하고 사람이 처리한다

### 결정 사항
- 10/20 (아래 10/20 정리 방식 변경으로 대체) HTTP API가 아니라 `python -m app.admin.purge_test_farm <farmId> [--commit]` 명령으로 만든다. `admin_token`처럼 서버 컨테이너 안에서만 실행되고(`railway ssh`), 공개 API에 삭제 경로를 열지 않는다.
- 10/20 (대체됨) 기본은 시험 실행: 한 트랜잭션에서 지운 뒤 롤백하고 표별 행 수를 보여 준다. `--commit`일 때만 남긴다.
- 10/20 (대체됨) 안전 조건: 농가 이름에 `(삭제 예정)`, 주문 소비자 모두 테스트 계정, 행 수 상한 500.
- 10/20 (대체됨) 지울 행은 운영 DB 스키마를 읽어(FK) 농가에서 자식 방향으로 모은다. 감사 이벤트·멱등 기록은 ID 경계로 찾는다.
- 10/20 (대체됨) 생산자 계정은 테스트 계정이 아니면 같이 지운다.
- 10/20 **정리 방식 변경: 삭제 대신 숨김.** 삭제 명령 리뷰에서 실사용자 팔로우·대화·좋아요가 주문 검사 없이 지워지고, 운영자 감사 기록이 사라지며, 비공개 첨부·R2 파일이 남는 문제가 나왔다. 이름 표시 대신 `farms.is_test` 플래그(마이그레이션)도 검토했지만, 숨기기만 하면 되는 문제에 비해 크다. 그래서 농가를 `SUSPENDED`로 바꾸는 명령 `python -m app.admin.retire_test_farm <farmId> [--commit | --restore]`로 바꾼다. 공개 경로(농가 목록·상세·공유, 상품 목록·상세, 주문 생성, 소식·대화)는 이미 `APPROVED` 농가만 보여 주므로 상품 상태는 바꾸지 않는다. 삭제 구현은 커밋 `929225b`에 남기고 DEV-94에서 참고한다.
- 10/20 안전 조건: `APPROVED` 농가만 숨긴다. 그 농가에 테스트 계정이 아닌 소비자 주문이 하나라도 있으면 거부한다(R-24 환불은 사람이 처리). 기본은 시험 실행이고 `--commit`일 때만 바꾼다.
- 10/20 정지 사유는 고정 문구 `RETIRE_REASON`이다. `--restore`는 사유가 이 문구인 농가만 `APPROVED`로 되돌린다(실제 제재로 정지된 농가는 풀지 않는다). 생산자는 정지 안내 화면을 보게 된다.
- 10/20 리뷰 반영: 숨김·복원을 `--commit`할 때 `ManagerEvent`(`test_farm_retired`·`test_farm_restored`, `target_type=farm`, `status=SUCCEEDED`)를 하나 남긴다. 서버 셸 실행이라 운영자 계정이 없어 `actor_id`는 비운다(환불 요청 알림과 같은 방식, `u-admin`으로 적으면 하지 않은 사람을 적게 된다). 생산자 결정 이력(`producer_decisions`)은 가입 승인·반려용이라 쓰지 않는다.
- 10/20 리뷰 반영: 출하 전 테스트 주문(`AWAITING_DEPOSIT`·`RESERVED`·`PREPARING`)은 거부하지 않고 상태별 개수를 보여 준다. 숨긴 농가의 물량은 아무도 살 수 없어 해가 없다. 입금 기한 만료는 지연 검사라 생산자가 잠기고 `expire-deposits`를 운영에서 돌리지 않으면 열린 채로 남을 수 있다. '입금했어요'를 누른 입금 대기는 자동 취소되지 않고(AC-09-7) 기한 뒤 `deposit-overdue`에 남으므로 따로 센다. 복원은 농가만 되돌리고, 숨긴 동안 만료된 주문은 되살리지 않는다.
- 10/20 리뷰 반영: 이미 `SUSPENDED`인 농가는 '이미 숨겨진(정지된) 농가'로 거부한다.

### 작업
- [x] (대체됨) 삭제 명령과 안전 조건, pytest, 안내
- [x] 삭제 명령·테스트 제거, `retire_test_farm` 명령
- [x] pytest(숨김 후 공개 경로 404, 실사용자 주문 거부, 시험 실행 무변경, 복원, 다른 이유로 정지된 농가 복원 거부)
- [x] admin spec.md·README 안내
- [x] 리뷰 반영: 감사 이벤트, 출하 전 주문·입금 알림 개수 표시, 이미 숨긴 농가 문구
- [ ] 운영 시험 실행 → commit(SWPP-118 농가), 결과 기록

### 기록
- 10/20 main `271fe87`에서 시작.
- 10/20 첫 구현은 FK를 열 하나씩 따라가 복합 FK(주문 → `(product_id, option_id)`)에서 다른 상품의 같은 옵션 ID(`opt-5`) 주문까지 모았다. 삭제 후 다른 농가 주문 수를 보는 테스트가 잡았고(0 ≠ 1), FK 제약 단위 묶음 비교로 고쳤다. 같은 방식이던 scratchpad 일회용 스크립트는 운영에서 실행하지 않았다.
- 10/20 감사 이벤트·멱등 기록의 ID 매칭을 부분 문자열에서 ID 글자 경계 정규식으로 바꿨다(`o-1`이 `o-11`에 맞지 않게). 다른 농가 주문(o-11)의 이벤트가 남는지 테스트에 추가.
- 10/20 검증: `uv run pytest -q tests/test_purge_test_farm.py` 5 passed, 전체 `uv run pytest -q` 372 passed, `uv run ruff check .` 통과. 새 파일 `ruff format` 통과(기존 14개 파일 미포맷은 main 그대로).
- 10/20 삭제 명령을 `retire_test_farm`(숨김)으로 바꿨다. 상품 목록·상세·주문 생성도 `get_approved_farm`/`approved_farm_names`로 농가 승인을 보므로 농가 상태만 바꾼다. 검증: `uv run pytest -q tests/test_retire_test_farm.py` 5 passed, 전체 `uv run pytest -q` 372 passed, `uv run ruff check .` 통과, 새 파일 `ruff format --check` 통과.
- 10/20 리뷰 반영(감사 이벤트, 주문 개수, 문구). 테스트 작성 중 `expected`를 같은 세션에서 세어 틀렸다(sessionmaker `autoflush=False`). 커밋 뒤 새 세션으로 고침. 명령은 `_result`가 주문만 읽어 영향 없음.
- 10/20 검증(리뷰 반영 후): `uv run pytest -q tests/test_retire_test_farm.py` 7 passed, 전체 `uv run pytest -q` 374 passed, `uv run ruff check .` 통과, 새 파일 `ruff format --check` 통과.
- 10/20 AI 1차 리뷰(pr-review): must 없음. should 반영: 모르는 옵션 거부(`--restor --commit`이 숨김으로 실행되던 문제). 검증: `tests/test_retire_test_farm.py` 8 passed, 전체 `uv run pytest -q` 375 passed, `ruff check .`·새 파일 format 통과.

