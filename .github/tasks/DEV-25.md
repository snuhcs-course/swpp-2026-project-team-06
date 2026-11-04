## DEV-25 [I1-P26-1] Comprehensive Integration Test Automation — CI

- 이슈: [DEV-25](https://linear.app/sswp6/issue/DEV-25) (GitHub #56)
- 브랜치: `zahra/dev-25-i1-p26-1-comprehensive-integration-test-automation`
- 기능·인수 조건: I1 P0 실제 client↔server 통합 회귀
- 상태: 진행 중

### 목표
기존 server·apps CI 뒤에 PostgreSQL·FastAPI·두 Expo 웹 앱·Chromium을 실제로 연결하는 필수 통합 검사를 추가한다.

### 범위 (수정 허용 경로)
- `.github/workflows/ci.yml`
- `.github/tasks.md` (이 절)

### 비범위 (건드리지 않음)
- 배포 workflow·Vercel·Railway·secrets
- 기존 server·apps 검사 약화 또는 삭제
- branch protection 설정(머지 후 저장소 관리자가 `integration`을 필수 체크로 지정)

### 결정 사항
- 10/09 `integration` job은 server·apps 뒤에서 PostgreSQL 16과 Chromium으로 `npm run test:integration:full`을 실행한다
- 10/09 job timeout은 25분이며 실패 때 Playwright report·trace·screenshots와 server/app/request log를 artifact로 올린다
- 10/09 경로 필터에 앱·패키지·서버·스크립트·루트 package 파일·Playwright 설정·workflow를 포함한다

### 작업
- [x] integration 변경 감지와 PostgreSQL service
- [x] Node·uv·Chromium 설치와 full integration 실행
- [x] 실패 artifact 업로드와 항상 성공하는 skip 경로
- [x] action syntax와 실제 Actions 실행 확인

### 완료 조건
- [x] 관련 PR에서 integration job이 실행되고 통과
- [ ] 관련 없는 변경에서는 job이 skip 단계 후 성공
- [x] 실패 증거 upload 단계가 report·trace·screenshot/video·process/HTTP log를 포함
- [x] 기존 server·apps job 유지
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/09 DEV-25는 root test automation과 CI를 함께 바꾸므로 packages/tasks.md와 이 파일에 각각 범위·결정을 기록
- 10/09 `integration` job을 `needs: [server, apps]`, PostgreSQL 16, Node 24, Python 3.12/uv, Chromium, 25분 제한으로 추가. 관련 경로가 없으면 skip 단계만 실행
- 10/09 실패 시 `playwright-report/`, `test-results/`, `.artifacts/integration/`을 7일 artifact로 업로드하도록 구성. 로컬 YAML parse와 full integration 통과; GitHub Actions 결과는 push 후 확인
- 10/09 첫 run 37818613030에서 Linux 전용 locator 차이를 artifact로 확인·수정. 재실행 run 37819337425에서 server 44초, apps 1분 28초, integration 2분 7초로 모두 통과


