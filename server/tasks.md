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
- 상태: 리뷰 중

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
- 10/09 AI 1차 diff 점검에서 첫 신청 동시 제출 시 농가 행이 아직 없어 잠금이 되지 않는 경쟁 조건을 발견. 생산자 계정 행을 먼저 잠그도록 수정하고 Ruff·전체 pytest 133개 재통과

## DEV-54 기존 자료 일괄 분석 백엔드

- 이슈: https://linear.app/sswp6/issue/DEV-54 · GitHub #103
- 브랜치: jinumeral/dev-54-dev-implement-grounded-bulk-source-analysis-backend
- 관련: FEAT-03/04/07, M-10~13/M-18, AC-SRC-1~8
- 상태: 구현·로컬 검증 완료, PR #104 검토 중. 기존 리뷰 중 작업은 main에 있는 구현을 기준으로 보존한다.
- 목표: 비공개 자료 등록 → 분석 → 근거 검토 → 상품별 상세 초안 저장.
- 수정 허용 경로: server/**, docs/spec/source-analysis.md, docs/spec/README.md, docs/spec/functional/FEAT-03-ai-product-draft.md, docs/spec/functional/FEAT-04-product-edit.md, docs/spec/functional/FEAT-07-product-detail.md, docs/spec/ia.md, docs/spec/screens.md, docs/spec/tech-design/adr/**, docs/wiki/Source-Analysis.md.
- 비범위: 앱 UI·공개 상품 변경·이미지 생성·배포·머지. 사용자가 제외한 내부 백엔드 계획 문서는 커밋하지 않는다.
- 결정: 2026-10-14 Mock으로 검증하고 Sol은 별도 어댑터로 구현. 사용자 키·실제 자료 전송 없이 테스트한다. 작업 시간은 실제 UTC 시계를 사용해 데모 FIXED_NOW와 분리한다.
- [x] 자료 저장·전처리·개인정보 검토
- [x] 영속 큐·재시도·취소·근거 검증
- [x] 검토·18개 모듈 비공개 초안
- [x] Sol 어댑터·Mock·테스트·명세 동기화
- 기록: 사용자 구현 지시로 DEV-54를 시작. Linear MCP는 읽기 전용이므로 상태 변경 불가. Agent 시간/Tokens 미측정.

- 결정 사항: OCR은 별도 프로세스와 명시적 모델 설치를 사용하고, 모든 실제 전송은 가림 검토 후 진행한다. 원본 사진·수동 문구는 생산자가 확인하며 공개 Product에 쓰지 않는다. 삭제 정리는 tombstone 반영 후 파일을 제거한다.
- 검증: PostgreSQL 16에서 pytest 151개 통과, Ruff 통과. Alembic 0006 upgrade/downgrade/re-upgrade/check 통과. 고정 모델 파일로 한국어 OCR 샘플 판독 확인. 실제 Sol·R2 연결 및 실제 농가 20묶음 평가는 미실행.
- 기록: 로컬 Windows 자원 부족 오류와 테스트 DB 시간대 차이를 분리한 후 전체 테스트를 재실행했다. 자동 리뷰에서 삭제 플래그 flush 누락을 수정했다. 키·원본 자료·내부 구현 계획은 커밋에서 제외한다.

## DEV-30 [I2-T12] 운영자 승인·권한·예외 처리 핵심 API

- 이슈: [DEV-30](https://linear.app/sswp6/issue/DEV-30) (GitHub [#75](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/75))
- 브랜치: `zahra/dev-30-i2-main-manager-approvals-permissions`
- 기능·인수 조건: M01~M03 / FEAT-01 AC-01-3, FEAT-04 AC-04-8, FEAT-11 AC-11-3, FEAT-17 AC-17-4
- 상태: 머지

### 목표
운영자가 생산자 신청을 승인·반려하고, 기존 공급 물량 승인 권한을 유지하며, 배송 완료와 전액 환불을 관리 API로 안전하게 처리한다.

### 범위 (수정 허용 경로)
- `server/**`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`, `docs/spec/**`, `docs/wiki/**`
- 전용 운영자 화면, 부분 환불, 환불 이력 모델, 실패한 운영자 작업의 조회·재시도

### 결정 사항
- 10/13 DEV-30은 M01~M03의 핵심 상태 전이만 구현한다. 부분 환불 금액·이력, 상세 반려 사유 표시·이력, 예외 목록·진단, 실패 작업 조회·복구는 DEV-35가 맡는다.
- 10/13 생산자 승인·반려는 PENDING 신청만 처리하고, 반려에는 비어 있지 않은 기본 사유를 저장한다.
- 10/13 운영자 전액 환불은 출하 전 물량만 한 번 복원하고, 출하·배송 완료 뒤 환불은 승인 판매 물량을 복원하지 않는다.

### 작업
- [x] 생산자 승인·반려 관리 API와 ADMIN 권한 검사
- [x] 기존 공급 물량 승인·반려 권한 회귀 확인
- [x] 배송 완료·전액 환불 관리 API와 상태 전이
- [x] M01~M03 인수 조건·권한·실패 회귀 테스트

### 완료 조건
- [x] 운영자 API PR #96 생성
- [x] 스펙과 코드의 핵심 M01~M03 동작 일치 확인
- [x] DEV-35 위임 범위를 PR 본문과 완료 기록에 명시
- [x] 관련 pytest·전체 pytest·ruff 통과
- [x] AI 1차 리뷰 후 main 머지 (사람 승인 없이 작성자 결정으로 머지, 기록 참고)

### 기록
- 10/13 DEV-30을 In Progress로 시작. T04는 구현 차단 조건으로 적용하지 않으며, DEV-35 위임 범위를 먼저 확정했다.
- 10/13 생산자 PENDING 신청 승인·기본 사유 반려, SHIPPED 주문 배송 완료, 출하 전 물량을 한 번만 복원하는 전액 환불과 출하 후 물량 유지 환불을 구현했다. 기존 공급 물량 승인·반려는 경로와 버전 검사를 변경하지 않고 회귀 테스트로 확인했다. 데이터베이스 마이그레이션은 필요하지 않다.
- 10/13 `tests/test_admin.py` 집중 테스트 8개, 전체 pytest 141개, `ruff check .` 통과. `origin/main...HEAD` 대비 수정 범위는 `server/**` 안이다.
- 10/13 DEV-35에 부분 환불 금액·환불 이력 저장, 기본 저장 사유를 넘는 상세 반려 사유 표시·이력, 운영자 예외 목록·진단, 실패 작업 표시·재시도·복구, 내부 테스트에서 발견되는 M01~M03 핵심 전이 밖의 추가 운영자 흐름을 명시적으로 위임한다. 전용 운영자 UI는 별도 배정 없이는 두 백엔드 작업 모두의 범위 밖이다.
- 10/13 AI 1차 리뷰에서 지적 없음. PR #96 본문에 DEV-35 위임과 검증 결과를 갱신하고 사람 리뷰 요청 상태로 전환했다.
- 10/16 `origin/main`(DEV-40·SWPP-89)을 병합하고 Ruff·전체 pytest 141개 재통과. 리뷰어 미지정 상태로 3일 대기해 DEV-35 착수를 위해 작성자가 직접 squash merge하기로 결정했다. 사후 리뷰를 요청한다.

## DEV-38 농가 공유 링크 실제 진입
- 목표: FEAT-19 AC-19-1/2/3의 서버 공유 페이지를 구현한다.
- 범위: `app/farms/router.py`, `app/farms/share.py`, `app/farms/templates/farm-share.html`, `app/farms/spec.md`, `app/main.py`, `tests/test_farms.py`, `tests/test_farm_share.py`, `tasks.md`.
- 결정: 기존 상대 shareUrl 계약을 서버 라우터에서 절대 URL로 완성한다. 승인 농가의 공개 필드만 OG에 쓰며 비승인/없는 농가는 동일 404 안내다. 사람은 소비자 농가 화면으로 이동하고 공유 크롤러는 정적 OG 태그를 읽는다. 자동 이스케이프, HTTP(S) 이미지만, no-store를 적용한다.
- 작업: [x] 공유 HTML·절대 URL [x] 권한·메타데이터·이스케이프 테스트 [x] 프런트 링크 실제 진입
- 기록: 10/16 DEV-29/38 브라우저 회귀 검사에서 발견. 사용자 요청한 생산자 공유 기능 범위이며 운영자·AI 구현은 제외.

- 검증: 전체 pytest 162개·Ruff 및 실서버 API 7개/Chromium 19개 통과. 공유 링크 메타데이터·승인 취소·HTML 이스케이프와 비로그인 실제 진입 확인.


## DEV-56 / DEV-57 / DEV-58 자료 기반 상세 생성 통합

- 상태: 진행 중. 사용자 2026-10-16 구현 승인. FEAT-03/04, AC-SRC-1~8.
- 브랜치: jinumeral/dev-56-dev-build-producer-source-upload-evidence-review-and-private
- 목표: 업로드→가림→근거 검토→18개 모듈 초안→명시적 상품 적용, Gemini 연결 및 가상 자료 검증.
- 범위: apps/producer/src/**, apps/consumer/src/app/**/products/**, packages/api/src/**, packages/ui/src/**, server/app/{source_analysis,ai,core,catalog}/**, server/app/main.py, packages/ui/assets/source/**, server/migrations/**, server/tests/**, server/.env.example, scripts/**, docs/spec/**, docs/wiki/**, docs/design/sales-templates/** 및 해당 폴더 spec/tasks.
- 비범위: AI CS/채팅·로그인·결제·배포. 기존 사용자 worktree 수정 금지.
- 결정: OpenRouter google/gemini-3.1-flash-lite, OCR 기본/선택 페이지 시각 분석. 고가 모델/OpenAI fallback 비활성. 평가 $1/누적 $5 영속 예약·정산. 기존 detailContent 유지, 별도 moduleDetail 및 상품 version으로 적용. 공개 사진 독립 저장.
- [x] DEV-56 업로드·개인정보·근거·재진입 UI 및 계약
- [x] DEV-57 공통 렌더러·사진 공개 복사·버전/멱등 적용
- [ ] DEV-58 제공자·예산·가상20세트·평가 및 회귀
- 완료 조건: 중요 사실/출처/개인정보 오류0, 명확한 필드95%, 테스트·타입·빌드·브라우저 통과. 실호출 미실행은 구분 기록.
- 기록: 신규 이슈 DEV-56→57→58 생성. 기존 DEV-51/53/54 정정, DEV-52 최신 단일 템플릿 진행 중.

- 범위 보충: 공통 렌더러가 사용하는 packages/ui/assets/source/** (기존 로컬 원본 일러스트와 출처 기록).

- 2026-10-16 구현/검증: 서버 전체173개 + 추가 회귀2개(신규 파일13개 통과), Ruff, 타입4개, mock12개, 실제 API7개, Chromium22개, 두 앱 웹 빌드 통과. 신규 UI는 360/390/430px에서 저장·재진입·미저장 이탈 확인·적용을 검증했다.
- 실제 Gemini 텍스트16세트 정확일치 precision/recall 1.0, 중요 오류0. 동일 고정 사례로 프롬프트를 개선한 결과이며 홀드아웃 성능이 아니다. 이미지19 추출 보류/PDF20 근거 거부로 시각 품질은 미완료; DEV-58 및 배포를 완료 처리하지 않는다. docs/spec/validation/source-integration-2026-10-16.json 참고.
- 커밋 전 수정: 독립 워커 모델 등록, CRLF 정규화, kg→개수 오분류 차단, 가림 이미지 전환/선택 표시, 미저장 편집 이탈 확인, CI 신규 E2E 활성화. 기존 디자인 worktree는 보존했고 복사본의 미커밋 v1 호환 분기만 제거했다.

### DEV-58 시각 자료 실패 수정 및 실제 자료 평가 (2026-10-16)
- 사용자 승인: 회전 이미지/PDF 실패 수정, 공개 직거래 자료 12건(이미지6/PDF3/텍스트3, 4판매처 이상), 독립 홀드아웃4건, 원본/근거/상세화면 비교. 배포·AI CS 제외.
- 범위: 위 통합 범위 내 preprocess/worker/service/models/AI adapter/evaluation, migration, 회귀 테스트, 검증 도구, 한국어 스펙·영문 Wiki. 수집 원문과 진단은 gitignored .artifacts에만 보관.
- 결정: OCR 방향 탐색·타일 분할, PDF 좌표 기반 가림·중복 제거, 전처리 버전 변경 시 source revision 갱신·가림 재승인. 근거 검증은 완화하지 않는다. 응답/오류 진단은 로컬 평가에서만 기록한다.
- 결정: 이미지/PDF 기대값을 명시하고 실패·빈 결과도 recall 분모에 포함한다. 형식별95%/중요오류0, 모호한 자료 검토필요 분리. 기존 $1 평가/$5 누적 원장과 Gemini 모델 유지.
- [x] OCR/PDF 처리 실패 재현 및 수정 (정확도 게이트는 미달)
- [x] 버전 무효화/가림/엄격한 근거 회귀
- [x] 공개자료12건 출처·정답 고정 및4건 최초 홀드아웃 평가 (재평가와 구분)
- [x] 실제3건 저장/적용 및 모바일 렌더 검토
- [x] 전체 테스트·커밋 스캔·스펙/Wiki 결과 갱신 (Linear/PR에도 반영)

- 10/16 실제 Paddle CPU 모델 RSS 약915MB, 잘못 회전된 긴 행 인식 시1.4GB 관측. 감지 박스로 방향 후보를 먼저 제한하고 인식 batch1/960px 타일을 사용한다. 프로세스 상한은 모델 작업 여유를 포함한2048MB로 명시하며120초 제한은 유지한다.
- 10/16 실제 PDF 실패 응답을 보존해 원인을 확인했다: 여러 span의 줄바꿈을 모델이 공백으로 반환한다. 동일 span 문자열의 공백 배치만 다른 경우 원문 위치로 quote를 복원한다(문자/숫자/구두점 변경은 계속 거절). 농장 소개/생산품목 라벨의 필드 매핑도 명시한다. 평가 정답은 수정하지 않는다.
- 10/16 사용자 OCR 엔진 교체 승인. Tesseract 비교는 한국어 오인식이 많아 채택하지 않는다. RapidOCR3.10.0/ONNX Runtime1.31.0 + PP-OCRv5 한국어 모델을 채택: 동일 보관 패널1.3초/RSS291MB(Paddle2GB 초과). 기존 Paddle 런타임을 교체하고 오프라인 모델 SHA 검증/네트워크 자동 다운로드 금지/1024MB·120초 상한을 유지한다. 범위에 server/pyproject.toml, server/uv.lock, server/README.md를 추가한다.

- 10/16 RapidOCR 실제 전처리 통과 후 타일 경계의 중복 문장을 발견했다. 가로 분할 대신 전체 너비의 세로 스트립(높이960/겹침128)을 인식하고, 동일 위치의 중복은 판독 면적·신뢰도로 하나만 남긴다. 최대 너비2800까지 보존한다.

- 최종 결과: RapidOCR 교체 후 실제12건 전처리/추출 성공. 텍스트100%/100%, 이미지18.75%/14.29%, PDF42.86%/37.5% precision/recall로 **시각 품질95% 기준은 미달**. 원문 정답은 수정하지 않았고 실패/빈 결과를 분모에서 제외하지 않는다. 최초 홀드아웃4건과 재평가 결과를 별도 보존한다.
- 합성 최종18실호출+2계약: 텍스트16건/PDF 정확일치 통과, 회전 이미지 문구 변형으로 실패(별도 수량 미확인 문장을 합침). 이전 통과 회차를 최종값으로 바꾸지 않는다. 프롬프트 조정 중 누락을 확인한 조건문 보존 예시를 추가했다.
- 최종 엔진 실제3건(ssarijai 텍스트/farm-citrus 이미지/farm-jun PDF)의 가림 승인→실호출→근거 확인→초안 저장→로컬 상품 적용→재조회 통과. 현재 ModuleStory로390px 렌더 확인, 가로 넘침/콘솔 오류 없음. 로컬 비교화면 `.artifacts/source-quality/real.html`, 원문·정답·응답은 ignored 비공개 파일이다.
- 검증: 전체 pytest190개, 추가 최종 집중15개, Ruff/uv lock 검사 통과. 0008 downgrade/upgrade/check 통과. 네트워크 차단 OCR 실측 최대596.8MB. 단위 테스트와 처리 성공은 생성 품질 통과를 뜻하지 않는다.
- 커밋 스캔: 중복 OCR 설치 진입점을 제거하고 기존 provision_ocr/manifest를 교체했다. 사용하지 않는 OCR confidence fallback을 제거하고 설치 안내를 동기화했다. 미커밋 중간 모델/호환 분기 없음. nullable 전처리 버전은 실제 커밋된 Asset 데이터(4d7eece)를 무효화하기 위해 필요하다.
- 남은 일: 작은 한국어 글자 오인식·필드 누락/분류·문구 변동을 개선한 뒤 새로운 독립 자료에서 검증하고 실제 농가 인수를 진행한다. DEV-58 In Progress 유지, 배포/머지 없음. Agent 시간/Tokens 미측정.

- 10/17 사용자 PR #57 머지 금지 재확인. GitHub #57 CLOSED/mergedAt=null, DEV-57 포함 #113 OPEN Draft/mergedAt=null. 현재 브랜치 커밋/push 및 검증 기록만 반영한다. 원장153건, 정산$0.096049/미정산 예약$0.191654 보존.

## DEV-31 Core AI draft, grounded answer, and producer escalation

- 이슈: [DEV-31](https://linear.app/sswp6/issue/DEV-31) (GitHub [#76](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/76), source T13)
- 브랜치: `zahra/dev-31-core-ai-draft-grounded-answer-handoff`
- 기능·인수 조건: FEAT-03 / AC-03-1~3 / P02, FEAT-13 / AC-13-1~4·6~8 / C06, M-05~M-12·M-15·M-18·M-20·M-21, N-04·N-08 / [contracts-1.2](../docs/spec/contracts-1.2.md) 5장
- 상태: 머지 (예상 8시간, T01·T04는 로컬 Mock 구현을 막지 않음)

### 목표
상품 초안은 생산자 원문에서 확인되는 값만 채우고, AI 채팅 답변은 실제로 전달한 근거와 검증 가능한 사실만 사용하게 한다. 실패·위험 질문은 생산자에게 원자적으로 전달하고, 환불·보상 요청은 저장 성공 뒤 개인정보 없는 운영 로그를 한 번만 남긴다.

### 범위 (수정 허용 경로)
- `server/**`
- `packages/api/src/mock/**`
- `scripts/test-spec12.mjs`
- `docs/spec/functional/FEAT-03-ai-product-draft.md`, `docs/spec/functional/FEAT-13-ai-reply.md`, `docs/spec/functional/rules.md`, `docs/spec/contracts-1.2.md`
- `docs/wiki/Testing-Documentation.md`

### 비범위 (건드리지 않음)
- Langfuse 연동과 새 의존성, `틀렸어요`, 자연어 출하, 환불·보상 결정·지속 저장·운영자 예외 UI
- DEV-35가 맡는 운영자 예외 목록·진단·실패 가시성·재시도·복구
- 데이터베이스 마이그레이션과 공개 API 응답 형식 변경

### 결정 사항
- 10/13 PR #98(`jangjinuite`)은 서버·Mock 구현을 막지 않는다. 현재 `main`에서 즉시 구현하고, #98 머지 뒤 `main`을 합쳐 “1:1 목록 / 답변 필요” 용어를 보존한 다음 겹치는 FEAT-13·wiki 문서를 마무리한다
- 10/13 Anthropic 생성은 공통 `_client(timeout)`에서 `max_retries=0`을 사용한다. 상품·상세 초안은 20초, 채팅·설정 미리보기는 `AI_ANSWER_TIMEOUT_SECONDS=8`을 사용하며 기존 실패 fallback을 유지한다
- 10/13 초안의 중량 단위와 사실을 정규화해 필드별로 원문 근거를 확인한다. `5키로`는 `5kg`와 같고 입력에 없는 `궁천조생`은 제거·누락 표시하므로 기존 fixture를 환각 회귀 검사로 강화한다
- 10/13 로컬 FAQ·전달 주제 매칭에는 원문을 유지하고 모델 payload 복사본만 개인정보를 가린다. 모델 답은 전달한 근거 ID만 인용하며 숫자·한국어 날짜·예상 당도 표기·금지 주제·농가 1인칭을 사후 검증한다. 생산자가 쓴 FAQ·정책의 1인칭은 AI 안내 아래 그대로 허용한다
- 10/13 `sourceRefs`는 기존 문자열 배열 계약과 과거 `ai:evidence` 표시를 유지한다. 새 답은 `product:<id>`, `order:<id>`, `farm:faq`, `farm:smallOrderPolicy`, `farm:reservationShippingPolicy`만 사용한다
- 10/13 환불·보상 의도는 AI 모드와 무관하게 저장 흐름에서 감지하되 router가 커밋된 응답의 `messageId`와 요청 로컬 alert의 message ID가 같을 때만 `farmclub.ai.safety`의 `manager_refund_request`를 남긴다. 본문·소비자 신원·연락처·주소·첨부는 기록하지 않는다
- 10/13 설정 미리보기에는 운영자 alert를 남기지 않는다. rollback/commit 실패에도 alert를 남기지 않는다. 멱등 경쟁에서 진 요청에도 alert를 남기지 않는다. 순차 cached replay에도 두 번째 alert를 남기지 않는다
- 10/13 Langfuse는 일정상 후속으로 미룬다. M-08 근거 기록은 메시지의 `source_refs`, `source_summary`, `settings_version`으로 충족하고 N-08 provider tracing은 후속 작업으로 남긴다

### 작업
- [x] 공통 Anthropic client·20/20/8초 timeout·재시도 비활성화
- [x] 한국어 단위·필드별 상품 초안 grounding과 fallback 검증
- [x] 근거 reference·한국어 숫자/날짜·예상 당도·금지 답변 사후 검증
- [x] 정확한 결정 규칙·예약 출하 정책·Mock 동작 정렬
- [x] 커밋 후 환불 alert와 멱등 경쟁·실패 억제
- [x] FEAT/rules/contracts/AI spec/wiki 문서 동기화

### 완료 조건
- [x] P02 / AC-03-1~3 초안 grounding·실패 테스트 통과
- [x] C06 / AC-13-1~4·6~8 답변·전달·미리보기 테스트 통과
- [x] M-07 성공·AI OFF·rollback·경쟁 loser·cached replay·preview alert 테스트 통과
- [x] Mock 회귀 테스트와 전체 server pytest, `ruff check .` 통과
- [x] `git diff origin/main...HEAD`가 이 범위와 일치
- [x] main 머지 (일정 압박으로 사람 승인 없이 작성자 결정으로 머지, 기록 참고)

### 기록
- 10/13 GitHub #76의 source T13·P02/C06·완료 조건을 DEV-31과 확인. 예상 시간을 4시간에서 8시간으로 조정하고 `origin/main`에서 별도 worktree·브랜치를 시작했다
- 10/13 PR #98은 FEAT-13·Testing wiki만 겹치고 서버·Mock은 겹치지 않음을 확인. 구현은 즉시 시작하고 문서는 #98 이후 재조정한다
- 10/13 공통 client, 초안/답변 grounding, 예약 출하 정책, 커밋 뒤 환불 alert와 멱등 race 억제를 구현. 집중 pytest 16개와 Ruff 통과, `test-spec12.mjs` 통과. 전체 Mock은 병렬 news-room mock server 1건이 종료되어 10/11였고 DEV-31이 수정한 spec 1.2 시나리오는 통과했다
- 10/13 PR #98에 서버/Mock은 독립 진행하고 머지 뒤 FEAT-13·Testing wiki를 재조정한다는 coordination comment를 남겼다
- 10/13 local port 권한으로 Mock 전체를 다시 실행해 11/11 통과. server 전체 pytest 147개와 `ruff check .`도 통과했다
- 10/16 PR #98·#104·#109 머지 뒤 `origin/main`을 병합하고 `server/tasks.md` 충돌만 해결했다. #98의 “1:1 목록(서버 needsReply 상태 유지)” 용어를 유지해 FEAT-13 예외 흐름·근거 검증과 Testing wiki를 갱신했다. 일정 압박으로 리뷰어 없이 작성자가 squash merge하고 사후 리뷰를 요청한다.

## DEV-35 운영자 예외 이력·복구와 환불 이력

- 이슈: [DEV-35](https://linear.app/sswp6/issue/DEV-35) (GitHub [#80](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/80))
- 브랜치: `zahra/dev-35-manager-exception-recovery`
- 기능·인수 조건: M01~M03, M07 / FEAT-01 AC-01-3, FEAT-10 AC-10-6, FEAT-11 AC-11-3, FEAT-17 AC-17-4
- 상태: 진행 중
- 예상: 10시간

### 목표
운영자 승인·배송·환불 작업의 결정 이력과 실패 진단·복구 경로를 만들고, 모든 환불 경로를 한 이력 모델과 결제 상태로 일관되게 기록한다.

### 범위 (수정 허용 경로)
- `server/**`
- `docs/spec/screens.md`, `docs/spec/functional/**`, `docs/spec/tech-design/**`, `docs/spec/contracts-1.2.md`(5장 환불 알림 영속화, 10/16 추가)
- `docs/wiki/Design-Documentation.md`, `docs/wiki/Testing-Documentation.md`, `docs/wiki/Requirements-and-Specifications.md`

### 비범위 (건드리지 않음)
- `apps/**`, `packages/**`와 Mock 동작
- 운영자 전용 UI, 소비자 부분 환불 표시 UI, 결제사 연동·콜백 복구
- DEV-31 환불 알림 영속화는 PR #99 머지 후 최종 통합한다

### 결정 사항
- 10/16 Zahra가 이슈 #80에서 `@nemodleo`(PM)를 언급해 두 정책을 확인했다. 부분 환불은 `Order.status`와 주문의 환불 일시·사유를 바꾸지 않고, 환불 가능 잔액은 배송비·도서산간비를 포함한 전체 결제액이다. 일반 PR 승인이 팀 확인을 완성한다.
- 10/16 부분 환불은 `Payment.status=PARTIALLY_REFUNDED`와 운영자 환불 이력에만 나타난다. 소비자 노출은 T29 전 별도 프론트·스펙 후속 작업으로 남기며, 주문의 `PARTIALLY_REFUNDED` 값은 과거 데이터 읽기 호환용으로만 유지한다.
- 10/16 환불 이력은 공통 `_refund` 안에서 소비자 취소·배송기간 거절·운영자 환불 모두 기록한다. 이미 `REFUNDED`인 주문의 조기 반환 뒤에는 이력을 추가하지 않으며, 출하 전 잔여 물량은 최종 전액 환불 때 한 번만 복원한다.
- 10/16 마이그레이션은 PR #104의 `0006` 다음 `0007`을 예약한다. `Payment.status`를 최소 24자로 넓히고, 기존 환불 주문은 결제가 없어도 `COALESCE`로 결정적 `SYSTEM` 환불 이력을 보강한다.
- 10/16 `run_idempotent`와 `IdempotencyRecord`만 멱등 수단으로 사용한다. 운영자 결정·배송 완료·환불은 키를 필수로 하고 body 없는 요청은 `{}`를 해시한다. Mock의 생산자 승인 회귀는 권한에서 먼저 403이므로 Mock은 변경하지 않는다.
- 10/16 `ManagerEvent`는 감사 전용이다. 재시도용 원문 body는 비공개 DB 필드에만 저장하고 응답·로그에는 정제 요약만 사용한다. 잘못된 Swagger 요청도 비재시도 감사 행으로 남기되 기본 예외 목록에서는 제외한다.
- 10/16 재시도는 원래 actor·scope·key와 정확한 원문 body를 사용하고 누른 운영자는 별도로 기록한다. M01~M03의 일시 실패만 명시적 allowlist로 재시도하며, 환불 요청 알림은 해결만 가능하다. T19/#81의 결제사 실패 모델이 정해지면 재검토한다.
- 10/16 비 API 예외는 요청 세션을 명시적으로 rollback한 뒤 깨끗한 세션으로 FAILED 감사를 시도하고 원래 예외를 다시 던진다. 감사 기록도 실패하면 요청 내용 없이 `manager_failure_audit_write_failed`를 기록하고 두 번째 예외는 억제한다.
- 10/16 API 4xx는 비재시도 감사로 남긴다. 409는 멱등 결과가 커밋된 뒤 감사를 upsert하고, 그 밖의 4xx는 rollback 뒤 깨끗한 세션으로 감사를 기록한다.
- 10/16 DEV-31 환불 알림은 커밋된 winning message 트랜잭션에만 `OPEN` 이벤트로 저장하고 `messageId`로 유일하게 만든다. preview·사진 전용·rollback/commit 실패·cached replay·idempotency race loser에는 관리자 이벤트가 없어야 한다.

- 10/16 실패 감사는 끝난 이벤트(SUCCEEDED·RECOVERED·RESOLVED)나 저장된 원문과 다른 본문으로 온 같은 키 요청에서 원래 기록을 덮어쓰지 않는다. 같은 키의 성공은 실제 실행된 본문을 기록한다.
- 10/16 원문 body는 RECOVERED·RESOLVED가 되면 지운다. 재시도는 행 잠금 대신 원래 actor·scope·key의 `run_idempotent`로 한 번만 실행한다.
- 10/16 배송 기간 거절 환불은 소비자의 선택이므로 actor를 `CONSUMER`와 그 소비자 ID로 기록한다. 환불·결정 이력 API는 최신순이다.

### 작업
- [x] Refund·ManagerEvent·ProducerDecision 모델과 마이그레이션 0007·시드·legacy backfill
- [x] 공통 환불 이력·부분/최종 환불·결제 상태와 주문 상태 불변 규칙
- [x] 생산자 결정 이력과 공급 물량 결정 관리자 기록
- [x] 운영자 작업 멱등·감사 failure wrapper와 예외 목록·상세·재시도·해결 API
- [x] PR #99 머지 뒤 환불 요청 알림 영속화 통합
- [x] 서버 구현 결정·한국어 스펙·영문 wiki 갱신

### 완료 조건
- [x] 모든 환불 경로가 중복 없이 이력과 결제 상태를 기록하고 부분 환불이 주문 흐름을 바꾸지 않음
- [x] 생산자 결정 이력과 운영자 예외 조회·허용된 재시도·해결이 ADMIN 전용으로 동작
- [x] 원문 body·원 actor 재시도, 4xx·transient·commit failure·감사 이중 실패 회귀 테스트 통과
- [x] 환불 알림은 해결 가능·재시도 불가이며 preview·rollback·replay·race loser에서 생성되지 않음
- [x] 집중 테스트, 전체 PostgreSQL pytest, Ruff, Alembic upgrade/downgrade/re-upgrade/check 통과
- [ ] `git diff main...HEAD` 범위 감사와 AI 1차 리뷰 후 사람 리뷰 1명 승인

### 기록
- 10/16 현재 `main`에서 작업 브랜치를 만들고 이슈 #80에 두 정책 결정과 PM 확인 요청을 기록했다. PR #104는 마이그레이션 번호만, PR #99는 환불 알림 영속화 최종 단계만 차단한다.
- 10/16 PR #98·#104가 반영된 `main`으로 최신화했다. `0007`은 실제 `0006_source_analysis` 뒤에 연결했고, PR #99는 아직 draft라 환불 알림 영속화만 대기한다.
- 10/16 환불·결정 이력, 결제 잔액 기반 부분/최종 환불, 운영자 감사·예외 API와 원문/원 actor 재시도를 구현했다. 동시 동일 키 경쟁은 지연 unique 제약으로 `run_idempotent`의 loser rollback 경로에서 회복한다.
- 10/16 Ruff, 전체 PostgreSQL pytest 174개, Alembic `0007 → 0006 → 0007`과 `alembic check`가 통과했다. PR #99가 여전히 draft라 메시지 환불 알림의 영속화 및 해당 완료 조건만 남았다.
- 10/16 `origin/main` 대비 범위를 감사해 변경이 허용된 `server/**`, 지정 `docs/spec/**`, `docs/wiki/**`에만 있음을 확인했다. Mock·앱·공용 패키지는 변경하지 않았다.
- 10/16 리뷰에서 같은 키·다른 본문 요청이 성공 감사를 REJECTED로 덮어쓰는 문제를 재현해 고쳤다. 테스트 이름을 AC·규칙 ID로 바꾸고 키 필수·ADMIN 권한·backfill SQL(결제 유무)·실패 이벤트 보존 회귀를 추가했다.
- 10/16 draft PR #114를 열었다. 남은 단계는 PR #99 머지 뒤 환불 알림 영속화, AI 1차 리뷰, 사람 리뷰다.
- 10/16 PR #99 머지 뒤 `main`을 병합했다(`server/tasks.md` 충돌만). `consumer_send`가 DEV-31 알림을 만들 때 같은 트랜잭션에서 `manager_refund_request` OPEN 이벤트를 저장하도록 통합했다. AI OFF 저장, 순차 replay·동시 경쟁 1건, rollback·preview·일반 메시지 미저장 회귀를 추가했고 Ruff·전체 pytest 206개가 통과했다.

## DEV-39 [I2-T22] Add AI answer feedback and verify producer AI settings

- 이슈: [DEV-39](https://linear.app/sswp6/issue/DEV-39)
- 브랜치: `zahra/dev-39-ai-answer-feedback`
- 기능·인수 조건: C09 / FEAT-13 AC-13-5·M-17; P08 / FEAT-32 AC-32-1~4
- 상태: 진행 중
- 예상: Human 6시간 / Agent 0시간

### 목표
소비자가 잘못된 AI 답을 농가에 전달하고 생산자가 바로잡을 수 있게 한다. AI 설정의 저장·미리보기·버전 충돌 흐름을 합의된 인수 조건으로 검증하고, 오래된 버전 저장 뒤에도 편집 입력을 보존한다.

### 범위 (수정 허용 경로)
- `server/**`
- `packages/api/**` (Mock 포함)
- `packages/ui/**`
- `apps/consumer/**`
- `apps/producer/**`
- `scripts/**`
- `package.json` (`test:mock` 목록만)
- `docs/spec/screens.md`
- `docs/spec/functional/FEAT-13-ai-reply.md`
- `docs/wiki/Design-Documentation.md`
- `docs/wiki/Requirements-and-Specifications.md`
- `docs/wiki/Testing-Documentation.md`

### 비범위 (건드리지 않음)
- 위 허용 경로 이외의 파일
- 운영자 예외 알림·화면 추가, AI 답변 내용 수정·철회

### 결정 사항
- 10/16 잠정 기본값: 오답 신고는 채팅을 HUMAN으로 바꾸지 않는다. 이전 AI 답변을 포함해 해당 대화의 모든 AI 답변을 신고할 수 있다. 이 두 질문을 Linear DEV-39에 올려 확인을 구했으며 팀 답변이 다르면 동작을 조정한다.
- 10/16 오답 신고는 기존 `Escalation` 흐름을 재사용한다. `reason="WRONG_ANSWER"`, `thread_message_id`는 질문 메시지, unique `reported_message_id`는 신고한 AI 답변이다. 질문은 같은 thread에서 해당 AI 답보다 `seq`가 작은 마지막 CONSUMER 메시지다. `question`에는 마스킹된 본문, `context`에는 전달 질문과 같은 주문 문맥을 복사한다.
- 10/16 동일 답변 중복 신고는 기존 Escalation을 200으로 반환한다. 동시 unique 충돌은 IntegrityError rollback 후 기존 행을 다시 읽는다. 전달된 AI 답은 이미 열린 질문이므로 400으로 거부한다.
- 10/16 생산자가 질문함 항목을 선택하지 않고 답하면 이 신고는 OPEN으로 남고 `needsReply`도 true다. 별도 다른 농가 AC-32-4 테스트는 `/farms/me/...`가 로그인 농가를 사용하므로 만들지 않는다.
- 10/16 `reported`는 서버가 AI 메시지에 계산해 소비자·생산자 양쪽 GET messages 응답에 제공한다. 생산자는 WRONG_ANSWER 코드를 한국어 레이블로 본다.
- 10/16 AI 설정 저장이 STALE_VERSION이면 최신 version을 다시 불러오되 편집 필드를 유지하며, 최신 version으로 재저장할 수 있게 한다.
- 10/16 PR #113 작성자에게 migration 순서 확인을 요청했다. 현재 main의 0007 뒤로 DEV-39는 0008을 쓴다. PR #113에는 0008(`down_revision="0007"`)·0009가 있어 revision이 충돌하므로, PR #113의 migration 순서를 DEV-39 병합 후 main 기준으로 조정해야 한다.

### 작업
- [x] 메시지 신고 모델·migration·권한 검사·동시 중복 회복 API 구현
- [x] 소비자 버튼·신고 상태·생산자 WRONG_ANSWER 레이블 및 두 앱 message API 반영
- [x] Mock와 `scripts/test-ai-feedback.mjs`, root `test:mock` 목록 반영
- [x] AC-32 stale-version 입력 보존·재저장 구현 및 AC-32-3 부작용 회귀 보강
- [x] API·Mock·Playwright 검증, 스펙·위키 갱신, AC-13-5 체크

### 완료 조건
- [x] AC-13-5 서버·Mock·브라우저 검증 통과(질문 격리, 중복·동시 신고, 보고 상태 양쪽 reload 포함)
- [x] AC-32-3 preview가 설정·대화·문의 기록을 바꾸지 않음
- [x] AC-32-4 server refreshed-version save와 producer 화면 입력 보존·재저장 검증 통과
- [x] 마이그레이션 upgrade/downgrade/check, 전체 허용 Mock·앱 테스트, spec/wiki 일치 확인
- [x] `git diff main...HEAD` 허용 범위 감사 및 AI 1차 리뷰 코멘트 게시
- [x] 사용자가 I2 승인 규칙 면제와 squash merge를 명시적으로 승인함

### 기록
- 10/16 Linear DEV-39를 Human 6h로 재산정하고 provisional HUMAN/older-answer 질문을 DEV-39에 게시했다. PR #113 작성자에게 migration 0008 순서를 확인 요청했다.
- 10/16 API·Mock·소비자 신고 버튼·생산자 한국어 표기·STALE_VERSION 입력 보존 흐름과 pytest/Mock/Playwright 회귀 케이스 구현을 마쳤다.
- 10/16 의존성 설치(`npm ci`, `uv sync`) 후 실행해 보니 새 AC-13-5 서버 테스트 4개와 Mock 테스트가 실패했다. 원인: API 키 없이는 "배송비" 질문이 주문·상품 없이 `FORWARDED`가 되고, Mock 시드에서는 `u-seojun`이 `f-kang`을 팔로우하지 않는다. 서버·Mock·Playwright 모두 소량 주문 원칙을 저장하고(Mock·Playwright는 대화를 AUTO로 돌린 뒤) "소량 주문 되나요?"로 규칙 답변을 받도록 고쳤다. Mock의 다른 소비자 404 검사는 그 소비자가 대화를 시작한 뒤 확인한다.
- 10/16 AC-13-5 원문을 `FEAT-13-ai-reply.md`·wiki에서 복원했고(구현 용어로 바꾸지 않음), `screens.md`의 영어 표현을 한국어로 고쳤다. 당시 확인한 PR #113 migration 정보와 revision 충돌은 아래 결정 사항 기록을 참조한다.
- 10/16 마이그레이션 `0008_ai_answer_report.py`(신고 답변 FK·unique)를 추가했다. 임시 DB에서 Alembic `upgrade head → downgrade 0007 → upgrade head → check`(새 작업 없음) 통과. 같은 임시 DB로 `npm run test:integration:full` 실행: 실서버 통합 7개, Playwright 21개 통과(AC-13-5 신고·양쪽 표시·reload, AC-32-4 STALE_VERSION 입력 보존·재저장 포함). 임시 DB는 삭제했다.
- 10/16 최종 검증: Ruff 통과, pytest 211개 통과, `npm run typecheck` 통과, `npm run test:mock` 13개 통과. 마이그레이션 upgrade/downgrade/check와 실서버 통합·Playwright 결과는 위 기록 참조.
- 10/16 PR 1차 검토에서 오래된 AI 답 신고 직후 해당 페이지가 refresh 결과에 없을 때 버튼 상태가 갱신되지 않는 경계를 보완했다. 성공 응답에서 현재 메시지를 바로 `reported`로 표시하고, 더 최신 답변이 있는 상태에서 이전 답변을 신고하는 AC-13-5 서버 회귀를 추가했다. 재검토에서 typecheck·diff check 통과. 이 worktree에는 `psycopg`가 없어 변경한 pytest는 여기서 재실행하지 못했다(위 전체 pytest 211개 통과 기록은 유지).
- 10/16 1차 리뷰 커밋 `3b6ee08`, 리뷰 보완 `2ef8dbf`를 push하고 PR #119를 열었다. AI 1차 리뷰 코멘트 게시: must 없음. I2 승인 규칙은 사용자가 면제했다. PR #113의 0008/0009 migration revision은 DEV-39 병합 뒤 충돌이 없게 조정해야 한다.
- 10/17 `main`을 병합해 `server/tasks.md`의 DEV-39/DEV-59 섹션을 보존했다. main의 AI grounding 변경까지 포함한 재검증: Ruff 통과, pytest 215개 통과, `npm run typecheck` 통과, `npm run test:mock` 13개 통과.
- 10/17 별도 로컬 DB `farmclub_dev39_ship_test`에서 Alembic upgrade/check 통과. `npm run test:integration:full`은 localhost만 대상으로 서버 통합 7개와 Playwright 21개 통과. Railway에는 연결하지 않았다.
- 10/17 GitHub PR #113 실제 diff를 확인해 migration 충돌 정보를 바로잡고 PR #119에 정정 코멘트를 남겼다. DEV-39 merge 이후 PR #113 migration을 새 main head 뒤로 재배치해야 한다.

## DEV-59 AI 상품 초안 근거 확인: 중량·당도 정확 일치와 배송 구절 한정
- 이슈: [DEV-59](https://linear.app/sswp6/issue/DEV-59) (GitHub [#115](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/115))
- 브랜치: `zahra/dev-59-ai-draft-grounding`
- 기능·인수 조건: P02 / FEAT-03 AC-03-1, 규칙 M-11
- 상태: 리뷰 대기
- 범위(수정 허용 경로): `server/app/ai/grounding.py`, `server/tests/test_ai_service.py`, `server/tasks.md`. 응답 형식·API 변경 없음
- 결정 사항:
  - 10/16 중량 옵션은 부분 문자열이 아니라 원문 중량 값 집합과 정확히 같을 때만 남긴다(`5kg`는 `15키로`의 일부가 아님). 중량이 없는 옵션은 기존처럼 원문 포함 여부로 본다.
  - 10/16 당도는 원문의 당도·브릭스·brix 옆 숫자를 숫자 경계로 뽑아 값이 같을 때만 남긴다(`2`는 `12브릭스`의 일부가 아님).
  - 10/16 AI 1차 리뷰: `브릭스` 뒤 숫자(`12브릭스 5키로`의 5)도 당도로 읽던 문제를 고쳐, 앞 키워드는 `당도`·`brix`만 쓰고 중량·금액·개수 단위가 붙은 숫자는 제외한다.
  - 10/16 배송 예정 기간은 배송·수령 문맥이 있는 구절(줄바꿈·`!?;`·소수점/천 단위가 아닌 `.,`로 나눔)의 날짜로만 확인한다.
- 작업: [x] 중량 옵션 정확 일치 [x] 당도 숫자 경계 [x] 배송 구절 한정 [x] AC-03-1 회귀 테스트 4개
- 검증: Ruff, 전체 pytest 210개 통과.

## DEV-58 최신 main 동기화 (2026-10-17)
- 범위: 기존 DEV-56/57/58 경로 내 core/seed.py, migrations, source spec, 검증 기록. main 변경은 원본 그대로 보존한다.
- 결정: main에 운영자 migration0007이 먼저 병합되어, 미배포 브랜치의 source integration은0008, preprocessing은0009로 재번호를 부여한다. 기존 로컬 평가 DB와 비용 원장은 dump로 보존하고 별도 새 DB에서 migration/전체 회귀를 검증한다. PR 머지는 하지 않는다.
- [x] 충돌 해결·전체 로컬 검증·커밋 스캔·main 동기화 커밋 CI 확인

- OCR 반환 좌표가 NumPy float32일 때 JSON 직렬화되는지 확인하는 회귀 테스트를 위해 numpy를 개발 의존성에 명시한다. CI의 기본 uv sync에서도 해당 테스트를 건너뛰지 않고 실행한다.

- 최종 통합: b8d33f3 원격 server/apps/integration CI 통과. 로컬에서 발견된 초기 입력 손실과 배송지 E2E 경쟁은 producer readiness/응답 대기로 보완한 뒤 실제 API7개·Chromium22개 전부 통과했다. 서버238개·타입4개·mock12개도 통과. 마지막 UI 보완 커밋의 원격 CI 상태는 PR #113에서 추적하며 Draft/미머지를 유지한다.

### DEV-58 모델 상향 (2026-10-17)
- 사용자 결정: 비용을 조금 늘려 더 좋은 모델을 사용한다. 기본 추출 모델을 OpenRouter `google/gemini-3-flash-preview`로 변경한다. 공식 단가는 입력/출력 100만 토큰당 $0.50/$3.00으로 기존 Flash-Lite의 2배다.
- 범위: 위 DEV-56/57/58 범위 안의 core 설정, source AI 어댑터, 비용 예약, worker, 평가 CLI, 관련 테스트·spec·wiki·검증 메타데이터.
- 결정: 모델별 허용 단가를 한 곳에 두고 설정 검증·제공자 가격 상한·비용 예약에 공유한다. 기존 Lite는 명시적 비교 실행에만 선택 가능하며 자동 fallback은 추가하지 않는다. 예약은 worker의 현재 기본값 대신 Run에 저장한 실제 모델을 따른다. 평가 CLI도 설정 모델을 호출·기록한다.
- 비교 원칙: OCR·프롬프트·고정 정답은 유지하고 같은 실제12건으로 평가한다. $1 평가/$5 누적 한도와 기존 비용 원장을 유지한다. 모델 교체만으로 OCR 오류가 해결된다고 간주하지 않는다. PR #57/#113 머지 및 배포는 하지 않는다.
- [x] 모델·가격 제한·예약/평가 일관성 구현 및 회귀 검증
- [x] 실제12건 모델 비교와 비용·한계 기록

- 검증: 전체 `pytest -q` 244개 통과 후 평가 CLI 회귀2개 추가, 관련 `pytest -q tests/test_source_integration.py` 최종21개 통과. `ruff check .`, `npm run typecheck`4개 workspace, `npm run test:mock`12개, `npm run test:integration:full` API7개/Chromium22개 통과.
- 실제12건: 동일 safeInput/정답 확인, precision37.04→38.71%, recall30.30→36.36%, 비용$0.023114. 출하시기 뒷부분/선별 설명/규격 분류 개선, GAP 누락·OCR 오타·일부 필드 오분류 유지. 표본별1회 반복 개발평가이므로 일반 성능 향상을 확정하지 않는다.
- 합성20건(18실호출+2계약): 정확일치90%/90%, 텍스트94.44%/94.44%, PDF100%/100%, 회전이미지0%/0%. 과거 판매 라벨 보존/이미지 문장 병합 때문에 실패했으며 정답/프롬프트를 바꾸지 않았다. 비용$0.018023. DEV-58 품질 게이트는 여전히 미달.
- 이번 실호출 합계$0.041137. 기존 원장183건 정산$0.137194/미정산 예약$0.191654(개별 micro-USD 올림 적용), 팀 전체 사용량 아님. 기록: docs/spec/validation/source-model-upgrade-2026-10-17.json. 원문/생성 결과는 ignored 로컬 artifacts에만 보존한다.
- 커밋 스캔: 이슈 없음. 레거시 호환 점검 후보1건 — 지적0건 / 커밋된 구조1건(google/gemini-3.1-flash-lite:388d956, 명시적 모델 비교 지원). PR #113 Draft 및 DEV-58 In Progress 유지, 머지/배포 없음.

### DEV-58 Sol 비교 평가 (2026-10-17)
- 사용자 승인: GPT Sol로 같은 실제12건을 비교한다. 기본 Flash는 유지하며 OpenRouter `openai/gpt-6.1-sol`을 명시적 평가 선택으로 추가한다. 기존 DEV-58 범위 안의 설정·어댑터·평가 진단·회귀 테스트·spec/wiki/메타데이터만 변경한다.
- 결정: 입력/출력100만토큰당 $2/$10 가격 상한, 지원되는 최소 추론 `low`, 최대 출력4096토큰을 사용한다. 자동 재시도/모델 fallback 없음. OCR·프롬프트·원문·정답·시각 선택은 기존12건과 동일하게 유지한다.
- 예산: 기존 원장을 보존하고 시작 시 누적 평가 사용액(정산+미확인 예약)에 $0.50을 더한 값과 기존 $1 한도 중 작은 값을 이번 프로세스의 평가 상한으로 적용한다. 모든 호출 전 영속 예약으로 검사하고 새 원장을 만들거나 한도를 우회하지 않는다.
- [x] OpenRouter Sol 선택 및 비용/추론 계약 회귀 검증
- [x] 실제12건 비교·비용·실패 분석과 리뷰 가능한 결과 저장

- 결과: Sol12/12 응답·근거 검증 완료. 정확일치 precision/recall36.36%/36.36%(Flash38.71%/36.36%), 비용$0.087277(Flash의3.776배), p50 5.408초/p95 26.622초. GAP/선별 과정/맛 분류 일부 개선, OCR 오타와 문구·필드 문제 유지. 이미지 직접 입력0건으로 시각 OCR 성능 비교가 아니다. 기본 Flash 유지.
- 공백만 제거한 사후 진단: Lite51.85%/42.42%, Flash54.84%/51.52%, Sol57.58%/57.58%. 주 평가/정답은 그대로 유지하며 의미 정확도로 주장하지 않는다.
- 검증: `pytest -q`250개, `ruff check .`, 타입4 workspace, mock12개, 실서버 API7개/Chromium22개 통과. 실제 생성 결과 비교 페이지를 현재 ModuleStory로 렌더했고3모델 카드/390px 가로 넘침0/콘솔 오류0을 확인했다. 원문/정답/응답은 ignored private artifacts에만 보존한다.
- 원장195건 정산$0.224474/미확인 예약$0.191654. 이번 평가 상한$0.828848(시작사용액+$0.50, 기존$1 이내)을 적용했다. 기록: docs/spec/validation/source-sol-comparison-2026-10-17.json. 비교화면: http://127.0.0.1:18084/models.html.
- 커밋 스캔: 이슈 없음. 레거시 호환 후보2건 — 지적0건 / 커밋된 모델 선택2건(Lite:388d956, Flash:cbe1d6f). DEV-58 In Progress/PR #113 Draft, 머지·배포 없음.

### DEV-58 직접 이미지 OCR 비교 (2026-10-17)
- 사용자 승인: 동일 이미지6건을 Sol/Gemini OCR로 실제 비교하고 기존 RapidOCR 대비 개선과 비용을 확인한다.
- 범위: 기존 DEV-58 평가 범위의 ignored `server/app/ai/.artifacts/vision_ocr_experiment.py`, `server/.artifacts/source-vision-comparison/**`, 로컬 비교 화면, `server/tasks.md`, `docs/spec/validation/**`, 관련 source spec/wiki 결과 기록. 제품 OCR·기본 모델·API는 이번 실험에서 바꾸지 않는다.
- 결정: 이미 가림 처리된 동일6이미지만 전송한다. JPEG quality85의 동일 입력을 두 모델에 제공하고 긴 이미지는 같은 고정 구간으로 분할한다. Sol low/Gemini Flash minimal, OCR 호출은2048 출력토큰, 후속 추출은 기존 Flash4096/프롬프트/고정 정답을 사용한다. OCR에는 정답·기존 OCR 텍스트를 주지 않는다. 자동 재시도 없음.
- 평가: 기존 RapidOCR+Flash 결과를 대조군으로 보존한다. OCR 단계는 기존21개 정답의 근거 구절을 공백 제거 후 찾는 회수율과 수동 오인식 검토로 비교한다(전체 문자 정확도/CER 아님). 후속 추출은 기존 정확일치와 공백 제거 진단을 별도로 기록한다. OCR 인용 검증 통과는 이미지 내용이 참임을 보증하지 않으므로 원본 대조를 병행한다.
- 예산: 동일 기존 비용 원장195건을 유지한다. 이번 실험 시작 사용액(정산+미확인 예약)$0.416128에 추가$0.50을 더한 $0.916128 평가 상한(기존$1 이하)을 적용한다. 이미지 base64 길이 기반 기존 보수적 예약을 그대로 사용하고 실제 usage로 정산한다. 한도 부족 시 자동 증액하지 않는다.
- [x] Sol/Gemini 각각6건 OCR + 동일 Flash 추출 완료
- [x] 정답 고정 확인·오타/누락/추출 정확도·실제 비용 및 비교 화면 기록
- 결과: 34/34 실호출 성공(OCR22 + Flash 추출12), 12/12 근거 검증 완료. 고정21근거 회수 RapidOCR15, Sol19, Gemini20. 원본 PDF 텍스트/이미지 대조에서 정답1건의 날짜기호(~→-) 오류를 확인했으며 기존 정답/주 점수는 보존했다. 그 한 글자만 고친 별도 진단은 Gemini21/21이다. 전체 문자 정확도로 해석하지 않는다.
- 최종 추출 고정정답 정확일치 P/R: RapidOCR22.22%/19.05%, Sol OCR57.89%/52.38%, Gemini OCR50%/42.86%. 원문 확인 정답1건 보정 진단에서 Gemini55.56%/47.62%, 다른 모델 동일. 긴이미지를 포함한5/6건의 두 VLM 판독은 공백 제거 후 같아 후속 Flash 출력의 변동/묶음/분류가 점수 차이를 만든다. Sol이 더 좋은 OCR이라는 결론은 내리지 않는다.
- 실제 비용: Sol OCR$0.025071 + Flash 추출$0.010216 = $0.035287; Gemini OCR$0.0093205 + Flash 추출$0.011973 = $0.0212935. 합계$0.0565805로 이전 견적보다 낮았다. 원장229건 정산$0.281061, 기존 미확인 예약$0.191654 유지. 새 미정산0건.
- 판단: Gemini OCR을 통합 후보로 권장한다. Sol은 farm-water에서 농장명/체험 단어를 새로 오인식했다. 두 OCR 모두 뒤의 Flash가 계절 목록을 나누거나 GAP·활용 문구를 누락하는 문제는 해결하지 못했다. 후속 단계의 문장 경계/필드 분류 개선과 독립 자료 평가가 필요하다. 이번 작업은 비교 평가만이며 제품 OCR은 변경하지 않았다.
- 검증: 가림된 동일 입력 해시/기존 정답 manifest SHA 불변/영속 예약·정산/12개 추출 근거 검사 확인. 비교 화면6사례×3카드, 390px 가로 넘침0/JS 오류0. source PDF 재확인은 설치된 pypdfium2로 수행했다(fitz는 미설치라 사용하지 않음). 원문/출력/스크립트는 ignored private artifacts; 공개 결과는 docs/spec/validation/source-vision-ocr-comparison-2026-10-17.json. http://127.0.0.1:18084/ocr.html.

### DEV-58 추출 묶음·분류·누락 보완 (2026-10-17)
- 사용자 승인: OCR 교체 범위를 늘리지 않고 묶음·분류·누락 검사만 개선한 전후 결과를 보여준다.
- 범위: `server/app/ai/source_analysis.py`, `server/app/source_analysis/{models,worker,synthetic,coverage}.py`, `server/app/source_analysis/spec.md`, 관련 source 테스트, `server/tasks.md`, source spec/wiki/검증 메타데이터, ignored 평가 스크립트·비교 화면. OCR 모델/원문/기존 정답·채팅·배포는 변경하지 않는다.
- 결정: 의미 문장/라벨 목록 단위로 추출하고 물리 줄바꿈은 근거 span으로만 보존한다. 과정·인증·맛·보관·사용 제안의 필드 우선순위를 명시하고 응답 전 근거 구절 누락을 점검한다. 근거 없는 값을 후처리로 생성하거나 금지된 추론을 허용하지 않는다.
- 결정: source-v4로 프롬프트 버전을 올려 기존 결과를 새 결과로 재사용하지 않는다. 구버전 대기 작업은 전송 전에 실패시켜 새 분석/명시적 재시도로 현재 버전을 적용한다.
- 결정: 비공개 평가 진단에 근거 span별 미반영 문구를 보수적으로 탐지하는 누락 점검을 추가한다. 원문을 길게 인용했어도 실제 value에서 빠진 내용은 표시하고, 장식/중복 구절 등 오탐 가능성을 명시한다. 자동 보완/추가 유료 호출은 하지 않는다.
- 평가: 저장된 Gemini OCR6건을 그대로 재사용해 Flash 추출만 재실행한다. 원문/고정 정답/이전 결과 유지, 이미 확인된 날짜기호 정답1건 보정은 별도 진단. 실제/합성 회귀와 전후 화면 확인. 추가 평가 한도$0.25, 기존 원장·$1 전체 평가 상한 유지.
- [x] 프롬프트·버전·누락 진단 및 의미 있는 회귀 테스트
- [x] 같은 OCR6건 개선 전후 실호출·회귀 평가·비교 화면
- 결과: 동일 저장 Gemini OCR6건의 추출 정밀도/재현율50%/42.86% → 85.71%/85.71%(9→18개 일치). 원문 확인 날짜기호 정답1건 보정 진단은55.56%/47.62% → 90.48%/90.48%. 정답은 변경하지 않았다. 남은 정확일치 차이는 원문 날짜기호, 규격 공백, 더 긴 인증 표현이다. 목록 묶음/과정 분류/맛·활용 문구/보관3문장과 인증을 복원했다.
- 회귀: 기존 RapidOCR 입력12건의 P/R38.71%/36.36% → 43.24%/48.48%, 텍스트3건100% 유지. 합성18건90%/90% 유지(텍스트16건94.44%, PDF100%, 회전이미지0%; 과거판매 라벨/회전이미지 문장 묶음 문제 유지). 실제 API의 실패/자동 금지 검사0건은 의미 정확도100%를 뜻하지 않는다. 독립 홀드아웃이 아닌 반복 개발자료다.
- 비용: OCR 재호출 없이 개선 전후6건 추출$0.013377, 기존 실제12건$0.027815, 합성18건$0.02214, 합계$0.063332. 원장265건 정산$0.344402/기존 미확인 예약$0.191654, 새 미정산0건. 이번 프로세스 평가 상한$0.722715(시작사용액+$0.25, 기존$1 이내) 유지.
- 검증: 집중31개/전체 pytest256개, Ruff, 타입4 workspace, mock12개, 실제 API7개·Chromium22개 통과. 전후 비교 화면6사례×2개 ModuleStory, 390px 가로 넘침0/JS 오류0. 금번 렌더 스크립트의 초기 JS 줄바꿈 오류를 수정한 뒤 최종 검증 통과. 현재 URL http://127.0.0.1:18084/extraction.html.
- 범위: 기본 OCR은 RapidOCR, 추출 모델은 기존Flash 유지. 채팅/배포/머지 없음. 누락 점검은 평가용 보조 진단이며 생산자용 자동 보완이나 무조건 통과 처리로 연결하지 않는다. DEV-58 품질95% 기준과 실제 농가 인수는 미완료.
- 커밋 전 scan-before-commit 점검: 회귀/버그/불필요 추가/미커밋 호환 이슈 없음. 모델·예약·평가 호출부와 source-v4 캐시/구버전 차단을 확인했고, 새 누락 진단은 원문/값을 변경하지 않는다. 전후 지연시간은 이전 OCR 포함/이후 추출만이라 속도 비교에 쓰지 않도록 메타데이터에 명시했다. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건(Lite:388d956, Flash:cbe1d6f). 구버전 source-v3는4047e06에 실재하며 새 작업은 이를 수용하지 않고 재분석을 요구한다.

## DEV-58 사용자 채택 Gemini OCR 제품 통합 (2026-10-17)

- 사용자 결정: 동일 저장 Gemini OCR6건 + source-v4 추출의 P/R85.71% 버전을 채택해 PR #113 수정. 과거95% 목표를 이번 채택의 강제 머지 조건으로 유지하지 않는다. 독립 성능/농가 인수 완료로 주장하지 않는다.
- 범위: server/app/ai/{source_analysis.py,source_ocr.py}, server/app/source_analysis/{worker.py,budget.py,service.py,spec.md}, server/tests/test_source*.py, server/tasks.md, apps/producer/src/lib/SourceWorkspace.tsx, apps/producer/{spec.md,tasks.md}, docs/spec/source-integration.md, docs/wiki/Source-Analysis.md, docs/spec/validation/source-gemini-production-2026-10-17.json, PR #113/Linear DEV-58.
- 결정: OpenRouter 이미지/PDF는 가림 승인 후 Gemini Flash OCR(2048 tokens/minimal)→기존 source-v4 추출 문구로 처리. 로컬 RapidOCR은 가림 좌표용으로 유지. 원본 사진은 분석 제외, 텍스트/mock/OpenAI 경로 유지. OCR용 가림 JPEG85만 전송, 긴 자료는 제한된 비중첩 조각. OCR/추출 각각 독립 비용 예약·정산, 불확실한 전송 자동 재시도 금지. OCR spans는 해당 Item.pages에 비공개 보존하여 페이지 원본 좌표를 덮어쓰지 않는다. 신규 pipeline version으로 이전 성공결과 재사용 차단. 이전 수치와 새 제품 경로 회귀 검증은 구분.
- DB 스키마 변경 없이 기존 작업 JSON 활용. main 충돌 해결·마이그레이션 재번호·머지는 이번 OCR 구현과 분리하며 PR 최신 상태에 명시.
- [x] OCR 어댑터/제품 worker/사용자 안내 연결
- [x] 가림·예산·취소·실패·근거·장문/텍스트 회귀 검증
- [ ] 명세/평가 한계/PR/Linear 갱신 및 커밋 전 스캔

- 검증: 전체 pytest267개, mock12개, 타입4 workspace, Ruff 통과. 실제 팀 OpenRouter로 긴 이미지 OCR6회+추출1회28.364초/$0.011443, 가림 준비3.578초. 실제 UI 업로드→가림→검토/설정→비공개 저장→명시적 적용→공개 본문 일치 확인. 기존 승인 상품 수정이며 사용자 직접 인수는 대기. 자동 테스트가 저장 후 열린 미리보기를 다시 눌러 닫은 뒤 같은 초안에서 재개했으며 유료 호출은 반복하지 않았다. 원문/영상/키는 ignored artifacts에만 보관한다.

- 커밋 전 scan-before-commit: 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (Item.pages number/spanIds:388d956). 예약 함수 전체 호출부와 신규 어댑터/테스트 포함 확인. PR/Linear 기록은 UI 추가 요청 반영 후 함께 갱신한다.

## DEV-58 상품별 편집 작업·생산자 흐름 안정화 (2026-10-17)
- 사용자 승인 계획: 판매 중 상품에서 현재 판매페이지 직접 수정, 신규 상품/작업 원자 생성, 생산자 앱 전체 공통 UI·흐름, 영상3개. 탭4개 유지, AI 채팅 기능/배포/머지 제외.
- 범위: server/app/source_analysis/**, server/app/catalog/{models,schemas,service}.py, server/migrations/**, server/tests/**, server/tasks.md, apps/producer/**, packages/api/**, packages/ui/{src,spec.md,tasks.md}, scripts/e2e/**, docs/spec/{source-integration,validation/**}.md, docs/wiki/Source-Analysis.md. main 동기화 충돌 파일은 main 변경 보존.
- 결정: 상품별 비공개 작업 연결을 보존하고 생성/재개 API를 멱등 처리. 현재 공개 모듈을 원본 없이도 편집 가능하게 복원하며 기존 공개 사진 보존, 근거 추정 금지. 신규 상품/작업은 한 트랜잭션. 저장/공개 분리·버전/권한 유지.
- [ ] main 동기화·마이그레이션 충돌 정리
- [ ] 상품별 편집/원자 생성 API·회귀
- [ ] 생산자 전체 화면 규격·이동/저장 정리
- [ ] 회귀·영상3개·스펙/Linear/PR·커밋 스캔
## DEV-44 [I2-T29] 운영자 기능·AI 전달 내부 점검

- 이슈: [DEV-44](https://linear.app/sswp6/issue/DEV-44)
- 브랜치: `zahra/dev-44-manager-ai-checklist`
- 기능·인수 조건: FEAT-01 / R-22, FEAT-04 / R-25, FEAT-10 / R-19, R-11 / R-12, M01~M03 / M07, FEAT-13 AC-13-6·AC-13-7, FEAT-32 AC-32-3
- 상태: 진행 중

### 목표
시드 로컬 데이터로 운영자 승인·권한·예외·AI 전달을 점검하고, 영문 통과/실패/보류 체크리스트와 근거를 남긴다. 제품 코드는 바꾸지 않는다.

### 범위 (수정 허용 경로)
- `docs/wiki/Testing-Documentation.md`
- `server/tasks.md`

### 비범위 (건드리지 않음)
- 제품 소스·제품 동작·자동 테스트 소스 변경
- 실제 결제·환불 연동, 운영자 전용 UI
- `POST /admin/farms/{farmId}/suspend`(R-24)와 `DELETE /admin/messages/{messageId}`(정책): `docs/spec/screens.md`에는 있으나 서버 라우트가 없고 M01~M03 밖이다

### 결정 사항
- 10/16 시드 로컬 데이터를 쓴다. 서버 pytest와 Playwright `producer-i2`·`conversation-ui`를 실행하고, 기존 AC 이름 테스트를 근거로 인용하며, 테스트가 없는 흐름은 Swagger/API로 확인한다.
- 10/16 구현된 모든 `/admin/...` 라우트에 대해 토큰 없음 401, Mock 로그인 소비자 `u-minji`·생산자 `u-kang` 403을 확인한다. 운영자 토큰은 `cd server && uv run python -m app.accounts.admin_token`(기본 `u-admin`)으로 받아 Swagger Authorize에 넣는다.
- 10/16 일시 실패 재시도는 M01~M03에만 허용, 환불 요청 알림은 해결만 가능·재시도 불가, 해결·복구된 이벤트는 재시도 불가를 확인한다. 오래된 공급 물량 버전(409), 필수 `Idempotency-Key` 누락(400), 같은 키 반복 시 첫 결과 반환을 확인한다.
- 10/16 AC-13-6, AC-13-7, M-07 환불·보상 알림의 `GET /admin/exceptions` 저장, AC-32-3 미리보기 무기록을 확인한다. API 키 없이 AI OFF·강제 전달·로컬 규칙/FAQ·기본 전달 경로를 직접 확인하고, Claude 근거 답변은 pytest(monkeypatch) 근거를 인용한다.
- 10/17 DEV-39가 main에 병합되어 AI 설정과 AC-13-5 재검증을 완료했다. 결과는 `docs/wiki/Testing-Documentation.md`에 기록했다. wiki에 소비자 부분 환불 이력이 T29 전 프론트·스펙 후속 작업으로 남아 있으므로, 완료가 확인되지 않으면 보류로 둔다.
- 10/16 스펙에만 있고 코드에 없는 위 두 운영자 라우트를 기록한다. 삭제할지 구현할지는 후속 이슈에서 정한다.
- 10/16 범위 안의 실패마다 Bug 이슈를 만들어 체크리스트에 연결하고 DEV-47(T38)로 넘긴다. DEV-44는 기록만 하고 고치지 않는다.

### 작업
- [x] `docs/wiki/Testing-Documentation.md`에 영문 결과 체크리스트 추가
- [x] 서버 pytest와 지정 Playwright spec 실행, 관련 `test_AC_…` 인용
- [x] 테스트가 없는 시드 API 흐름과 권한 확인, 통과/실패/보류와 근거 기록
- [x] 최종 실행 확인. 범위 안 제품 실패가 없어 DEV-47용 Bug 이슈는 만들지 않음
- [x] draft 문서 PR [#118](https://github.com/snuhcs-course/swpp-2026-project-team-06/pull/118) 열고 실제 소요·근거 기록

### 완료 조건
- [x] 승인·권한·예외·AI 전달마다 통과/실패/보류 결과와 근거가 있음
- [x] 체크리스트·이슈 범위·결정·테스트 결과·후속 Bug가 연결되고 최신임
- [ ] 문서 PR 리뷰 후 머지

### 기록
- 10/16 `origin/main`에서 분리된 worktree로 시작. DEV-39가 진행 중이고 부분 환불 이력 후속 작업이 아직 남아 있음을 확인했다.
- 10/16 서버 전체 테스트 통과(206), 지정 Playwright spec 통과(11). 첫 Playwright 실행은 API 호스트 이름이 맞지 않았고, route intercept URL을 맞춘 뒤 모두 통과해 제품 Bug는 만들지 않았다.
- 10/16 시드 HTTP 확인 통과: 운영자 라우트 12개 모두 토큰 없음 401, Mock 로그인 `u-minji`·`u-kang` 403. 승인·반려·공급 물량·배송 완료·환불 흐름, 오래된 버전, 키 필수·반복, 예외 수명주기, AC-13-6·7, AC-32-3을 확인했다. AI 로컬 경로는 API 키 없이 통과했다.
- 10/17 AC-13-5와 AI 설정 점검은 DEV-39 병합 후 재검증했다. 소비자 부분 환불 이력은 문서화된 프론트·스펙 후속 작업 때문에 보류. 스펙에만 있는 두 라우트는 없음으로 기록하고 M01~M03에서 제외했다.
- 10/16 draft PR #118을 열었다. Agent 시간 추정 0.5h, 토큰 합계는 이 세션에서 제공되지 않아 PR과 Linear 결과에도 그대로 적었다.
- 10/16 재검증: 위 실행 기록은 의존성이 없는 worktree에서 나온 것이라 출처를 확인할 수 없어 다시 실행했다. 현재 `main`(`34c9009`, #116·#117 포함)을 별도 worktree에 두고 `npm ci`·`uv sync --frozen` 후 임시 DB로 실행: pytest 210개 통과, `npm run test:integration:full` 실서버 통합 7개·Playwright 19개 통과(`producer-i2`·`conversation-ui` 11개 포함). 시드 API 점검 스크립트 46개 항목 통과(라우트 12개 × 3계정 권한, 승인·반려·이력, 공급 물량 409·승인, 배송 완료·환불 키 필수(4개 작업)·같은 키 반복·환불 이력 1건, 환불 요청 알림 목록·상세·재시도 거부·해결·해결 후 재시도 거부, AC-32-3, 규칙 답변·강제 전달·기본 전달, AC-13-6·7). 일시 실패 재시도 복구는 HTTP로 재현하지 않았고 `test_AC_11_3_transient_retry_uses_original_actor_and_exact_body` 통과로 대신한다. 임시 DB·worktree는 삭제했다.
- 10/17 DEV-39(#119)가 main에 squash-merge되어 AC-13-5를 재검증했다. 현재 main에서 서버 pytest 215개, integration 7개, Playwright 21개, Mock 13개와 typecheck/Ruff/Alembic check가 통과했다. Railway는 별도 URL 미확인 상태로 미검증이다.

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

## DEV-58 상품별 판매페이지 편집 구현 기록
- main 동기화: DEV-39의0008 보존, source integration0009/preprocessing0010로 재번호. 격리 DB upgrade→0008 downgrade→head 재업그레이드 및 전체 pytest275개 통과. 기존 데모/평가 DB는 변경하지 않았다.
- 구현 결정: 상품별 Workspace에 비공개 판매페이지 스냅샷·기준 상품 버전·자료 batch 연결을 저장한다. 기존 moduleDetail와 detailContent를 그대로 보존하는 두 스냅샷 형식을 사용해 원본 자료 없이 편집한다. 모듈/기존 블록을 임의 변환하지 않는다. 새 API는 상품+batch+workspace 원자 생성/재개, 비공개 페이지 저장/명시적 적용. source 적용과 페이지 편집 사이 미공개 충돌은 차단한다. 범위 추가: server/app/core/seed.py(새 FK 정리 순서).

- 구현 완료: 상품별 현재 내용 재개·비공개 저장·명시적 적용, 18모듈 추가/숨김/문구 편집 및 기존 블록 보존, 새 상품 원자 생성/응답 유실 멱등 재시도. source 적용과 수정본 충돌 보호, 삭제된 원본 작업과 독립 편집, 본인 전용 사진 조회를 포함한다.
- 검증: 전체 `pytest -q` 281개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 API/DB의 생산자/자료 Playwright18개 통과, 사진 권한 보완 후 상품 편집·자료 적용4개 및 응답 유실 재시도2개 추가 통과. migration0011 upgrade/downgrade0010/re-upgrade 통과.
- 화면 점검: 현황의 제목/여백, 상품 목록 카드/판매페이지 진입, 환경설정 카드, 농가 프로필/출하 간격을 공통 토큰에 맞췄다. 기존4탭·URL 상품 필터/출하 상태 및 기존 송장 오류 보존 계약을 유지한다. 로그인/승인/정지 안내는 기존 공용 컴포넌트 유지, AI 채팅 동작은 수정하지 않았다.
- scan-before-commit: 새 상품 effect의 미커밋 중간 코드 제거, 잠금 대기 후 workspace 재조회, 비공개/숨김 사진 접근 보완. 최종 이슈 없음. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (detailContent: b464eba, moduleDetail: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지 유지. 추가 AI 호출/배포 없음. Agent 시간/Tokens 미측정.

## DEV-58 상세 편집 통합·항목별 ON/OFF
- 사용자 승인: 근거 검토 별도 탭/개별 확정 제거, 기존18항목별 스위치, 자동 채움·직접 편집·선택적 원문 보기.
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceDetailsEditor,ProductPageEditor}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/**, server/tests/**, scripts/e2e/**, 해당 spec/tasks 및 docs/spec/source-integration.md/docs/wiki/Source-Analysis.md.
- 결정: 유효한 단일 후보만 자동 채움(UNREVIEWED 유지), 충돌/과거/오래된/불명확한 후보 제외. 기존 저장 내용/선택 우선, OFF내용 보존. 편집값+모듈 선택 원자 저장 API와 기존 API 병행. 사진 승인/버전/명시적 공개 유지. 추가 AI 호출·머지·배포 없음.
- [x] 구현/회귀/영상/커밋 스캔

- 범위 추가: docs/spec/source-analysis.md의 예전 개별 확인 필수 문구를 승인된 자동 채움·항목별 선택 계약에 맞춘다. OFF된 오래된 사진은 비공개 보존하고 다시 켤 때 준비/연결 검증을 수행한다.

- 완료: 근거 검토 탭/개별 확정 제거, 자동 채움·18항목 스위치·직접 편집·접히는 원문, 문구/선택 원자 저장. 자동 값은 UNREVIEWED 유지, OFF 값/사진 보존, 충돌·오래된 항목은 선택적 해결. 기존 상품 편집도 같은 스위치로 통일했다.
- 검증: 전체 pytest284개 통과 후 오래된 OFF 사진 케이스 추가/보완을 포함한 최종 관련22개 통과. Ruff, 타입4 workspace, mock13개 통과. 기존 생산자·자료 Playwright18개 + 저장 실패/동일 요청 재시도1개 통과; 직접 탭 진입/분석 완료 갱신 보완 후 관련9개 재검증 통과.
- scan-before-commit: 상세 편집 탭 직접 진입 시 최신 결과를 읽지 않던 경로와 분석 중 열린 편집 화면의 초기 선택 갱신을 보완. 미저장 입력은 기존 버전에 고정해 충돌 시 보존한다. 최종 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 커밋된 구조1건 (기존 review/drafts CONFIRMED 계약: 4d7eece).
- 영상: .artifacts/in-app-v4/toggle-review/index.html. 새 상품 mock 분석의 자동 채움/OFF저장/재진입/ON복원, 기존 실제 Gemini 생성 상품의 수정/반영을 녹화. 추가 유료 AI 호출0, PR113 Draft·머지/배포 보류. Agent 시간/Tokens 미측정.

## DEV-58 분석 완료 표시·업로드 개인정보 안내 전환
- 사용자 지시: 실행별 완료 n/n 제거, 최신 분석 상태 하나만 표시. 개인정보 가리기/승인 기능 대신 업로드 전 직접 가리기 안내.
- 범위: apps/producer/src/lib/SourceWorkspace.tsx, server/app/source_analysis/{worker,service}.py, server/tests/test_source*.py, scripts/e2e/source*.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 개인정보는 업로드 전에 사용자가 직접 제거. 새로 준비된 자료는 자동 가림 없이 분석 가능 상태로 전환한다. 기존 가림본과 버전 취소/예산/권한 보호는 유지한다. 기존 대기 작업은 취소 후 새 분석으로 이어갈 수 있도록 안내한다. 추가 유료 호출·머지·배포 없음.
- [x] 구현·관련 회귀 검증

## DEV-58 두 첨부함·설명 기반 사진 배치·페이지 직접 편집
- 사용자 승인 계획: 자료/상품사진 별도 썸네일 박스, 텍스트 자료 수정, 상품사진 한 줄 설명으로만 AI 위치 분류, 완료 후 편집 진입, 실제 페이지에서 문구/사진/ON-OFF 편집.
- 범위: apps/producer/src/lib/**, packages/{ui,api}/src/**, server/app/{source_analysis,ai}/**, server/migrations/versions/**, server/tests/test_source*.py, scripts/e2e/source*.ts, 관련 spec/tasks 및 docs/spec/{source-analysis,source-integration}.md, docs/wiki/Source-Analysis.md.
- 결정: 사진 설명은 캡션/상품 사실로 사용하지 않는다. 상품사진은 OCR 없이 준비하고 위치 분류에 이미지 전송하지 않는다. 미배치 사진 수동 선택, 수동 수정 우선. 기존 초안/가림본 보존. 추가 유료 검증/배포/PR113 머지 없음.
- [x] 백엔드·직접 편집기·통합 검증·영상

- DEV-58 scope addition: docs/spec/source-editor.md; current source-editor contract supersedes the previous UI/approval flow.

- 완료: 자료/상품사진 두 박스·텍스트 수정·설명만 이용하는 사진 배치, 분석 완료 후 페이지 직접 편집, 사진 추가/제외/이동/순서 및 원래 위치의 OFF 접기. 최신 상태 하나와 업로드 전 개인정보 제거 안내로 전환. 비공개 저장/명시적 적용·버전·권한 보호 유지.
- 검증: 전체 `pytest -q` 291개, `npm run typecheck` 4 workspace, `npm run test:mock` 13개, Ruff 통과. 격리 DB/API의 source-analysis/source-editor/source-workspace-ui/product-page-workspace Playwright 11개 통과. migration0012 upgrade/downgrade0011/re-upgrade 통과.
- 영상: `.artifacts/in-app-v4/page-editor-review/index.html` (새 자료→직접 편집→저장/공개, 기존 상품 사진 추가/제외/복원/순서→저장/공개). mock 제공자 및 기존 저장 결과만 사용, 추가 유료 호출 0. 사진 설명 분류의 실제 모델 품질 평가는 별도 미실시.
- scan-before-commit: 사진 업로드 중 중복 조작·사진 풀 중복·분류 재시도 중복·버전 충돌 보호 보완 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보3건 — 지적0건 / 커밋된 구조3건 (privacy_approved: 4d7eece, modules/blocks: 839503e, SourceRun inputs 없는 실행: 388d956).
- 사용자 영상 확인 전 PR113 Draft/미머지·미배포 유지. Agent 시간/Tokens 미측정.

## DEV-58 큰 섹션 눈 아이콘·항목 제외
- 승인 계획: 큰 제목 왼쪽 눈으로 섹션 전체 제어, OFF 제목/장식 흐림, 하위 항목·사진 우측 상단 ×, 연한 placeholder. 별도 회색 조작 줄/접기 없음.
- 범위: apps/producer/src/lib/{PageCanvas,SourceDetailsEditor,ProductPageEditor}.tsx, packages/{ui,api}/src/**, server/app/source_analysis/**, server/tests/{test_source*,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, apps/producer/{spec,tasks}.md, server/{spec,tasks}.md, docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: hiddenSectionIds는 JSON 초안/API에 저장하며 기존 enabled와 분리. 숨김은 공개/활성 근거 검증에서 제외, 재활성화 시 재검증. 기존 초안은 빈 배열 기본값. ×는 비파괴 제외, 항목 추가/사진 풀에서 복원. SQL 마이그레이션 없음. PR113 Draft/미머지/미배포, 유료 AI 호출 없음.
- [x] 구현·저장/공개 회귀·타입·브라우저·커밋 스캔

- 완료: 큰 제목 바로 왼쪽 눈·OFF 제목/장식/구분선 흐림, 하위 항목/사진 ×와 복원, 연한 placeholder, 섹션 숨김/개별 제외 독립 저장·공개 필터 적용.
- 검증: server/에서 `pytest -q tests/test_source_editor.py tests/test_product_workspace.py tests/test_source_integration.py tests/test_source_analysis.py` 57개 통과(12.72초), 타입4 workspace 및 최종 생산자 타입 검사 통과, mock13개 통과. 격리 DB/API Playwright15개 최종 통과(1.0분), 360/390/430px 정렬·흐림·제외/복원·placeholder·새로고침·미리보기/공개 확인. Ruff/diff 검사 통과.
- 스캔: 여러 저장본 중 최신 hiddenSectionIds 선택 및 활성 충돌 항목 확인 경로 보완. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보2건 — 지적0건 / 커밋된 구조2건 (Draft snapshot:4d7eece, PageSnapshot:839503e).
- 검증 과정의 루트 cwd 실행은 전처리 subprocess 환경 때문에 실패하여 server/에서 정상 재검증. 브라우저 fixture 모델 등록 및 실제 사진 선택자를 수정했다. 화면 캡처 `.artifacts/section-editor-{360,390,430}.png` 확인. 기존 영상은 이번 조작 변경 전 기록으로 남김. 로컬 API 재시작만 수행, 기존 데이터 재시드/AI 호출 없음. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.

## DEV-58 빈 항목 직접 입력·오버레이 정렬
- 사용자 승인: 항목 추가 버튼/목록 제거. 모든 빈 항목은 제자리의 연한 `내용을 입력해주세요`, 빈 섹션은 제목/장식/구분선도 흐림. 내용 입력/사진 추가 시 자동 반영, 빈 내용은 공개 제외. 눈은 섹션 머리 맨 오른쪽으로 이동.
- 범위: apps/producer/src/lib/{PageCanvas,SourceAttachments,SourceDetailsEditor}.tsx, packages/ui/src/ModuleStory.tsx, server/app/source_analysis/{service,workspace}.py, server/tests/{test_source_editor,test_product_workspace}.py, scripts/e2e/{source-analysis,source-editor,product-page-workspace}.spec.ts, 관련 spec/tasks 및 docs/spec/source-editor.md, docs/wiki/Source-Analysis.md.
- 결정: × 제외는 값 보존/흐림, 클릭 편집으로 다시 반영. 빈 항목 × 숨김. 숨김 눈은 수동 상태 유지. 첨부 텍스트/항목 ×를 첫 줄에 겹쳐 배치하고 오른쪽 공간만 확보. API/DB 필드 추가 없음. 격리 mock 영상2개 갱신, PR113 머지·배포 없음.
- [x] 구현·검증·영상·커밋 스캔

- 검증 완료: 타입4 workspace, mock13개, Ruff/diff 검사 통과. server/에서 관련 source-editor/product-workspace/source-integration/source-analysis pytest58개(13.86초), 격리 DB/API Playwright15개(1.1분) 통과. 빈 항목 입력/사진 활성화, 공백 제외, 빈 섹션 제목 흐림, 오른쪽 눈/× 정렬, 제외 후 클릭 복원·저장/공개 확인.
- scan-before-commit: 호출부·전체 diff·빈 상태/충돌 경로 검토 후 이슈 없음. 커밋 안전. 레거시 호환 점검: 신규 후보0건 — 지적0건 / 커밋된 구조0건. 기존 hiddenSectionIds 기본값은 기존 커밋의 변경 없는 동작.
- 영상2개 최신 녹화: `.artifacts/in-app-v4/page-editor-review/index.html`. 항목 추가 없이 직접 입력, 빈 섹션 흐림/오른쪽 눈/× 제외·클릭 복원, 사진 추가/제외/순서 및 저장/공개. 격리 mock만 사용, 추가 유료 호출0. 로컬 API 갱신, 실제 데모 데이터 유지. PR113 Draft/미머지/미배포. Agent 시간/Tokens 미측정.


## DEV-58 기본 정보 입력과 빈 항목 안내 (AC-SRC-11, FEAT-03/04/07)
- 범위: apps/producer/src/lib/{SourceWorkspace,SourceBasicInfo,PageCanvas}.tsx, packages/api/src/sourceAnalysis.ts, server/app/source_analysis/{schemas,service,router,editor}.py, server/tests/test_source*.py, scripts/e2e/source*.spec.ts, 관련 spec/tasks/wiki 및 로컬 검토 영상.
- 결정: 품종 필수, 사이즈·예상 당도 선택. 대상별 basicInfo JSON 저장, 기존 상품 기본값 복사, 분석 전 저장/필수 검증. 직접 편집 CONFIRMED/EXCLUDED > 기본 정보 > 추출 결과. 실측값으로 변환하지 않음. 기본 정보 저장만으로 공개 상품 변경 없음.
- 결정: 기본 정보만 변경할 때 추출 근거는 무효화하지 않으며 reviewVersion을 증가시켜 오래된 편집 저장을 막는다. 기본 정보에서 만든 미확정 제안은 변경 시 새로 만들고 직접 편집은 유지한다.
- [x] 구현·API/mock 타입·관련 문서 갱신
- [x] backend/typecheck/mock/브라우저 검증 및 headless 영상 갱신
- [x] 커밋 전 스캔, PR #113 갱신 (미머지)

- 검증: server/에서 관련 pytest 61개 통과(15.39초). npm run typecheck 4 workspace, npm run test:mock 13개, 격리 DB/API Playwright 16개(1.1분), 변경 Python Ruff 및 git diff --check 통과.
- 스캔: 기본 정보 우선순위가 오래된 사진 검증을 생략하던 경로를 보완하고, 화면 전환 후 늦은 응답/flush 참조 수명을 수정했다. 수정 후 관련 검증 통과. 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 2건 — 지적 0건 / 커밋된 구조 2건 (SourceTarget:388d956, Batch.targets:4d7eece).
- 화면 확인: .artifacts/basic-info-390.png. 기존 영상 페이지 .artifacts/in-app-v4/page-editor-review/index.html에 기본 정보 입력부터 분석·편집·저장·공개 영상(32.68초)과 기존 상품 사진 편집(12.4초)을 갱신하고 재생 확인. headless 브라우저 종료, 추가 유료 호출 0. 기존 실제 데모 DB를 보존해 로컬 API만 갱신했다.
- PR113 Draft/미머지/미배포 유지. Agent 시간/Tokens 미측정.


## DEV-58 카드 직접 입력·대표사진 필수 (FEAT-03/04/07, AC-SRC-11)
- 범위: apps/producer/src/lib/{SourceAttachments,SourceWorkspace,SourceBasicInfo,SourceDetailsEditor,ProductPageEditor,PageCanvas}.tsx, packages/api/src/{sourceAnalysis,productWorkspace}.ts, packages/ui/src/{Icon,content}.tsx, server/app/source_analysis/{representative,service,schemas,router,publish,workspace}.py, 관련 source/workspace pytest 및 scripts/e2e 테스트, 관련 spec/tasks/wiki, 로컬 검토 영상.
- 결정: 텍스트 추가 즉시 첨부함에 카드·포커스 생성. 카드 내 편집, blur/분석 전 저장, 빈 신규 카드는 업로드하지 않음. 저장 실패 입력 유지. 기존 텍스트를 비우면 입력 또는 × 삭제 안내로 분석 차단.
- 결정: 첫 성공 상품사진을 상품별 대표로 자동 지정, × 왼쪽 별로 변경. 대표 삭제 시 다음 첫 사진으로 대체, 마지막 삭제 가능하나 새 분석/공개에 대표사진 필수. 자료 이미지는 불가. 대상/초안 JSON에 대표 ID, 기존 상품 작업 JSON에 대표 URI를 저장하며 공개 반영 시 product.photos 첫 사진과 동기화. 섹션 숨김과 별개 대표 커버 유지.
- 결정: 원본 사진 공개 경로는 상세 사진뿐 아니라 현재 상품 대표사진으로 참조되는지도 검사한다. 공용 Photo의 서버 상대 미디어 경로를 API 주소로 해석해 앱 간 동일하게 표시한다.
- [x] 구현 및 스펙 반영
- [x] backend/typecheck/mock/browser 검증·영상 갱신
- [x] 커밋 스캔; PR113/Linear에 이 기록 반영, Draft·미머지 유지

- 검증: server/에서 `DATABASE_URL=… .venv/bin/pytest -q --tb=short tests/test_source_*.py tests/test_product_workspace.py` 99 passed. `npm run typecheck` 4 workspace, `npm run test:mock` 13 passed. 격리 API/DB Playwright 4 spec 17 passed. Ruff 및 git diff --check 통과.
- 스캔: 공개 대표사진 접근 판정, 자동 지정 전 DB flush, 카드 sibling key 중복, 신규 카드 삭제/blur 경합 보완. 미해결 이슈 없음. 커밋 안전. 레거시 호환 점검: 후보 3건 — 지적 0건 / 커밋된 구조 3건 (SourceTarget:388d956, Batch.targets:4d7eece, PageSnapshot:839503e).
- 화면: 기존 영상 페이지 `.artifacts/in-app-v4/page-editor-review/index.html` 갱신, 36.24초/12.28초 재생 확인. 카드 입력/대표사진 캡처 포함. headless 브라우저 종료, 추가 유료 호출 0. 실제 데모 DB 보존 후 로컬 API 갱신. Agent 시간/Tokens 미측정.

## DEV-58 PR113 최종 머지 리뷰 (FEAT-03/04/07, AC-SRC-9/11)
- 범위: server/app/source_analysis/workspace.py, server/tests/test_product_workspace.py, apps/producer/src/lib/ProductPageEditor.tsx, packages/api/src/productWorkspace.ts, scripts/e2e/product-page-workspace.spec.ts, 관련 spec/tasks/wiki.
- 결정: main에 없는 PageSnapshot 중간 형식 보충 분기 제거. 현재 대표사진 필드를 명시하며 비공개 저장/명시적 공개 및 권한 검사를 회귀 검증한다. 연속 사진 상태 갱신은 함수형 처리한다.
- [x] 구현·검증·리뷰 완료. 최신 CI 확인 뒤 PR113 머지 결과는 PR/Linear에 기록.

- 검증: 전체 pytest 300 passed(37.17초), typecheck 4 workspace 통과, Ruff 전체 통과, 격리 Playwright 4 spec 18 passed. 변경하지 않은 mock 계약 13 passed 결과 재사용. 마이그레이션 0008→0009→0010→0011→0012 단일 체인 확인.
- 리뷰 수정: 첫 사진 업로드의 대표 지정 덮어쓰기 수정, PageSnapshot 브랜치 전용 호환 제거, 현재 스펙 우선순위/마이그레이션 설명 정정. 새 첫 업로드·저장·재접속 및 누락/다른 상품 사진/null 대표 계약 회귀 테스트 추가. 커밋 전 스캔 이슈 없음, 신규 호환 후보 0건.
- 머지 스캔: 후보 7건 — 지적 1건(수정 완료) / 정당 6건. ProductWorkspace.snapshot은 origin/main 이력 0건(브랜치839503e→b36fe10)이라 제거. Batch.targets·Draft.snapshot·Run.inputs·Page.spans·Asset.privacy_approved는 base4d7eece, Product.detail_content는 baseb464eba에 존재해 유지. 새 사진 저장 이후 공개 참조·소유권·버전·예약/취소 경로 검토.
- 사용자 승인: Draft 해제·리뷰 수정 후 머지 명시 요청. 기존 사람 승인 병목 없이 각자 충돌 해소 후 머지하는 팀 방침에 따라 진행. Agent 시간/Tokens 미측정, 추가 유료 AI 호출 0.

## DEV-58 공개자료 후속 안정화 (FEAT-03/04/07, AC-SRC-4/5/9/10/11)
- 이슈: https://linear.app/sswp6/issue/DEV-58
- 브랜치: jinumeral/dev-58-dev-integrate-budgeted-openrouter-gemini-and-synthetic-pre
- 상태: 진행 중. 2026-10-17 사용자 계획 승인.
- 목표: 정상 문구 가림, 후보 단위 오류의 전체 전파, 자료 연락처 자동 반영을 수정한다. 숫자 OCR 한계는 별도 실험으로 측정한다.
- 범위: server/app/source_analysis/**, server/app/ai/source_analysis.py, server/migrations/versions/0013_source_diagnostics.py, server/tests/test_source*.py, packages/api/src/sourceAnalysis.ts, apps/producer/src/lib/SourceWorkspace.tsx, scripts/e2e/source-analysis.spec.ts, 관련 spec/tasks/wiki/validation 및 .artifacts 후속 평가.
- 비범위: AI CS, 운영 OCR 모델/크롭 변경, 배포, 농가 인수.
- 결정: 기존 엄격 검증은 유지하고 후보별 통과만 저장. Item PARTIAL 및 Run PARTIAL, 채택/거절 개수와 비공개 JSON 진단. 전부 거절은 FAILED. 재시도는 명시적으로만 하며 기존 후보 중복/생산자 편집 덮어쓰기 방지.
- 결정: 개인정보 라벨은 항목 경계에서 인식하고 '대표 특산물' 같은 설명 보존. 자료 전화/이메일은 자동 추출 제외, 생산자 직접 편집 허용. 처리 버전 갱신.
- 결정: 원본/첫 평가를 보존하고 동일 모델 숫자 크롭 비교와 3자료 재검증은 기존 비용 포함 $0.50 이내. 동일 자료 재사용 결과는 독립 평가로 표시하지 않음.
- [x] 구현·마이그레이션·제품 스펙/영문 위키 동기화
- [x] 무료 서버/앱/브라우저 회귀 및 마이그레이션 검증
- [x] 실제 자료 재검증·숫자 실험·보고서/영상
- [x] 커밋/브랜치 스캔·PR·Linear 기록 (최신 원격 CI 결과는 PR에 기록)
- 기록: 원격 main d4efd6d, migration head0012 확인. 기존 테스트/데모 DB 보존.

- 구현: 후보별 검증, PARTIAL 종료/명시 재시도, 동일 후보 ID 재사용, 재응답에서 누락된 확정 후보·생산자 편집 보존. source-parser-v3/source-v6-candidate-validation, migration0013.
- 무료 검증: 최종 전체 pytest324(37.93초), 최종 recovery24 통과. 타입4 workspace, mock13, 웹export2, migration head/check→0012→head/check 통과. 관련 브라우저18개 중17개 통과 후 바뀐 source-analysis3개 재실행 전부 통과(안내 문자열 선택자와 재시도 후 최신 초안 재저장 순서 수정). 기존 라이브 데모 DB/8000·8081·8082 보존.
- 실제 회귀: 기존 정답17그룹/원본 유지, 3자료 각1회. 정밀도17/18, 완전 회수14/17, 엄격 필드/값7/18·7/17. 동일 자료 재사용이므로 일반 정확도/수정 인과효과로 해석하지 않는다. 후보 충돌로 편집란이 빈 경우는 직접 보완했으며 자동 점수에 포함하지 않는다.
- 숫자 실험: 1000의 두 위치 모두 기존/문맥2배 확대가 100으로 오독. 대조군5kg(5–6과)는 양쪽 통과. 운영 OCR/크롭 변경하지 않음.
- 비용: 3자료 재검증 $0.027342 + 숫자6회 $0.007345 = 추가 $0.034687. 기존 포함 $0.060098/36호출, 미정산0, 예산$0.50 이내. 자동 재호출 없음.
- 산출물: `.artifacts/source-recovery-1017/index.html` 및 3개 편집/저장/공개 영상. 실제 자료3개 로컬 공개까지 PASS(명시적 수동 수정 후). 원본 첫 평가 보존. 배포/농가 인수 미실행. Agent 시간/Tokens 미측정.
- 잔여: 숫자 원문 검토, 같은 필드 후보 충돌 수동 조정, PDF13% 할인 누락, 농가 인수. DEV-58 전체 Done 아님.
- 커밋/브랜치 스캔: 전체 diff·새 파일·호출부·취소/비공개/예산/재시도 경로 확인. 확정 후보가 재응답에서 누락되는 사례도 추가 검증. 이슈 없음. 레거시 호환 점검: 후보1건 — 지적0건 / 정당1건(기존 source_items 진단 빈 객체 backfill, origin/main 4d7eece의 Item). 브랜치 중간 형식 호환 추가 없음.
- PR130 ready for review, ce38486 구현 push 및 AI 리뷰 코멘트 완료. Linear DEV-58에 구현/비용/실험/잔여 항목 반영, In Progress 유지. 최신 head CI 완료 여부는 PR 체크를 참조. 머지/배포 없음.

## DEV-65 Railway 자동 배포: GitHub Actions에서 railway up
- 이슈: [DEV-65](https://linear.app/sswp6/issue/DEV-65) (GitHub [#129](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/129))
- 브랜치: `nemodleo/dev-65-dev-railway-자동-배포-github-actions에서-railway-up-github`
- 기능·인수 조건: 배포(DEV-64 후속). 제품 FEAT·AC 없음
- 상태: 리뷰 중
- 목표: Railway GitHub App을 조직 레포에 못 붙이는 상황에서 main 머지만으로 서버가 배포되게 한다.
- 범위(수정 허용 경로): `.github/workflows/deploy-railway.yml`(새 파일), `README.md` Deployment 절, `docs/spec/tech-design/stack.md` CI/CD 행, `server/tasks.md`. 서버 코드·`ci.yml` 변경 없음
- 비범위: Vercel 앱 자동 배포(dist 업로드 방식 유지, 수동), Railway 변수 추가(카카오·PortOne은 각 PR 머지 뒤 사람이), 운영 플래그 전환
- 결정 사항:
  - 10/18 배포 트리거는 `push: main` + `paths: server/**, 워크플로 자신` + `workflow_dispatch`. 다른 폴더 변경은 서버를 다시 올리지 않는다.
  - 10/18 `concurrency: railway-deploy`, 취소 없음(배포는 순서대로). 시크릿 `RAILWAY_TOKEN`이 비어 있으면 첫 단계에서 명확한 오류로 실패.
  - 10/18 Railway CLI는 npm `@railway/cli@4`(로컬에서 검증한 4.x 계열). `railway up ./server --path-as-root --service farmclub-api --environment production --ci`로 2026-10-17 수동 배포와 같은 명령. 끝나면 `/health`를 최대 3분 폴링.
  - 10/18 README의 Vercel 절은 사실(GitHub 미연결, dist 업로드, EXPO_PUBLIC_* 빌드 시 고정)에 맞게 고침.
- 작업: [x] 워크플로 [x] README·stack.md [x] actionlint
- 검증: `actionlint .github/workflows/deploy-railway.yml` 통과. 실제 실행은 `RAILWAY_TOKEN` 등록 뒤 Actions에서 1회 수동 실행으로 확인해야 함(미실행).

## DEV-66 서버 배포를 main CI 성공 뒤에만 실행
- 이슈: [DEV-66](https://linear.app/sswp6/issue/DEV-66) (GitHub [#133](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/133))
- 브랜치: `nemodleo/dev-66-dev-서버-배포를-main-ci-성공-뒤에만-실행`
- 기능·인수 조건: 배포(DEV-65 후속). 제품 FEAT·AC 없음
- 상태: 리뷰 중
- 목표: main 테스트가 실패한 커밋이 배포되지 않게 한다(main 브랜치 보호가 꺼져 있어 CI 실패 PR도 머지 가능).
- 범위(수정 허용 경로): `.github/workflows/deploy-railway.yml`, `README.md` Automatic deploys 절, `docs/spec/tech-design/stack.md` CI/CD 행, `server/tasks.md`. `ci.yml`·서버 코드 변경 없음
- 결정 사항:
  - 10/18 트리거를 `push`에서 `workflow_run`(workflows: CI, completed, branches: main)으로 바꾸고, `conclusion == success`이고 `event == push`일 때만 실행. PR에서 돈 CI로는 배포하지 않는다.
  - 10/18 CI가 검사한 `head_sha`를 체크아웃해 올린다. 그사이 main이 더 나가도 검증 안 된 커밋은 올리지 않는다.
  - 10/18 변경 판단은 `git diff HEAD~1 HEAD`(squash 머지 규칙상 커밋 하나 = PR 하나). `server/` 또는 이 워크플로가 바뀌었을 때만 배포하고, 아니면 건너뛰고 성공. `workflow_run`에는 paths 필터가 없어서 직접 판단한다.
  - 10/18 수동 실행(`workflow_dispatch`)은 변경 여부와 상관없이 현재 main을 올린다(변수 변경 뒤 재배포용).
  - 10/18 `actions/checkout`·`setup-node`는 `ci.yml`과 같은 v7로 맞춤.
- 작업: [x] 워크플로 트리거·변경 판단 [x] README·stack.md [x] actionlint
- 검증: `actionlint .github/workflows/deploy-railway.yml` 통과. 실제 흐름(머지 → CI 성공 → 배포)은 머지 뒤 1회 실행으로 확인 예정.

## DEV-47 AI가 근거 없음을 답으로 내면 전달로 바꾸기
- 이슈: [DEV-47](https://linear.app/sswp6/issue/DEV-47) (GitHub [#92](https://github.com/snuhcs-course/swpp-2026-project-team-06/issues/92)) — 내부 테스트 A-10 FAIL
- 브랜치: `zahragholami/dev-47-ai-non-answer-handoff`
- 기능·인수 조건: FEAT-13 정상 흐름 3(근거가 없으면 전달 후 needsReply), 예외 흐름 E1(근거 검증 실패 → 전달), C06
- 상태: 진행 중
- 예상: 1시간

### 목표
Claude가 `action=ANSWER`로 "정보가 없어 답할 수 없어요, 판매자에게 문의하세요" 같은 비답변을 내면 지금은 AI 답으로 저장되어 생산자 needsReply 목록에 들어가지 않는다. 이런 답을 전달(HANDOFF)로 처리한다.

### 재현 (10/18, Railway 실제 Claude)
- `POST /api/farms/me/ai-settings/preview`(u-kang, productId p-house) "원산지가 어디예요?" → 3회 모두 `ANSWER` "제공된 정보에 원산지가 없어 … 판매자에게 직접 문의해 주시기 바랍니다", sourceRefs `["product:p-house"]`.
- 근거에 원산지가 없으므로 FEAT-13 정상 흐름 3에 따라 전달되어야 한다.

### 범위 (수정 허용 경로)
- `server/app/ai/grounding.py`, `server/app/ai/service.py`(프롬프트·비답변 처리)
- `server/tests/test_ai_service.py`, `server/tests/test_messaging.py`
- `server/app/ai/spec.md`(구현 결정 한 줄), `server/tasks.md`

### 비범위 (건드리지 않음)
- 규칙 답(`_rule_answer`), 전달 주제 판별, messaging 저장 흐름, 앱 화면
- 제품 스펙 문서: 동작은 FEAT-13에 이미 정해져 있고 구현이 어긋난 버그라 바꾸지 않는다

### 결정 사항
- 10/18 프롬프트만 고치면 모델 출력이 확률적이라 다시 샐 수 있다. 저장 전 검증(`validate_model_answer`)처럼 결정적인 검사를 둔다: 답이 근거·정보 없음을 말하거나 판매자·농가 문의로 돌리면 HANDOFF.
- 10/18 일부만 답하고 나머지는 "근거에 없다"고 하는 답도 전달한다. 소비자 질문을 생산자가 확인하는 쪽이 FEAT-13 원칙(추측하지 않고 전달)에 맞다.
- 10/18 프롬프트에도 "근거에 없다는 답은 ANSWER가 아니라 HANDOFF"를 적어 모델이 처음부터 전달을 고르게 한다.

### 작업
- [x] 비답변 판별(`grounding.is_non_answer`)과 `_claude_answer`의 HANDOFF 처리
- [x] 프롬프트 보강
- [x] 회귀 테스트: 실제 Railway 출력 3개 판별, 정상 답 오탐 없음, 가짜 Claude로 `_claude_answer` HANDOFF, 채팅 전송 시 FORWARDED·needsReply
- [ ] pytest·Ruff, 관련 Playwright(conversation-ui) 통과

### 완료 조건
- [x] 회귀 테스트 포함 pytest·Ruff 통과
- [ ] 머지 후 Railway에서 같은 질문이 HANDOFF인지 확인

### 기록
- 10/18 회귀 테스트 3개를 먼저 추가해 수정 전 실패를 확인했다(판별 함수 없음, `_claude_answer`가 ANSWER 반환, 채팅 답 `handoffStatus` None). 채팅 테스트는 처음에 f-kang 근거가 비어 가짜 Claude가 예외를 내고 기존 실패 경로로 전달되어 버그 없이도 통과했다. f-kang AI 설정에 FAQ를 넣고 Claude 호출 여부를 확인하도록 고쳤다.
- 10/18 수정 후 pytest 327개 통과(3개 추가), Ruff 통과.
- 10/18 AI 1차 리뷰: '정보상 추가 비용 없이'·'농장에서 확인한 당도'가 비답변으로 오탐되어 정규식을 좁혔다(명사+조사 바로 뒤 '없'(없이 제외), '판매자·농가에게/께 문의·확인'만). 두 문장을 오탐 방지 테스트에 추가. pytest 327 통과, Ruff 통과.

## DEV-69 farmclub.kr 도메인 연결(Cloudflare DNS)과 서브도메인 설계
- 이슈: [DEV-69](https://linear.app/sswp6/issue/DEV-69)
- 브랜치: `nemodleo/dev-69-dev-farmclubkr-도메인-연결cloudflare-dns과-서브도메인`
- 기능·인수 조건: FEAT-19 공유 링크(AC-19-1), 배포. 결정은 [ADR 0012](../docs/spec/tech-design/adr/0012-domains-cloudflare.md)
- 상태: 리뷰 중. **도메인이 실제로 연결된 뒤 머지**(ADR 0012 전환 순서 4번)
- 목표: 호스팅 기본 주소를 `farmclub.kr`·`farm.farmclub.kr`·`api.farmclub.kr`로 바꾸고, 공유 링크를 `farmclub.kr/s/farms/<id>`로 낸다.
- 범위(수정 허용 경로): `docs/spec/tech-design/adr/0012-*`, `docs/spec/tech-design/stack.md`, `docs/wiki/Design-Documentation.md`, `README.md` 배포 절, `server/.env.example`, `server/app/core/config.py`, `server/app/farms/share.py`·`router.py`, `server/tests/test_farm_share.py`, `apps/consumer/vercel.json`, `apps/*/public/index.html`, 앱 기본 URL 상수(`apps/consumer/src/app/(tabs)/me/index.tsx`, `apps/producer/src/app/(tabs)/farm/index.tsx`), `packages/api/src/mock/farms.ts`, `.github/workflows/deploy-railway.yml`·`deploy-vercel.yml`
- 비범위: 도메인 구매, Cloudflare·Vercel·Railway·카카오·PortOne 콘솔 설정(사람), `admin`·`dev`·`staging` 환경 구성, 운영 `/docs` 닫기(ADR 0008)
- 결정 사항:
  - 10/18 `.kr`은 Cloudflare Registrar 지원 TLD가 아니고 KISA는 직접 팔지 않음 → 인증 등록대행자 호스팅케이알(hosting.kr)에서 구매(사용자 결정) + 네임서버만 Cloudflare.
  - 10/18 공유 링크는 소비자 앱 `vercel.json` rewrite `/s/:path*` → `https://api.farmclub.kr/s/:path*`(SPA 규칙보다 앞). 서버는 `SHARE_BASE_URL`이 있으면 `<base>/s/farms/<id>`, 없으면 지금처럼 `url_for`. 기본값 빈 문자열이라 로컬·테스트 동작은 그대로.
  - 10/18 `admin`·`dev`·`staging`은 대상이 없어 DNS 레코드를 만들지 않음(서브도메인 탈취 방지). 운영자는 `api.farmclub.kr/docs`.
  - 10/18 Vercel·Railway 레코드는 DNS only, SSL Full(strict). 메일 미사용: null MX, `v=spf1 -all`, DMARC reject.
  - 10/18 사용자 결정으로 Vercel 레코드(`@`·`www`·`farm`)는 Cloudflare 프록시 켬으로 바꿈. SSL Full(strict) 필수, Bot Fight Mode·Rocket Loader 끔. `api`는 Railway 인증서 발급 전까지 DNS only. ADR 0012·README 반영.
  - 10/18 `README.md`의 2026-10-17 Railway 생성 기록 문장은 사실 기록이라 옛 주소를 그대로 둠.
- 작업: [x] ADR 0012 [x] stack.md·wiki·README [x] 공유 주소 설정·테스트 [x] 하드코딩 주소 교체 [ ] 사람: 도메인 연결 후 머지
- 검증: 아래 기록 참고.
- 기록:
  - 10/18 `server/`에서 `uv sync --frozen` 후 `uv run pytest -q` 325 통과(새 테스트 `test_AC_19_1_share_url_uses_public_domain_when_configured` 포함), `ruff check app tests` 통과.
  - 10/18 루트 `npm ci` 후 `npm run typecheck` 통과, `npm run test:mock` 13 통과. `actionlint`(두 배포 워크플로) 통과.
  - 10/18 실제 DNS·Vercel rewrite·카톡 미리보기는 도메인이 없어 확인하지 못함. 전환 순서 5~6번에서 사람이 확인.
