## DEV-152 Freeze I3 user-journey test matrix and measurable criteria

- Issue: [DEV-152](https://linear.app/sswp6/issue/DEV-152)
- Branch: `llovablanche/dev-152-i3-journey-matrix`
- Requirements: FEAT-06/07/08/09/10/12/13/14/17/32; AC-06-1–5, AC-07-1–3, AC-08-1–7, AC-09-3/7/8, AC-10-5–7, AC-12-1/4/8/9, AC-13-1–8, AC-14-1/2, AC-17-2/4/5; N-03/04/05/06; 1.2 AI contract §5; 1.4 capacity contract; source integration AC-SRC-1–11.
- Status: In review

### Goal
Freeze a comparable oracle before I3 evaluation starts, with explicit denominators and no invented pass results.

### Scope (editable paths)
- `docs/evaluation/i3-journeys/**`

### Out of scope
- Product behavior, existing product specifications, DEV-154 corpus, live execution, shared production data, and financial transactions.

### Decisions
- 10/31 Use a case matrix plus a protocol and manifest; a test case starts NOT_READY until evidence is captured.
- 10/31 Link AI support to DEV-154's 60-case/180-run frozen corpus and retain its proposed targets separately from future measurements.
- 10/31 DEV-151 is marked Done in Linear, but its carryover register is not attached to the issue or present in main. Use current FEAT/contracts and I3 issue acceptance criteria as the oracle; flag the missing register for reviewer reconciliation.

### Work
- [x] Map P0 and P1 journeys to source requirements and accountable owners.
- [x] Define normal, boundary, error, retry, and state-change cases with setup, action, expected result, denominator, verdict, evidence, and reviewer.
- [x] Freeze protocol and digest; validate all rows and cross-links.
- [x] Update PR context and complete AI first review.

### Completion criteria
- [x] Every DEV-152 acceptance criterion is represented in versioned artifacts.
- [x] Validator passes and actual command/result is recorded.
- [ ] One human approves before merge to main.

### Record
- 10/31 Started from `origin/main` at `8f8d4d5`; DEV-151 dependency is Done; baseline environment and build are pending DEV-165.
- 10/31 Added five direct AI guard cases because DEV-154's corpus does not exercise wrong-answer report and cross-consumer routing. Added separate full source workflow cases for image, long image, and PDF after review found that analysis-only coverage was insufficient. The final frozen matrix has 44 cases (34 P0, 10 P1). `python3 docs/evaluation/i3-journeys/validate.py` passed with the DEV-154 link to 60 questions / 180 planned trials and no measured results. Product execution remains pending DEV-165 and downstream issues.
- 10/31 Draft PR #336 opened and updated; AI first review recorded at PR comment `6544860385` with no remaining findings. Human approval and merge remain pending.

## DEV-167 Record I3-AIS-01..03 results on baseline i3-b2-87792b7

- Issue: [DEV-167](https://linear.app/sswp6/issue/DEV-167) (I3-T08) · Branch: `nemodleo/dev-167-i3-ai-answer-review`
- Work record and commands: `docs/evaluation/i3-ai-support/tasks.md` (## DEV-167).

### Scope (editable paths)
- `docs/evaluation/i3-journeys/results/i3-b2-87792b7/I3-AIS-0{1,2,3}.md` and this section. `matrix.csv` and `protocol.md` stay frozen (`execution_status` is not edited).

### Record
- 11/04 I3-AIS-01 PASS 30/30/30 (10/10 stable), I3-AIS-02 PASS 30/30/30 (10/10), I3-AIS-03 FAIL 0/30/30 (0/10). Cohort app `87792b7`, Haiku `claude-haiku-4-5-20251001`, local `farmclub_i3_ais`, run 2026-11-04 04:28–04:30 UTC. Agent review agrees with the automatic verdicts; Hyun's sign-off pending.
- 11/04 `python3 docs/evaluation/i3-journeys/validate.py` PASS.

## DEV-166 Evaluate consumer farm discovery, product discovery, and follow journey

- 이슈: [DEV-166](https://linear.app/sswp6/issue/DEV-166) (I3-T04) · 브랜치: `nemodleo/dev-166-i3-discovery-runs`
- 매트릭스 행: I3-DISC-01..05 (v1.0, 수정 없음). 환경: DEV-165 절차를 `main` @ `87792b7`에 적용한 baseline `i3-b2-87792b7`.
- 상태: 실행·기록 완료, 검토자(Minsun Kim) 확인과 결함 이슈 등록 대기

### 목표
소비자 발견(홈·농가 목록·검색)·상품 상세·팔로우 여정 5행을 격리 로컬 스택에서 행마다 한 번 실행하고, 판정과 근거를 `results/i3-b2-87792b7/`에 남긴다.

### 범위 (수정 허용 경로)
- `scripts/i3-discovery/**` (실행 하네스)
- `docs/evaluation/i3-journeys/results/i3-b2-87792b7/**`
- `docs/evaluation/i3-journeys/tasks.md` (이 절)
- 범위 밖: `matrix.csv`·`protocol.md`·`manifest.json`(고정본), 제품 코드, 운영(api.farmclub.kr·farmclub.kr) — 11/4 운영에서 HE가 진행 중이라 운영은 읽지도 않는다

### 결정 사항
- 11/04 baseline은 `i3-b2-87792b7`: DEV-165(`i3-b1-eb727b6`) 절차를 그대로 쓰되 코드는 `87792b7`, DB는 따로 `farmclub_i3_disc`(`_test` 포함, Alembic `0025`). `server/.env`는 로컬 값만 두고 AI·카카오·R2 등 키 줄은 모두 뺐다(발견 행은 AI를 쓰지 않음).
- 11/04 행마다 `app.core.seed --reset` 뒤 setup은 로컬 DB SQL(01·02·04)이나 생산자 API(05, `u-kang`의 sales-settings)로 만든다. SQL은 결과 기록과 trace에 그대로 남긴다.
- 11/04 장애 주입(03 검색 실패, 04 팔로우 실패)은 Playwright route로 브라우저에서 첫 요청만 503/abort한다. 서버 코드는 바꾸지 않는다(서버 머지는 운영 배포로 이어짐).
- 11/04 DISC-01의 "A 품종 한라봉"은 농가 주 품목·상품 품종·상품명에 모두 넣었다(실제 농가 등록 모습). 상품 `variety`만 검색되는지는 분모 밖 진단으로 따로 적었다(아래 기록).
- 11/04 DISC-03은 setup이 "변경 없음"이라 시드에서 A(`f-halla`)를 찾는 검색어 `한라네`를 쓴다.
- 11/04 하네스 오류(로케이터·헤더 누락)로 실행이 끝나지 않았거나 setup이 적용되지 않은 시도는 계획 분모에 넣지 않고 `attempt1/`에 남기며 결과 기록에 적는다.

### 작업
- [x] worktree·`make setup`·DB 생성·`make migrate`, API(:8000)·소비자 웹(:8081, 실제 API) 실행
- [x] 하네스 `scripts/i3-discovery/run.mjs` (리셋 → setup → Chromium 단계 → 단언, trace는 `.artifacts/i3-journeys/i3-b2-87792b7/`, gitignore 확인)
- [x] I3-DISC-01..05 실행, 결과 기록 5개
- [x] `validate.py` 실행
- [ ] 검토자 확인(Minsun Kim)
- [ ] FAIL 2건 Linear 결함 이슈 등록(Hyun)과 새 빌드 재실행(원래 결과는 덮어쓰지 않음)

### 기록
- 11/04 `make setup` 통과, `make migrate` → `0025`. 실행 명령: `node scripts/i3-discovery/run.mjs`(1차, 04:32–04:33 UTC), 하네스 수정 뒤 `node scripts/i3-discovery/run.mjs I3-DISC-01 I3-DISC-03 I3-DISC-04 I3-DISC-05`(04:33:57–04:34:28 UTC). 계산된 실행: DISC-02는 1차, 나머지는 2차. 1차의 01·04는 하네스 로케이터 오류로 중단(그 전 단언은 2차와 같음), 03은 시드에 없는 검색어 `한라봉`을 써 "A 검색"이 성립하지 않음(실패 안내 없음은 2차와 같음), 05는 `Idempotency-Key` 누락으로 일시 중지가 400이라 setup 미적용.
- 11/04 결과: P0 DISC **3 / 5 / 5** (pass / attempted / planned) — PASS 3(01·02·04), FAIL 2(03·05), blocked 0, not_ready 0. 유형별: normal·boundary·retry PASS, error·state-change FAIL.
- 11/04 결함 후보 1 (DISC-03): 검색 요청이 실패하면 이전(필터 없는) 목록이 "마감 임박순 · 농가 4곳"으로 그대로 남고 안내 문구가 없다. ‘다시 시도’가 `load(false)`(덧붙이기)라 재시도 결과가 이전 목록 뒤에 붙어 A가 두 번, "농가 5곳"이 된다. `apps/consumer/src/app/(tabs)/farms/index.tsx`.
- 11/04 결함 후보 2 (DISC-05): 생산자가 판매를 일시 중지해도 서버 `soldOut`이 단계 잔여만 보고 `false`라 홈 추천 첫 칸·농가 목록 대표 상품에 남고, 상세는 가격·"42박스 남음"을 보여 주며 예약하기가 켜져 옵션 시트가 열린다(AC-07-3 위반). `server/app/catalog/service.py` `card()`, `server/app/farms/service.py` `home()`·`farm_cards()`, 소비자 상세의 `disabled={p.soldOut}`. Mock은 `soldOut = availability !== "AVAILABLE"`이라 Mock 테스트에서는 안 보인다.
- 11/04 분모 밖 관찰: `GET /api/farms?q=궁천조생` → `[]`(게시 상품 `p-house`·`p-hyodon` 품종이 궁천조생). FEAT-06 "농가명·품종·지역 부분 일치"와 다르다 — `search_farms`가 상품 `variety`를 보지 않음. 결함 여부는 검토자 판단.
- 11/04 `python3 docs/evaluation/i3-journeys/validate.py` → `PASS: 44 frozen cases (34 P0, 10 P1); AI link: 60 questions / 180 planned trials; no measured results` (고정본 digest 일치, 결과 파일은 검사 대상 아님).

## DEV-168 [I3-T05] Evaluate consumer preorder, order state, and retry consistency

- 이슈: [DEV-168](https://linear.app/sswp6/issue/DEV-168)
- 브랜치: `nemodleo/dev-168-i3-preorder-runs`
- 기능·인수 조건: FEAT-08/09/10 / AC-08-1/2/3/4/6/7, AC-09-1/3/4/7, AC-10-5/6 (matrix I3-PRE-01..05)
- 상태: 리뷰 중

### 목표
소비자 예약 주문의 가격·옵션·물량·동의·주문 상태·재시도가 소비자 목록/상세와 생산자 화면에서 서로 맞는지, 고정된 matrix v1.0의 PRE 5행을 한 번씩 실행해 기록한다.

### 범위 (수정 허용 경로)
- `docs/evaluation/i3-journeys/results/i3-b2-87792b7/**`
- `docs/evaluation/i3-journeys/tasks.md` (이 섹션)
- `scripts/i3-preorder/**` (실행기)

### 비범위 (건드리지 않음)
- `matrix.csv`·`protocol.md`·`manifest.json`(고정, digest), 제품 코드·스펙, 운영 서버(api.farmclub.kr 등), Linear 결함 이슈 생성(담당자가 연다)

### 결정 사항
- 11/04 기준 빌드는 `main` @ `87792b7`(#388, DEV-207 주문 상태 문구 포함), 기준 ID `i3-b2-87792b7`. DEV-165 방식 그대로 로컬 격리 스택(DB `farmclub_i3_pre`, API 8100·소비자 8181·생산자 8182, `FIXED_NOW=2026-10-07T10:00+09:00`, AI·카카오 키 없음).
- 11/04 실행 전 차이 기록: PRE-01의 "unpaid order absent from paid-order tabs"는 현재 계약보다 오래된 표현이다. `screens.md` SCR-13(DEV-68·DEV-207)은 입금 대기를 '입금 대기 · 입금해 주세요' 카드로 보이고 앱은 미확정 탭에 둔다. AC-10-6의 "결제 전 주문 제외"는 `PENDING_PAYMENT`다. 제품 계약이 우선이므로 "입금 대기는 미결제 카드로만 보이고 확정 탭·결제 문구에 없음 + `PENDING_PAYMENT`는 목록에 없음"으로 판정했다.
- 11/04 DEV-207 문구: PRE 5행의 기대 결과는 상태값(`AWAITING_DEPOSIT` 등)만 쓰고 옛 문구('입금 확인' 등)를 쓰지 않아 고칠 차이는 없다. 화면 확인은 현재 문구('입금 대기 · 입금해 주세요')로 했다.
- 11/04 픽스처는 DB를 직접 고치지 않고 생산자 API로 만든다(배송비·도서산간 `PATCH`, 마지막 1개·가격 변경 `PUT stages`, 판매 중지 `PUT sales-settings`). 응답 유실은 Playwright `page.route`(서버까지 보낸 뒤 브라우저 연결만 끊음), 입금 기한 초과는 같은 DB로 API를 `FIXED_NOW=2026-10-08T10:30+09:00`에 다시 띄워 만든다.
- 11/04 실행기 디버깅 실행(dry run)은 기록 실행 전에 했고 계획 분모 밖이다(`.artifacts/.../dryrun/`). 고친 것은 실행기뿐이고 제품 관찰은 같았다.

### 작업
- [x] worktree·`make setup`·DB `farmclub_i3_pre`(+`_test`)·`make migrate`(0025)·`server/.env`(키 줄 제거)
- [x] 실행기 `scripts/i3-preorder/run.mjs` 작성(행마다 시드 초기화, 판정·스크린샷은 `.artifacts/i3-journeys/i3-b2-87792b7/`)
- [x] PRE-01..05 한 번씩 실행, 결과 기록 5개
- [x] `validate.py` 통과 확인
- [ ] 리뷰어(Zahra Gholami) 검토, PRE-05 결함 Linear 이슈(담당 Hyun) 연결

### 완료 조건
- [x] 5행 모두 시도, 판정과 근거 기록(PASS/FAIL/BLOCKED 규칙대로)
- [x] FAIL은 결함을 구체적으로 적음
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 11/04 기록 실행 2026-11-04T04:38:43Z–04:40:25Z, `node scripts/i3-preorder/run.mjs` → PRE-01 PASS 9/9, PRE-02 PASS 4/4, PRE-03 PASS 3/3, PRE-04 PASS 6/6, PRE-05 FAIL 3/4.
- 11/04 집계(P0 · PRE · 결정적 행): pass 4 / attempted 5 / planned 5, fail 1, blocked 0, not_ready 0. 유형별: normal 1/1/1, boundary 1/1/1, error 1/1/1, retry 1/1/1, state-change 0/1/1.
- 11/04 결함(PRE-05): 주문서를 연 뒤 생산자가 지금 단계 가격을 29,000→30,000원으로 바꾸면 예약하기가 409 `STAGE_CHANGED` 없이 30,000원 주문을 만들고 입금 안내로 넘어간다(FEAT-08 E1·사후 조건 위반). `create_order`가 제출 시점 가격으로 다시 계산하고 `OrderInput`에 기대 가격·단계가 없어서다. 결함 이슈는 담당자가 연다.
- 11/04 관찰(PRE-03, 판정 무관): 판매 중지 409 뒤에도 주문서 버튼이 '바뀐 금액으로 예약하기'로 바뀌고 켜져 있다. 후속 검토 제안.
- 11/04 `python3 docs/evaluation/i3-journeys/validate.py` → PASS: 44 frozen cases (34 P0, 10 P1). 로컬 서버(8100·8181·8182) 종료.
