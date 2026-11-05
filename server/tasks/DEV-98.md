## DEV-98 관리자 페이지 테스트 농가 숨기기·되돌리기
- 이슈: [DEV-98](https://linear.app/sswp6/issue/DEV-98)
- 브랜치: `nemodleo/dev-98-dev-관리자-페이지에서-테스트-농가-숨기기되돌리기`
- 기능·인수 조건: 운영 도구(제품 동작 변경 없음). 관련 규칙 R-24, R-27(판매 중지 상품도 공개 화면에 남음), DEV-93 명령
- 상태: 리뷰 대기

### 목표
운영 검증에 쓴 테스트 농가(예: 서울증류소)를 운영자가 서버 셸 없이 관리자 페이지에서 숨기고 다시 공개한다. 판매 중지한 상품이 소비자 화면에 남는 것은 R-27대로라 상품이 아니라 농가를 숨긴다.

### 범위 (수정 허용 경로)
- `server/app/admin/retire_test_farm.py`(조건·실행 함수 분리, CLI 동작 유지), `server/app/admin/farms.py`(새 파일), `server/app/admin/schemas.py`, `server/app/main.py`, `server/app/admin/spec.md`
- `server/tests/test_admin_farms.py`(새 파일)
- `scripts/admin-web/**`(farms 화면, 메뉴, 중계 허용 경로, 테스트, README)
- `docs/spec/ia.md`(관리자 페이지 절), `docs/spec/screens.md`(운영자 API 표), `docs/wiki/Design-Documentation.md`(API 표 한 줄), `server/tasks.md`

### 비범위 (건드리지 않음)
- 행 삭제·영구 삭제(DEV-94), 정지 때 자동 환불(R-24), 마이그레이션, 소비자·생산자 앱

### 결정 사항
- 10/21 새 판단 없이 DEV-93 명령과 같은 함수(`check_retire`·`check_restore`·`retire_in`·`restore_in`)를 쓴다. 조건이 두 곳에서 달라지지 않게 하려는 것이다.
- 10/21 실행은 다른 관리 API처럼 `run_manager_action`(멱등 키, 감사 이벤트)으로 한다. 이벤트 이름은 관리 API 형식 `test_farm.retire`·`test_farm.restore`, actor는 `u-admin`. CLI의 `test_farm_retired`(actor 없음)는 그대로 둔다.
- 10/21 거부는 409 `CONFLICT`, `details.reason=TEST_FARM_REFUSED`, 메시지는 명령과 같은 문구. 실사용자 주문 거부 문구는 소비자 수와 앞 3명만 보이게 줄였다(화면에 ID 수십 개가 나왔다).
- 10/21 목록은 공개 중(`APPROVED`) 농가와 이 기능으로 숨긴 농가만 보인다. 승인 전·반려·제재 정지 농가는 대상이 아니라 뺀다.
- 10/21 화면은 미리보기(시험 실행)를 먼저 보여 주고, 실행 버튼은 두 번 눌러 확인한다(가입 승인과 같은 방식).

### 작업
- [x] `retire_test_farm` 조건·실행 함수 분리(CLI 테스트 그대로 통과)
- [x] `/admin/farms` 목록·미리보기·숨기기·되돌리기 API, pytest 8개
- [x] 관리자 페이지 `/farms` 화면, 메뉴, 중계 허용 경로, node 테스트
- [x] 로컬 확인: 강씨네 미리보기 거부 문구, 남원 숨기기 → 소비자 API 404 → 다시 공개 → 200, 감사 이벤트 2개
- [x] 문서: admin spec.md, admin-web README, ia.md, screens.md 운영자 API 표, wiki API 표
- [ ] 머지 후 Vercel `farmclub-admin` 재배포, 운영에서 서울증류소(f-d10e34e748) 숨김

### 기록
- 10/21 main에서 시작. 시드 f-kang에 테스트 계정이 아닌 구매자 주문이 있어 성공 테스트는 DEV-93 테스트의 `make_order_consumers_test_accounts`를 쓴다.
- 10/21 검증: `uv run pytest -q` 383 passed(새 `tests/test_admin_farms.py` 8개 포함), `ruff check .` 통과, 바꾼 파일 `ruff format --check` 통과, `node --test scripts/admin-web/admin.test.mjs` 12 passed.
- 10/21 AI 1차 리뷰(pr-review): must 없음. should 반영: 생산자가 테스트 계정이 아닌 농가(실사용자 가입, 아직 주문 없음)를 숨길 때 미리보기에 경고 문구. 서울증류소처럼 본인 카카오로 가입한 운영 검증 농가도 이 경우라 막지 않고 알리기만 한다.

