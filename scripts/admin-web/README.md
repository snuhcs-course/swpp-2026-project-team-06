# 관리자 페이지 (DEV-82, DEV-83, DEV-87, DEV-98)

운영자가 쓰는 임시 관리자 페이지다. 지금은 생산자 가입 신청과 상품 공급 물량 신청을 목록으로 보고 승인·반려하는 화면 두 개와 테스트 농가를 숨기는 화면이 있고, 왼쪽 메뉴에 관리 화면을 하나씩 늘려 간다. 빌드 없는 HTML 화면과 Vercel 함수(로컬은 `server.mjs`)로 되어 있다.

| 경로 | 화면 |
| -- | -- |
| `/login` | 로그인(공용 접속 비밀번호). 로그인한 상태면 `/producers`로 |
| `/producers` | 농가 가입 신청: 상태 탭 → 승인(두 번 눌러 확인) / 반려(사유) → 결정 이력 |
| `/capacity` | 공급 물량 승인(DEV-87): 상품별 첫 판매·증량 신청 → 신청량 전체 승인(두 번 눌러 확인) / 반려(사유). 부분 승인 없음 |
| `/farms` | 테스트 농가(DEV-98): 공개 중·숨김 탭 → 숨기기 / 다시 공개 → 미리보기(거부 사유, 출하 전 테스트 주문) → 두 번 눌러 실행. 테스트 계정이 아닌 소비자 주문이 있으면 거부 |
| `/` | 로그인 상태에 따라 `/producers` 또는 `/login` |

## 구조

```
api/page.js      화면을 내려 준다. 로그인 안 했으면 /login?next=… 으로 보낸다
api/login.js     POST {password} → 맞으면 세션 쿠키, 틀리면 0.8초 늦게 401
api/logout.js    POST → 쿠키 지우고 /login
api/proxy.js     세션 확인 → 운영자 토큰을 붙여 실서버 /admin/… 허용 경로로 중계
api/_lib/        세션(서명 쿠키)·공용 함수. 밑줄 폴더라 함수·정적 파일로 나가지 않는다
api/_views/      화면 HTML(login, producers, capacity, farms). 데이터는 없고 중계로 불러온다
assets/          공용 스타일(admin.css)과 사이드바 메뉴·중계 호출(admin.js)
vercel.json      경로 규칙(rewrites). server.mjs도 같은 규칙을 읽는다
```

- 실서버 CORS는 소비자·생산자 앱 주소만 허용한다. 그래서 브라우저가 실서버를 직접 부르지 않고, 중계가 `api/proxy.js` `ALLOWED`에 적은 경로(가입 신청, 공급 물량 신청, 테스트 농가)만 실서버로 넘긴다.
- 로그인은 공용 비밀번호(`ADMIN_WEB_PASSWORD`)를 한 번 확인하고 `fc_admin` 쿠키를 준다. HttpOnly·SameSite=Strict, https에서는 Secure, 12시간 유효. 값은 만료 시각과 HMAC 서명이고, 서명 키는 비밀번호에서 만든다. 그래서 새 환경 변수가 없고, 비밀번호를 바꾸면 모든 로그인이 풀린다. 다른 사이트에서 온 POST(Origin이 다름)는 거절한다.
- 운영자 토큰(`ADMIN_TOKEN`)은 함수 환경 변수에만 있고 브라우저로 가지 않는다. 세션이 끝나면 화면이 `/login`으로 보내고, 다시 로그인하면 보던 화면으로 돌아온다.
- 링크와 비밀번호를 아는 사람은 누구나 승인·반려할 수 있고, 결정은 모두 운영자 계정(`u-admin`) 이름으로 기록된다. 사람별 기록이 필요해지면 사람별 운영자 계정(서버 변경)으로 바꾼다.

### 메뉴 늘리기

1. `api/_views/<이름>.html`을 만든다(`producers.html`처럼 `#side`·`assets/admin.js`를 쓴다).
2. `api/page.js`의 `PAGES`, `vercel.json` `rewrites`, `assets/admin.js`의 `NAV`에 한 줄씩 넣는다.
3. 새 실서버 경로를 부르면 `api/proxy.js`의 `ALLOWED`를 넓힌다.

## 운영자 토큰 발급 (7일 유효)

```sh
cd server
railway ssh -- .venv/bin/python -m app.accounts.admin_token
```

API 서버 컨테이너 안에서 실행해 토큰은 7일 유효하다. 만료되면 화면에 안내가 뜨고, 다시 발급해 `ADMIN_TOKEN`을 바꾼다. 운영 DB의 운영자 계정(`u-admin`)과 운영 `JWT_SECRET`으로 발급된다. `railway run`은 내 컴퓨터에서 실행하므로 내부 주소(`postgres.railway.internal`)인 운영 DB에 닿지 않는다. Railway에 연결된 체크아웃(`railway link`)에서 실행한다. 토큰은 비밀번호처럼 다루고 저장소·채팅에 붙이지 않는다.

## 로컬 실행

```sh
ADMIN_WEB_PASSWORD=… ADMIN_TOKEN=… node scripts/admin-web/server.mjs   # http://127.0.0.1:8090/login → https://api.farmclub.kr
# 로컬 서버에 붙일 때는 FARMCLUB_API_URL=http://127.0.0.1:8000 과 로컬에서 발급한 토큰
# (server/에서 같은 DATABASE_URL·JWT_SECRET으로 uv run python -m app.accounts.admin_token)
```

## Vercel 임시 배포

이 폴더를 루트로 하는 별도 Vercel 프로젝트(`farmclub-admin`)로 올린다. `api/proxy.js`가 서버리스 함수가 된다. Vercel 환경 변수에 `ADMIN_WEB_PASSWORD`와 `ADMIN_TOKEN`을 넣어야 동작한다(없으면 로그인·중계가 503). 실서버 주소를 바꾸려면 `FARMCLUB_API_URL`을 넣는다.

```sh
cd scripts/admin-web
vercel deploy --prod
```

검색 노출을 막는 헤더(`noindex`)를 붙인다. 로그인 전에는 로그인 화면만 열리고, 목록·승인은 세션이 있어야 된다.
