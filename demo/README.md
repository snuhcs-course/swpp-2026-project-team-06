# demo — 워킹 데모 사이트와 녹화 스크립트

https://demo.farmclub.kr (Vercel `farmclub-demo`)의 원본이다. 평가자에게 보여 주는 영상 4개(전체 흐름·소비자 앱·생산자 앱·관리자 페이지)와 단계 설명 페이지로 되어 있다. 제품 앱·서버 코드는 여기 없다.

| 경로 | 내용 |
| -- | -- |
| `site/` | 정적 사이트(빌드 없음). `index.html`(전체 흐름), `consumer/`·`producer/`·`admin/`, `vercel.json`(cleanUrls) |
| `site/videos/` | 영상 자리. **git에 없다**(`.gitignore`). 배포 때 `videos.mjs fetch`가 채운다 |
| `scenario.mjs` | 시나리오 원본(DEV-134): 구간 순서, 구간마다 전체 흐름 한 줄, 앱 페이지 단계(제목·설명·FEAT ID)와 그 단계의 녹화 자막, 하단 문구 |
| `manifest.json` | 영상 4개의 실제 길이(초)와 이어 붙인 구간. `demo:stitch`가 쓰고 `demo:site`가 읽는다 |
| `cmd/` | `npm run demo:record`·`demo:stitch`·`demo:site`·`demo:publish`(아래 "영상을 다시 찍었을 때"). 테스트는 `scripts/test-demo-*.mjs` |
| `videos.json` | 영상이 있는 GitHub Release 태그와 파일별 SHA-256·크기 |
| `videos.mjs` | `fetch`(Release → `site/videos/`, SHA-256 확인) / `upload`(mp4 → Release, `videos.json` 갱신) |
| `record/` | Playwright 녹화 스크립트. `story.mjs`가 지금 영상(I3, `demo-i3`)의 원본(구간 `p1 a1 p2 a2 c1 p3 c2 p4 c3 p5 c4`), `prep-test-login.mjs`는 로컬 녹화 전 테스트 계정 미리 로그인(로그인 장면을 찍지 않음), `lib.mjs`는 커서·자막·ffmpeg 인코딩. `consumer.mjs`·`producer.mjs`·`admin.mjs`는 I1 때 앱별 녹화(화면이 바뀌어 맞지 않을 수 있음) |
| `../scripts/demo.mjs` | `npm run demo`: 로컬 실서버 스택(시드 초기화 → FastAPI → 두 앱, `ADMIN_WEB_PASSWORD`가 있으면 관리자 페이지도) |

## 배포

main에 머지되면 `.github/workflows/deploy-vercel.yml`의 `deploy-demo` job이 CI 성공 뒤 실행된다. 그 커밋에 `demo/site/`·`demo/videos.json`·`demo/videos.mjs`·워크플로 변경이 있으면 영상을 Release에서 받아 `vercel deploy demo/site --prod`로 올리고 `/`(200)·`/videos/story.mp4`(206)를 확인한다. 같은 Actions 탭 **Run workflow**(main)로 수동 배포도 된다. 토큰은 `production` Environment의 `VERCEL_TOKEN`(새 비밀값 없음).

## 고치는 법

**문구·페이지만 고칠 때**: `site/**`을 고쳐 PR → 머지하면 배포된다. 로컬 확인은 `node demo/videos.mjs fetch && npx serve@14.2.4 demo/site`.

**영상을 다시 찍었을 때** (명령은 `make demo-*`로도 같다)
1. 시나리오가 바뀌었으면 `scenario.mjs`를 먼저 고친다(구간 순서·단계·FEAT ID·자막·하단 문구). `story.mjs`가 아직 자막을 따로 적고 있어서 자막을 바꿨으면 `story.mjs`의 `cap()`도 같이 고친다. 어긋나면 `npm run demo:site`가 `자막 불일치`로 경고한다
2. `npm run demo:record -- --target local [구간…]` — 구간마다 `story.mjs`를 돌린다(아래 "녹화"). 구간을 안 주면 시나리오 순서 전체
3. `npm run demo:stitch` — `demo/.raw/story/<구간>.(mp4|webm)`을 이어 `demo/.raw/out/`에 `story.mp4`(전체)와 `consumer`·`producer`·`admin.mp4`(그 역할 구간만)를 만들고 길이를 `manifest.json`에 적는다. 시스템 ffmpeg가 필요하다. 손으로 편집한 완성 영상이면 `npm run demo:stitch -- --measure <폴더>`로 길이만 잰다
4. `npm run demo:site` — `scenario.mjs`·`manifest.json`으로 `site/**`의 단계 목록·영상 길이·카드 길이·하단 문구를 다시 쓴다(제목·소개 문단·스타일은 그대로). `-- --check`는 고칠 것이 있는지만 본다
5. `npm run demo:publish -- --dry-run`으로 영상 4개와 길이를 확인한 뒤 `npm run demo:publish` — `node demo/videos.mjs upload demo/.raw/out demo-<iteration>`을 실행한다(`gh` 로그인 필요, 같은 태그는 같은 이름 교체, 새 태그는 영상 4개 모두). 태그는 `-- --tag demo-i3`로 바꾼다
6. `demo/videos.json`·`demo/manifest.json`·`site/**` 커밋 → PR → 머지 → 배포

Release 파일을 교체한 순간부터 머지 전까지는 라이브 사이트가 옛 영상을 계속 보여 준다(배포된 사본이라서). 교체한 영상은 머지 뒤 배포에서 반영된다.

## 녹화

