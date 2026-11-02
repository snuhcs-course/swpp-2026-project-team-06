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

## DEV-186 대상별 두 단계 상세 문구

FEAT-03/04/07 · AC-SRC-1/2/3/5/6/7/10/11. 제품 계약은 `docs/spec/source-analysis.md` DEV-186 절이다.

| 날짜 | 구현 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-11-01 | `refresh_runs`는 전처리·추출 성공(검증 거절로 유효 후보가 남은 EXTRACT PARTIAL 포함) 및 후보 집합 변경 후 대상별 REFINE Item을 생성하고 worker가 lease 기반 처리 | 완료·재접속·중복/불확실 전송을 기존 작업 경로로 통제 | AC-SRC-5/10 |
| 2026-11-01 | migration0023의 Item.refinement JSON에 입력 후보 ID·prompt 버전·모듈/문구/인용 저장 | 후보 불변·검토 추적·개인정보 삭제 수명을 기존 Item과 공유 | AC-SRC-2/6 |
| 2026-11-01 | `app/ai/source_refine.py`만 모델 호출, 기존 paid_vision_call 예약/정산 wrapper 재사용 | 원장·한도·공급자 설정을 공유하고 자동 고가 전환을 막음 | AC-SRC-10 |
| 2026-11-01 | text_safety의 공유 금액 regex·단위 수치 검사와 preprocess.scrub로 문구별 거절/진단 | 금액·개인정보·근거 없는 수치 차단, 무관한 유효 문구 보존 | AC-SRC-3/6 |
| 2026-11-01 | 정리 성공은 REFINED, 실패는 기존 EXTRACTED 제안; 저장은 어느 경로든 금액 차단 | 실패 복구와 생산자 검토를 유지, 성공 시 제외 문구가 되살아나지 않음 | AC-SRC-3/5/11 |
| 2026-11-01 | 현재 대상 후보 집합·저장된 값/인용을 대조하고 모듈 간 인용 허용 | 과거→농가 이야기·시기→생산 과정 이동을 안전하게 검토 | AC-SRC-1/2/3 |
| 2026-11-01 | 확인/수정/제외 값 우선; 미확인 자동 값만 새 정리로 교체 | 재분석에서 생산자 편집을 보존 | AC-SRC-5/11 |

저장된 비활성 REFINED 값은 과거 정리 기록과 일치하는 경우 오래된 근거와 함께 비공개로 보존한다. 재활성화/공개에는 현재 근거 검사를 다시 적용한다. 미확인 REFINED의 다중 인용은 조각 병합의 결과이므로 원문 후보 수만으로 충돌 처리하지 않는다.

DEV-186 결정4~7: `source-refine-v4`·단일 JSON detector·운영 문구 축약/제거·summary/taste 분리를 적용한다. `Item.refinement`에 excluded와 modules/excluded canonical JSON의 SHA-256 refinementVersion을 저장한다. 검토는 대상별 refinementResults로 현재 근거의 결과만 공개한다. 서버 validate는 거절 사유와 unused를 채워 현재 후보 전부를 설명한다. 같은 현재 후보 집합·프롬프트 버전·안전 목록 SHA256은 저장된 성공 정리를 재사용하며 일반 reviewVersion 변경은 정리 버전에 영향을 주지 않는다. 생산자 플랫폼 문구는 저장 허용, 효능/금액은 거절한다. 대상/숫자/개인정보/기존 생산자 편집 검증은 유지한다.

DEV-186 리뷰 보완: usable 대상별 후보가 없을 때만 target=None 근거를 unassigned로 표시한다. fallback의 대상별 단일/충돌 후보가 우선이며 성공 정리가 생략한 필드를 원문으로 되살리지 않는다. 실패 fallback은 금액/효능/플랫폼/기간 자동 채움을 막는다. editor는 활성·비제외 필드만, 비편집 save_drafts는 비활성 필드까지 모든 CONFIRMED 필드의 금액/효능을 검사하고 오류의 fields는 fieldKey를 쓴다. historicalSales 확정은 계속 금지한다. 안전 목록과 moneyPattern의 단일 원천은 서버 JSON이며 TS가 상대 경로로 직접 import한다. mock tsc는 레포 rootDir로 JSON·API의 상대 디렉터리를 유지한다(심링크 불필요). 숫자 단위는 긴 단위부터 일치시킨다. SUCCEEDED REFINE은 항상 modules를 저장하므로 미커밋 중간 구조용 get/존재 guard는 두지 않는다.

