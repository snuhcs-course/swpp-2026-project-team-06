## DEV-29 생산자 I2 핵심 흐름 및 DEV-34·DEV-38 보완

- 이슈: [DEV-29](https://linear.app/sswp6/issue/DEV-29), [DEV-34](https://linear.app/sswp6/issue/DEV-34), [DEV-38](https://linear.app/sswp6/issue/DEV-38)
- 브랜치: `jinumeral/dev-29-i2-t11-finish-the-main-producer-onboarding-product-sales-and`
- 기능·인수 조건: P01–P07 / FEAT-03 AC-03-1/3, FEAT-04 AC-04-1, FEAT-17 AC-17-2/5, FEAT-19 AC-19-1
- 상태: 구현·로컬 검증·AI 1차 리뷰 완료. PR #109의 최종 CI와 머지 결과는 PR 및 Linear에서 확인한다.

### 목표
기존 생산자 흐름의 실제 구현을 확인하고 초안 복구·필수 입력·공유 실패·수동 출하의 빈틈을 수정한다.

### 범위 (수정 허용 경로)
- `apps/producer/src/app/(tabs)/products/new.tsx`, `apps/producer/src/app/(tabs)/products/[id]/edit.tsx`
- `apps/producer/src/app/(tabs)/farm/index.tsx`, `apps/producer/src/app/ship.tsx`
- `apps/producer/spec.md`, `apps/producer/tasks.md`
- `scripts/e2e/producer-and-privacy.spec.ts`, `scripts/e2e/producer-i2.spec.ts`
- `docs/spec/functional/FEAT-03-ai-product-draft.md`, `docs/spec/functional/FEAT-04-product-edit.md`, `docs/spec/functional/FEAT-17-shipping.md`, `docs/spec/functional/FEAT-19-farm-link.md`
- `docs/wiki/Testing-Documentation.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위
로그인·결제 구현, AI 채팅, 배포, 운영자 API, 실제 농가 검증. 기존 미커밋 디자인 자료는 보존한다. DEV-43/46/49의 실제 자료 및 발견 결함 기반 완료를 이번 코드 검사로 대신하지 않는다.

### 결정 사항
- 10/16 사용자 지시에 따라 기존 PR #98/#104를 머지하며 본인 할당 범위만 계속한다. 별도 확인 없이 진행하라는 지시를 이번 구현 계획에도 적용한다.
- 10/16 초안의 null뿐 아니라 빈 문자열·빈 옵션 배열을 미확인 항목으로 표시한다. 초안 생성과 상품 생성은 동시에 실행하지 않는다.
- 10/16 원산지·보관 방법 누락을 편집 화면 필드 및 공급 신청 버튼에 반영한다. API 계약은 변경하지 않는다.
- 10/16 Web Share 사용자 취소는 유지하고 다른 공유 실패는 링크 복사로 복구한다.
- 10/16 출하 후 목록 갱신 실패를 화면에 표시하고 재시도할 수 있게 한다. 출하 처리 중 확인창을 닫거나 다시 요청할 수 없게 하며 기존 PREPARING→SHIPPED 전이만 유지한다.

### 작업
- [x] 기존 P01–P07 구현과 검증 근거 대조
- [x] DEV-34 초안 실패·누락 표시·필수 입력 보완
- [x] DEV-38 공유 및 수동 출하 오류 복구
- [x] 타입 검사·실서버 Chromium 회귀 검사
- [x] 스펙·영문 wiki와 PR 검증 근거 동기화

### 기록
- 10/16 PR #98 검증 브랜치를 작업 기준으로 사용하고 머지 후 main 위로 이번 커밋만 옮긴다. 별도 일회용 PostgreSQL 컨테이너(55436)에서 검증하며 사용자 DB를 사용하지 않는다. Agent 시간/Tokens는 미측정.

- 10/16 회귀 검사에서 실서버 공유 페이지가 없고 상대 shareUrl이 생산자/소비자 앱 호스트로 해석되는 미구현을 확인. DEV-38의 AC-19-1/2/3을 위해 범위를 `server/app/farms/router.py`, `server/app/farms/share.py`, `server/app/farms/templates/farm-share.html`, `server/app/farms/spec.md`, `server/app/main.py`, `server/tasks.md`, `server/tests/test_farms.py`, `server/tests/test_farm_share.py`로 확장한다. 요청 URL의 서버 origin으로 절대 공유 URL을 만들고 Jinja2 자동 이스케이프 HTML·승인 확인·비승인 404·캐시 금지를 적용한다. 새 AI 호출이나 배포는 없다.

- 10/16 PR #98(6343b24), #104(4d7eece) 머지 후 main 위로 이번 커밋만 재배치. 전체 pytest 162개·Ruff, 4 workspace 타입 검사, 실서버 API 7개·Chromium 19개 통과. 실제 AI/카카오톡 크롤러/농가 자료 검증과 배포는 미실행. 첫 공유 회귀 실패가 드러낸 서버 페이지 누락을 구현한 뒤 전체 통합을 재실행했다.
- 10/16 커밋 전/브랜치 자체 점검: 범위 이탈·미커밋 중간 구조 호환 없음. 레거시 호환 점검: 후보 0건 — 지적 0건 / 정당 0건.


