# server spec

> 구현하는 기능: FEAT-01~15, FEAT-17, FEAT-19의 서버 쪽(모듈별 spec.md) · 지키는 규칙: N-03, N-05, N-06, N-07
> 동작·규칙·인수 조건 원본: docs/spec/functional/ (여기에 다시 쓰지 않는다)
> 스택·레포 구조: docs/spec/tech-design/stack.md 2·3장, 데이터 모델·주문 상태: docs/spec/tech-design/README.md, 결정: docs/spec/tech-design/adr/

## 역할
FastAPI 서버 하나(ADR 0007). 두 앱의 API, 운영자 관리 API(ADR 0008), 농가 공유 링크 OG 페이지(ADR 0006)를 맡는다. Railway에 배포하고 DB는 PostgreSQL이다.

## 구조
```
server/
  pyproject.toml, uv.lock   uv 프로젝트
  alembic.ini, migrations/  Alembic (env.py는 core/config의 DB URL, core/db의 Base.metadata를 쓴다)
  docker-compose.yml        로컬 PostgreSQL 16
  .env.example              환경 변수 이름만
  app/
    main.py                 FastAPI 앱 생성, /health, 모듈 라우터 등록
    core/                   config.py(설정), db.py(엔진·세션·Base), security.py(현재 사용자·역할 검사)
    accounts/ farms/ catalog/ orders/ messaging/ ai/ analytics/
                            모듈마다 router.py·models.py·schemas.py·service.py, 맡은 일은 각 spec.md
  tests/                    pytest
```

| 모듈 | 맡는 FEAT | spec |
| --- | --- | --- |
| accounts | FEAT-01, 08(저장 배송지) | [app/accounts/spec.md](./app/accounts/spec.md) |
| farms | FEAT-02, 06, 19 | [app/farms/spec.md](./app/farms/spec.md) |
| catalog | FEAT-03, 04, 05, 07, 14 | [app/catalog/spec.md](./app/catalog/spec.md) |
| orders | FEAT-08, 09, 10, 11, 14, 17 | [app/orders/spec.md](./app/orders/spec.md) |
| messaging | FEAT-12, 13, 15 | [app/messaging/spec.md](./app/messaging/spec.md) |
| ai | FEAT-03, 13, 17 (호출 어댑터) | [app/ai/spec.md](./app/ai/spec.md) |
| analytics | PRD 4장 지표 서버 이벤트 | [app/analytics/spec.md](./app/analytics/spec.md) |

## 계약

**앱 구조**
- 앱용 API는 `/api` 아래, 모듈 라우터의 prefix로 나눈다(`/api/auth`, `/api/farms`, `/api/products`, `/api/orders`, `/api/messaging`). 운영자 관리 API는 `/admin/...`(ADR 0008), 공유 링크는 `/s/farms/<id>`(ADR 0006). `/health`는 루트.
- 모듈 사이 호출은 상대 모듈의 `service.py` 함수로만 한다. 다른 모듈의 `models.py`를 직접 쿼리하지 않는다(같은 트랜잭션이 필요하면 세션을 인자로 넘긴다).
- Swagger UI는 `/docs`, 스키마는 `/openapi.json`. packages/api가 이 스키마로 클라이언트를 생성한다.

**core**
- `config.py`: `pydantic-settings`로 환경 변수를 읽는다. 이름은 `.env.example`이 원본이다. 빈 값은 기본값으로 본다.
- `db.py`: SQLAlchemy 2.0 엔진·세션(`get_db` 의존성), 모든 모델의 `Base`. 엔진은 처음 쓸 때 만든다.
- `security.py`: `get_current_user`, `require_roles(...)`, `require_approved_producer` 자리. JWT(PyJWT)·카카오 로그인은 DEV-4(ADR 0003).
- 권한은 서버에서 검사한다(N-06). 역할: `CONSUMER`, `PRODUCER`, `ADMIN`(tech-design/README.md `User.roles`). 생산자 API는 `PRODUCER` + `Farm.approvalStatus = APPROVED`를 확인한다.
- 시간은 DB에 UTC(timezone-aware)로 저장하고, 화면 표시는 KST(N-03). 금액은 원 단위 정수(N-03).

**관리 API (ADR 0008)**
- 생산자 승인·반려(accounts), 상품 승인·반려(catalog), 배송 완료·환불(orders), 농가 정지(farms, R-24), 메시지 삭제(messaging).
- 각 모듈이 `/admin/<자원>` 라우터를 갖고, 모든 경로에 `require_roles(ADMIN)`을 건다. 운영 환경 `/docs`는 공개하지 않는다.

**공유 링크 (ADR 0006)**
- `/s/farms/<id>`는 farms 모듈이 Jinja2 템플릿으로 OG 태그 HTML을 주고 소비자 앱 `/farms/<id>`로 보낸다.

**에러 형식** (DEV-4에서 확정, 그 전엔 FastAPI 기본)
- 본문: `{"error": {"code": "STAGE_SOLD_OUT", "message": "<사용자 문구>"}}`. `code`는 영문 대문자 상수, `message`는 policy.md 문구.
- 상태 코드: 400 입력 오류, 401 로그인 필요, 403 권한 없음, 404 없음, 409 상태·물량 충돌(R-06, 주문 상태 전이), 422 검증 실패, 504 AI 시간 초과는 쓰지 않고 각 FEAT의 대체 동작으로 처리.
- 응답·로그에 개인정보를 넣지 않는다(N-05).

**테스트 방법**
- `uv run pytest`(테스트), `uv run ruff check .`(린트). CI는 DEV-9.
- 테스트 이름에 AC ID를 넣는다: `test_AC_09_1_last_item_concurrent_payment`.
- DB가 필요한 테스트는 docker compose의 PostgreSQL을 쓴다. `SELECT … FOR UPDATE`(R-06)를 확인해야 하므로 SQLite로 대신하지 않는다.
- 외부 서비스(카카오, Claude, Langfuse, PostHog, R2)는 테스트에서 가짜로 바꾼다.

## 구현 결정
| 날짜 | 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-07 | 패키지 관리는 uv(`pyproject.toml` + `uv.lock`) | stack.md 2장 "uv 또는 pip" 중 잠금 파일·속도 | — |
| 2026-10-07 | 의존성은 fastapi, uvicorn[standard], sqlalchemy 2, alembic, psycopg[binary], pydantic-settings, pyjwt, httpx, jinja2만. anthropic·boto3·posthog·sentry는 각 기능 이슈에서 추가 | 쓰지 않는 의존성을 미리 넣지 않음 | — |
| 2026-10-07 | DB 드라이버는 psycopg 3, URL은 `postgresql+psycopg://` | SQLAlchemy 2.0 권장 드라이버 | — |
| 2026-10-07 | 앱 API는 `/api/<모듈 prefix>`, 관리 API는 `/admin/...`, 공유 링크 `/s/...`, `/health`는 루트 | stack.md 5장 `POST /api/auth/kakao`, ADR 0006·0008 | — |
| 2026-10-07 | 저장 배송지는 accounts `ShippingAddress`, 주문은 주문 시점 주소를 `Order`에 복사(참조하지 않음). `ProductDraft`는 catalog | 팀 결정. 배송지를 바꿔도 지난 주문이 바뀌지 않게 | AC-08-5 |
| 2026-10-07 | 모듈 간에는 service 함수로만 호출 | 모듈 경계 유지, 동시 작업 충돌 감소 | — |
