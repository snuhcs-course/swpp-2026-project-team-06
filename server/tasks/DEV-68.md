## DEV-68 무통장 입금(소비자 → 농가 계좌 직접): 생산자 계좌·입금 대기·입금 확인·환불 송금

- 이슈: [DEV-68](https://linear.app/sswp6/issue/DEV-68)
- 브랜치: `nemodleo/dev-68-dev-무통장-입금소비자-농가-계좌-직접-생산자-계좌`
- 기능·인수 조건: FEAT-09(개정, AC-09-1·2·3·7·8), FEAT-14, FEAT-17(AC-17-7·8) / 규칙 R-01·R-02·R-13 개정, R-28 신설
- 상태: 진행 중 (2026-10-18 박현 제안 승인 → 스펙·구현)

### 목표
PG 보류(C안). 소비자가 농가 계좌로 직접 무통장 입금하고 생산자가 통장과 대조해 앱에서 입금을 확인한다. farmclub은 통신판매중개자로 돈을 만지지 않는다.

### 범위 (수정 허용 경로)
- `server/app/orders/**` (모델·스키마·서비스·라우터·spec.md)
- `server/app/farms/**` (Farm 계좌 3칸, MyFarm·FarmPatch)
- `server/app/catalog/service.py` (계좌 없는 농가 초기 승인 요청 차단 한 곳)
- `server/app/core/config.py` (`deposit_deadline_hours`), `server/app/core/seed.py` (농가 계좌·입금 대기 주문 시드)
- `server/migrations/versions/0014_*.py`
- `server/tests/test_orders.py`, `server/tests/test_farms.py`
- `docs/spec/**`, `docs/wiki/**` (스펙·영문 동기화)

### 비범위 (건드리지 않음)
- PortOne·카드 코드(#124 DEV-36, #120 DEV-37 브랜치). 계좌조회 API 자동 매칭, 수수료 정산, 알림(FEAT-18).
- `server/app/admin/**` 감사 구조(관리 API는 orders admin_router에 추가만).

### 결정 사항
- 10/18 상태 `AWAITING_DEPOSIT` 신설. `PENDING_PAYMENT`(동의만) → `POST /orders/{id}/deposit`(멱등, 물량 선점) → `AWAITING_DEPOSIT` → 생산자/운영자 `confirm-deposit` → `RESERVED`(`paid_at`=확인 시각). 기존 `/pay`·`mockResult` 삭제.
- 10/18 입금자명 = `order_no`. 금액 변형 없음. 주문 번호 형식 `FC-MMDD-NNNN`은 유지하고 NNNN만 연번 대신 무작위 4자리(소비자가 거래 건수를 못 세게, 박현 결정 10/18). 시드·Mock·문서도 같은 형식.
- 10/18 디자인은 새 요소 없이 기존 앱(Figma v6) 부품·패턴만 쓴다(박현): 입금 정보는 면색 카드 대신 기존 Row 목록, 복사는 글자 버튼, 고지는 Notice, 주문 접수 아이콘은 기존 검정 체크 원, 생산자 줄의 동작은 버튼 대신 기존 ‘… ›’ 글자 링크, 현황 할 일은 ListRow. 기한 `deposit_due_at = 안내 시각 + DEPOSIT_DEADLINE_HOURS(24)`.
- 10/18 만료는 지연 검사(소비자 조회·취소, 생산자 목록·확인 시점에 `expire_overdue_deposits`) + `POST /admin/orders/expire-deposits` 일괄. 만료 주문 `CANCELED`, `cancel_reason="입금 기한 초과"`, 물량 해제.
- 10/18 소비자 `POST /orders/{id}/deposit-reported` → `deposit_reported_at`(힌트). 입금 대기 취소 → `CANCELED`(환불 없음), 물량 해제.
- 10/18 환불은 입금했던 계좌로 농가가 송금. `Refund.settled_at`, 생산자 `POST /orders/{id}/refund-settled`. `Payment.method=BANK_TRANSFER`, `provider=FARM_ACCOUNT`.
- 10/18 박현 피드백: 입금·환불 확인 창(시트)을 없애고 줄에서 바로 ‘미승인’ 1 : ‘승인’ 2. 미승인은 사유 필수(소비자에게 그대로 보임). 입금 미승인은 ‘입금 대기로 두기’(사유 표시, 소비자가 다시 입금했어요 가능) 또는 ‘주문 취소’(`입금 미승인 · 사유`, 물량 해제)를 생산자가 고른다. 환불 미승인은 송금 대기 유지 + 사유(계좌 확인·연락 중·환불 대상 아님 등 바로 고르기 + 직접 입력). AC-09-9·AC-17-8 신설. 서버: `POST /orders/{id}/reject-deposit {reason, cancel}`, `POST /orders/{id}/refund-issue {reason}`, 마이그레이션 0015(`orders.deposit_issue·deposit_issue_at·refund_issue·refund_issue_at`), OrderView·ProducerOrder `depositIssue`·`refundIssue`.
- 10/18 Farm `bank_name`·`account_number`·`account_holder`·`account_updated_at`. 계좌 없으면 `create_capacity_request` INITIAL에서 409 `NO_FARM_ACCOUNT`. 소비자 `OrderView.depositAccount`·`sellerInfo`는 본인 주문에서만.

### 작업
- [x] 마이그레이션 0014: farms 계좌 4칸, orders `deposit_due_at`·`deposit_reported_at`·`deposit_confirmed_by`·`cancel_reason`, refunds `settled_at`
- [x] orders: `deposit`·`deposit_reported`·`confirm_deposit`·`refund_settled`·`expire_overdue_deposits`, 상태 전이·물량, OrderView/ProducerOrder/Dashboard 필드
- [x] farms: MyFarm·FarmPatch 계좌, 검증(숫자·하이픈 6~32자)
- [x] catalog: 계좌 없는 초기 승인 요청 409
- [x] admin: `confirm-deposit`, `expire-deposits`
- [x] 시드: 농가 계좌 4곳 (입금 대기 주문 시드는 넣지 않음 — 대시보드·e2e 건수 기준이 바뀌지 않게, 테스트가 직접 만든다)
- [x] pytest: AC-09-1(동시 마지막 물량, deposit), AC-09-2(입금 대기 취소 물량 복구), AC-09-3(멱등), AC-09-7(만료), AC-09-8(입금 확인), AC-17-7(환불 송금 완료), 계좌 없는 승인 요청
- [x] docs/spec·wiki 개정(rules·FEAT-09·14·17·policy·screens·ia·tech-design·R&S·Design-Documentation)
- [x] 농가 미승인: reject-deposit·refund-issue, 0015, pytest AC-09-9·AC-17-8

### 완료 조건
- [ ] 생산자 계좌 등록·수정 API, 소비자 입금 안내 응답, 입금 확인 → RESERVED, 24시간 만료 자동 취소, 환불 송금 완료 표시
- [ ] pytest 통과, Mock·통합 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/18 제안·Before/After 보드 https://claude.ai/artifact/Pfj8bHERB3FXqH4iD1D6HL 승인. 스펙 섹션 작성.
- 10/18 서버·API·Mock·앱·문서 구현. `uv run pytest`: 332 중 328 통과, 4 실패는 로컬 `server/.env`의 AI 키 때문(.env를 치우고 돌리면 4/4 통과, 이번 변경과 무관). 범위 추가: `server/.env.example`(DEPOSIT_DEADLINE_HOURS), `packages/ui/src/format.ts`(deadline), `apps/consumer/src/lib/DepositCard.tsx`, `apps/producer/src/app/(tabs)/farm/account.tsx`.
- 10/18 농가 미승인 반영 후 실행: `uv run pytest` 339 중 335 통과(실패 4는 로컬 `server/.env` AI 키, 기존과 같음), `alembic upgrade head`·`alembic check` 통과(전용 DB), `npm run typecheck` 통과, `npm run test:mock` 14/14, `npm run test:integration:full` API 7 + Playwright 43/43 통과(전용 DB `farmclub_dev68_mig`).
- 10/18 리뷰(자라, Request changes) 반영: main(f31c7b0) 병합(충돌 3파일 모두 양쪽 유지), ruff 8건 정리, R-15(생산자 목록에서 `paid_at` 없는 취소 제외·입금 전 배송 정보 비움), 박현 결정 — 입금했다고 알린 주문은 기한이 지나도 취소하지 않고 운영자 목록 `GET /admin/orders/deposit-overdue`, 부분 환불 송금 표시는 나중 고려. `expire-deposits` 멱등 키·감사 기록, 주문 번호 충돌 재시도, 0014 downgrade server_default 원복. pytest 345 중 341 통과(실패 4는 로컬 `.env` AI 설정, 이번 변경과 무관), alembic 0013↔0015 왕복·check 통과.