DEV-186 추가 리뷰: 성공 REFINE의 일부 거절은 diagnostics/refinement.excluded로만 기록하고 error는 null로 유지한다. 응답 후 입력 변경으로 실패하면 RefineError가 usage/request_id를 전달하여 fail()도 보존한다. 클라이언트는 실패 REFINE에 파일명을 붙이지 않고 정리 전용 오류를 표시하며, 선택 버튼의 금액/효능을 공유 detector로 숨긴다. hint는 새 상품 PageCanvas story 입력 opt-in에만 적용하고 기본 정보에는 표시하지 않는다.

### DEV-186 후속 리뷰 구현 결정 (2026-11-01)
- 저장 정리는 `source-refine-v4`·`safetyListsHash`(안전 JSON SHA256)·현재 후보 집합이 모두 일치해야 재사용한다. 조회 때 금액/효능을 재검사하고 제외 사유를 제공한다(AC-SRC-2/3).
- 취소/삭제/버전 변경으로 오래된 비활성 정리는 대상 키를 생략해 fallback하며 실제 현재 REFINE 대기만 None으로 막는다. 유효한 정리가 의도적으로 생략한 필드는 빈 값으로 둔다(AC-SRC-5/11).
- 내부 modules는 editor 계산에만 전달하며 외부 review에는 excluded/refinementVersion만 공개한다. 앱은 refinementResults 생략을 허용한다(AC-SRC-2/11).

### DEV-186 배송 방법 보존 (2026-11-01 owner 결정)
- R-19의 판매자 출하에 따라 택배사·포장/완충·농장 직배송·수확 직후 포장/발송·도서산간 가능 여부를 delivery에 보존한다. 기간(period), 금액(price), 공통 정책(platform)은 정리 모델에서 제외한다. 받는 시기/배송비는 ②에서 생산자가 정한다(R-20).
- source-refine-v4와 공유 JSON 해시로 재사용 키를 갱신한다. 기간 키워드/정규식도 같은 JSON에서 Python·TS가 읽는다. 정제 출력의 PLATFORM_TEXT/PERIOD_TEXT는 diagnostics warning이며 거절하지 않는다. 금액/효능 hard reject·근거 검증은 유지한다. 판단 없는 fallback과 오래된 자동 저장값은 기간도 걸러낸다.
- scorer 금지 검사는 money/health/platform/gold-forbidden 유지. 합성06 delivery 복원·09 문의/20 배송일 제외를 검증하고 합성 manifest 해시만 갱신한다. holdout lock·LOCAL_GOLD_SHA256은 2026-11-01 v1.1로 재잠금 완료(146문장·261사실).

## I3 최종 문장 실행·감사 (DEV-170)

FEAT-03/04/07 · AC-SRC-2/3/5/6 · M-11/13/18. 평가 계약은 DEV-187 final-text gold 형식을 따른다.

- `final_eval.py`는 승인된 고정 입력에 제품 `parse`·stage-1 `extract`·`validate_candidates`·stage-2 `refine`·`refinement.validate`를 in-process 호출한다. OpenRouter의 crop/OCR orchestration은 worker와 공유하며 프롬프트를 복제하지 않는다. 검증 모듈을 로컬 저장한 뒤 scorer 봉투로 변환한다. 상품/공개 페이지는 쓰지 않는다.
- 기본 mock은 등록 fixture를 유지하고 평가 CLI의 명시적 `mock_empty` 옵션만 미등록 입력을 빈 후보로 처리한다. mock 수치는 품질 결과가 아니며 최종 acceptance는 BLOCKED다.
- runner는 저장소 밖 새 비공개 폴더만 사용한다. 입력 snapshot·원문·검증 후보/모듈·usage·request id·감사 문장은 로컬 전용이다. 커밋할 보고서는 scorer의 ID·format·hash·count·집계와 고정 설정만 포함한다.
- stage별/전체 latency의 p50은 median, p95는 nearest rank다. 미관측 단계는 null, 빈 형식은 N/A다. 비용 불명확 응답은 실제 비용으로 부르지 않고 기존 예약 상한을 유지한다. per-run 한도와 기존 전역/평가 Spend 한도를 모두 적용하며 초과 직전 이후 source는 NOT_RUN으로 보존한다.
- holdout은 mock을 거절하고 고정 SHA·로컬 lock·repo 형식을 검증한 뒤 최초 호출 전 gold 옆 marker를 독점 생성한다. 실패에도 지우지 않는다. `--force-rerun`에는 비어 있지 않은 `--rerun-reason`이 필수이며 기존 marker 수+1을 시도 번호로 사유와 함께 marker·metadata에 기록한다. offline `--rescore`는 추가 모델 호출이나 holdout 시도를 만들지 않는다.
- 예상 밖 source 예외는 메시지 없이 `SOURCE_FAILED`로 기록하고 다음 자료를 처리한다. 실행이 중단되어도 finally에서 완료한 source의 부분 metadata·runs와 누적 비용을 저장한다.
- `audit.csv`는 모든 출력 문장, `critical-audit.csv`는 숫자/날짜·품종·인증 lexicon에 걸린 문장이다. source별 누락/충돌·accepted evidence·적용 페이지 검증은 `source-audit.csv`로 받는다. 문장 index/SHA를 검증한 supportJudgments만 scorer로 보낸다. false 판단은 scorer proxy와 별개로 evaluator gate를 실패시킨다. 사람 검토 미완료는 BLOCKED이며 regex proxy를 실제 precision으로 주장하지 않는다.
- 로컬 `inputs.json` snapshot으로 mock과 live의 합성 PDF 생성 메타데이터까지 고정할 수 있다. 공개 safe 파일 변경도 hash로 거절한다. holdout을 개발 튜닝에 쓰지 않는다.

