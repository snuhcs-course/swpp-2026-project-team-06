## Current integration (DEV-56/57/58)

Use the producer /products/source-analysis page with both the API and worker running. Set SOURCE_ANALYSIS_PROVIDER=openrouter, SOURCE_ANALYSIS_MODEL=google/gemini-3.1-flash-lite and the server-only OPENROUTER_API_KEY. This is independent of AI CS. Expensive vision and direct fallback are disabled. The historical DEV-54 UI/publication/Sol statements below are superseded by docs/spec/source-integration.md.

Generate synthetic cases from server with `python -m app.source_analysis.synthetic --output .artifacts/source-eval --font <Korean-font>`. Use a separate local database and explicitly add --live for paid evaluation. Default caps are $1 evaluation/$5 cumulative, with at most 4096 output tokens per request. Never interpret mock results as model quality or actual farmer acceptance. Deployment is held.

# 자료 분석 백엔드 실행

FEAT-03/04/07, AC-SRC-1~8. 공개 상품과 별개인 비공개 초안 API다. 앱 UI·공개 반영·이미지 생성은 포함하지 않는다.

## 로컬 실행

1. PostgreSQL을 준비하고 server에서 `uv sync --extra ocr` 실행.
2. 서버 환경에 `DATABASE_URL`, `SOURCE_ANALYSIS_ENABLED=true`, `SOURCE_ANALYSIS_PROVIDER=mock`, `MOCK_LOGIN_ENABLED=true` 설정. 기본은 비활성이다. 키는 필요 없다.
3. `uv run alembic upgrade head`, 새 로컬 DB에서 `uv run python -m app.core.seed` 실행.
4. API: `uv run uvicorn app.main:app --port 8000`.
5. 다른 터미널에서 같은 DB/저장소 설정으로 `uv run python -m app.source_analysis.worker`. 한 번만 처리하려면 `--once`.
6. `/docs`의 source-analysis API 사용. 승인 생산자의 JWT 필요. 생성·분석 시작·재시도·초안 저장에 Idempotency-Key 필요.

Windows Alembic이 한글 주석을 시스템 인코딩으로 읽지 못하면 UTF-8 설정으로 실행하거나 주석만 제거한 로컬 ini를 사용한다. migration 경로는 원래 migrations 디렉터리를 가리켜야 한다.

## Mock 확인 자료

`app.ai.source_analysis.MOCK_TEXT`를 붙여넣는다(끝 줄바꿈 없음).

```text
테스트 감귤
제주산 감귤입니다.
서늘한 곳에 보관해 주세요.
```

Mock은 이 고정 자료의 checksum에만 응답한다. 임의 자료는 UNSUPPORTED_MOCK_SOURCE로 실패한다. 실제 분석 결과인 것처럼 표시하지 않는다.

순서: batch 생성 → targets의 서버 ID로 sources 등록 → 현재 batchVersion으로 runs 생성 → worker 처리 → review 조회 → candidateIds/원문 또는 생산자 직접 입력 확인 → 현재 reviewVersion으로 drafts 저장. 저장 결과는 schemaVersion=1, 18개 modules와 공개용 메타데이터를 제거한 previewModules다. 공개 URL/게시 API는 없다.

## 이미지/PDF 전처리

`uv run --extra ocr python -m app.source_analysis.provision_ocr .artifacts/ocr-models`로 모델을 명시적으로 설치한다. SOURCE_OCR_MODEL_DIR를 절대 경로로, SOURCE_OCR_MODEL_SHA256을 명령이 출력한 manifest 해시로 설정한다. worker 실행 중에는 모델을 다운로드하지 않는다.

- 한국어 PP-OCRv5 mobile recognition + PP-OCRv5 mobile detection, RapidOCR 3.10.0/ONNX Runtime 1.31.0. 파일별 SHA-256은 ocr-manifest.json에 고정. 모델·엔진 Apache-2.0.
- Pillow/Pillow-HEIF로 방향과 HEIC를 처리한다. pypdfium2/PDFium은 PDF 렌더링에 사용하며 각 패키지의 포함된 라이선스/NOTICE를 배포 시 보존한다. uv.lock이 실행 의존성 버전을 고정한다.
- 원본은 그대로 비공개 저장하고, 분석용 이미지의 EXIF를 제거한다. OCR 개인정보 후보와 QR 영역을 가린다. PDF 원문은 문자 좌표로 필요한 영역만 가리고, 회전 이미지와 긴 문서는 방향 보정·세로 스트립 OCR로 처리한다.
- 실제 모드는 모든 가림 사본의 생산자 확인 후 전송한다. 누락된 이름·상세 주소는 span/영역을 추가로 가린다. OCR/정규식만으로 개인정보가 전부 제거됐다고 보증하지 않는다.
- 20MB/파일, 100MB/작업, 30파일, 10상품, PDF20페이지/파일·60페이지/작업, 텍스트30,000자. 파서는 별도 subprocess에서 120초·메모리1GB 제한. 파일 유형/초대형 픽셀/손상/암호 PDF 오류를 개별 파일에 남긴다.
- QR/이미지 전처리에 OCR extra가 필요하다. 모델 누락·해시 불일치·불확실한 판독은 차단된다. 판매 사진 선택은 originalPhoto=true로 지정하고 준비 완료한 이미지 원본만 가능하다. 문서 페이지는 판매 사진 ID가 아니다.

