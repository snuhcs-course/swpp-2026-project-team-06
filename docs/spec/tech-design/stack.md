# 기술 스택 (I1-P19)

> 상태: 결정(팀 확인 대기) · 담당: 박현(PM) · Linear: SWPP-23
> 참조: [PRD](../prd.md) 7.3 비기능 요구사항, [기능 명세](../functional/README.md), [서비스 정책](../policy.md), [데이터 모델](./README.md)
> 결정 근거는 [adr/](./adr/)에 하나씩 남긴다.

## 1. 결정 기준

1. I1 일정: 구현(P23·P24) 마감 10/7. 직접 만들 코드가 적어야 한다.
2. 소비자 앱과 생산자 앱은 별도 모바일 웹이다(N-01). I2 이후 앱 출시 가능성을 열어 둔다.
3. 첫 진입은 농가가 카톡으로 보낸 링크다(FEAT-19). 링크 미리보기(농가 이름·사진)가 떠야 한다.
4. 운영자 업무(생산자·상품 승인, 배송 완료, 환불)를 화면 없이 스크립트로만 하기엔 부담이 크다.
5. AI는 상품 초안(FEAT-03), 문의 응답(FEAT-13)에 쓴다. 출하 문장 해석(FEAT-17)은 I2다. 개인정보는 보내지 않는다(M-18).
6. I1부터 지표를 측정한다(PRD 4장).
7. 팀 전원이 AI 코딩 에이전트로 개발한다 → 자료가 많은 주류 스택.
8. 비용은 무료~월 $20 안.

## 2. 스택

| 영역 | 결정 | 이유 | ADR |
| --- | --- | --- | --- |
| 프론트엔드 | Expo(React Native, TypeScript) + Expo Router, **웹 출력**으로 소비자 앱·생산자 앱 2개 | 한 코드로 웹을 먼저 내고 I2에 Android·iOS로 넓힐 수 있음 | [0001](./adr/0001-frontend-expo-web.md) |
| 웹 호스팅 | Vercel(정적 웹 출력), 앱마다 프로젝트 1개 | 무료, 브랜치 미리보기 | 0001 |
| 백엔드 | FastAPI + Pydantic v2 + SQLAlchemy 2.0 + Alembic, Railway | 타입 기반 API 정의, 코드에서 나온 OpenAPI 스키마로 `packages/api` 클라이언트 생성, 트랜잭션과 `SELECT … FOR UPDATE`로 물량 차감(R-06) | [0007](./adr/0007-backend-fastapi.md) |
| 운영자 화면 | 관리 API(`/admin/...`) + Swagger UI, 전용 화면은 I2 | 승인·배송 완료·환불을 I1부터 화면 없이 처리, 모든 관리 API에서 `ADMIN` 역할 검사(N-06) | [0008](./adr/0008-operator-admin-api.md) |
| 인증 | I1: Mock 로그인(시드 테스트 계정 선택, 설정 플래그) → 서버가 JWT 발급(PyJWT). I2: 카카오 로그인(OAuth 인가 코드) | 데모를 외부 계정 없이 재현. 두 웹 앱과 API가 다른 도메인이어도 동작 | [0009](./adr/0009-mock-login.md), [0003](./adr/0003-auth-kakao.md) |
| DB | PostgreSQL(Railway). 로컬은 Docker Postgres | 백엔드와 같은 프로젝트 | 0007 |
| 파일 | Cloudflare R2 + boto3 | 송신 무료, S3 호환 | 0007 |
| 링크 미리보기 | 서버가(FastAPI + Jinja2 템플릿) 공유 주소 `/s/farms/<id>`에서 OG 태그 HTML을 주고 소비자 앱으로 이동 | 웹 출력 앱만으로는 카톡 미리보기를 만들기 어려움 | [0006](./adr/0006-share-link-og.md) |
| AI | Claude API, **Claude Haiku 4.5**(`claude-haiku-4-5`), 구조화 출력. 백엔드의 어댑터 한 곳에서만 호출 | 빠르고 저렴. 이후 자체 모델 서빙으로 바꿀 수 있게 어댑터로 감쌈 | [0004](./adr/0004-ai-claude-haiku-adapter.md) |
| AI 관측 | Langfuse Cloud(무료) | AI 입력·출력·근거 기록(M-08), 정확도 평가(N-08) | 0004 |
| 지표 | PostHog Cloud(무료), I1부터 | PRD 4장 지표, 개인정보 없이 | [0005](./adr/0005-analytics-posthog.md) |
| 에러 | Sentry(앱·서버, 무료) | | — |
| 결제 | I1 Mock. I2부터 PortOne(NHN KCP) | 주문·결제 모델은 PortOne 연동을 가정 | — |
| CI/CD | GitHub Actions: 서버 테스트·린트, 앱 타입체크 → Railway·Vercel 자동 배포 | | — |
| 패키지 | npm workspaces(앱), uv 또는 pip(서버) | 설정 최소 | — |

