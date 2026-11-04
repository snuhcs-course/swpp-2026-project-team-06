## DEV-65 Railway 자동 배포: GitHub Actions에서 railway up
- 이슈: [DEV-65](https://linear.app/sswp6/issue/DEV-65) (GitHub [#129](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/129))
- 브랜치: `nemodleo/dev-65-dev-railway-자동-배포-github-actions에서-railway-up-github`
- 기능·인수 조건: 배포(DEV-64 후속). 제품 FEAT·AC 없음
- 상태: 리뷰 중
- 목표: Railway GitHub App을 조직 레포에 못 붙이는 상황에서 main 머지만으로 서버가 배포되게 한다.
- 범위(수정 허용 경로): `.github/workflows/deploy-railway.yml`(새 파일), `README.md` Deployment 절, `docs/spec/tech-design/stack.md` CI/CD 행, `server/tasks.md`. 서버 코드·`ci.yml` 변경 없음
- 비범위: Vercel 앱 자동 배포(dist 업로드 방식 유지, 수동), Railway 변수 추가(카카오·PortOne은 각 PR 머지 뒤 사람이), 운영 플래그 전환
- 결정 사항:
  - 10/18 배포 트리거는 `push: main` + `paths: server/**, 워크플로 자신` + `workflow_dispatch`. 다른 폴더 변경은 서버를 다시 올리지 않는다.
  - 10/18 `concurrency: railway-deploy`, 취소 없음(배포는 순서대로). 시크릿 `RAILWAY_TOKEN`이 비어 있으면 첫 단계에서 명확한 오류로 실패.
  - 10/18 Railway CLI는 npm `@railway/cli@4`(로컬에서 검증한 4.x 계열). `railway up ./server --path-as-root --service farmclub-api --environment production --ci`로 2026-10-17 수동 배포와 같은 명령. 끝나면 `/health`를 최대 3분 폴링.
  - 10/18 README의 Vercel 절은 사실(GitHub 미연결, dist 업로드, EXPO_PUBLIC_* 빌드 시 고정)에 맞게 고침.
- 작업: [x] 워크플로 [x] README·stack.md [x] actionlint
- 검증: `actionlint .github/workflows/deploy-railway.yml` 통과. 실제 실행은 `RAILWAY_TOKEN` 등록 뒤 Actions에서 1회 수동 실행으로 확인해야 함(미실행).

