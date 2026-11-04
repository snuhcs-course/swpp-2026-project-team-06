## DEV-83 관리자 페이지: 로그인 페이지 분리와 메뉴 레이아웃(승인 웹 확장)

- 이슈: [DEV-83](https://linear.app/sswp6/issue/DEV-83)
- 브랜치: `nemodleo/dev-83-dev-관리자-페이지-로그인-페이지-분리와-메뉴`
- 기능·인수 조건: FEAT-01 AC-01-3(승인 관문), R-22 · ADR 0008(운영자 관리 API). DEV-82 승인 웹을 잇는다
- 상태: 진행 중

### 목표
DEV-82 임시 승인 웹을 여러 관리 기능을 담을 관리자 페이지로 키울 토대를 만든다. 로그인 페이지를 따로 두고, 비밀번호를 매 요청 헤더로 보내는 대신 로그인 세션을 쓰며, 메뉴를 붙일 레이아웃을 둔다.

### 범위 (수정 허용 경로)
- 관리자 페이지: `scripts/admin-web/**`
- 문서: `docs/spec/ia.md`(운영자 화면 안내), `server/tasks.md`

### 비범위
- 사람별 운영자 계정(서버 운영자 로그인 API·계정·결정 기록에 사람 ID), 주문·환불·상품 승인 화면, 정식 도메인, 서버·CORS 변경

### 결정 사항
- 10/19 경로: `/login`(로그인), `/producers`(가입 신청), `/`는 로그인 상태에 따라 둘 중 하나로. 화면은 함수(`api/page.js`)가 내려 주며 세션이 없으면 302 `/login?next=…`. 로그인 뒤 `next`(같은 사이트 경로만)로 돌아간다.
- 10/19 세션: 로그인 때 공용 비밀번호를 한 번 확인하고 `fc_admin` 서명 쿠키(HMAC-SHA256, 12시간, HttpOnly·SameSite=Strict, https에서 Secure). 서명 키는 비밀번호에서 만든다 → 새 환경 변수 없음, 비밀번호를 바꾸면 모든 로그인이 풀림. 로그아웃은 POST로 쿠키 삭제. 다른 Origin의 POST는 403.
- 10/19 중계는 `X-Admin-Password` 헤더 대신 세션 쿠키를 확인한다(없으면 401 `NOT_LOGGED_IN` → 화면이 `/login`으로). 틀린 비밀번호는 로그인에서 0.8초 늦게 거절.
- 10/19 레이아웃: 왼쪽 사이드바(좁은 화면은 위쪽 메뉴), 지금 메뉴는 '가입 신청' 하나. 메뉴는 `assets/admin.js` NAV·`api/page.js` PAGES·`vercel.json` rewrites에 한 줄씩 추가. 공용 스타일·스크립트는 `assets/`, 화면 HTML·공용 함수는 `api/_views`·`api/_lib`(밑줄 폴더라 함수·정적 파일로 안 나감). 로컬 `server.mjs`는 `vercel.json` rewrites를 읽어 같은 경로 규칙을 쓴다.
- 10/19 공용 비밀번호 유지(사용자 결정). 사람별 계정은 서버 변경이 필요해 후속.

### 작업
- [x] 세션 쿠키 로그인·로그아웃, 중계 세션 확인
- [x] 로그인 페이지, 관리자 레이아웃, 가입 신청 화면 이전
- [x] 테스트(`cd scripts/admin-web && npm test`)
- [x] 문서(README, ia.md)
- [x] 로컬 확인(로컬 API + 로컬 토큰)
- [x] Vercel 배포(사용자 요청, 10/19)
- [ ] 운영 비밀번호로 로그인·승인 확인(사용자)

### 완료 조건
- [x] 미로그인 `/producers` → `/login`, 틀린 비밀번호 거절, 로그인 → 목록·승인·반려·이력, 로그아웃이 로컬에서 동작
- [x] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/19 main 79eaea7에서 시작.
- 10/19 로컬 확인: 새 DB `farmclub_dev83`(alembic head + 시드), uvicorn :8003, 로컬 발급 토큰·로컬 테스트 비밀번호로 `server.mjs` :8093. 브라우저에서 미로그인 `/producers` → `/login?next=%2Fproducers`, 틀린 비밀번호 "비밀번호가 맞지 않아요."(0.8초), 로그인 → `/producers`, 위미 감귤농장 반려(사유) · 하례 귤밭 재신청 후 승인 · 결정 이력(u-admin), 로그아웃 → `/login`, 다시 `/producers` → `/login`. curl로 서명 위조·만료·다른 Origin POST·`//` next 막힘, https에서 Secure 확인. 375px 폭 위쪽 메뉴 확인.
- 10/19 사용자 요청으로 이 브랜치를 `farmclub-admin`에 `vercel deploy --prod`(머지 전). https://farmclub-admin.vercel.app 에서 `/`·`/producers` → `/login` 302, `/login` 200, 로그인 없이 중계 401, 틀린 비밀번호 401(약 1초), 다른 Origin 403, 로그아웃 303, `api/_views`·`api/_lib`·테스트·`server.mjs`·옛 `index.html` 404 확인. 운영 비밀번호 로그인은 사용자 몫.

