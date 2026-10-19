# 운영에서 자료 분석 켜기·끄기 (DEV-86)

운영(Railway 프로젝트 `farmclub`, environment `production`)에서 자료 분석(DEV-56/57/58, FEAT-03/04/07)을 켜는 순서다.
제품 동작은 `docs/spec/source-integration.md`, 로컬 실행은 같은 폴더 `README.md`를 따른다.
변수 값(키·토큰)은 Railway와 비밀번호 관리자에만 둔다. 레포·이슈·PR·채팅에 붙여 넣지 않는다.

## 구성

| 서비스 | 이미지 | 하는 일 |
| -- | -- | -- |
| `farmclub-api` (기존) | `server/Dockerfile` (OCR 없음, 변경 없음) | 업로드·검토·저장 API, 기동 때 마이그레이션 |
| `farmclub-source-worker` (새로) | `server/Dockerfile.worker` (OCR extra + 해시 검증된 OCR 모델 포함) | 대기열 처리: 전처리·OCR·가림·OpenRouter 호출, 24시간 지난 고아 파일 정리 |

- 둘은 **같은 PostgreSQL과 같은 비공개 R2 버킷**을 써야 한다. 한쪽만 다르면 worker가 업로드 원본을 찾지 못한다.
- OCR 모델은 worker 이미지 빌드 때 받고 해시를 검증한다(`SOURCE_OCR_MODEL_DIR`·`SOURCE_OCR_MODEL_SHA256`은 이미지에 들어 있어 따로 넣지 않는다).
- API가 켜져 있어도 worker가 없으면 분석이 `QUEUED`에서 멈춘다. 반대로 worker는 `SOURCE_ANALYSIS_ENABLED=true`가 아니면 바로 종료한다.
- 일부 변수만 넣으면 API가 기동하지 못한다(`app/core/config.py _source_settings`). 아래 4단계처럼 **한 번에** 넣는다.

## 0. 미리 준비

- [ ] **R2 버킷**: 비공개 버킷 `farmclub-source-private`(공개 접근·r2.dev URL 끔)과 이 버킷에만 Object Read & Write 권한이 있는 API 토큰. 이 버킷은 자료 분석 전용으로 둔다. worker가 24시간 지난 키 중 DB에서 쓰지 않는 것을 지운다.
- [ ] **OpenRouter 키**: https://openrouter.ai/settings/keys → Create Key.
  - 이름 예: `farmclub-source-production`.
  - **Credit limit**을 꼭 건다(예: $5~10). 서버도 DB 원장으로 누적 `SOURCE_BUDGET_USD`(기본 $5, 최대 $100)를 넘으면 `BUDGET_EXCEEDED`로 멈추지만, 키 한도가 마지막 안전장치다.
  - 계정에 크레딧이 있어야 한다(Credits 페이지). 모델은 `google/gemini-3-flash-preview` 하나만 쓴다(OCR·추출 모두).
  - 키는 만들 때 한 번만 보인다. 바로 Railway 변수와 비밀번호 관리자에만 넣는다.
- [ ] 로컬 확인(선택): 같은 R2 값으로 로컬에서 분석 1건을 돌려 본다(README "로컬 실행", `SOURCE_STORAGE=r2`).

## 1. worker 서비스 만들기 (아직 배포하지 않음)

1. Railway → 프로젝트 `farmclub` → **+ Create → Empty Service**, 이름 `farmclub-source-worker`.
2. 서비스 **Settings → Config-as-code → Railway Config File** 경로를 `/railway.worker.json`으로 지정한다.
   (배포 워크플로가 `server/`를 루트로 올리므로 앞에 `/server`를 붙이지 않는다. 지정하지 않으면 API 설정 `railway.json`을 읽어 `/health` 헬스체크에서 실패한다.)
3. 공개 도메인은 만들지 않는다(HTTP를 열지 않는다).
4. 메모리: OCR 파서가 자료 한 건에 최대 1GB(`SOURCE_PARSER_MEMORY_MB`)까지 쓰고 worker는 동시에 2건을 처리한다. 서비스 메모리 한도를 2.5GB 이상으로 둔다.

