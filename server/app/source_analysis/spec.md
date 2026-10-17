# source_analysis

FEAT-03/04/07 · M-10~13/M-18 · AC-SRC-1~8. 제품 기준: docs/spec/source-analysis.md.

비공개 원본·분석 작업·출처 후보·생산자 검토·18개 요소 상세 초안을 소유한다. Product/주문은 변경하지 않는다. 외부 모델 호출은 app/ai/source_analysis.py에 한정한다.

PostgreSQL 작업 테이블과 독립 worker를 사용한다. 농가 소유권·revision·멱등 키를 검사하며 재분석은 확인한 값을 덮어쓰지 않는다. Mock은 명시적 fixture만 처리하고 실제 API 실패를 대체하지 않는다. 개인정보 검토를 통과한 파생 자료만 실제 모드에 전송한다.

## DEV-56/57/58 integration

Current contract: docs/spec/source-integration.md, AC-SRC-1~10. SourceWorkspace uses the sourceAnalysis client and shared ModuleStory renderer. Product moduleDetail is separate from legacy detailContent. OpenRouter Gemini and persistent budget accounting are source-analysis-only.


## DEV-58 전처리·근거 구현 결정

- RapidOCR3.10.0/ONNX Runtime1.31.0 + PP-OCRv5 mobile 한국어. `ocr-manifest.json`의 URL·SHA를 명시적 설치 명령으로 배치한다. 런타임은 manifest 및 모든 파일을 검증하고 다운로드하지 않는다. Paddle 런타임이나 옛 모델 형식으로의 자동 fallback은 없다.
- 방향 감지 후 두 방향의 텍스트 점수를 비교한다. 긴 이미지는 최대 너비2800, 높이960/겹침128 스트립으로 인식하고 동일 위치의 중복을 제거한다. PDF 원문은 crop/회전을 반영한 문자 좌표를 사용하며 원문과 겹치는 OCR을 버린다. 낮은 신뢰도 영역은 가리고 실제 전송 전 생산자 검토를 유지한다.
- `source-parser-v2`와 Asset.preprocess_version(migration0009; main 동기화 후 번호)으로 재사용을 통제한다. 이전 전처리 결과의 재분석은 revision·후보·가림 승인을 무효화한다. 이미 큐에 들어간 구버전 자료도 PARSER_CHANGED로 차단한다. 엔진/좌표/모델 변경 시 이 버전을 갱신한다.
- source-v4 프롬프트는 구성/농장 소개와 불확실한 조건을 보존하고, 의미 문장·라벨 목록 단위 묶음과 구체 필드 우선순위·응답 전 누락 검사를 적용한다. 인용은 공백 배치만 정규화해 원문 오프셋으로 복원하며 숫자·문자·구두점 변경은 허용하지 않는다. 진단 사유는 비공개 평가에만 저장한다.
- 평가 도구는 고정 SHA 원문 manifest와 정답을 받는다. 실패·빈 결과를 분모에서 빼지 않으며 이미지/PDF도 형식별95% 게이트에 포함한다. 실제 공개자료 평가와 실제 농가 인수는 별개다. 현재 실제 시각 자료 정확도는 기준 미달이며 상세 결과는 docs/spec/validation/source-visual-2026-10-16.json을 따른다.

## DEV-58 모델 상향 (2026-10-17)

- 기본 모델은 `google/gemini-3-flash-preview`, 추론 수준은 `minimal`이며 반환에서 추론 텍스트는 제외한다. 출력 상한4096토큰에 추론 토큰도 포함한다.
- `core.config.SOURCE_OPENROUTER_PRICES`를 설정 허용목록·제공자 단가 상한·비용 예약에 공유한다. Flash 입력/출력은100만토큰당 $0.50/$3.00, Lite는 $0.25/$1.50이다. Lite는 명시적 비교용 선택이며 자동 fallback은 없다.
- 예약은 Run에 저장한 모델로 계산하며 평가 CLI도 설정 모델로 호출하고 같은 모델명을 보고서에 기록한다. $1/$5 한도와 미정산 예약은 유지한다. OCR/프롬프트/정답은 모델 비교 중 바꾸지 않는다.


### Sol comparison (2026-10-17)

Sol은 명시적 비교 선택(`openai/gpt-6.1-sol`, low 추론)으로 허용한다. 기본 Flash 및 자동 fallback 비활성은 유지한다. 동일 가격표에서 $2/$10 상한과 예약을 적용하며 평가 진단에 usage/requestId를 비공개 저장한다.

### 추출 묶음·분류·누락 점검 (2026-10-17)

