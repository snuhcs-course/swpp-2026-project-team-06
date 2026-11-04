## DEV-70 배포 워크플로 수동 실행을 main으로 제한, 토큰을 production Environment로
- 이슈: [DEV-70](https://linear.app/sswp6/issue/DEV-70)
- 브랜치: `nemodleo/dev-70-dev-배포-워크플로-수동-실행을-main으로-제한하고`
- 기능·인수 조건: 배포 보안(DEV-65·66·67 후속). 제품 FEAT·AC 없음
- 상태: 리뷰 중
- 목표: 다른 브랜치에서 Run workflow를 눌러도 그 브랜치가 운영(Railway·Vercel)에 올라가지 않게 한다(팀원 제보).
- 범위(수정 허용 경로): `.github/workflows/deploy-railway.yml`, `.github/workflows/deploy-vercel.yml`, `README.md` Deployment 절, `server/tasks.md`, 레포 Environment 설정. 서버·앱 코드 변경 없음
- 결정 사항:
  - 10/18 두 job `if`에 `github.ref == 'refs/heads/main'`을 앞에 붙임. `workflow_run`은 기본 브랜치 ref로 돌아 영향 없음. 수동 실행은 main에서만 통과.
  - 10/18 `if`만으로는 부족: 수동 실행은 고른 브랜치의 워크플로 파일로 돌아, 그 줄이 없는 예전 브랜치나 지운 브랜치는 통과한다. 그래서 job에 `environment: production`을 붙이고, 레포 Environment `production`의 배포 브랜치를 `main`만 허용(커스텀 정책)으로 만들었다(10/18 gh api로 생성). 토큰을 이 Environment 시크릿으로 옮기면 main이 아닌 실행은 토큰을 받지 못한다.
  - 10/18 토큰 이동은 사람 몫(에이전트는 값을 다루지 않음): `RAILWAY_TOKEN`·`VERCEL_TOKEN`을 Environment 시크릿으로 다시 등록하고 레포 수준 시크릿은 삭제. 옮기기 전에도 Environment 브랜치 정책 때문에 main이 아닌 실행에서 `environment: production` job은 시작하지 못한다.
- 작업: [x] 두 워크플로 조건·environment [x] Environment `production`(main 전용) 생성 [x] README [x] actionlint [ ] 토큰 이동(사람)
- 검증: `actionlint` 두 파일 통과. 머지 뒤 main 배포가 environment 아래에서 정상 동작하는지 확인 예정.