## DEV-170 R2 개발 후속

- 개발 중간 버전 stage-1 `source-v7-fact-coverage`, stage-2 `source-refine-v5-fact-routing`은 배포된 호환 대상이 아니다. 출처/상품 구분·후보 전체 사실 보존, 생산 계절과 판매/배송 기간 분리, 농가/생산/맛 모듈 분할 지시는 최종 v8/v6에 유지한다. OCR 프롬프트와 금액/건강·근거 검증은 유지한다. FEAT-03/04/07 · AC-SRC-2/3/6.
- metadata `errorCode`는 고정 코드만 기록하며 401/403은 `PROVIDER_AUTH`로 즉시 전체 실행을 중단한다. 나머지 자료는 `NOT_RUN`으로 채점 분모에 남긴다. 제공자 오류 본문은 기록하지 않는다.
- `costUsd`/`settledUsd`는 제공자 정산액만 보고한다. `reservedUsd`는 누적 총 예약액, `unsettledReservedUsd`는 정산 미확인 예약액이며 한도에는 계속 포함한다. gross 예약액과 정산액은 더해서 지출로 해석하지 않는다.
- 대상 이름/생산자 선택 정보가 없는 혼합 자료의 한계는 private 분석에 기록한다. gold product를 모델 입력으로 복사하지 않는다. 개발 실패 상세는 저장소 밖에만 남기고 holdout은 튜닝에 사용하지 않는다.

## DEV-170 최종 개발 튜닝2/2

- `source-v8-exact-numbers` / `source-refine-v6-exact-numbers`는 기존 식별 라벨·계절·절별 배치를 유지하고 숫자·단위·범위 전체를 인용 근거 표기로 보존한다. 문의 경로는 platform 제외를 명확히 한다. 기존 platform/period 서버 warning은 유지한다. FEAT-03/04/07 · AC-SRC-2/3/6 · M-11.
- stage-1 숫자 검증은 공유 `text_safety.numbers`로 단위까지 비교한다. stage-2 수치 근거는 현재 인용 quote만 사용하여 후보 value의 단위 변조/발명을 상속하지 않는다. 후보별/문장별 거절로 무관한 정상 사실을 보존한다.
- R3 unsupported4개는 근거 있는 월 범위의 scorer 토큰 차이다. scorer/gold/원점수를 바꾸지 않고 집계 보고서에 한계로 기록한다. 개별 문장·토큰·원문 근거는 private 분석에만 보존한다. R4 live와 사람 감사를 실행하기 전 unsupported0/recall 유지 달성을 주장하지 않는다.


## DEV-182 일반 추출 안정화

FEAT-03/04/07 · AC-SRC-2/3/5/6/8/10/11. 제품 계약은 `docs/spec/source-analysis.md` DEV-182 절이다.