- 라벨 목록의 줄바꿈은 한 composition으로, 독립 보관 문장은 각각 storage로 유지한다. 선별/검사 절차는 productionProcess, 명시 인증은 qualityEvidence이며 맛·사용 제안의 필드 우선순위를 정의한다. 값은 원문 사실·조건을 유지하고 근거 span은 그대로 검증한다.
- Run의 기본 prompt_version과 전송 전 worker 검증은 어댑터 PROMPT_VERSION을 공유한다. 이전 프롬프트 성공 결과는 재사용하지 않고 구버전 대기 작업은 PROMPT_CHANGED로 실패한다. 기존 검토 값은 덮어쓰지 않으며 새 분석/명시적 재시도로 갱신한다. DB 스키마는 변경하지 않는다.
- coverage.audit_coverage는 비공개 평가용 진단이다. 실제 candidate value를 해당 후보가 인용한 span과 비교해 미반영 문구를 표시한다. 긴 인용 자체를 완전성으로 인정하지 않으며 가림 span은 제외한다. 제목/중복/표현 차이는 오탐 가능하므로 자동 보완·모델 재호출·완료 판정에 사용하지 않는다.
- 저장된 Gemini OCR6건으로 추출만 비교한 결과는 docs/spec/validation/source-extraction-v4-2026-10-17.json에 기록한다. 운영 OCR은 아직 RapidOCR이며 OCR 실험 결과를 운영 반영으로 간주하지 않는다.

## DEV-58 채택 버전의 실제 OCR 연결 (2026-10-17)

사용자가 동일 Gemini OCR6건+source-v4의 정확일치 P/R85.71%를 채택했다. 과거95% 기준은 개선 목표이며 이번 PR의 강제 머지 조건에서 제외한다. 이는 OCR 문자 정확도나 독립 자료 성능이 아니며 독립 검증/실제 농가 인수를 완료로 간주하지 않는다.

- OpenRouter 이미지/PDF는 로컬 RapidOCR로 방향·가림 위치를 준비하고 생산자 승인 후 가림 이미지 전체를 Gemini 3 Flash Preview OCR(minimal/2048 tokens)로 읽는다. JPEG85/비중첩 최대960px 조각과 조용한 행 경계를 사용하며, 원래 실험의 수동 분할 위치와는 다르다. 이후 source-v4 추출 문구를 그대로 사용한다. 텍스트/mock/OpenAI는 기존 경로이며 원본 상품 사진은 분석하지 않는다.
- 파이프라인 버전 source-v5-gemini-ocr로 기존 결과 재사용을 차단한다. OCR과 추출 각각 영속 예약/정산하고 실패·취소 뒤에도 비용을 보존한다. 요청 사이마다 가림 승인/revision/lease를 확인한다. 불확실한 호출 및 부분 OCR 뒤 자동 재시도는 없고 생산자의 명시적 재시도만 허용한다. 자동 고가 fallback 없음.
- 정확한 OCR 근거는 비공개 Item.pages.ocrSpans에 저장한다. 기존 개인정보 검토 좌표는 덮어쓰지 않으며 OCR 결과의 개인정보/판독불가 줄은 제외한다. 근거 인용/수치 검증과 생산자 승인 후 저장·적용은 유지한다. OCR transcript는 읽힌 후보 근거이지 원본 사실을 인증하지 않는다.
- 제품 연결은 실제 DB+고정 제공자 응답 회귀267개와 로컬 실호출 UI 흐름1건으로 검증했다. 긴 이미지의 OCR6회+추출1회는28.364초/$0.011443이며 가림 준비3.578초와 사람 검토 시간은 별도다. 업로드→가림→검토/설정→저장→명시적 적용→공개 본문 일치를 확인했다. 기존 승인·공개 상품의 상세 수정이며 신규 상품 승인 검증이나 새로운 정확도 평가가 아니다. 상세 메타데이터는 docs/spec/validation/source-gemini-production-2026-10-17.json에 기록한다. PR 머지 전 사용자가 업로드→가림→검토/설정→미리보기→저장→공개 흐름을 직접 확인한다.

### 상품별 판매페이지 수정 (DEV-58, 2026-10-17)
- 상품 목록의 `판매페이지 수정`은 해당 상품의 비공개 수정본을 연다. 없으면 현재 `moduleDetail` 또는 `detailContent`를 사진 URI/문구 그대로 보존하여 시작한다. 원본 자료가 없어도 수정할 수 있다.
- `수정본 저장`은 공개 내용을 변경하지 않는다. `상품에 반영` 확인 후에만 상품 상세가 변경된다. 판매 중인 상품은 구매자 페이지에 즉시 반영되며, 초안/심사 상태는 바꾸지 않는다.
- 상품 버전이 바뀌면 적용을 거절한다. 수정본을 자동 폐기하지 않고, 사용자가 명시적으로 현재 상품 불러오기를 선택해야 폐기한다. 저장하지 않은 입력에는 이탈 확인을 표시한다.
- 새 상품은 상품+연결 자료 작업을 한 트랜잭션으로 생성한다. 멱등 키 재시도로 응답 유실 시 중복 생성하지 않는다.
- API: POST `/api/source-analysis/product-workspaces` (선택 productId), PUT `/{productId}` (version/snapshot), POST `/{productId}/apply` (version). 초기화는 POST의 discardChanges/version으로 명시한다. 승인 농가 소유권·상품/수정본 버전·사진 소유 참조를 검증한다.
- 생산자 4탭은 유지한다. 공통 좌우20px/카드16px/카드반경16px/터치48px 규격을 사용한다. AI 채팅 기능은 이번 변경 범위에서 제외한다.