## 2. 배포 워크플로에 worker 알리기

GitHub → 레포 **Settings → Secrets and variables → Actions → Variables** → `RAILWAY_WORKER_SERVICE` = `farmclub-source-worker`.
이 변수가 있을 때만 `deploy-railway.yml`이 API 배포·`/health` 확인 뒤 worker를 올린다. 기존 `RAILWAY_TOKEN`(프로젝트 토큰)을 그대로 쓴다.

## 3. API 서비스 변수 (`farmclub-api`)

**Variables → RAW Editor**에 아래를 한 번에 붙여 넣고 값을 채운 뒤 저장하고, 위에 뜨는 **Deploy**(staged changes 적용)를 한 번만 누른다.
값 하나라도 비면 API가 기동하지 못하고 이전 배포가 계속 떠 있다(배포 로그에 `OpenRouter key and budget-qualified model are required` 또는 `Private R2 source storage is not configured`).

```text
SOURCE_ANALYSIS_ENABLED=true
SOURCE_ANALYSIS_PROVIDER=openrouter
SOURCE_ANALYSIS_MODEL=google/gemini-3-flash-preview
OPENROUTER_API_KEY=<OpenRouter 키>
SOURCE_STORAGE=r2
SOURCE_R2_ENDPOINT=https://<Cloudflare 계정 ID>.r2.cloudflarestorage.com
SOURCE_R2_BUCKET=farmclub-source-private
SOURCE_R2_ACCESS_KEY=<R2 토큰 Access Key ID>
SOURCE_R2_SECRET_KEY=<R2 토큰 Secret Access Key>
SOURCE_BUDGET_USD=5
```

- `SOURCE_R2_*` 값은 로컬 `server/.env`에 넣어 둔 것과 같다. 엔드포인트에 버킷 이름을 붙이지 않는다.
- 기존 `APP_ENV=production`, `JWT_SECRET`, `DATABASE_URL`은 그대로 둔다. `SOURCE_EVALUATION`은 넣지 않는다(평가 전용).

## 4. worker 서비스 변수 (`farmclub-source-worker`)

API 값과 어긋나지 않게 API 서비스 변수를 참조한다. **RAW Editor**에 그대로 붙여 넣는다.

```text
APP_ENV=${{farmclub-api.APP_ENV}}
JWT_SECRET=${{farmclub-api.JWT_SECRET}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
SOURCE_ANALYSIS_ENABLED=${{farmclub-api.SOURCE_ANALYSIS_ENABLED}}
SOURCE_ANALYSIS_PROVIDER=${{farmclub-api.SOURCE_ANALYSIS_PROVIDER}}
SOURCE_ANALYSIS_MODEL=${{farmclub-api.SOURCE_ANALYSIS_MODEL}}
OPENROUTER_API_KEY=${{farmclub-api.OPENROUTER_API_KEY}}
SOURCE_STORAGE=${{farmclub-api.SOURCE_STORAGE}}
SOURCE_R2_ENDPOINT=${{farmclub-api.SOURCE_R2_ENDPOINT}}
SOURCE_R2_BUCKET=${{farmclub-api.SOURCE_R2_BUCKET}}
SOURCE_R2_ACCESS_KEY=${{farmclub-api.SOURCE_R2_ACCESS_KEY}}
SOURCE_R2_SECRET_KEY=${{farmclub-api.SOURCE_R2_SECRET_KEY}}
SOURCE_BUDGET_USD=${{farmclub-api.SOURCE_BUDGET_USD}}
```

- `DATABASE_URL`은 API 서비스 Variables에서 `DATABASE_URL`이 참조하는 원본과 같게 한다(DB 서비스 이름이 `Postgres`가 아니면 그 이름으로 바꾼다).
- worker는 `JWT_SECRET`을 쓰지 않지만, `APP_ENV=production`에서는 설정 검증이 이 값을 요구한다.

