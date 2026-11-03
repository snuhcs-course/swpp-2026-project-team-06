# demo spec

> 구현하는 기능: 없음(평가용 워킹 데모 사이트·녹화 도구). 영상이 보여 주는 동작은 FEAT-01·02·03·04·05·06·07·08·09·10·12·13·14·15·19
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)

## 역할
워킹 데모 `demo.farmclub.kr`(Vercel `farmclub-demo`)의 원본과, 그 영상을 만드는 녹화 스크립트를 둔다. 제품 앱·서버 코드는 여기 없다.

## 구조
- `site/` — 정적 데모 사이트. `index.html`(전체 흐름), `consumer/`, `producer/`, `admin/` 페이지, `vercel.json`(cleanUrls). 빌드 없음
- `record/` — Playwright 녹화 스크립트. `lib.mjs`(커서·자막·ffmpeg 인코딩), `story.mjs`(구간별 전체 이야기), `consumer.mjs`·`producer.mjs`·`admin.mjs`(앱별), `prep-login.mjs`(운영 녹화용 브라우저 프로필 로그인)
- `README.md` — 사이트 구조, 녹화·배포 방법
- `../scripts/demo.mjs` — 로컬 실서버 스택(시드 초기화 → FastAPI → 두 앱)을 한 번에 띄우는 실행기

## 계약
- 배포: main CI 성공 후 `demo/site/**` 변경이 있으면 `.github/workflows/deploy-vercel.yml`이 `farmclub-demo`에 올린다
- 영상은 git에 넣지 않는다. 사이트는 외부 영상 주소를 가리킨다(저장소는 tasks.md DEV-133 결정 사항)
- 녹화 스크립트 주소는 환경 변수 `FARMCLUB_CONSUMER_URL`·`FARMCLUB_PRODUCER_URL`·`FARMCLUB_API_URL`·`FARMCLUB_ADMIN_URL`, 기본값은 로컬

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-23 | 영상은 git에 넣지 않고 GitHub Release(`demo-i2`) 첨부로 두고, 배포 때 `videos.mjs fetch`가 `videos.json`의 SHA-256으로 확인하며 `site/videos/`에 넣는다. 교체는 `upload`(같은 이름 `--clobber`) + `videos.json` 커밋 | R2는 비공개 버킷뿐이고 공개 버킷은 콘솔 작업이 필요. 사이트 주소(`/videos/*.mp4`)를 유지하고, 커밋된 해시로 바꿔치기를 막음 | — |
| 2026-10-23 | `deploy-vercel.yml` `deploy-demo`: main CI 성공 뒤 `demo/site/`·`demo/videos.(json\|mjs)`·워크플로 변경 때만 배포, `/` 200·`/videos/story.mp4` 206 확인 | DEV-114 `deploy-admin`과 같은 구조, 새 비밀값 없음 | — |
| 2026-10-23 | 녹화 브라우저는 `posthog.com` 요청을 모두 끊는다(`lib.mjs` `POSTHOG`) | 운영에서 찍어도 PostHog 지표·세션 녹화에 남지 않게. `*.vercel.app`은 DEV-127 리다이렉트·CORS·카카오 때문에 녹화에 못 씀 | — |