[0002](./adr/0002-backend-django-admin.md)(Django + DRF, Django Admin)는 [0007](./adr/0007-backend-fastapi.md)·[0008](./adr/0008-operator-admin-api.md)로 대체됐다.

## 3. 레포 구조

```
apps/
  consumer/        소비자 앱 (Expo Router, 웹 출력)
  producer/        생산자 앱 (Expo Router, 웹 출력)
packages/
  ui/              공통 컴포넌트·디자인 토큰 (N-02 크기 기준 포함)
  api/             API 클라이언트·타입
server/            FastAPI 서버
  app/
    main.py        앱 생성, 라우터 등록
    core/          설정, DB 세션, 인증·권한, 공통
    accounts/      사용자, 역할, Mock 로그인(I2 카카오), 생산자 신청·승인, 저장 배송지(ShippingAddress)
    farms/         홈, 농가, 팔로우, 검색, 공유 링크(OG)
    catalog/       상품, 중량 옵션, 단계·가격·물량, 상품 승인
    orders/        주문, Mock 결제, 취소·환불, 수확 시작·출하, 구매 확정, 주문 시점 배송지 사본
    messaging/     소식, 좋아요, 채팅, 질문함, 연락처 가림
    ai/            Claude 어댑터, 상품 초안, 문의 응답, 개인정보 제거(출하 문장 해석은 I2)
    analytics/     PostHog 서버 이벤트
  migrations/      Alembic 마이그레이션
docs/              스펙(docs/spec)·위키(docs/wiki)
```

도메인 모듈마다 `router.py`(API 경로), `models.py`(SQLAlchemy 모델), `schemas.py`(Pydantic 입출력), `service.py`(업무 로직)를 둔다.

코드 폴더마다 `spec.md`(구현 결정)와 `tasks.md`(작업 기록)를 둔다([docs/spec/README.md](../README.md) 두 층 스펙).

## 4. FEAT ↔ 코드 폴더

| FEAT | 소비자 앱 | 생산자 앱 | 서버 |
| --- | --- | --- | --- |
| FEAT-01 회원가입·로그인 | `apps/consumer` 로그인 | `apps/producer` 로그인·신청·대기 | `accounts` |
| FEAT-02 농가 프로필 | 농가 페이지 | 농가 탭 | `farms` |
| FEAT-03 AI 상품 초안 | — | 새 상품 | `catalog`, `ai` |
| FEAT-04 상품 편집·게시 요청 | — | 상품 편집 | `catalog` |
| FEAT-05 단계·가격·물량 | — | 단계 설정 | `catalog` |
| FEAT-06 농가 탐색·팔로우 | 홈·발견, 농가 목록·내 정보 | — | `farms`, `catalog` |
| FEAT-07 상품 상세 | 상품 상세 | — | `catalog` |
| FEAT-08 예약 주문 | 주문서·배송지 | — | `orders`, `accounts`(저장 배송지 `ShippingAddress`. 주문은 주문 시점 주소를 복사) |
| FEAT-09 Mock 결제 | 결제·완료 | — | `orders` |
| FEAT-10 주문 내역·상세 | 내 정보 > 주문 내역 | — | `orders` |
| FEAT-11 출하 전 취소 | 주문 상세 | — | `orders` |
| FEAT-12 소식·채팅 | 소식 탭, 채팅 탭·농가 채팅 | 소식 올리기 | `messaging`, `farms`(자동 팔로우) |
| FEAT-13 AI 응답·전달 | 농가 채팅 | 질문함 | `messaging`, `ai` |
| FEAT-14 생산자 현황 | — | 현황 | `orders`, `catalog` |
| FEAT-15 농가 소식·반응 | 농가 페이지 소식 탭, 소식 탭(좋아요) | — | `messaging` |
| FEAT-17 출하 처리 | (주문 상세에 송장 번호) | 출하 처리 | `orders`(I2 자연어는 `ai`) |
| FEAT-19 농가 링크 공유 | (도착: 농가 페이지) | 농가 탭 | `farms` |

## 5. 핵심 흐름

**Mock 로그인 (FEAT-01, ADR 0009) — I1**
1. 앱이 `GET /api/auth/test-accounts?app=consumer|producer`로 그 앱의 시드 테스트 계정 목록을 받아 보여준다(계정 분리, ADR 0010).
2. 사용자가 고르면 `POST /api/auth/test-login`(`userId`, `app`)으로 보낸다.
3. 서버는 설정 플래그(`MOCK_LOGIN_ENABLED`)가 켜져 있고 그 사용자가 시드 테스트 계정(`User.isTestAccount`)일 때만 JWT를 돌려준다. 새 계정은 만들지 않는다.
4. 소비자 API는 `CONSUMER`, 생산자 앱 API는 `PRODUCER` 역할과 농가 승인 상태를 서버에서 검사한다(N-06). 다른 앱 계정의 토큰은 403 `WRONG_APP`.