## 5. worker 배포

- 이 PR이 main에 머지된 뒤라면: GitHub Actions → **Deploy server to Railway → Run workflow**(브랜치 `main`). API를 다시 올리고 `/health` 확인 뒤 worker를 올린다.
- 첫 빌드는 OCR 의존성과 모델(약 20MB) 때문에 API보다 오래 걸린다. 빌드 로그에 `OCR model manifest hash mismatch`가 나오면 모델 파일이나 manifest가 바뀐 것이니 배포하지 않고 원인을 확인한다.
- worker 배포 로그에 오류 없이 프로세스가 떠 있으면 된다(대기 중에는 로그가 거의 없다).

## 6. 켠 뒤 확인

1. `curl -s https://api.farmclub.kr/api/source-analysis/config` → `{"enabled":true}`.
2. `curl -s https://api.farmclub.kr/health` → `{"status":"ok"}`.
3. 승인된 테스트 농가로 https://farm.farmclub.kr 로그인 → **새 상품** → 이제 `/products/manual`이 아니라 자료 작업 화면이 열린다.
4. 짧은 **텍스트 자료 1건**(예: 상품명·산지·보관법 세 줄)을 넣고 분석한다. 몇십 초 안에 후보가 나오고 근거가 원문과 맞는지 본다. 비용은 한 건에 1센트 안팎이다.
5. (선택) 개인정보가 없는 이미지 1건: worker의 RapidOCR가 방향·가림을 준비하고 Gemini OCR·추출이 이어진다. 후보에 이미지 글자가 나오면 OCR까지 동작한 것이다. 몇 센트 안팎이다.
6. OpenRouter **Activity**에서 호출이 `google/gemini-3-flash-preview`로 찍혔는지, R2 버킷에 객체가 생겼는지 확인한다.
7. 테스트 상품·자료는 저장하지 않고 정리한다(자료 작업 삭제 → worker가 파일 정리).

분석이 `QUEUED`에서 멈추면 worker가 안 떠 있거나 DB·R2가 API와 다른 것이다. `BUDGET_EXCEEDED`는 누적 예산 도달, `OCR_NOT_CONFIGURED`/`OCR_MODEL_MISMATCH`는 worker가 아니라 API 이미지로 떠 있거나 모델이 맞지 않는 것이다.

## 7. 롤백 (끄기)

1. `farmclub-api` → Variables → `SOURCE_ANALYSIS_ENABLED`를 `false`로 바꾸고 Deploy. 생산자 앱은 다시 기존 문구/직접 입력·상세 편집으로 간다(DEV-84). 다른 `SOURCE_*` 값은 남겨 둬도 된다(꺼져 있으면 검사하지 않는다).
2. `farmclub-source-worker` → 최신 배포 **⋮ → Remove**. worker는 꺼진 설정으로는 바로 종료하므로 남겨 두면 재시작을 반복하다 멈춘다.
3. 다시 켤 때는 1을 `true`로 되돌리고 worker를 다시 배포한다(5단계). 처리 중이던 작업은 lease가 끝나면 다시 집힌다.
4. 키 유출이 의심되면 OpenRouter 키와 R2 토큰을 폐기하고 새로 발급해 3·4단계 값을 바꾼다.

## 남은 위험

- 품질 게이트: `docs/spec/source-integration.md` 기준 이미지/PDF 정확일치 95% 게이트는 아직 미달이고 실제 농가 인수도 하지 않았다. 켜는 결정은 이 상태를 알고 하는 것이다.
- 생산자 검토·명시적 적용 없이 공개 상품에 반영되지 않는다(AC-SRC). 자동 고가 fallback은 없다.
- 비용: worker는 대기열이 비면 약 2초마다 정리(`cleanup()`)를 돌려 R2 버킷 목록을 읽는다. 월 약 130만 회로 R2 무료 Class A 한도(월 100만 회)를 넘을 수 있다(초과분은 소액). 정리 주기 조정은 후속 이슈로 남긴다.
