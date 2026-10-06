# 0007 백엔드: FastAPI (0002 대체)

- 상태: 결정 (2026-10-07). [0002](./0002-backend-django-admin.md)의 백엔드 결정을 대체한다
- 관련: R-06, R-22, R-25, N-04, N-06

## 배경
0002에서 Django + DRF를 골랐다. 팀은 더 가벼운 구조와 타입 기반 API 정의를 원한다.

## 결정
FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic을 Railway에 올리고 PostgreSQL을 쓴다. 파일은 boto3로 Cloudflare R2에 올린다. 서버는 도메인 모듈(accounts, farms, catalog, orders, messaging, ai, analytics)로 나누고, 모듈마다 `router.py`, `models.py`, `schemas.py`, `service.py`를 둔다.

## 결과
- API 스키마(OpenAPI)가 코드에서 바로 나와 `packages/api` 클라이언트를 생성하기 쉽다.
- 관리 화면·인증·마이그레이션 설정을 직접 조립해야 한다. Django보다 초기 작업이 늘어 I1 일정에 위험이 있다.
- 물량 차감은 트랜잭션과 `SELECT … FOR UPDATE`로 처리한다(AC-09-1).
- 운영자 업무는 [0008](./0008-operator-admin-api.md)을 따른다.

## 검토한 대안
- Django + DRF(0002): 관리 화면이 공짜지만 팀이 FastAPI를 택했다.
