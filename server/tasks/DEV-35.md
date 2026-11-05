## DEV-35 운영자 예외 이력·복구와 환불 이력

- 이슈: [DEV-35](https://linear.app/sswp6/issue/DEV-35) (GitHub [#80](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/80))
- 브랜치: `zahra/dev-35-manager-exception-recovery`
- 기능·인수 조건: M01~M03, M07 / FEAT-01 AC-01-3, FEAT-10 AC-10-6, FEAT-11 AC-11-3, FEAT-17 AC-17-4
- 상태: 진행 중
- 예상: 10시간

### 목표
운영자 승인·배송·환불 작업의 결정 이력과 실패 진단·복구 경로를 만들고, 모든 환불 경로를 한 이력 모델과 결제 상태로 일관되게 기록한다.

### 범위 (수정 허용 경로)
- `server/**`
- `docs/spec/screens.md`, `docs/spec/functional/**`, `docs/spec/tech-design/**`, `docs/spec/contracts-1.2.md`(5장 환불 알림 영속화, 10/16 추가)
- `docs/wiki/Design-Documentation.md`, `docs/wiki/Testing-Documentation.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`와 Mock 동작
- 운영자 전용 UI, 소비자 부분 환불 표시 UI, 결제사 연동·콜백 복구
- DEV-31 환불 알림 영속화는 PR #99 머지 후 최종 통합한다

### 결정 사항
- 10/16 Zahra가 이슈 #80에서 `@nemodleo`(PM)를 언급해 두 정책을 확인했다. 부분 환불은 `Order.status`와 주문의 환불 일시·사유를 바꾸지 않고, 환불 가능 잔액은 배송비·도서산간비를 포함한 전체 결제액이다. 일반 PR 승인이 팀 확인을 완성한다.
- 10/16 부분 환불은 `Payment.status=PARTIALLY_REFUNDED`와 운영자 환불 이력에만 나타난다. 소비자 노출은 T29 전 별도 프론트·스펙 후속 작업으로 남기며, 주문의 `PARTIALLY_REFUNDED` 값은 과거 데이터 읽기 호환용으로만 유지한다.
- 10/16 환불 이력은 공통 `_refund` 안에서 소비자 취소·배송기간 거절·운영자 환불 모두 기록한다. 이미 `REFUNDED`인 주문의 조기 반환 뒤에는 이력을 추가하지 않으며, 출하 전 잔여 물량은 최종 전액 환불 때 한 번만 복원한다.
- 10/16 마이그레이션은 PR #104의 `0006` 다음 `0007`을 예약한다. `Payment.status`를 최소 24자로 넓히고, 기존 환불 주문은 결제가 없어도 `COALESCE`로 결정적 `SYSTEM` 환불 이력을 보강한다.
- 10/16 `run_idempotent`와 `IdempotencyRecord`만 멱등 수단으로 사용한다. 운영자 결정·배송 완료·환불은 키를 필수로 하고 body 없는 요청은 `{}`를 해시한다. Mock의 생산자 승인 회귀는 권한에서 먼저 403이므로 Mock은 변경하지 않는다.
- 10/16 `ManagerEvent`는 감사 전용이다. 재시도용 원문 body는 비공개 DB 필드에만 저장하고 응답·로그에는 정제 요약만 사용한다. 잘못된 Swagger 요청도 비재시도 감사 행으로 남기되 기본 예외 목록에서는 제외한다.
- 10/16 재시도는 원래 actor·scope·key와 정확한 원문 body를 사용하고 누른 운영자는 별도로 기록한다. M01~M03의 일시 실패만 명시적 allowlist로 재시도하며, 환불 요청 알림은 해결만 가능하다. T19/#81의 결제사 실패 모델이 정해지면 재검토한다.
- 10/16 비 API 예외는 요청 세션을 명시적으로 rollback한 뒤 깨끗한 세션으로 FAILED 감사를 시도하고 원래 예외를 다시 던진다. 감사 기록도 실패하면 요청 내용 없이 `manager_failure_audit_write_failed`를 기록하고 두 번째 예외는 억제한다.
- 10/16 API 4xx는 비재시도 감사로 남긴다. 409는 멱등 결과가 커밋된 뒤 감사를 upsert하고, 그 밖의 4xx는 rollback 뒤 깨끗한 세션으로 감사를 기록한다.
- 10/16 DEV-31 환불 알림은 커밋된 winning message 트랜잭션에만 `OPEN` 이벤트로 저장하고 `messageId`로 유일하게 만든다. preview·사진 전용·rollback/commit 실패·cached replay·idempotency race loser에는 관리자 이벤트가 없어야 한다.

- 10/16 실패 감사는 끝난 이벤트(SUCCEEDED·RECOVERED·RESOLVED)나 저장된 원문과 다른 본문으로 온 같은 키 요청에서 원래 기록을 덮어쓰지 않는다. 같은 키의 성공은 실제 실행된 본문을 기록한다.
- 10/16 원문 body는 RECOVERED·RESOLVED가 되면 지운다. 재시도는 행 잠금 대신 원래 actor·scope·key의 `run_idempotent`로 한 번만 실행한다.
- 10/16 배송 기간 거절 환불은 소비자의 선택이므로 actor를 `CONSUMER`와 그 소비자 ID로 기록한다. 환불·결정 이력 API는 최신순이다.

### 작업
- [x] Refund·ManagerEvent·ProducerDecision 모델과 마이그레이션 0007·시드·legacy backfill
- [x] 공통 환불 이력·부분/최종 환불·결제 상태와 주문 상태 불변 규칙
- [x] 생산자 결정 이력과 공급 물량 결정 관리자 기록
- [x] 운영자 작업 멱등·감사 failure wrapper와 예외 목록·상세·재시도·해결 API
- [x] PR #99 머지 뒤 환불 요청 알림 영속화 통합
- [x] 서버 구현 결정·한국어 스펙·영문 wiki 갱신

### 완료 조건
- [x] 모든 환불 경로가 중복 없이 이력과 결제 상태를 기록하고 부분 환불이 주문 흐름을 바꾸지 않음
- [x] 생산자 결정 이력과 운영자 예외 조회·허용된 재시도·해결이 ADMIN 전용으로 동작
- [x] 원문 body·원 actor 재시도, 4xx·transient·commit failure·감사 이중 실패 회귀 테스트 통과
- [x] 환불 알림은 해결 가능·재시도 불가이며 preview·rollback·replay·race loser에서 생성되지 않음
- [x] 집중 테스트, 전체 PostgreSQL pytest, Ruff, Alembic upgrade/downgrade/re-upgrade/check 통과
- [ ] `git diff main...HEAD` 범위 감사와 AI 1차 리뷰 후 사람 리뷰 1명 승인

### 기록
- 10/16 현재 `main`에서 작업 브랜치를 만들고 이슈 #80에 두 정책 결정과 PM 확인 요청을 기록했다. PR #104는 마이그레이션 번호만, PR #99는 환불 알림 영속화 최종 단계만 차단한다.
- 10/16 PR #98·#104가 반영된 `main`으로 최신화했다. `0007`은 실제 `0006_source_analysis` 뒤에 연결했고, PR #99는 아직 draft라 환불 알림 영속화만 대기한다.
- 10/16 환불·결정 이력, 결제 잔액 기반 부분/최종 환불, 운영자 감사·예외 API와 원문/원 actor 재시도를 구현했다. 동시 동일 키 경쟁은 지연 unique 제약으로 `run_idempotent`의 loser rollback 경로에서 회복한다.
- 10/16 Ruff, 전체 PostgreSQL pytest 174개, Alembic `0007 → 0006 → 0007`과 `alembic check`가 통과했다. PR #99가 여전히 draft라 메시지 환불 알림의 영속화 및 해당 완료 조건만 남았다.
- 10/16 `origin/main` 대비 범위를 감사해 변경이 허용된 `server/**`, 지정 `docs/spec/**`, `docs/wiki/**`에만 있음을 확인했다. Mock·앱·공용 패키지는 변경하지 않았다.
- 10/16 리뷰에서 같은 키·다른 본문 요청이 성공 감사를 REJECTED로 덮어쓰는 문제를 재현해 고쳤다. 테스트 이름을 AC·규칙 ID로 바꾸고 키 필수·ADMIN 권한·backfill SQL(결제 유무)·실패 이벤트 보존 회귀를 추가했다.
- 10/16 draft PR #114를 열었다. 남은 단계는 PR #99 머지 뒤 환불 알림 영속화, AI 1차 리뷰, 사람 리뷰다.
- 10/16 PR #99 머지 뒤 `main`을 병합했다(`server/tasks.md` 충돌만). `consumer_send`가 DEV-31 알림을 만들 때 같은 트랜잭션에서 `manager_refund_request` OPEN 이벤트를 저장하도록 통합했다. AI OFF 저장, 순차 replay·동시 경쟁 1건, rollback·preview·일반 메시지 미저장 회귀를 추가했고 Ruff·전체 pytest 206개가 통과했다.