**카카오 로그인 (ADR 0003) — I2**
1. 앱이 카카오 인가 화면으로 보낸다(리다이렉트 주소는 각 앱의 `/auth/kakao`).
2. 앱이 받은 인가 코드를 `POST /api/auth/kakao`로 서버에 보낸다.
3. 서버가 카카오에서 토큰·사용자 정보(카카오 식별자, 이름)를 받아 사용자를 찾거나 만들고 JWT(액세스·리프레시)를 돌려준다.
4. 전환할 때 Mock 로그인 플래그를 끈다.

**공유 링크 (FEAT-19, ADR 0006)**
1. 생산자 앱이 복사하는 링크는 서버의 `/s/farms/<id>`다.
2. 이 주소는 FastAPI가 Jinja2 템플릿으로 농가 이름·소개·대표 사진을 OG 태그에 채운 HTML을 주고, 사람에게는 바로 소비자 앱 농가 페이지로 이동시킨다.
3. 승인 취소된 농가는 OG 없이 ‘찾을 수 없는 농가’로 보낸다.

**AI 호출 (FEAT-03·13, I2에 FEAT-17, ADR 0004)**
1. 모든 호출은 `server/app/ai`의 어댑터를 거친다. 다른 모듈은 모델 이름을 모른다.
2. 보내기 전에 연락처·주소·계좌를 지운다(M-18).
3. 출력은 정해진 JSON 형식으로만 받고, 형식이 틀리면 실패로 처리한다.
4. 시간 제한: 상품 초안 20초(N-04), 문의 응답은 넘기면 ‘농가에 전달’(N-04).
5. 입력·출력·근거·모델·지연 시간을 Langfuse에 남긴다.

**지표 (PRD 4장, ADR 0005)**
- 화면 이벤트는 앱에서, 결제·취소·구매 확정처럼 확정된 사실은 서버에서 보낸다.
- 이벤트에 이름·연락처·주소·메시지 본문을 넣지 않는다(N-05). 사용자 구분은 내부 ID만 쓴다.
- 이벤트 이름과 속성은 [트래킹 플랜](./README.md)을 따른다.

## 6. 이번에 정한 값

| 열린 질문 | 값 |
| --- | --- |
| FQ-05 첨부 개수·용량 | 생산자 소식: 사진 최대 5장(장당 10MB), 영상 1개(60초, 100MB). 소비자 채팅: 사진 최대 3장(장당 10MB). 서버에서 다시 검사 |
| FQ-08 AI 초안 문구 길이 | 최대 3,000자 |
| Q-19 AI 모델·비용·로그 | Claude Haiku 4.5, Langfuse. 월 비용 한도는 Claude Console에서 설정 |
| PQ-08 외부 AI 고지 | 처리방침에 ‘AI 응답·상품 초안을 위해 메시지 본문 등을 Anthropic(미국)의 Claude API로 보낸다. 연락처·주소는 보내지 않는다’를 고지. 국외 이전 고지 요건은 법률 검토 |

## 7. I2 이후

- 결제: PortOne(NHN KCP) 실결제.
- 앱: 같은 Expo 코드로 Android·iOS 빌드(EAS).
- AI: 비용·품질을 보고 자체 모델 서빙을 검토. 어댑터만 바꾼다.
- 알림(FEAT-18), 택배 조회(FEAT-22), 신고(FEAT-31).
- 로그인: 카카오(ADR 0003)로 바꾸고 Mock 로그인을 끈다(ADR 0009).
- AI: 자연어 출하 처리(FEAT-17), ‘틀렸어요’(M-17).

## 8. 열린 질문

- [ ] TQ-01. PostHog·Langfuse 리전(미국/EU)
- [ ] TQ-02. 도메인(I1은 Railway·Vercel 기본 도메인)

## 9. 변경 이력

| 날짜 | 버전 | 내용 |
| --- | --- | --- |
| 2026-10-07 | 0.1 | 9/30 추천안(docs/specs/i1/P19-tech-stack.md)을 현재 스펙에 맞게 다시 씀: 웹 출력 2개, 카카오 로그인, Django Admin, 공유 링크 OG, Claude Haiku 4.5, PostHog I1 |
| 2026-10-07 | 0.2 | 백엔드 Django → FastAPI, 운영자 처리 Django Admin → 관리 API + Swagger UI(ADR 0007·0008) |
| 2026-10-07 | 0.3 | P22(SWPP-26): 인증 I1 Mock 로그인(ADR 0009), 카카오는 I2. FEAT ↔ 코드 폴더표(홈, 소식·채팅, 반응, 출하 처리의 `ai`는 I2) |