## 실제 Sol 연결

SOURCE_ANALYSIS_PROVIDER=openai, SOURCE_ANALYSIS_MODEL=gpt-6.1-sol, 서버 secret OPENAI_API_KEY를 설정한다. 기존 AI_MODEL/Anthropic 기능과 분리된다. 운영은 private R2 설정이 필수이고 Mock은 local에서만 허용한다.

Responses API, Structured Outputs, store=false, tools 없음, SDK 자동 재시도 없음. 가림 승인된 페이지/문구와 고정 상품 ID만 전송한다. store=false가 공급자의 전체 보존 정책을 대체하지 않는다. 실제 키·업로드 자료·유료 호출은 이번 개발 검증에 사용하지 않았다.

429는 Retry-After와 지연으로 최대3회 시도한다. 전송 후 timeout/5xx/worker 유실처럼 결과가 불명확하면 REQUEST_UNCERTAIN으로 남기고 acknowledgeUncertain=true로 명시적 재시도한다. DB 멱등성과 외부 모델의 중복 과금은 별개다. 모드·모델·promptVersion·요청 ID·duration·실제 usage가 항목별로 남는다. 사용량 미수신은 빈 값이며 0원이라고 간주하지 않는다.

## 검증·평가

`uv run pytest`, `uv run ruff check .`, Alembic upgrade/downgrade/check. 기존 테스트처럼 실제 PostgreSQL을 사용한다. CI에는 OpenAI 키를 넣지 않는다.

`python -m app.source_analysis.evaluate private-results.jsonl`은 이미 수집한 결과의 정확 일치 precision/recall·누락·p50/p95·입력된 실제 비용을 계산한다. 각 줄은 expected/actual([{targetId,fieldKey,value}]), durationMs, costUsd를 받는다. 비용이 빠진 기록이 있으면 총액은 null. 평가 원문/정답은 레포 밖 비공개 보관.

공개 직거래 자료12건과 가상20세트의 실제 API 평가를 수행했다. 이미지/PDF 품질은 아직 기준 미달이다. 실제 농가 인수는 수행하지 않았다. 빈 항목을 정직하게 남기는 결과와 틀린 결과를 구분하고, 출처·문구 정리·품질 주장 보존은 별도 사람이 채점한다.

## 운영 경계

API와 worker는 같은 PostgreSQL 및 같은 비공개 Local/R2 저장소를 사용해야 한다. R2 bucket은 공개하지 않는다. SOURCE_R2_* 키는 .env.example 참고. 새 API는 비활성 기본값이다.

작업 취소는 이미 보낸 요청을 회수하지 않는다. 늦은 결과는 버전/lease 검사로 버리고 확인한 내용을 덮어쓰지 않는다. source 삭제는 참조 초안 삭제가 선행되어야 한다. batch 삭제는 논리 삭제 후 worker가 파일과 민감 자료를 정리한다. 고아 업로드는 24시간 이후 정리한다. 자동 worker 재시작은 배포 환경 프로세스 관리자가 담당한다.

## OCR 교체 및 로컬 품질 검증 (DEV-58)

전처리는 방향 보정, 높이960px 세로 스트립 인식, PDF 원문 좌표 추출, 개인정보·QR·낮은 신뢰도 영역 가림을 수행한다. 기본 상한은 프로세스 RSS 1024MB / 120초다. 생산자가 가림을 확인한 뒤에만 외부 모델로 전달한다. OCR의 잘못 읽은 글자를 추측해서 수정하지 않는다.

평가는 로컬 DB에서만 실행한다. 파일 사례 manifest에는 `file`, `mime`, `sha256`, `kind`, `expected`를 넣는다. 원문/진단/정답은 gitignored `.artifacts/`에 보관한다.

```sh
python -m app.source_analysis.synthetic --cases .artifacts/source-real/cases.json \
  --output .artifacts/source-real-prepare --prepare-only
# 실제 API 호출: 예산 원장을 유지하고 키는 메모리에서만 입력
python -m app.source_analysis.synthetic --cases .artifacts/source-real/cases.json \
  --output .artifacts/source-real-live --live --key-prompt
```

정확일치 지표는 실패·빈 결과도 포함한다. 형식별 precision/recall 95%와 중요 오류 0을 모두 충족해야 품질 게이트를 통과한다. 공개 자료 평가 통과도 실제 농가의 수용 검증을 대신하지 않는다.

구체적인 현재 결과는 `docs/spec/validation/source-visual-2026-10-16.json`을 따른다. 이전 Paddle 모델 폴더는 새 설치 명령으로 다시 준비한다.
