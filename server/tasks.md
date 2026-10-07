# server tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 모듈별 FEAT는 `app/<모듈>/spec.md`
- 상태: 진행 중

### 목표
DEV-4(백엔드) 구현을 바로 시작할 수 있게, stack.md 3장 구조대로 실행되는 빈 FastAPI 서버와 모듈별 spec.md를 만든다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- SQLAlchemy 모델·마이그레이션 파일, 카카오 로그인·JWT·권한 구현, AI 호출 (DEV-3·DEV-4 이후)
- anthropic·boto3·posthog·sentry 의존성(각 기능 이슈)
- CI 워크플로(DEV-9), Railway 배포(DEV-8)

### 결정 사항
- 10/07 tasks.md는 작업 단위 폴더(`server/`)에만 두고, 서버 모듈 폴더(`app/<모듈>/`)에는 두지 않는다. 모듈 폴더에는 spec.md만 둔다. 한 이슈가 여러 모듈을 함께 고치는 일이 많아, 이슈 기록을 한 곳에 모으기 위해서다
- 10/07 패키지 관리는 uv, DB 드라이버는 psycopg 3(`postgresql+psycopg://`)
- 10/07 앱 API는 `/api/<prefix>`, 관리 API `/admin/...`, 공유 링크 `/s/...`, `/health`는 루트(server/spec.md)
- 10/07 `ProductDraft`는 catalog가 가진다(ai는 저장하지 않음) — 팀 확정
- 10/07 PR 리뷰 반영: CORS를 두 앱 주소(`CONSUMER_APP_URL`, `PRODUCER_APP_URL`)로만 허용. 없으면 앱의 `health()`가 브라우저에서 막힘
- 10/07 Python 3.12로 고정(`.python-version`). uv가 3.14를 고르는 것을 막고 Railway와 맞추기 위해
- 10/07 `server/.gitignore`에 .venv·캐시·.env
- 10/07 배송지 엔티티는 데이터 모델 표에 없었음 → 팀 결정: accounts 모듈의 `ShippingAddress`(사용자별 저장 배송지, AC-08-5). 주문은 참조하지 않고 주문 시점 주소를 `Order`에 복사. 데이터 모델 문서 반영은 별도 docs PR
- 10/07 API 경로 규칙(앱 `/api/<prefix>`, 관리 `/admin/...`, 공유 링크 `/s/...`, `/health` 루트) — 팀 확정

### 작업
- [x] `server/spec.md`, `app/<모듈>/spec.md` 7개 작성
- [x] uv 프로젝트(`pyproject.toml`), 의존성·개발 의존성
- [x] `app/main.py`(`GET /health`, 라우터 등록), `app/core/`(config·db·security)
- [x] 모듈 7개 `router.py`·`models.py`·`schemas.py`·`service.py`
- [x] Alembic(`alembic init migrations`, env.py가 core 설정·Base.metadata 사용)
- [x] `docker-compose.yml`(PostgreSQL 16), `.env.example`(이름만)
- [x] `tests/test_health.py`, `uv run pytest`·`uv run ruff check .` 통과

### 완료 조건
- [x] FastAPI 앱, 도메인 모듈(router·models·schemas·service), `/health`, Alembic, 로컬 Postgres(docker compose), pytest 통과
- [x] 각 코드 폴더 `spec.md`, 작업 폴더 `tasks.md`
- [x] `.env.example`(비밀값 없이)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/07 spec.md·tasks.md 먼저 커밋
- 10/07 서버 뼈대: pytest 2개 통과, ruff 통과, docker compose Postgres 16에서 `alembic check` 통과. Python 3.12(`.python-version`)

## DEV-4 [I1-P24] Implement backend (prototype)

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4)
- 상태: 시작 전 — 아래는 SWPP-26(P22 스펙 확정)에서 넘어온 할 일만 미리 적었다. 시작할 때 `spec` 스킬로 목표·범위·완료 조건을 채운다
- 기준 문서: `docs/spec/screens.md`(화면·API), Must 범위는 screens.md 4장

### SWPP-26에서 넘어온 할 일
- [ ] Python 환경은 uv(Poetry 아님): `uv sync`, `uv run …`
- [ ] Mock 로그인: `GET /api/auth/test-accounts`, `POST /api/auth/test-login`, 설정 `MOCK_LOGIN_ENABLED`(config.py·`.env.example`에 추가, 운영 기본값 꺼짐), 시드 테스트 계정(소비자 2, 승인된 생산자 1, 승인 대기 생산자 1, `isTestAccount`) — ADR 0009, AC-01-4·5
- [ ] `.env.example`의 `KAKAO_*` 변수는 I2용으로 남기고 주석 표시. 카카오 로그인 코드는 만들지 않음
- [ ] 오류 형식 `{code, message, details}` 예외 처리기(422 검증 오류 → 400 `VALIDATION_ERROR` 포함)
- [ ] cursor 페이지네이션 공통 함수(`limit` 기본 20·최대 50, `nextCursor`)
- [ ] `Idempotency-Key` 저장(사용자·키, 24시간) — `POST /api/orders`, `POST /api/orders/{orderId}/pay`, AC-09-3
- [ ] 모델: `Reaction`(messaging), `Order.deliveryNote`·`trackingNumber`·`consentVersion`, `User.isTestAccount`·`kakaoId` 비워 둘 수 있게 — tech-design/README.md
- [ ] 홈 `GET /api/home`(farms 별도 라우터), 시즌 히어로 설정 값
- [ ] `ai.parse_shipping`은 만들지 않음(FEAT-17 자연어는 I2). 생산자 출하는 `POST /api/orders/{orderId}/ship`
- [ ] 엔드포인트 목록은 screens.md 7.2를 기준으로 하고, 바뀌면 같은 PR에서 screens.md를 고친다