준비: `npm ci`, `cd server && uv sync --frozen`, `npx playwright install chromium`, ffmpeg, Docker.

녹화 브라우저는 `posthog.com`으로 가는 요청(이벤트·세션 녹화·설정·스크립트)을 모두 끊는다(`lib.mjs` `POSTHOG`). 그래서 운영(`farmclub.kr`)에서 찍어도 PostHog 지표·녹화에 남지 않는다. 구간이 끝나면 `PostHog requests blocked: N`을 출력한다. 서버는 PostHog로 보내지 않는다(`server/app/analytics` 미구현). 스크립트 없이 손으로 찍을 때는 브라우저 확장 등으로 `*.posthog.com`을 따로 막아야 한다. 앱의 Vercel 기본 주소(`farmclub-consumer.vercel.app`, `farmclub-producer.vercel.app`)는 정식 도메인으로 넘어가지 않고 PostHog도 꺼져 있어(DEV-125, DEV-236) 손으로 찍을 때 쓸 수 있다. 서버 보조 주소(`CONSUMER_APP_ALT_URLS`·`PRODUCER_APP_ALT_URLS`)와 카카오 콘솔 등록이 끝나야 로그인·데이터가 보이고, 운영 서버·DB라 만든 데이터는 운영에 남는다.

**로컬(시드·테스트 계정, 권장)**
```sh
DEMO_DB=farmclub_demo ADMIN_WEB_PASSWORD=<로컬에서 정한 값> npm run demo   # 서버·두 앱·관리자 페이지
# 다른 터미널
ADMIN_WEB_PASSWORD=<같은 값> npm run demo:record -- --target local          # 시나리오 순서 전체, 구간만: ... --target local p1 a1
```
- **영상에 로그인 장면을 넣지 않는다**(I3, DEV-181). 실제 로그인은 카카오이고 테스트 계정 화면은 시험용이다. 녹화 전에 한 번 미리 로그인하고, 같은 프로필로 찍으면 모든 구간이 로그인된 상태로 시작한다
  ```sh
  DEMO_PROFILE=demo/.raw/local-profile ADMIN_WEB_PASSWORD=<같은 값> node demo/record/prep-test-login.mjs
  DEMO_HQ=1 DEMO_PROFILE=demo/.raw/local-profile ADMIN_WEB_PASSWORD=<같은 값> FARMCLUB_ADMIN_URL=http://127.0.0.1:8090 node demo/record/story.mjs p1   # 구간마다
  ```
  구간은 `p1 a1 p2 a2 c1 p3 c2 p4 c3 p5 c4` 순서로 데이터가 이어진다. 한 구간이 실패하면 `npm run demo`를 다시 띄워(시드 초기화) `p1`부터 찍는다. 끝나면 `demo/.raw/local-profile`(로그인 쿠키)을 지운다
- `DEMO_DB`를 주면 개발용 `farmclub` DB를 지우지 않고 데모 DB만 시드를 다시 넣는다. 포트는 `DEMO_API_PORT`·`DEMO_CONSUMER_PORT`·`DEMO_PRODUCER_PORT`·`DEMO_ADMIN_PORT`
- `demo:record`는 주소를 `DEMO_*_PORT`(또는 `FARMCLUB_*_URL`)에서 정하고, 로컬 주소가 아니거나 관리자 구간에 `ADMIN_WEB_PASSWORD`가 없으면 멈춘다. 로컬 스택은 시드·테스트 계정·`FIXED_NOW`(2026-10-07)를 쓴다. p1부터 다시 찍을 때는 `npm run demo`를 다시 띄워 시드를 초기화한다
- 결과는 `demo/.raw/story/<구간>.webm`(`DEMO_HQ=1`이면 `.mp4`, git 밖). 구간 순서는 `scenario.mjs`의 `order`. 실패하면 그 구간에서 멈추고 다시 시작할 명령을 보여 준다

**운영(카카오 화면이 필요할 때)**
```sh
DEMO_PROFILE=demo/.raw/prod-profile node demo/record/prep-login.mjs   # 뜬 창에서 사람이 카카오·관리자 페이지에 로그인
DEMO_PROFILE=demo/.raw/prod-profile npm run demo:record -- --target prod --yes p1   # 운영 주소·DEMO_KAKAO=1은 명령이 넣는다
```
- 운영 DB에 데모 농가·상품·주문이 생긴다(그래서 `--yes`가 있어야 돈다. `make`에는 운영 녹화 타깃이 없다). 농가·인물·연락처·계좌는 `story.mjs`의 가상 값만 쓴다
- 다 찍은 뒤 데모 농가를 숨긴다: main README "Hiding a test farm (DEV-93)"의 `retire_test_farm`
- 브라우저 프로필(`demo/.raw/`)에는 로그인 쿠키가 남는다. 커밋하지 않고 끝나면 지운다

## I4 소비자 담당 구간 (DEV-281)

개인 소비자 복구 구간은 [인수·데모 준비 안내](../docs/evaluation/i4-consumer/README.md)를 따른다. 기존 로컬 통합 실행기로 scripts/e2e/consumer-i4-demo.spec.ts를 실행하면 실제 로컬 UI의 입금 재알림·열린 주문 갱신·문의 재시도 세 장면을 녹화하고 소스/환경/파일 해시 manifest를 만든다. 영상과 증거는 git에서 제외된 test-results에 남으며 기존 I3 공개 영상·사이트·Release를 바꾸지 않는다. 사람 참가자 관찰은 별도 빈 session-template.json에 기록한다.
