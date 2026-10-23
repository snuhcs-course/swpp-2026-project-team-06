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
- `.gitignore`(`demo/.raw/`) → 10/23 `demo/.gitignore`로 대신함(루트는 안 건드림)
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
- 10/23 **영상 저장소 결정: (b)+(c)** (사용자 승인). Release `demo-i2`(prerelease)에 4개 업로드, `demo/videos.json`에 태그·SHA-256·크기. `demo/videos.mjs fetch`가 배포 때 받아 SHA-256 확인, `upload`가 같은 이름 교체(`--clobber`)+manifest 갱신. 영상만 다시 찍어도 `videos.json`이 바뀌어 그 커밋이 배포를 부름. 곧 재녹화 예정이라 교체 흐름을 먼저 갖춤
- 10/23 `.gitignore`는 루트 대신 `demo/.gitignore`(`.raw/`, `site/videos/`, `site/.vercel`). 범위를 줄임
- 10/23 `scripts/demo.mjs`: 문구를 iteration 중립으로, `ENVIRONMENT`→`APP_ENV`(서버 설정 이름), `ADMIN_WEB_PASSWORD`가 있으면 관리자 페이지(`scripts/admin-web/server.mjs`)를 로컬 API에 붙여 같이 띄움(재녹화에 필요). `prep-login.mjs` 관리자 기본 주소를 `admin.farmclub.kr`로
- 10/23 `record/consumer.mjs`·`producer.mjs`·`admin.mjs`는 I1 앱별 녹화로 그대로 옮김(화면 변경으로 안 맞을 수 있다고 README에 표시). 지금 영상 원본은 `story.mjs`
- 10/23 사이트 영상 길이 표기·단계 목록은 HTML에 손으로 있음. 재녹화 때 손으로 고침(자동 생성은 DEV-134)
- 10/23 녹화가 운영 PostHog를 오염시키지 않게 `lib.mjs`에서 `posthog.com`(하위 도메인 포함) 요청을 모두 abort. vercel.app 주소로 찍는 안은 DEV-127 리다이렉트·CORS·카카오 복귀 주소 때문에 불가. 운영 빌드가 쓰는 호스트(`us.i.posthog.com`, `us-assets.i.posthog.com`, `APP_POSTHOG_HOST` 미설정)를 번들에서 확인

### 작업
- [x] 사이트 원본 `demo/site/` 추가(HTML 4장, `vercel.json`), 영상은 `.gitignore`
- [x] 녹화 스크립트 `demo/record/*.mjs`, `scripts/demo.mjs` 추가. 절대경로·개인 프로필 경로·비밀값 제거, 주소는 환경 변수
- [x] 영상 저장소 결정 반영 후 업로드(Release `demo-i2`, `demo/videos.json`, `demo/videos.mjs`)
- [x] `deploy-vercel.yml`에 `deploy-demo` job
- [x] `demo/README.md`(구조·고치는 법·로컬/운영 녹화·운영 녹화 뒤 데모 농가 정리·배포)
- [x] `README.md` 도메인 표·`docs/spec/tech-design/stack.md`에 `demo.farmclub.kr` 추가, `package.json` `demo` 스크립트
- [x] `node --check`로 스크립트 문법 확인, 로컬 `serve`로 사이트 4페이지·영상 재생 확인
- [ ] 머지 후 Action 배포 1회와 `demo.farmclub.kr` 200·영상 재생 확인

### 완료 조건
- [x] `demo/site/`가 지금 라이브와 같은 화면을 낸다
- [x] 녹화 스크립트·실행기가 레포에 있고 비밀값·개인 경로가 없다
- [x] 영상은 git 밖에 있고 사이트에서 재생된다
- [ ] main 머지 후 Action이 `farmclub-demo`에 배포한다
- [ ] 테스트 통과(CI, 해당 없는 앱 테스트는 영향 없음 확인)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/23 브랜치·spec·tasks 첫 커밋, draft PR. 다음: 영상 저장소 결정 받고 사이트·스크립트 추가
- 10/23 구현 커밋. 검증: `videos.mjs upload`(새 Release 생성)·재실행(교체, manifest 변화 없음)·`fetch`(받기·SHA-256·이미 같으면 건너뜀), `actionlint` 통과, 로컬 `serve` 4페이지 200·영상 206·재생 확인, `DEMO_DB=farmclub_demo ADMIN_WEB_PASSWORD=… npm run demo`로 API(health ok, 테스트 계정, 카카오 꺼짐)·두 앱·관리자 페이지(200) 기동 확인. Vercel 미리보기 배포는 로그인 보호(302)라 화면 확인 못 함. 남은 것: 머지 후 Action 배포 1회 확인
- 10/23 PostHog 차단 검증: 같은 `POSTHOG` 패턴으로 `farmclub.kr/`·`farm.farmclub.kr/login`을 로그인 없이 열어 요청 43건 중 PostHog 10건(flags, 설정·녹화 스크립트)이 모두 abort, PostHog 응답 0건
