## DEV-66 서버 배포를 main CI 성공 뒤에만 실행
- 이슈: [DEV-66](https://linear.app/sswp6/issue/DEV-66) (GitHub [#133](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/133))
- 브랜치: `nemodleo/dev-66-dev-서버-배포를-main-ci-성공-뒤에만-실행`
- 기능·인수 조건: 배포(DEV-65 후속). 제품 FEAT·AC 없음
- 상태: 리뷰 중
- 목표: main 테스트가 실패한 커밋이 배포되지 않게 한다(main 브랜치 보호가 꺼져 있어 CI 실패 PR도 머지 가능).
- 범위(수정 허용 경로): `.github/workflows/deploy-railway.yml`, `README.md` Automatic deploys 절, `docs/spec/tech-design/stack.md` CI/CD 행, `server/tasks.md`. `ci.yml`·서버 코드 변경 없음
- 결정 사항:
  - 10/18 트리거를 `push`에서 `workflow_run`(workflows: CI, completed, branches: main)으로 바꾸고, `conclusion == success`이고 `event == push`일 때만 실행. PR에서 돈 CI로는 배포하지 않는다.
  - 10/18 CI가 검사한 `head_sha`를 체크아웃해 올린다. 그사이 main이 더 나가도 검증 안 된 커밋은 올리지 않는다.
  - 10/18 변경 판단은 `git diff HEAD~1 HEAD`(squash 머지 규칙상 커밋 하나 = PR 하나). `server/` 또는 이 워크플로가 바뀌었을 때만 배포하고, 아니면 건너뛰고 성공. `workflow_run`에는 paths 필터가 없어서 직접 판단한다.
  - 10/18 수동 실행(`workflow_dispatch`)은 변경 여부와 상관없이 현재 main을 올린다(변수 변경 뒤 재배포용).
  - 10/18 `actions/checkout`·`setup-node`는 `ci.yml`과 같은 v7로 맞춤.
- 작업: [x] 워크플로 트리거·변경 판단 [x] README·stack.md [x] actionlint
- 검증: `actionlint .github/workflows/deploy-railway.yml` 통과. 실제 흐름(머지 → CI 성공 → 배포)은 머지 뒤 1회 실행으로 확인 예정.

