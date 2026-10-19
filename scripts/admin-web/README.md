# 운영자 생산자 승인 웹 (DEV-82)

생산자 가입 신청을 목록으로 보고 승인·반려하는 임시 운영자 화면이다. 빌드 없는 한 페이지(`index.html`)와 실서버로 요청을 넘기는 중계(`api/proxy.js`)로 되어 있다.

- 실서버 CORS는 소비자·생산자 앱 주소만 허용한다. 그래서 브라우저가 실서버를 직접 부르지 않고, 중계가 `/admin/producers` 아래 경로만 실서버로 넘긴다.
- 접속은 공용 비밀번호로 한다. 중계가 비밀번호(`ADMIN_WEB_PASSWORD`)를 확인한 뒤 환경 변수에 둔 운영자 토큰(`ADMIN_TOKEN`)을 붙여 실서버를 부른다. 토큰은 브라우저로 가지 않는다. 틀린 비밀번호는 0.8초 늦게 거절한다.
- 링크와 비밀번호를 아는 사람은 누구나 승인·반려할 수 있고, 결정은 모두 운영자 계정(`u-admin`) 이름으로 기록된다. 사람별 기록이 필요해지면 운영자 로그인으로 바꾼다.

## 운영자 토큰 발급 (7일 유효)

```sh
cd server
railway ssh -- .venv/bin/python -m app.accounts.admin_token
```

API 서버 컨테이너 안에서 실행해 토큰은 7일 유효하다. 만료되면 화면에 안내가 뜨고, 다시 발급해 `ADMIN_TOKEN`을 바꾼다. 운영 DB의 운영자 계정(`u-admin`)과 운영 `JWT_SECRET`으로 발급된다. `railway run`은 내 컴퓨터에서 실행하므로 내부 주소(`postgres.railway.internal`)인 운영 DB에 닿지 않는다. Railway에 연결된 체크아웃(`railway link`)에서 실행한다. 토큰은 비밀번호처럼 다루고 저장소·채팅에 붙이지 않는다.

## 로컬 실행

```sh
ADMIN_WEB_PASSWORD=… ADMIN_TOKEN=… node scripts/admin-web/server.mjs   # http://127.0.0.1:8090 → https://api.farmclub.kr
# 로컬 서버에 붙일 때는 FARMCLUB_API_URL=http://127.0.0.1:8000 과 로컬에서 발급한 토큰
```

## Vercel 임시 배포

이 폴더를 루트로 하는 별도 Vercel 프로젝트(`farmclub-admin`)로 올린다. `api/proxy.js`가 서버리스 함수가 된다. Vercel 환경 변수에 `ADMIN_WEB_PASSWORD`와 `ADMIN_TOKEN`을 넣어야 동작한다(없으면 503). 실서버 주소를 바꾸려면 `FARMCLUB_API_URL`을 넣는다.

```sh
cd scripts/admin-web
vercel deploy --prod
```

검색 노출을 막는 헤더(`noindex`)를 붙이지만 주소를 아는 사람은 화면을 열 수 있다. 비밀번호가 있어야 목록·승인이 된다.
