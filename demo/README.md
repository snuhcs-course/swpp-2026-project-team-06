# demo — 워킹 데모 사이트와 녹화 스크립트

https://demo.farmclub.kr (Vercel `farmclub-demo`)의 원본이다. 평가자에게 보여 주는 영상 4개(전체 흐름·소비자 앱·생산자 앱·관리자 페이지)와 단계 설명 페이지로 되어 있다. 제품 앱·서버 코드는 여기 없다.

| 경로 | 내용 |
| -- | -- |
| `site/` | 정적 사이트(빌드 없음). `index.html`(전체 흐름), `consumer/`·`producer/`·`admin/`, `vercel.json`(cleanUrls) |
| `site/videos/` | 영상 자리. **git에 없다**(`.gitignore`). 배포 때 `videos.mjs fetch`가 채운다 |
| `videos.json` | 영상이 있는 GitHub Release 태그와 파일별 SHA-256·크기 |
| `videos.mjs` | `fetch`(Release → `site/videos/`, SHA-256 확인) / `upload`(mp4 → Release, `videos.json` 갱신) |
| `record/` | Playwright 녹화 스크립트. `story.mjs`가 지금 영상의 원본(구간 p1~p4·a1~a2·c1~c3), `lib.mjs`는 커서·자막·ffmpeg 인코딩. `consumer.mjs`·`producer.mjs`·`admin.mjs`는 I1 때 앱별 녹화(화면이 바뀌어 맞지 않을 수 있음) |
| `../scripts/demo.mjs` | `npm run demo`: 로컬 실서버 스택(시드 초기화 → FastAPI → 두 앱, `ADMIN_WEB_PASSWORD`가 있으면 관리자 페이지도) |

## 배포

main에 머지되면 `.github/workflows/deploy-vercel.yml`의 `deploy-demo` job이 CI 성공 뒤 실행된다. 그 커밋에 `demo/site/`·`demo/videos.json`·`demo/videos.mjs`·워크플로 변경이 있으면 영상을 Release에서 받아 `vercel deploy demo/site --prod`로 올리고 `/`(200)·`/videos/story.mp4`(206)를 확인한다. 같은 Actions 탭 **Run workflow**(main)로 수동 배포도 된다. 토큰은 `production` Environment의 `VERCEL_TOKEN`(새 비밀값 없음).

## 고치는 법

**문구·페이지만 고칠 때**: `site/**`을 고쳐 PR → 머지하면 배포된다. 로컬 확인은 `node demo/videos.mjs fetch && npx serve@14.2.4 demo/site`.

**영상을 다시 찍었을 때**
1. 새 mp4를 한 폴더에 지금과 같은 이름(`story.mp4`, `consumer.mp4`, `producer.mp4`, `admin.mp4`)으로 둔다. 일부만 바꿔도 된다
2. `node demo/videos.mjs upload <폴더>` — `demo-i2` Release의 같은 이름 파일을 교체하고 `videos.json`의 SHA-256을 바꾼다(`gh` 로그인 필요). 새 iteration은 태그를 붙인다: `node demo/videos.mjs upload <폴더> demo-i3`(새 태그는 영상 4개를 모두 올려야 한다)
3. 영상 길이·단계가 바뀌었으면 `site/**/index.html`의 길이 표기(예: `4:55`)와 단계 목록을 손으로 고친다(자동화는 DEV-134)
4. `demo/videos.json`(+ HTML) 커밋 → PR → 머지 → 배포

Release 파일을 교체한 순간부터 머지 전까지는 라이브 사이트가 옛 영상을 계속 보여 준다(배포된 사본이라서). 교체한 영상은 머지 뒤 배포에서 반영된다.

## 녹화

준비: `npm ci`, `cd server && uv sync --frozen`, `npx playwright install chromium`, ffmpeg, Docker.

녹화 브라우저는 `posthog.com`으로 가는 요청(이벤트·세션 녹화·설정·스크립트)을 모두 끊는다(`lib.mjs` `POSTHOG`). 그래서 운영(`farmclub.kr`)에서 찍어도 PostHog 지표·녹화에 남지 않는다. 구간이 끝나면 `PostHog requests blocked: N`을 출력한다. 서버는 PostHog로 보내지 않는다(`server/app/analytics` 미구현). 스크립트 없이 손으로 찍을 때는 브라우저 확장 등으로 `*.posthog.com`을 따로 막아야 한다. 앱의 `*.vercel.app` 주소는 정식 도메인으로 308 이동하고(DEV-127) API·카카오도 정식 도메인만 받아 녹화에 쓸 수 없다.

**로컬(시드·테스트 계정, 권장)**
```sh
DEMO_DB=farmclub_demo ADMIN_WEB_PASSWORD=<로컬에서 정한 값> npm run demo   # 서버·두 앱·관리자 페이지
# 다른 터미널
ADMIN_WEB_PASSWORD=<같은 값> FARMCLUB_ADMIN_URL=http://127.0.0.1:8090 node demo/record/story.mjs p1   # 구간마다
```
- `DEMO_DB`를 주면 개발용 `farmclub` DB를 지우지 않고 데모 DB만 시드를 다시 넣는다. 포트는 `DEMO_API_PORT`·`DEMO_CONSUMER_PORT`·`DEMO_PRODUCER_PORT`·`DEMO_ADMIN_PORT`
- 결과는 `demo/.raw/story/<구간>.mp4`(git 밖). 구간 순서는 `story.mjs` 머리 주석. 이어 붙이기·앱별 자르기는 아직 ffmpeg로 손으로 한다(DEV-134)

**운영(카카오 화면이 필요할 때)**
```sh
DEMO_PROFILE=demo/.raw/prod-profile node demo/record/prep-login.mjs   # 뜬 창에서 사람이 카카오·관리자 페이지에 로그인
DEMO_KAKAO=1 DEMO_PROFILE=demo/.raw/prod-profile \
FARMCLUB_CONSUMER_URL=https://farmclub.kr FARMCLUB_PRODUCER_URL=https://farm.farmclub.kr \
FARMCLUB_API_URL=https://api.farmclub.kr FARMCLUB_ADMIN_URL=https://admin.farmclub.kr \
node demo/record/story.mjs p1
```
- 운영 DB에 데모 농가·상품·주문이 생긴다. 농가·인물·연락처·계좌는 `story.mjs`의 가상 값만 쓴다
- 다 찍은 뒤 데모 농가를 숨긴다: main README "Hiding a test farm (DEV-93)"의 `retire_test_farm`
- 브라우저 프로필(`demo/.raw/`)에는 로그인 쿠키가 남는다. 커밋하지 않고 끝나면 지운다
