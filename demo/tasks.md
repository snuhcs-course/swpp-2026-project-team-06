# demo tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-133 워킹 데모 사이트·녹화 스크립트를 main demo/로 옮기고 push로 배포

- 이슈: [DEV-133](https://linear.app/sswp6/issue/DEV-133)
- 브랜치: `nemodleo/dev-133-demo-site-to-repo`
- 기능·인수 조건: 없음(평가용 데모 도구). 영상이 보여 주는 기능은 `demo/spec.md` 참고
- 상태: 진행 중

### 목표
`demo.farmclub.kr`의 원본(사이트·녹화 스크립트)이 레포에 없고 Vercel `farmclub-demo`는 Git 연결 없이 CLI로만 배포돼 왔다. 원본을 main `demo/`로 옮기고 push로 배포되게 해 I3·I4·Final에서도 갱신할 수 있게 한다.

### 범위 (수정 허용 경로)
- `demo/**`
- `scripts/demo.mjs`, `package.json`(`demo` 스크립트만)
- `.github/workflows/deploy-vercel.yml`(`deploy-demo` job 추가)
- `.gitignore`(`demo/.raw/`)
- `README.md` 배포 절, `docs/spec/tech-design/stack.md` 배포 표(`demo.farmclub.kr` 한 줄씩)

### 비범위 (건드리지 않음)
- 앱(`apps/**`, `packages/**`)·서버(`server/**`) 코드
- `iteration-2-demo` 브랜치(제출 스냅숏)와 그 README
- 시나리오 한 곳 관리·record/stitch/site/publish 명령(DEV-134), CI 녹화(DEV-135)
- 운영 Railway 변수(`MOCK_LOGIN_ENABLED` 등)

### 결정 사항
- 10/23 작업 폴더는 새 `demo/`. 배포 job은 DEV-114 `deploy-admin`과 같은 방식(`production` Environment의 기존 `VERCEL_TOKEN`, 변경 감지 → `vercel deploy demo/site --prod` → 200 확인). 새 비밀값 없음
- 10/23 사이트 원본은 10/23 라이브(하단 "Iteration 2 데모"로 재배포한 판)를 기준으로 한다. 로컬 원본 일부가 iCloud에서 내려가 비어 있었기 때문
- 10/23 **결정 필요: 영상 저장소.** 지금 R2는 비공개 버킷 하나뿐이고 공개 미디어도 API(`/api/media/…`)가 내보낸다(`server/app/media/spec.md`). 데모 영상 4개(약 20MB)를 git 밖에 둘 곳 후보:
  - (a) R2 공개 버킷 + 사용자 지정 도메인(예: 데모 전용 하위 도메인) — Cloudflare 콘솔 작업을 사람이 해야 함
  - (b) GitHub Release 첨부 파일(`demo-i2` 태그) — 설정 없음. 다운로드 주소가 리다이렉트라 `<video>` 재생 확인 필요
  - (c) Vercel 배포에만 포함(git 밖) — CI가 배포 때 (a) 또는 (b)에서 받아 `demo/site/videos/`에 넣음. 사이트 주소는 지금과 같음
  - 추천: (b)로 보관 + (c)로 배포. 콘솔 작업 없이 시작하고 주소(`/videos/*.mp4`)가 안 바뀜. 공개 버킷은 DEV-134에서 다시 판단

### 작업
- [ ] 사이트 원본 `demo/site/` 추가(HTML 4장, `vercel.json`), 영상은 `.gitignore`
- [ ] 녹화 스크립트 `demo/record/*.mjs`, `scripts/demo.mjs` 추가. 절대경로·개인 프로필 경로·비밀값 제거, 주소는 환경 변수
- [ ] 영상 저장소 결정 반영(위 결정 필요) 후 업로드
- [ ] `deploy-vercel.yml`에 `deploy-demo` job
- [ ] `demo/README.md`(구조·로컬/운영 녹화·운영 녹화 뒤 데모 농가 정리·배포)
- [ ] `README.md` 배포 절·`docs/spec/tech-design/stack.md`에 `demo.farmclub.kr` 추가
- [ ] `node --check`로 녹화 스크립트 문법 확인, 로컬 `npx serve demo/site`(또는 동등)로 사이트 4페이지·영상 재생 확인
- [ ] 머지 후 Action 배포 1회와 `demo.farmclub.kr` 200·영상 재생 확인

### 완료 조건
- [ ] `demo/site/`가 지금 라이브와 같은 화면을 낸다
- [ ] 녹화 스크립트·실행기가 레포에 있고 비밀값·개인 경로가 없다
- [ ] 영상은 git 밖에 있고 사이트에서 재생된다
- [ ] main 머지 후 Action이 `farmclub-demo`에 배포한다
- [ ] 테스트 통과(CI, 해당 없는 앱 테스트는 영향 없음 확인)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/23 브랜치·spec·tasks 첫 커밋, draft PR. 다음: 영상 저장소 결정 받고 사이트·스크립트 추가
