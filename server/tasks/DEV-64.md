## DEV-64 Railway 서버 배포 설정 준비
- 이슈: [DEV-64](https://linear.app/sswp6/issue/DEV-64)
- 브랜치: `zahra/dev-64-railway-deploy-config`
- 기능·인수 조건: 해당 없음(배포 설정). 스택 `docs/spec/tech-design/stack.md`(백엔드·DB는 Railway)
- 상태: 진행 중
- 예상: 1시간

### 목표
Railway에 서버와 PostgreSQL을 올릴 수 있게 레포 쪽 설정을 준비한다. 계정 작업(프로젝트·DB 생성, 변수 설정, 배포, Vercel 변수 변경)은 Hyun이 머지 후 한다.

### 범위 (수정 허용 경로)
- `server/Dockerfile`, `server/.dockerignore`, `server/railway.json`
- `server/app/core/config.py`(DATABASE_URL 형식 정규화만), `server/tests/`
- `server/tasks.md`, `README.md`(배포 절)

### 비범위 (건드리지 않음)
- 제품 동작, API, 마이그레이션, 앱(`apps/**`)·`packages/**`
- 실제 Railway·Vercel 계정 작업과 비밀값

### 결정 사항
- 10/17 Railway 빌더는 Dockerfile로 고정한다. `uv.lock`으로 `uv sync --frozen --no-dev`, 시작 시 `alembic upgrade head` 후 `uvicorn`을 `$PORT`로 띄우고 헬스 체크는 `/health`.
- 10/17 Railway가 주는 `postgresql://`·`postgres://` DATABASE_URL을 설정에서 `postgresql+psycopg://`로 바꾼다. 앱과 Alembic이 같은 설정을 읽으므로 한 곳만 고친다.
- 10/17 시드는 자동 실행하지 않는다. 배포 후 한 번 수동으로 `python -m app.core.seed`(덮어쓰기 없음)를 실행한다.

### 작업
- [x] Dockerfile·.dockerignore·railway.json
- [x] DATABASE_URL 정규화와 테스트
- [x] README 배포 절(Railway 서비스 설정, 환경변수, 시드, Vercel 변수)
- [x] 로컬 Docker 빌드·실행 검증(PostgreSQL 연결, 마이그레이션, `/health`)

### 완료 조건
- [x] 이미지가 빌드되고 로컬 PostgreSQL로 시작해 마이그레이션 후 `/health` 응답
- [x] Ruff·pytest 통과
- [ ] PR 머지
- [ ] Hyun 배포 후 배포 URL 확인

### 기록
- 10/17 Railway 설정·URL·배포 단계가 레포 어디에도 없고, Vercel 앱 두 개가 Mock 모드(`EXPO_PUBLIC_API_MOCK=1`)로 빌드되어 실서버를 쓰지 않음을 확인했다. 테스트 2(실결제, SWPP-109)에는 실서버가 필요하다.
- 10/17 `docker build` 성공(863MB). Railway처럼 `APP_ENV=production`, `PORT=8123`, `postgresql://` 형식 DATABASE_URL로 임시 DB에 띄워 확인: 마이그레이션 0001→0008 실행, `/health` `{"status":"ok"}`, 컨테이너 안 `python -m app.core.seed` 1회 성공·재실행은 건너뜀, Vercel 소비자 origin CORS 허용·다른 origin 거부, `u-minji` 테스트 로그인 후 채팅 목록 조회. 컨테이너·이미지·임시 DB는 삭제했다. Ruff 통과, pytest 218개 통과(DATABASE_URL 정규화 3개 추가).

