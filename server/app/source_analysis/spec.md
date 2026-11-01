# source_analysis

## I3 오프라인 평가 구현 (DEV-172)

FEAT-03/04/07 · AC-SRC-1/2/3/5/6/8. 평가 계약은 `docs/spec/validation/source-corpus-i3-v1.md`, 입력/gold 해시 잠금은 같은 이름 JSON을 따른다. 작업 기록은 이 폴더 `tasks.md`다.

| 날짜 | 구현 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-10-31 | `corpus_score.py`는 제공자/DB 없이 저장된 run만 채점하고 manifest 바이트 SHA를 CLI에서 강제한다 | 무단 실호출/결과에 맞춘 gold 변경 방지 | AC-SRC-2/6 |
| 2026-10-31 | 원래 gold는 값·구절 해시/위치로 고정하고 미연결 위치는 BLOCKED로 남긴다 | 비공개 원문을 git에 복사하지 않으면서 기준 보존 | AC-SRC-2/6 |
| 2026-10-31 | split 전체·Counter 일대일 TP·필드×형식 집계·exact 주 점수/normalized 진단 | 실패/거절/누락/중복과 대상 혼동을 숨기지 않음 | AC-SRC-1/3/5/8 |
| 2026-10-31 | 후보별 원본 대조 중요 사실 감사는 별도 입력, 누락은 BLOCKED·무근거는 FAIL | 자동 금지 필드0건을 사실 정확성으로 오인하지 않음 | AC-SRC-3 |
| 2026-10-31 | I2 split은 이력으로 보존, 현재 split은 development, 독립 holdout=[]/BLOCKED | 전체 사례의 개발 노출 확인; 신규 승인 자료 없음 | AC-SRC-2 |
| 2026-11-01 | DEV-152 95%는 text·image(image+long_image)·PDF 3그룹, 개별 이미지/PDF origin은 진단 | 공용 I3 프로토콜과 동일한 분모 유지 | AC-SRC-2/6 |
| 2026-11-01 | gold span만 감사에서 참조, 적용 페이지 감사는 오프라인 BLOCKED | gold 누락을 PASS로 해석하지 않고 적용 증거 없는 readiness 주장 방지 | AC-SRC-3/6 |
| 2026-11-01 | 모든 actual 후보의 근거율을 전체·text/image/PDF별 집계, categories=[]도 gold 근거 필수 | DEV-152 승인 사실 근거100%를 측정; 누락은 BLOCKED, 확인된 무근거는 FAIL | AC-SRC-2/3 |
| 2026-11-01 | 분모0 지표는 null/N/A와 이유를 보고, 정의된 실패 없이 판정 불가하면 BLOCKED | 미정의를0% 실패로 오인하지 않음 | AC-SRC-2/5 |
| 2026-11-01 | 범위의 단위 공백은 동일하게 정규화하되 -/~와 숫자 쉼표 공백은 보존 | 서로 다른 사실을 정규화로 합치지 않음 | AC-SRC-3 |

## I3 최종 문장 평가 구현 (DEV-187)

FEAT-03/04/07 · AC-SRC-1/2/3/5/6/8, AC-03-2. 제품 평가 계약은 `docs/spec/validation/source-final-gold-format.md`다.

| 날짜 | 구현 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-11-01 | `final_score.py`는 Gold/Run의 엄격한 구조 검증과 DB/제공자 없는 CLI·import API를 제공한다 | stage-1 필드 scorer와 stage-2 문장 평가 분리 | AC-SRC-2/3 |
| 2026-11-01 | normalize를 재사용한 section별 mustContain recall·critical recall·오배치, regex 금지·안전 원문 토큰 차집합 | 정돈된 문장과 중요 사실 보존을 결정적으로 비교 | AC-SRC-3/6 |
| 2026-11-01 | 출력에는 ID·형식·해시·카운트만, 오류도 상세를 가린다 | 로컬 holdout 문장·PII·경로 유출 방지 | AC-SRC-6 |
| 2026-11-01 | 평가에서만 name→intro/historicalSales→farm 추가, 사진 전용 모듈 제외 | 제품 SECTION_MODULES 변경 없이 final-text 표 적용 | AC-SRC-1/3 |
| 2026-11-01 | 실패 run은 recall all-miss, 남은 출력은 안전성 감사; precision은 토큰/원문/해시 결합 사람 판단의 proxy | 분모와 진단 한계를 숨기지 않음 | AC-SRC-2/5 |
| 2026-11-01 | final 전용 normalize_final은 count+조사/어미·천 단위 쉼표를 양쪽 입력에 적용, NUMBER_RE는 단위 뒤 영문 경계 검사 | stage-1 동결을 유지하며 recall/unsupported 불일치 방지 | AC-SRC-2/3 |
| 2026-11-01 | gold는 raw verbatim과 contains 모두 검증, where 선택; platform/health는 FORBIDDEN_WORDS 한 상수로 검출 | gold 자기 불일치 거절 및 DEV-186 규칙9~12 동기화 | AC-SRC-2/6 |
| 2026-11-01 | local run gold 리스트는 고정 파일 SHA와 holdout lock 대조 뒤 검증, format은 source 봉투에서 주입하되 레포 holdout lock·dev manifest의 `{id, format}`과 같아야 한다 | private gold를 repo에 저장하지 않고 변경 감지 | AC-SRC-2/6 |
| 2026-11-01 | gold 문장에 health·platform 금지어나 같은 source 금지 구절이 있으면 거절 | 채점기 판정과 gold 검증을 일치 | AC-SRC-6 |
| 2026-11-01 | caseType=contract/extraction·byCaseType 및 개수 제공, 전체 gate/분모 유지 | 빈 gold 계약 사례와 추출 점수 구분 | AC-SRC-2/5 |

