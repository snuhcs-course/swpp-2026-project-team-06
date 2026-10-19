# 운영자 생산자 승인 웹 (DEV-82)

생산자 가입 신청을 목록으로 보고 승인·반려하는 임시 운영자 화면이다. 빌드 없는 한 페이지(`index.html`)와 실서버로 요청을 넘기는 중계(`api/proxy.js`)로 되어 있다.

- 실서버 CORS는 소비자·생산자 앱 주소만 허용한다. 그래서 브라우저가 실서버를 직접 부르지 않고, 중계가 `/admin/producers` 아래 경로만 실서버로 넘긴다.
- 운영자 토큰은 화면에 붙여 넣는다. 브라우저 탭(sessionStorage)에만 두고, 중계는 저장하지 않고 그대로 전달한다.

## 운영자 토큰 발급 (7일 유효)

```sh
cd server
railway run uv run python -m app.accounts.admin_token
```

운영 DB의 운영자 계정(`u-admin`)과 운영 `JWT_SECRET`으로 발급된다. 토큰은 비밀번호처럼 다루고 저장소·채팅에 붙이지 않는다.

## 로컬 실행

```sh
node scripts/admin-web/server.mjs   # http://127.0.0.1:8090 → https://api.farmclub.kr
FARMCLUB_API_URL=http://127.0.0.1:8000 node scripts/admin-web/server.mjs   # 로컬 서버에 붙일 때
```

## Vercel 임시 배포

이 폴더를 루트로 하는 별도 Vercel 프로젝트(`farmclub-admin`)로 올린다. `api/proxy.js`가 서버리스 함수가 된다. 실서버 주소를 바꾸려면 Vercel 환경 변수 `FARMCLUB_API_URL`을 넣는다.

```sh
cd scripts/admin-web
vercel deploy --prod
```

검색 노출을 막는 헤더(`noindex`)를 붙이지만 주소를 아는 사람은 화면을 열 수 있다. 화면만으로는 아무것도 할 수 없고 운영자 토큰이 있어야 목록·승인이 된다.
