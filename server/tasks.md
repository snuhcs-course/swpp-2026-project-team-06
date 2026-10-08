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

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4) (GitHub #5)
- 브랜치: `zahra/dev-4-i1-p24-implement-backend-prototype`
- 기능·인수 조건: 스펙 1.1(`docs/spec/screens.md` bccb29a, PR #28)의 Must API 23개 — FEAT-01·02·03·04·05·06·07·08·09·10·14·15 / AC-01-1·3~7, AC-03-1~3, AC-04-1·3·4, AC-05-1~3, AC-06-1·4·5, AC-07-1·2, AC-08-1~5, AC-09-1~3, AC-15-1
- 상태: 진행 중

### 목표
진우·자라 노트(데모 코드 이어서 작업하기)대로 스펙 1.1(계정 분리, 새 필드, Must API부터)을 서버에 구현한다. 데모 프로토타입(Hyun Park 작성)의 Mock을 응답 모양·로직의 참고로 쓴다. 스펙 1.2~1.5는 다음 PR에서 한다.

### 범위 (수정 허용 경로)
- `server/**`
- `README.md` 서버 실행 절(시드·Mock 로그인 플래그)

### 비범위 (건드리지 않음)
- 스펙 1.2~1.5 계약(판매 한도·중지, 공급 물량 승인 1.4, 소식방·1:1 채팅·AI 설정·주문 문의, 상세 블록) — 후속 PR
- Must가 아닌(Should) API, 카카오 로그인(I2), 실결제, R2 업로드, PostHog·Sentry·Langfuse 연동
- `apps/**`, `packages/**`, `docs/spec/**`(동작이 스펙과 다르면 같은 PR에서 고친다)

### 결정 사항
- 10/08 범위는 스펙 1.1의 Must API 23개(screens.md 7.2 I1 열). 사용자 확인
- 10/08 ID는 문자열(시드는 Mock과 같은 `u-minji`·`f-kang`·`p-house`·`opt-5`, 새 행은 접두어 + 랜덤). JSON은 camelCase. 앱과 Mock을 그대로 맞추기 위해
- 10/08 AI 초안은 `anthropic` SDK로 Claude Haiku 4.5를 부르고, `ANTHROPIC_API_KEY`가 없거나 실패·20초 초과면 `failed=true`(AC-03-3). 테스트는 가짜 어댑터. 사용자 확인
- 10/08 `JWT_SECRET`이 비어 있으면 local이 아닌 환경에서는 서버 시작을 실패시킨다(#19 리뷰, 이슈 #5)
- 10/08 시드 테스트 계정은 소비자 2·생산자 5(ADR 0010). 이전 SWPP-26 할 일의 “생산자 2명”은 SWPP-81로 바뀌었다
- 10/08 시계는 `FIXED_NOW` 설정으로 고정할 수 있다(데모·테스트 기준일 2026-10-07, contracts 1장)
- 10/08 API 문서는 FastAPI `/docs`·`/openapi.json`으로 프론트에 공유한다
- 10/08 `reservedCount`(예약한 사람 수)는 저장하지 않고 결제된 주문의 소비자 수로 계산한다(tech-design 데이터 모델). 시드의 레드향·노지·효돈 표시 값은 주문 수와 같아진다
- 10/08 팔로워 수·좋아요 수는 `Farm.follower_count`, `Broadcast.reaction_count`에 두고 팔로우·좋아요 때 같은 트랜잭션에서 바꾼다(시드 128명·128개를 그대로 보여주기 위해)
- 10/08 옵션 ID는 상품 안에서만 유일하다(`opt-5`, 기본 키 = 상품 + 옵션). 단계 ID는 전체에서 유일하게 `st-house-1`처럼 바꿨다
- 10/08 현황의 답할 질문 수(`openQuestions`)는 채팅(Should, 1.2)이 들어오기 전까지 0
- 10/08 운영자 토큰은 `python -m app.accounts.admin_token`으로 발급한다(시드 `u-admin`, 테스트 계정 아님). 관리 API는 Swagger UI에서 부른다(ADR 0008)
- 10/08 테스트는 같은 PostgreSQL의 `<DB>_test` DB에서 돈다. CI의 alembic 검사 DB와 섞이지 않게
- 10/08 도서산간 판정은 우편번호·주소 예시 규칙(Mock과 같음). 생산자가 지역을 정하는 R-20은 후속

### 작업
- [x] core: 설정(플래그·JWT 검사), 오류 형식, JWT·권한, 페이지네이션, 멱등 키, 시계
- [x] 모델과 Alembic 마이그레이션(스펙 1.1 데이터 모델)
- [x] 시드(tech-design 시드 데이터, Mock db.ts)
- [x] accounts: test-accounts, test-login, me, 배송지 조회·추가
- [x] farms: 홈, 농가, 팔로우·해제
- [x] catalog: 상품 상세, 내 상품, AI 초안, 상품 생성·수정, 단계 기본값·설정, 게시 요청 / 관리: 상품 승인
- [x] orders: 주문 생성, Mock 결제, 주문 상세, 생산자 현황
- [x] messaging: 농가 공개 소식
- [x] 테스트(AC ID), ruff, alembic check
- [ ] AI 1차 리뷰 → ready for review

### 완료 조건
- [x] 스펙 1.1의 Must API 23개 구현
- [x] API 문서(`/docs`) 공유
- [x] JWT_SECRET 비면 local 외 환경에서 시작 실패
- [x] 테스트 통과(CI server job)
- [ ] 리뷰 1명 승인 후 main 머지

### 기록
- 10/08 spec 작성, 브랜치 생성
- 10/08 core·모델·시드·accounts·farms·catalog·orders·messaging 구현. pytest 65개(AC-09-1 동시 결제 포함), ruff, alembic upgrade·downgrade·check 통과
- 10/08 로컬 서버 스모크: 로그인·WRONG_APP 403·홈·상품 상세·주문·같은 키 결제 2번(1번만 반영)·현황·운영자 승인 확인
- 10/08 남은 일(후속 PR): 스펙 1.2~1.5 계약, Should API(주문 내역·취소·구매 확정·출하·소식 올리기·채팅 등), 공유 링크 OG(/s), 카카오(I2)