## 현재 배포·구현 계약 (DEV-90, 2026-10-19)

운영 API와 독립 `farmclub-source-worker`가 활성화되어 있다. `docs/spec/source-integration.md`의 현재 운영 상태와 `server/README.md`를 따른다. 기존 배포 보류는 과거 이력이다. 이미지·긴 이미지·PDF 운영 분석/비공개 반영3/3, 생산자 UI 저장·재접속·반영 및 격리 DB 브라우저17개를 검증했다. 일반 정확도·실제 농가 인수는 미완료이며 DEV-58은 In Progress다. 기본 정보 저장 직후 업로드 경합은 DEV-92에 남아 있다.

API 이미지에는 OCR 의존성을 추가하지 않는다. `Dockerfile.worker`는 고정 RapidOCR/ONNX와 checksum 모델을 빌드 시 설치하고 시작 시 migration head·모델 무결성을 검사한다. 같은 private R2/DB를 참조하며 Run/비용 원장/기존 $5 한도는 유지한다. parser/prompt는 source-parser-v3/source-v6-candidate-validation이다.

현재 제품 동작은 `docs/spec/source-editor.md`가 아래 구현 이력의 개인정보 검토·카드 스위치 설명보다 우선한다. 새 자료는 업로드 전 개인정보 제거 안내 후 승인 대기 없이 분석하며, 명시적 적용으로 상품 상세를 갱신한다. 아래 날짜별 기록은 당시 결정과 검증 이력이다.

FEAT-03/04/07 · M-10~13/M-18 · AC-SRC-1~8. 제품 기준: docs/spec/source-analysis.md.

비공개 원본·분석 작업·출처 후보·생산자 검토·18개 요소 상세 초안을 소유한다. 명시적 반영에서 Product.moduleDetail/대표사진을 갱신하며 가격·재고·공개 상태·주문은 변경하지 않는다. 외부 모델 호출은 app/ai/source_analysis.py·source_ocr.py 어댑터를 사용한다.

PostgreSQL 작업 테이블과 독립 worker를 사용한다. 농가 소유권·revision·멱등 키를 검사하며 재분석은 확인한 값을 덮어쓰지 않는다. Mock은 명시적 fixture만 처리하고 실제 API 실패를 대체하지 않는다. 새 자료는 업로더가 개인정보를 제거한 뒤 분석에 전송하며 이전 가림본·버전 보호는 유지한다.

## DEV-56/57/58 integration

Current contract: docs/spec/source-integration.md, AC-SRC-1~10. SourceWorkspace uses the sourceAnalysis client and shared ModuleStory renderer. Product moduleDetail is separate from legacy detailContent. OpenRouter Gemini and persistent budget accounting are source-analysis-only.


## DEV-58 전처리·근거 구현 결정

- RapidOCR3.10.0/ONNX Runtime1.31.0 + PP-OCRv5 mobile 한국어. `ocr-manifest.json`의 URL·SHA를 명시적 설치 명령으로 배치한다. 런타임은 manifest 및 모든 파일을 검증하고 다운로드하지 않는다. Paddle 런타임이나 옛 모델 형식으로의 자동 fallback은 없다.
- 방향 감지 후 두 방향의 텍스트 점수를 비교한다. 긴 이미지는 최대 너비2800, 높이960/겹침128 스트립으로 인식하고 동일 위치의 중복을 제거한다. PDF 원문은 crop/회전을 반영한 문자 좌표를 사용하며 원문과 겹치는 OCR을 버린다. 낮은 신뢰도 영역은 가리고 실제 전송 전 생산자 검토를 유지한다.
- `source-parser-v2`와 Asset.preprocess_version(migration0010; main 0008 뒤 0009 통합 스키마)으로 재사용을 통제한다. 이전 전처리 결과의 재분석은 revision·후보·가림 승인을 무효화한다. 이미 큐에 들어간 구버전 자료도 PARSER_CHANGED로 차단한다. 엔진/좌표/모델 변경 시 이 버전을 갱신한다.
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

### DEV-58 통합 편집
AC-SRC-11: review.editorFields 자동 채움 제안, PUT /batches/:bid/editor 원자 저장. 자동 제안은 UNREVIEWED/EXTRACTED로 보존하며 개별 확정 없이 유효한 ON 항목만 previewModules에 포함한다. 기존 API와 저장 데이터는 유지한다. OFF 내용은 복원 가능하며 오래된 OFF 근거는 공개 검증에서 제외한다. UI는 자료/상세 편집 2탭, 카드별 스위치/직접 편집/접히는 원문.

## DEV-58 공개자료 후속 안정화
- 승인 계획: 후보별 엄격 검증, 유효 후보 보존, PARTIAL 상태와 공개 개수/비공개 진단 분리. 전부 거절은 실패이며 자동 재호출하지 않는다.
- 단어 자체가 아닌 개인정보 항목 문맥을 기준으로 가림 처리한다. 자료 연락처는 상품 문의에 자동 반영하지 않으며 직접 편집과 분리한다.
- 처리 버전 변경 시 이전 결과 재사용을 차단한다. 명시적 재시도 결과가 이전 자동 후보를 대체해도 확정된 생산자 편집은 보존한다.

### DEV-84 사용 여부 조회
`SOURCE_ANALYSIS_ENABLED`가 꺼지면 `/api/source-analysis/**`는 모두 404다(`enabled()` 게이트). 앱이 이것을 "상품 없음" 404와 구분하도록 게이트 밖 `config_router`의 `GET /api/source-analysis/config`가 `{ enabled }`를 200으로 돌려준다(인증 불필요, 카카오 config 선례). 운영은 배포 보류로 꺼져 있고 생산자 앱은 이때 기존 문구/직접 입력·상세 편집을 쓴다.
