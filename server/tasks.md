# server tasks

이슈별 작업 기록. 새 작업은 맨 아래에 섹션을 추가하고, 머지 후에도 지우지 않는다.

## DEV-12 [I1] 구현 뼈대: apps·packages·server 폴더와 폴더별 spec.md

- 이슈: [DEV-12](https://linear.app/sswp6/issue/DEV-12) (GitHub #19)
- 브랜치: `nemodleo/dev-12-i1-구현-뼈대-appspackagesserver-폴더와-폴더별-specmd`
- 기능·인수 조건: 없음(뼈대). 모듈별 FEAT는 `app/<모듈>/spec.md`
- 상태: 사람 리뷰 대기

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
- 상태: 완료

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
- 10/08 현황의 답할 질문 수(`openQuestions`)는 채팅(Should, 1.2)이 들어오기 전까지 0 → 1.2 (1/2)에서 답변이 필요한 대화 수로 바꿈
- 10/08 운영자 토큰은 `python -m app.accounts.admin_token`으로 발급한다(시드 `u-admin`, 테스트 계정 아님). 관리 API는 Swagger UI에서 부른다(ADR 0008)
- 10/08 테스트는 같은 PostgreSQL의 `<DB>_test` DB에서 돈다. CI의 alembic 검사 DB와 섞이지 않게
- 10/08 PR #48은 이슈 #5를 닫지 않는다(`Refs #5`). DEV-4는 스펙 1.2~1.5 후속 PR(1.4 공급 물량·주문 처리 → 1.2 채팅 → 1.2 AI 설정·문의 → 1.5 상세·공개 소식방)까지 연다. 1.1의 publish-request·관리 승인·stage-presets·pendingReapproval은 1.4 PR에서 바꾼다
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
- [x] AI 1차 리뷰 → ready for review

### 완료 조건
- [x] 스펙 1.1의 Must API 23개 구현
- [x] API 문서(`/docs`) 공유
- [x] JWT_SECRET 비면 local 외 환경에서 시작 실패
- [x] 테스트 통과(CI server job)
- [x] 리뷰 후 main 머지

### 기록
- 10/08 spec 작성, 브랜치 생성
- 10/08 core·모델·시드·accounts·farms·catalog·orders·messaging 구현. pytest 65개(AC-09-1 동시 결제 포함), ruff, alembic upgrade·downgrade·check 통과
- 10/08 로컬 서버 스모크: 로그인·WRONG_APP 403·홈·상품 상세·주문·같은 키 결제 2번(1번만 반영)·현황·운영자 승인 확인
- 10/08 남은 일(후속 PR): 스펙 1.2~1.5 계약, Should API(주문 내역·취소·구매 확정·출하·소식 올리기·채팅 등), 공유 링크 OG(/s), 카카오(I2)
- 10/08 AI 1차 리뷰(PR #48 코멘트): must 없음. should 2건 반영(공개 API 토큰 오류는 비로그인 처리, AC-08-3 테스트), 2건은 기록(REJECTED 상태 표기, openQuestions 0)

## DEV-4 스펙 1.2 (1/2) — 소식방·1:1 채팅·AI 응답

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4) (GitHub #5, 이 PR은 닫지 않음)
- 브랜치: `zahra/dev-4-spec-1-2-messaging`
- 기능·인수 조건: FEAT-12(AC-12-1~8), FEAT-13(AC-13-1~4·6~8), FEAT-15(AC-15-2~6), M-01~09·14·16·19·20 / [contracts-1.2](../docs/spec/contracts-1.2.md) 1·4장
- 상태: 완료

### 목표
스펙 순서대로 1.2부터 서버에 반영한다. 이 PR은 소식방(방송 + 본인 비공개 답장), 소비자·생산자 1:1 채팅, AI 응답·전달·직접 응대(HUMAN/AUTO), 소식 올리기·좋아요를 만든다. 프론트(`packages/api`)가 이미 부르는 경로와 응답 모양을 따른다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- contracts-1.2 2·3장(판매 한도·중지·기간 가격): 문서가 스펙 1.4로 대체됐다고 적고 있어 1.4 PR에서 한다
- contracts-1.2 5·6장(AI 응답 설정 API, 주문 문제 문의, 비공개 사진 첨부): 1.2 (2/2) PR
- 1.1의 Should 중 주문 내역·취소·구매 확정·출하(orders): 1.4 PR
- 스펙 1.5의 공개 소식방 읽기·`canReply`: 1.5 PR
- `apps/**`, `packages/**`, `docs/spec/**`

### 결정 사항
- 10/08 1.2는 PR 두 개로 나눈다(채팅 / AI 설정·문의). 리뷰 크기 때문에
- 10/08 AI 응답은 근거 규칙(배송비·받는 시기·당도·FAQ) → 필수 전달 주제 → `ANTHROPIC_API_KEY`가 있으면 Claude가 근거 안에서만 답하거나 전달, 없거나 실패하면 전달. 농가 AI 설정 행이 없으면 기본값(켜짐)
- 10/08 소비자 메시지 전송은 대화 행을 잠그고(FOR UPDATE) 그 안에서 AI 답까지 저장한다. 생산자의 HUMAN 전환·답변과 직렬화되어 늦은 AI 답이 끼어들지 않는다(AC-13-6)
- 10/08 첨부(`attachmentIds`)는 1.2 (2/2)에서 연다. 이 PR에서는 빈 목록만 받고 그 밖은 404
- 10/08 연락처 가림 정규식을 `core/masking.py` 하나로 모았다. 기존 계좌 패턴이 날짜(2026-11-10)까지 가려 AI 답의 받는 시기가 '[연락처]'로 나왔다(테스트로 발견). 계좌는 하이픈 묶음 중 숫자 10자리 이상만
- 10/08 AI 답 저장 직전 농가 설정은 세션 캐시를 건너뛰고 다시 읽는다(`ai_settings(fresh=True)`). 설정 행이 이미 있을 때 바뀐 버전을 놓치지 않게
- 10/08 메시지 순서는 `ThreadMessage.seq`(일련번호). 질문과 AI 답이 같은 시각이어도 순서가 바뀌지 않게
- 10/08 시드: 1:1 대화 5개·전달 질문 3개(Mock), 소식방 답장 2개(김민지·이서준, 서로 안 보이는지 확인용). 이서준·박지윤의 강씨네 팔로우를 넣었다(follower_count 표시 값은 그대로)
- 10/08 상품이 둘 이상인 농가에서 상품을 특정하지 않은 질문은 전달한다(Mock과 같음). 주문 문맥(`orderId`)이 있으면 그 주문의 상품으로 답한다

### 작업
- [x] 모델·마이그레이션 0002(Thread, ThreadMessage, Escalation, RoomReply, FarmAiSettings, Broadcast.videos)
- [x] 소식방 목록·메시지·전송, 팔로우 농가 소식, 소식 올리기, 좋아요
- [x] 소비자 채팅 목록·시작·메시지·전송·읽음
- [x] 생산자 채팅 목록·시작·메시지·답변·읽음·AI 모드, 질문함·답변(1.1 계약 유지)
- [x] AI 응답 엔진(ai 모듈), 현황의 답할 질문 수
- [x] 시드(대화·전달 질문·소식방 답장), 테스트(AC ID)

### 완료 조건
- [x] 소비자 A의 답장·질문이 B의 목록·요약·cursor·API에 나오지 않음(AC-12-1·6)
- [x] HUMAN/OFF에서 AI 답 없음, 왕복 전환 뒤 늦은 답 저장 안 함(AC-13-6·7)
- [x] 테스트·ruff·alembic check, CI 통과
- [x] 리뷰 후 main 머지

### 기록
- 10/08 브랜치·spec 작성
- 10/08 모델·마이그레이션 0002, AI 응답 엔진, 소식방·1:1·좋아요·소식 올리기, 시드. pytest 98개, alembic upgrade·downgrade·check 통과
- 10/08 로컬 서버 스모크: 소식방 답장 격리, AI 전달, 생산자 답변 필요 목록, 현황 답할 질문 3

## DEV-4 스펙 1.2 (2/2) — AI 응답 설정·주문 문제 문의·비공개 사진

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4) (GitHub #5, 이 PR은 닫지 않음)
- 브랜치: `zahra/dev-4-spec-1-2-settings-inquiries`
- 기능·인수 조건: FEAT-32(AC-32-1~4), FEAT-33(AC-33-1~4), FEAT-10(AC-10-4), M-20·M-21, R-15 / [contracts-1.2](../docs/spec/contracts-1.2.md) 5·6장
- 상태: 완료

### 목표
1.2 (1/2)에 이어 농가 AI 응답 설정(저장·미리보기), 결제 주문의 문제 문의, 비공개 사진 첨부를 서버에 만든다. 1:1 채팅의 첨부·문의 예외(팔로우 해제 후 본인 결제 주문 문의)를 연다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- 스펙 1.4(공급 물량·판매 설정·주문 처리), 1.5(상세·공개 소식방)
- Cloudflare R2 업로드(I1은 DB에 저장, 아래 결정), 환불·교환 심사

### 결정 사항
- 10/08 비공개 사진은 I1에서 `private_attachments` 테이블에 바이트로 저장한다(공개 소식 미디어와 분리). R2 연동은 배포(DEV-8) 때 저장소만 바꾼다
- 10/08 업로드는 multipart(`file`, `orderId` 또는 `threadId`) — 프론트 `uploadAttachment`와 같다. JPEG·PNG·WebP, 10MB, 서버가 실제 형식을 확인하고 EXIF·메타데이터를 지운다(Mock과 같은 방식). `python-multipart` 추가
- 10/08 AI 설정은 저장할 때마다 이력(`farm_ai_settings_history`)을 남긴다
- 10/08 미리보기는 DB에 쓰지 않는다. `settings`를 보내면 저장 전 값으로, 없으면 저장된 설정으로 답하고 `settingsVersion`은 저장된 설정일 때만 준다. 정책을 바꾸려는 FAQ·원칙 문구(환불·보상·무조건 등)는 근거로 쓰지 않는다(AC-32-2)
- 10/08 문의 접수는 그 농가 1:1 대화에 주문 문맥 메시지로 넣고 대화를 HUMAN으로 바꾼다. 열린 문의가 있으면 생산자 '답변 필요'에 나온다. 해결·재열기는 문의 상태만 바꾸고 주문·환불은 그대로(AC-33-3)
- 10/08 팔로우를 해제한 소비자도 그 농가의 본인 결제 주문(`orderId`)으로는 문의·대화할 수 있다. 주문 없는 전송은 403(AC-33-2)
- 10/08 사진은 업로드한 사람만 묶을 수 있고, 한 번 묶이면 다시 못 쓴다. 묶인 사진은 그 대화의 소비자·농가만 읽는다(그 밖은 404)
- 10/08 시드는 바꾸지 않았다. 문의는 테스트에서 만든다

### 작업
- [x] 모델·마이그레이션 0003(PrivateAttachment, OrderInquiry, FarmAiSettingsHistory)
- [x] AI 설정 조회·저장(버전)·미리보기
- [x] 비공개 사진 업로드·조회, 채팅 전송에 첨부 연결
- [x] 주문 문제 문의 접수·조회, 생산자 해결·재열기, 대화 페이지의 inquiries, 답변 필요·팔로우 예외
- [x] 테스트(AC ID), 시드

### 완료 조건
- [x] AC-32-1~4, AC-33-1~4 테스트
- [x] 테스트·ruff·alembic check, CI 통과
- [x] 리뷰 후 main 머지

### 기록
- 10/08 브랜치·spec 작성
- 10/08 모델·마이그레이션 0003, AI 설정 API, 비공개 사진, 주문 문제 문의. pytest 115개(새 테스트 17개), ruff, alembic upgrade·downgrade·check 통과

## DEV-4 스펙 1.4 — 상품별 공급 물량 승인·판매 설정·주문 처리

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4) (GitHub #5, 이 PR은 닫지 않음)
- 브랜치: `zahra/dev-4-spec-1-4-capacity-orders`
- 기능·인수 조건: AC-04-8·9, AC-05-6, AC-09-6, AC-10-6, FEAT-10·11·17 / [capacity-1.4](../docs/spec/capacity-1.4.md)
- 상태: 완료

### 목표
1.1의 게시 요청·운영자 상품 승인·재승인(`pendingReapproval`)을 상품별 공급 물량 신청(g)과 판매 설정으로 바꾸고, 중량 집계(예약·출하·잔여)와 주문 처리(내역·취소·구매 확정·받는 시기 응답·생산자 주문·수확 시작·출하)를 서버에 만든다. 프론트 `packages/api`(endpoints.ts·types.ts)와 Mock(`capacity.ts`·`sales.ts`·`orders.ts`)을 따른다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- 스펙 1.5(상세 콘텐츠·공개 소식방), 승인 한도 감액·농가 전체 공유 물량(capacity-1.4 1장)
- `apps/**`, `packages/**`, `docs/spec/**`

### 결정 사항
- 10/08 시드 상품 승인량은 Mock과 같은 명시적 전환표(p-house 2,400kg 등)를 쓴다. 박스 한도에서 자동 추정하지 않는다(capacity-1.4 6장)
- 10/08 마이그레이션은 기존 주문의 옵션 중량을 정확히 찾지 못하면 중단하고, 결제된 미반환 주문으로 단계 예약량을 다시 계산한다
- 10/08 결제는 상품 행 다음 단계·옵션 물량 행 순서로 잠그며, 취소·미공급 반환은 `releasedQuantity`로 한 번만 반영한다
- 10/08 받는 시기 변경은 기존 결제 주문의 스냅샷을 유지하고 RESERVED/PREPARING 주문에 제안 기간으로 기록한다

### 작업
- [x] 모델·마이그레이션 0004: Product(approvedSupplyGrams·salesLimitGrams·salesPaused·version, pending_reapproval 삭제), CapacityRequest, Order(unitWeightGrams·releasedQuantity)
- [x] 공급 신청·이력·철회, 운영자 승인·반려(구형 publish-request·admin approve 삭제)
- [x] 판매 설정, PATCH·stages version·PERIOD_LOCKED, 중량 집계·availability, 내 상품 목록
- [x] 결제 때 중량·기간 물량 확보(TOTAL_LIMIT_REACHED·SALES_PAUSED·STAGE_CHANGED)
- [x] 주문 내역·취소·구매 확정·받는 시기 응답, 생산자 주문·수확 시작·출하(반환·출하 집계)
- [x] 시드 전환, 테스트(AC ID), 기존 1.1 승인 테스트 교체

### 완료 조건
- [x] AC-04-8·9, AC-05-6, AC-09-6, AC-10-6 테스트
- [x] 테스트·ruff·alembic check, CI 통과
- [x] 리뷰 후 main 머지

### 기록
- 10/08 브랜치·spec 작성. capacity-1.4, packages/api 계약·Mock, 현재 catalog·orders 서비스 확인 완료(구현 전)
- 10/08 draft PR #51 생성(`Refs #5`). 모델·0004, 공급 승인, 판매 설정·버전, 중량 결제, 주문 처리, 시드 전환 구현
- 10/08 AI 1차 리뷰에서 생산자 상품 정렬·현재 단계 라벨, 소비자 주문 정렬 동률, 마이그레이션 중량 반올림 위험을 발견해 수정
- 10/08 AI 재검토에서 catalog의 orders 모델 직접 조회를 발견해 orders service 경계 뒤로 이동
- 10/08 `ruff check .`, pytest 120개, alembic 0004 upgrade → 0003 downgrade → head upgrade, `alembic check` 통과
- 10/08 PR #51에 AI 1차 리뷰를 남기고 모든 must/should를 해결. GitHub Actions server/apps 통과, draft 해제·사람 리뷰 대기

## DEV-4 스펙 1.5 — 농가·상품 상세와 공개 소식방

- 이슈: [DEV-4](https://linear.app/sswp6/issue/DEV-4) (GitHub #5, 이 PR에서 닫음)
- 브랜치: `zahra/dev-4-spec-1-5-storefront`
- 기능·인수 조건: AC-02-4, AC-03-4, AC-07-5, AC-12-10, AC-15-6 / [storefront-1.5](../docs/spec/storefront-1.5.md)
- 상태: 리뷰 중

### 목표
농가·상품의 긴 상세 콘텐츠를 생성·검증·저장하고 공개 응답에 제공한다. 승인 농가의 공개 소식방은 비로그인·미팔로우도 읽되, 팔로워·소유 생산자의 기존 비공개 범위와 답장 권한은 유지한다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`, `docs/spec/**`
- 이미지 생성 AI, 미디어 업로드 저장소 변경, 화면 내비게이션·캐시 처리

### 결정 사항
- 10/09 기존 레코드의 fallback을 보존하도록 농가·상품 `detail_content`는 nullable JSON으로 추가하고, 빈 `blocks` 저장은 명시적 상세 제거로 구분한다
- 10/09 상세 블록 검증은 공유 서버 스키마 한 곳에서 수행한다. 서버 저장 URI는 HTTPS 또는 서비스 상대 경로만 허용하고 Mock 전용 localhost/data URI는 허용하지 않는다
- 10/09 상세 초안은 `app/ai` 어댑터만 호출한다. AI 키가 없으면 입력·등록 정보만 조합한 `mode=mock` 초안을 반환하고, 생성 자체는 DB에 저장하지 않는다
- 10/09 공개 소식방은 optional user로 권한 필터를 먼저 적용한 뒤 요약·cursor를 계산한다. 공개 읽기는 팔로우를 만들지 않는다
- 10/09 Mock schema 7 시드에는 저장된 상세가 없으므로 서버 시드도 기존 intro/description fallback을 유지한다. 저장 예시는 AC 테스트에서 만든다

### 작업
- [x] 모델·마이그레이션 0005: Farm/Product detailContent nullable JSON
- [x] DetailContent 검증, 농가·상품 응답·저장
- [x] 농가·상품 detail-draft API와 AI 어댑터
- [x] 비로그인·미팔로우 공개 소식방 읽기와 canReply
- [x] 시드 fallback 유지와 AC 기반 테스트

### 완료 조건
- [x] AC-02-4, AC-03-4, AC-07-5, AC-12-10, AC-15-6 서버 테스트
- [x] 기존 intro/description fallback과 빈 blocks 저장 구분
- [x] 테스트·ruff·alembic upgrade/downgrade/check (로컬 통과, CI 대기)
- [ ] AI 1차 리뷰 후 사람 리뷰·main 머지

### 기록
- 10/09 PR #51 머지 후 main 갱신. storefront-1.5, 관련 FEAT·규칙, packages/api 타입·endpoints·Mock, 현재 farms/catalog/messaging/ai 코드 확인
- 10/09 nullable 상세 저장·공통 검증·mock/AI 초안, 농가/상품 조회·수정, 공개 소식방 권한 필터·canReply 구현. Ruff, pytest 128개, alembic 0005 upgrade → 0004 downgrade → head upgrade, `alembic check` 통과
- 10/09 AI 1차 diff 점검에서 snake_case null의 500 가능성, `3만원` 가격 필터 누락, 미승인 생산자 소식방 테스트 누락을 찾아 수정
- 10/09 PR #52에 AI 1차 리뷰(지적 없음)를 남기고 draft 해제. `origin/main` 대비 0 behind, 사람 리뷰·CI 대기

## DEV-7 Bug #54 — 생산자 신청 상태 API 누락

- 이슈: [DEV-7](https://linear.app/sswp6/issue/DEV-7) (GitHub [#54](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/54), 관련 #8)
- 브랜치: `zahra/dev-7-bug-54-producer-application-status`
- 기능·인수 조건: FEAT-01 / AC-01-3·7 / SCR-20·21
- 상태: 진행 중

### 목표
실제 서버에 빠진 생산자 가입 신청 조회·제출 API를 프론트·Mock 계약과 맞춰, 승인 대기·반려 생산자가 신청 내용과 반려 사유를 보고 다시 신청할 수 있게 한다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`, `docs/spec/**`
- 생산자 승인·반려 관리 API, 계정 관문 화면, 데이터베이스 스키마·시드 변경

### 결정 사항
- 10/09 `Farm`의 기존 신청 필드와 `User.name`을 사용해 Mock의 `ProducerApplication` 응답 계약을 그대로 구현한다. 새 모델·마이그레이션은 만들지 않는다
- 10/09 `GET` 누락과 같은 원인으로 빠진 `POST`도 함께 복구한다. 반려 농가는 기존 farm ID를 유지해 다시 신청하고, 그 밖의 기존 농가 상태는 `INVALID_TRANSITION`으로 거부한다
- 10/09 첫 신청 행이 아직 없을 때의 동시 제출도 직렬화하도록 생산자 `User` 행을 먼저 잠근 뒤 농가 상태를 확인·저장한다

### 작업
- [x] 생산자 신청 입력·응답 스키마 추가
- [x] 신청 조회·신규 신청·반려 후 재신청 서비스와 라우트 추가
- [x] 권한·검증·상태 전이 회귀 테스트 추가

### 완료 조건
- [x] 오미숙(PENDING)·박순자(REJECTED)의 신청 내용 조회와 반려 사유 표시 계약이 맞음
- [x] 신규 생산자 신청과 반려 후 재신청이 되고 잘못된 역할·상태는 거부됨
- [ ] 관련 pytest·ruff와 DEV-6 실제 서버 재검증 통과
- [ ] AI 1차 리뷰 후 사람 리뷰·main 머지

### 기록
- 10/09 DEV-6 실제 서버 브라우저 테스트에서 `GET /api/auth/producer-application` 404를 재현. 서버 spec·화면 명세·packages/api·Mock에는 GET·POST 계약이 있으나 FastAPI 라우터와 서비스에 구현이 없음을 확인
- 10/09 GET·POST와 신규 신청·반려 재신청을 구현. POST 직후와 GET의 같은 시각이 서로 다른 오프셋으로 직렬화되는 문제를 테스트에서 발견해, commit 후 다시 읽어 UTC 응답을 일관되게 반환하도록 수정
- 10/09 accounts 집중 테스트 17개, 전체 pytest 133개, Ruff, Alembic upgrade·check 통과. DEV-6 실제 앱 전체 재검증은 이 PR 머지 후 진행
