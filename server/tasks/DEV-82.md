## DEV-82 운영자 생산자 승인 웹(로컬)과 가입 신청 목록 API

- 이슈: [DEV-82](https://linear.app/sswp6/issue/DEV-82)
- 브랜치: `nemodleo/dev-82-dev-운영자-생산자-승인-웹로컬과-가입-신청-목록`
- 기능·인수 조건: FEAT-01 AC-01-3(승인 관문), R-22 · ADR 0008(운영자 관리 API)
- 상태: 진행 중

### 목표
운영자가 확인 중인 생산자 가입 신청을 목록으로 보고 승인·반려한다. 지금은 Swagger에서 농가 ID를 알아야만 승인할 수 있다.

### 범위 (수정 허용 경로)
- 서버: `server/app/accounts/{router,schemas,service,spec}.py|md`(`GET /admin/producers`), `server/app/farms/service.py`(`list_applications`), `server/tests/test_admin.py`, `server/tasks.md`
- 승인 웹: `scripts/admin-web/**`(새 폴더, 빌드 없는 한 페이지 + 중계 함수 + 로컬 서버, Vercel 임시 배포 설정)
- 문서: `docs/spec/screens.md`(7.2 운영자 행), `docs/spec/ia.md`(운영자 화면 안내), `docs/wiki/Requirements-and-Specifications.md`(해당 시)

### 비범위
- 운영자 웹 정식 배포·도메인, 운영자 로그인(카카오 등), 주문·환불·상품 승인 화면, CORS 설정 변경

### 결정 사항
- 10/19 신청 목록은 `GET /admin/producers?status=PENDING|REJECTED|APPROVED|SUSPENDED|ALL`(기본 PENDING), 응답은 기존 `ProducerApplication` 모양 목록(신청 최신순). 운영자 토큰만.
- 10/19 승인 웹은 로컬 전용. 실서버 CORS는 소비자·생산자 앱 주소만 허용하므로, 웹을 띄우는 로컬 Node 서버가 `/admin/*` 요청을 실서버(기본 `https://api.farmclub.kr`)로 대신 보낸다. 127.0.0.1에만 열린다.
- 10/19 운영자 토큰은 사용자가 발급(`railway ssh -- .venv/bin/python -m app.accounts.admin_token`, 서버 컨테이너 안에서. `railway run`은 로컬 실행이라 내부 DB 주소에 닿지 않음)해 화면에 붙여 넣는다. 브라우저 sessionStorage에만 두고 저장소·서버 로그에 남기지 않는다.
- 10/19 (위를 바꿈) 접속은 공용 비밀번호로 한다. 운영자 토큰은 중계 환경 변수(`ADMIN_TOKEN`)에만 두고, 비밀번호(`ADMIN_WEB_PASSWORD`)가 맞을 때만 붙인다. 링크·비밀번호를 아는 사람은 누구나 승인·반려하고 결정은 `u-admin`으로 기록된다(사람별 기록은 후속). 토큰 7일 만료 시 재발급. 실서버 코드는 그대로.
- 10/19 같은 폴더를 Vercel 별도 프로젝트(`farmclub-admin`)로 임시 배포한다. 중계는 서버리스 함수(`api/proxy.js`) 하나로 로컬과 같은 코드를 쓰고, `/admin/producers` 아래 경로와 GET·POST만 넘긴다. `noindex` 헤더를 붙이고, 화면만으로는 아무것도 못 하며 운영자 토큰이 있어야 동작한다.

### 작업
- [x] 서버 목록 API와 테스트
- [x] 승인 웹(목록·상태 탭·승인·반려 사유·결정 이력)과 중계
- [x] 문서
- [x] 로컬 서버로 확인(목록·탭·반려·새 신청 승인·결정 이력, 401 안내)
- [ ] Vercel 임시 배포, 머지·배포 뒤 운영 서버로 확인

### 완료 조건
- [ ] 로컬 승인 웹에서 운영 서버의 확인 중 신청을 보고 승인·반려할 수 있다
- [ ] 테스트 통과
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/19 main 7b2b123에서 시작.