| 날짜 | 구현 결정 | 이유 | 관련 AC |
| --- | --- | --- | --- |
| 2026-11-02 | 일부 거절 EXTRACT=PARTIAL/CANDIDATES_REJECTED 유지; enqueue는 SUCCEEDED 또는 검증 거절로 acceptedCount/rejectedCount>0인 EXTRACT PARTIAL만 허용 | main의 명시적 retry·Run PARTIAL 계약 보존; 실패/불확실 자동 재생 금지 | AC-SRC-2/3/5/10 |
| 2026-11-02 | parser v4가 PDF 첫20쪽과 첫 raw page의 pagesAnalysed/pagesSkipped 메타데이터 반환; PREPARE JSON에 영속 저장·재사용 | DB migration 없이 batch60쪽 cap과 공개 생략 안내 연결 | AC-SRC-5/8 |
| 2026-11-02 | worker/runner가 preprocess.text_chunks의4000자 원문 span 묶음을 공유 | OpenRouter 일반 텍스트까지 같은 분할 적용 | AC-SRC-2/5 |
| 2026-11-02 | refine의 원문순40후보/JSON16000자 prefix 제한·생략 진단, 전체 후보 freshness와 생략 unused 보존 | 요청/출력 한도와 stale/fallback 보호 | AC-SRC-2/3/5 |
| 2026-11-02 | stage1/2 emptyReason 고정 코드와 API 카운트만 공개; run_view는 EXTRACT 전체가 성공·빈 후보인 파일에만 한 번 사유 공개, 후보 없는 REFINE은 사유 없음, 정리 사유3종만 사용(평가 source 전체의 stage1 진단은 보존); UI는 error와 emptyReason 중복 제거·거절 개수를 오류 한 줄에 통합 | 빈 결과 설명과 개인정보 보호 | AC-SRC-5/6/8 |
| 2026-11-02 | final scorer만 실제 범위 표현을 단일 토큰으로 정규화; 에서/부터는 동일 단위+까지/사이일 때만 범위, 그 외 독립 수치로 분리; 범위↔단일 끝점 지원 금지, 기존 T11 보고 점수 보존 | 월 범위 오탐의 측정 수정과 모델 변경 구분 | AC-SRC-2/3 |

평가 runner의 text chunk 계획 추정은 파서와 같은 UTF-8-sig 디코딩 문자 수를4000자로 나누며, 실제 예약은 기존 byte/image 상한을 유지한다.

합성 manifest 해시 정의는 [제품 spec](../../../docs/spec/source-analysis.md#synthetic-input-definition)을 따른다.

DEV-182 리뷰 보완: PARTIAL retry는 기존 service.retry로 새 Run을 생성한다. 후보 집합 변경 시 기존 정리는 is_current/matching_refinement에서 제외하고 새 REFINE을 큐에 넣으며, 동일 집합 성공 정리는 재사용한다. 실패/불확실 요청은 명시적 재시도 규칙을 유지한다. limit_candidates가 첫 후보부터 상한으로 제외하면 REFINE_INPUT_LIMIT를 worker/평가 runner 모두 기록한다. 부분 빈 chunk와 전체 빈 파일, 오류 중복 안내, PARTIAL 안내는 DB API 회귀와 두 화면 stubbed Playwright로 검증한다.

## DEV-182 단일 상품 농가 공통 후보 (2026-11-02)

FEAT-03/04/07 · AC-SRC-1/2/3/5/8/11. 제품 결정은 `docs/spec/source-analysis.md`의 단일 상품 공통 근거 절을 따른다.

- `refinement.includes_target`을 worker 조회·검증·empty_reason, final_eval 선택·검증, editor fallback과 REFINED 저장 검증에서 공유한다. worker는 run 대상 수, 검토·저장은 batch 대상 수를 사용한다. null 후보를 상품 ID로 다시 쓰지 않는다.
- `source_refine.FARM_COMMON_MODULE_FIELDS`에 공통 인용의 필드/모듈 경계를 모은다. mock과 서버 검증·fallback·저장 검증이 같은 규칙을 사용한다. stage-2는 `source-refine-v7-farm-common`으로 올리고 stage-1 prompt는 유지한다.
- `current_candidates`는 공통/상품 후보를 한 번에 기존 source_order로 정렬한다. 전체 payload SHA-256을 REFINE JSON의 `inputCandidatesHash`에 저장하고 `inputCandidateIds`와 함께 최신성을 확인한다. cap 적용 전 해시이므로 생략된 공통 후보의 같은 ID 내용 수정도 SOURCE_CHANGED/outdated로 처리한다. 버전이 다른 저장 정리는 다음 분석에서 다시 계산한다.
- 공통 ID를 가진 REFINED 필드를 기존 stored_fields/current_ids 검사와 함께 검증해 editor → draft 저장을 지원한다. 실패/outdated 원문 제안에도 같은 공통 필드 경계를 사용하고 정상 정리의 누락/제외를 복원하지 않는다.
- 기존 `13-common-farm`을 stage-1 mock 전용 고정 SHA allowlist로 연결하고 실제 추출→정리→검증을 사용한다. 원천 fixture·gold·manifest·scorer는 변경하지 않는다. 원문순 cap·생략 후보 최신성·단일/다중 대상·저장·fallback·empty_reason을 AC ID 합성 테스트로 확인한다.
