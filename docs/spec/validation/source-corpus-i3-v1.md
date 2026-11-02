# DEV-172 · I3 자료 분석 평가 동결 v1 (2026-10-31)

기준: FEAT-03/04/07, AC-SRC-1/2/3/5/6/8, M-10~13/M-18.
제품 추출·OCR·공개 동작은 바꾸지 않는다. 새 모델 호출·프롬프트 튜닝·새 자료 수집은 없다.

- Manifest: [source-corpus-i3-v1.json](./source-corpus-i3-v1.json)
- **파일 전체 바이트 SHA-256**: `95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d`
- 이전 비공개 `source-real/cases.json` SHA-256: `097dbcef182bbdb57d6b2857fca8bf0e36a208327ba660bd6efe11d7138b462b` — 2026-10-31 로컬 바이트 검증 **MATCH**.
- 동결 상태: `FROZEN_DEVELOPMENT_ONLY`. 첫 커밋 전 리뷰 수정은 v1에 반영했다. 동결 이후 이 파일·manifest를 결과에 맞춰 덮어쓰지 않는다. 수정/신규 자료/정답 보정/정규화 변경은 새 버전과 별도 결과를 만든다.
- **holdout: BLOCKED**, locked IDs `[]`. 기존 4개 holdout도 반복 개발에 노출됐다. 독립성 근거 없는 비공개 자료를 holdout으로 승격하지 않는다.

## 인벤토리와 독립성

| I3 split / 용도 | text | image | long_image | pdf | 합계 |
| --- | ---: | ---: | ---: | ---: | ---: |
| development / extraction | 19 | 6 | 1 | 4 | 30 |
| development / contract-only | 2 | 0 | 0 | 0 | 2 |
| holdout / extraction | 0 | 0 | 0 | 0 | 0 |

- 실제 공개 URL 3개에서 파생된 12건 = text3 / image5 / long_image1 / PDF3. 이전 문서의 image6은 긴 이미지1을 포함한다. PDF2는 공개 PDF crop, PDF1은 상세이미지의 PDF 변환이다. 각 PDF의 `pdfOrigin`은 아래 표와 manifest에 명시한다. 독립 출처/판매처 수를 case 수로 부풀리지 않는다.
- PDF origin: `original`=원본 PDF, `crop`=원본 PDF 영역 추출, `image_to_pdf`=이미지의 PDF 변환, `web_print`=웹페이지 인쇄 PDF. 현재 crop2건/image_to_pdf2건이며 original/web_print는0건이다. public_url/synthetic 출처 분류와 별개이며, 웹페이지에서 가져온 이미지를 PDF로 변환한 사례를 web_print로 분류하지 않는다.
- 합성 extraction18건 = text16 / image1 / PDF1. 중복·빈 입력 계약2건은 별도다. `14-private-contact`는 가상 연락처로 만든 **synthetic** 사례이며 private-origin 자료가 아니다.
- source-v4 vision6건 = real12의 부분집합 `oasis-long`, `farm-citrus`, `farm-mong`, `farm-shin`, `farm-water`, `farm-yang`. PDF는 이 6건에 없으며 전체 개발 corpus의 PDF4건으로 형식 범위를 보존한다. 12+18+6을 36개 독립 자료로 합산하지 않는다.
- gold는 32건 모두 존재(빈 gold 포함); extraction의 필드 라벨은 총53개. private-origin 신규 등록0건. 원문·정답 전문·모델 응답은 비공개로 유지한다.
- `i2Split`은 원래 값, `split`은 I3 용도다. 아래 표와 manifest의 `cohorts`는 모든 case ID를 보존한다.

| ID | 형식 / pdfOrigin | origin | I2 split | I3 split / 용도 | gold 필드 수 |
| --- | --- | --- | --- | --- | ---: |
| `farm-mong` | image | public_url | development | development / extraction | 2 |
| `farm-water` | image | public_url | development | development / extraction | 2 |
| `farm-citrus` | image | public_url | development | development / extraction | 2 |
| `farm-yang` | image | public_url | holdout | development / extraction | 2 |
| `farm-shin` | image | public_url | holdout | development / extraction | 2 |
| `farm-father` | pdf / crop | public_url | development | development / extraction | 2 |
| `farm-jun` | pdf / crop | public_url | holdout | development / extraction | 2 |
| `oasis-long` | long_image | public_url | development | development / extraction | 11 |
| `oasis-storage` | pdf / image_to_pdf | public_url | development | development / extraction | 4 |
| `ssarijai` | text | public_url | development | development / extraction | 2 |
| `farm-orafield` | text | public_url | development | development / extraction | 1 |
| `farm-close` | text | public_url | holdout | development / extraction | 1 |
| `01-origin` | text | synthetic | development | development / extraction | 2 |
| `02-weight` | text | synthetic | development | development / extraction | 1 |
| `03-expected-brix` | text | synthetic | development | development / extraction | 1 |
| `04-measured-brix` | text | synthetic | development | development / extraction | 1 |
| `05-storage` | text | synthetic | development | development / extraction | 1 |
| `06-delivery` | text | synthetic | development | development / extraction | 1 |
| `07-farm-story` | text | synthetic | development | development / extraction | 1 |
| `08-appearance` | text | synthetic | development | development / extraction | 1 |
| `09-support` | text | synthetic | development | development / extraction | 1 |
| `10-historical` | text | synthetic | development | development / extraction | 1 |
| `11-conflict` | text | synthetic | development | development / extraction | 2 |
| `12-mixed-products` | text | synthetic | development | development / extraction | 2 |
| `13-common-farm` | text | synthetic | development | development / extraction | 1 |
| `14-private-contact` | text | synthetic | development | development / extraction | 1 |
| `15-injection` | text | synthetic | development | development / extraction | 0 |
| `16-missing-count` | text | synthetic | development | development / extraction | 1 |
| `17-duplicate` | text | synthetic | development | development / contract | 0 |
| `18-empty` | text | synthetic | development | development / contract | 0 |
| `19-rotated-image` | image | synthetic | development | development / extraction | 1 |
| `20-pdf-table` | pdf / image_to_pdf | synthetic | development | development / extraction | 1 |

## 입력·gold·근거 해시 계약

`safeInputSha256`은 OCR 후 추출에 사용된 개인정보 처리 **입력 객체**의 `canonical-json-utf8` 해시다. JSON은 `ensure_ascii=False, sort_keys=True, separators=(",", ":")`, UTF-8, BOM/말미 개행 없음이다. 실패한 추출도 준비된 safeInput을 그대로 고정한다. 계약 전용2건은 `utf8-contract-input` 바이트다.

12건 입력은 비공개 `source-real-flash-comparison/*-diagnostic.json`의 safeInput, 합성18건은 `source-synthetic-flash-comparison/*-diagnostic.json`의 safeInput을 사용한다. 실제 사용한 진단 파일 바이트 해시도 기록한다. 경로는 `.artifacts/` 기준 상대 POSIX 문자열의 SHA-256만 기록하며 자동으로 원문을 출력하지 않는다. 파일을 찾으려면 승인된 비공개 root 아래의 상대경로 해시와 `safeInputArtifactPathSha256`을 대조한다. 경로는 파일 내용 해시와 구별한다.

`sourceReference.artifactBytesSha256`은 **원본 파생파일**의 해시이며 안전한 외부 전송 허가가 아니다. `safeVisualPages`는 당시 준비된 가림 PNG11개의 바이트 해시다. vision6건의 `i2VisionSafeInputSha256`은 저장 Gemini transcript의 별도 canonical 해시이고, `i2VisionTiles`는 당시 가림 JPEG crop의 바이트 해시/좌표다. OCR 텍스트 추출 점수를 직접 시각 판독 정확도로 해석하지 않는다.

`expected`는 `(targetId, fieldKey, exactSha256, normalizedSha256, sourceSpanIds)`다. targetId=null인 혼합상품/공통농가 사례를 임의 상품으로 바꾸지 않는다. fieldKey는 `schemas.py::FieldKey`의20개 키를 따른다. 원래 synthetic runner가 real에도 사용한 `synthetic-product` 대상 ID를 유지한다.

`sourceSpans`는 원래 human gold quote의 UTF-8 해시와 gold ordinal/원본 gold 파일 해시/page1/기존 PDF crop 좌표를 보존한다. 저장 safeInput에서 공백만 다른 동일 문구를 찾으면 page/span ID/box(있는 경우)를 연결한다. 복수 줄은 읽기 순서대로 이어 붙여 찾으며 문자는 고치지 않는다. **42/53개만 연결 확인**, 나머지11개는 `BLOCKED_NEEDS_SOURCE_REVIEW`다. 이는 원본 사진을 새로 육안 검수했다는 뜻이 아니다.

미연결: `farm-water` gold1·2, `farm-shin` gold2, `farm-jun` gold1, `oasis-long` gold8·9·10, `oasis-storage` gold1·2·3, `20-pdf-table` gold1. 담당자는 승인된 원본에서 구절/페이지/영역을 확인하여 새 버전으로 보완해야 한다. 알려진 `farm-water` 날짜 구분자(`~` vs `-`)는 [기존 원본 대조 기록](./source-vision-ocr-comparison-2026-10-17.json)의 오류이며 v1 gold와 주 점수를 조용히 고치지 않는다. 날짜 구분자 정규화도 하지 않는다.

## 채점 규칙 (`source-normalization-v1`)

- 단위: case 내부 **대상+필드+전체 값** 하나. exact는 UTF-8 문자열 그대로다. 필드/대상이 틀리면 FP1+FN1이다. 문장 분할/병합·부분일치·의미 유사성은 TP로 인정하지 않는다.
- normalized는 별도 **진단**이다. NFC, 줄바꿈/연속 공백을 한 공백으로, 바깥 공백 제거, 스마트 따옴표를 ASCII로 바꾼다. `. : ; ! ? ( ) | &`와 숫자 사이가 아닌 쉼표 주변 공백만 제거한다. 숫자 사이 쉼표 주변 공백은 보존하고 해당 숫자 조각은 정규화하지 않는다. `1, 050g`는 그대로이며 `1,050g`·`1, 50g`와 다르다. 임의 한글 내부 띄어쓰기/구두점/부정/예상·실측/기간 기호는 보존한다.
- 숫자 바로 뒤의 단위만 정규화: KG/kg/킬로/키로/킬로그램/키로그램→kg, g/그램→g, °Bx/Brix/브릭스→brix. 소수 후행0 제거, 숫자-단위 공백 제거. 명시적 +/−(ASCII - 포함) 부호는 보존하며 쉼표로 묶인 숫자의 일부 자릿수를 정규화하지 않는다. `1,050g`≠`1,50g`, `1,000g`≠`1,0g`, `+2브릭스`≠`2브릭스`다. 범위 뒤 수량에도 같은 단위 정규화를 적용한다: `3-5 kg`→`3-5kg`, `3~5 kg`→`3~5kg`. 두 범위 기호는 서로 바꾸지 않으며 `3-5kg`≠`3~5kg`다. kg↔g 환산이나 수치 추론은 없다. `한/두/세/네`는 독립된 수량 표현에서 `개/상자/박스` 앞에 있을 때만 1/2/3/4로 바꾼다. 다른 한글 수사·품종명은 그대로다.
- Counter 교집합의 일대일 대응으로 TP를 센다. 같은 예측을 여러 번 내면 gold 개수를 넘는 부분은 FP다. TP/(TP+FP)=precision, TP/(TP+FN)=recall. 전체 micro, 필드별20개, 형식별4개(`byFormat`), 형식×필드(`byFormatField`)를 모두 보고한다. DEV-152에 맞춰 text·image(image+long_image)·PDF 3그룹(`byFormatGroup`)을 집계하고 95% exact P/R 판정에 사용한다. image/long_image 각각은 진단으로 유지하며 PDF는 `byPdfOrigin`으로도 보고한다. `caseCounts`는 각 형식/그룹/PDF origin의 case 수를 포함한다. 빈 분모는 null(N/A)이며0%나100%로 바꾸지 않는다. 존재 그룹의 미정의 P/R은 `undefinedMetrics`에 분모0 이유를 출력한다. 정의된 지표의 실패가 없고 분모0으로 판정 불가하면 BLOCKED다. recall=0 등 정의된 지표의 실제 실패는 유지한다. macro 평균은 쓰지 않는다.
- 입력은 동결 split **전체**다. 누락된 run도 NOT_RUN으로 생성하여 gold를 FN에 포함한다. ID 중복/알 수 없는 ID/다른 split/계약 전용 ID/입력 해시 불일치/스키마 밖 필드/빈 후보/알 수 없는 상태는 입력 오류로 중단한다. gold를 실행 결과로 교체할 수 없다.
- EVALUATED/PARTIAL의 유효 actual만 TP 자격이 있다. rejected는 원 모델이 낸 거절 후보이며 항상 FP, 대응 gold는 FN이다. FAILED/EMPTY/REJECTED/NOT_RUN의 actual도 TP 없이 FP로 계산한다. 실패/빈 응답의 gold를 분모에서 빼지 않는다. 정상 무주장 사례는 EVALUATED+actual=[]다.
- contract-only2건은 추출 P/R 밖에 명시적으로 보존한다. 이는 본래 I2부터 중복/빈자료 API 계약용이었기 때문이며 새 실패 제외 규칙이 아니다.

### 별도 중요 사실 감사

DEV-152 기준은 `origin/main:docs/evaluation/i3-journeys/protocol.md`의 source-analysis 계약이다. 필드 채점, 원본 대조, 적용 페이지 도달 감사를 구분한다.

필드 점수와 **분리**해 모든 원 모델 후보(actual+rejected 순서)를 사람이 원본과 대조한다. `criticalFacts`는 기존 gold 값 해시의 숫자/날짜/품종/인증/qualityEvidence 초기 색인이다. 이것만으로 중요 사실 전부를 자동 판정하지 않는다. `forbiddenFields`/`forbiddenValueSha256`도 이전 검토 단서이며 완전한 안전성 인증이 아니다.

각 run에 `criticalAudit.complete=true`, 개인정보 없는 reviewer 식별자(예: reviewer-1), 후보별 `candidateSha256`(후보 객체 canonical JSON), `categories`(numeric/date/cultivar/certification/qualityEvidence), `supported`(boolean), `sourceSpanIds`를 입력한다. categories=[]는 **모든 범주를 검토했고 중요 주장이 없음**을 사람이 확인했다는 뜻이다. qualityEvidence 필드는 그 범주를 생략할 수 없다. **모든 actual 승인 후보는 categories=[]여도 supported와 비어 있지 않은 gold sourceSpanIds가 필수**다. rejected 후보는 중요 범주가 있을 때 지원 여부·근거를 요구하며 승인 사실의 근거율 분모에는 포함하지 않는다. 복합 문장의 숫자·단위·예상/실측·측정일·품종·인증 범위/유효성을 모두 확인하고 하나라도 무근거면 supported=false다. 부분 문자열/근거 없는 이미지 추정/과거 인증의 현재 확정을 지원으로 인정하지 않는다.

`sourceSpanIds`는 해당 case의 **gold `sourceSpans`만** 참조할 수 있다. gold에 없는 근거를 run 감사에서 새로 등록할 수 없다. gold 누락은 사람이 원본을 검수하여 **새 manifest 버전**에서 보완한다. 그 전에는 근거 누락/미등록 span은 BLOCKED이며, 확인된 무근거 승인 사실 또는 중요 사실은 FAIL이다. gold span이 없다는 이유로 PASS를 추론하지 않는다. 원본의 부재/충돌 시 빈 칸 또는 확인 표시를 했는지도 사람이 검토한다.

- `evidenceSupport.overall`과 `evidenceSupport.byFormatGroup`(text/image/PDF)은 `{supported, total, rate}`를 출력한다. total은 모든 actual 후보 수(실패 상태의 actual도 포함), supported는 후보 해시가 맞고 supported=true이며 유효한 gold span과 연결된 수다. rate=supported/total, total=0은 null(N/A)이며100%로 추론하지 않는다.
- 완전한 감사에서 승인 사실 근거율 <100% 또는 확인된 supported=false 승인 후보 ≥1 → **FAIL**. 감사 누락으로 근거율이100% 미만이면 **BLOCKED**이며, 이미 확인된 무근거 사실은 누락이 있어도 FAIL을 유지한다.
- unsupported critical candidate ≥1 → **FAIL**, 거절된 후보라도 기록한다.
- 감사 없음/후보 누락/값 변경 후 오래된 감사/근거 미지정/미등록 span → **BLOCKED**.
- 사람이 원본에서 전 범주를 확인하고 모든 승인 사실·중요 주장이 근거와 연결될 때만 audit PASS. 전체 감사 없이는 금지 필드0건을 중요오류0으로 주장하지 않는다.
- run/holdout/근거 위치 준비가 BLOCKED면 최종 BLOCKED(확인된 무근거 승인 사실/critical FAIL은 우선). 준비된 평가에서는 실패/거절 run 또는 **각 존재 그룹(text·image+long_image·PDF)의 exact P/R <95%**이면 FAIL. normalized가 좋다고 exact 실패를 승격하지 않는다. 95%는 기존 개선 목표의 진단 판정이며 제품 머지 게이트를 새로 바꾸지 않는다. development PASS는 회귀 결과이며 일반 성능/농가 인수/배포 승인이 아니다.

### 적용 페이지 감사 (DEV-152)

**무근거 중요 사실이 적용된 페이지에 도달했는가: BLOCKED.** CLI의 `appliedPageAudit`에 이유·담당자·다음 행동을 출력한다. 저장 추출 run에는 명시적 적용, 저장된 상세, 실제 렌더 증거가 없어 오프라인에서 도달 여부를 판정할 수 없다. DEV-170 실행자와 사람 리뷰어가 격리된 빌드에서 채택 사실→적용→저장 상세→렌더를 추적하고 출처 근거 및 무근거 중요 사실 도달 건수를 기록해야 한다. 도달1건 이상은 FAIL이며 미실행/증거 누락은 BLOCKED다. 오프라인 `status=PASS`는 추출 채점만 뜻하고 이 감사의 PASS나 DEV-152 readiness를 뜻하지 않는다.

### 오프라인 실행

run JSON 배열의 각 원소: `id`, `safeInputSha256`, `status`, `actual: [{targetId, fieldKey, value}]`, 선택 `rejected`와 `criticalAudit`. 원문·예측값·감사 worksheet는 git 밖에 보관한다. API 키/DB는 CLI에 필요 없다. 보고서에는 집계만 출력한다.

```sh
cd server
uv run python -m app.source_analysis.corpus_score \
  ../docs/spec/validation/source-corpus-i3-v1.json /private/path/runs.json \
  --manifest-sha256 95a75ca765ccf66c559dc0fc24ed41b2a0c268d2a8aca7206bdec8e2fc41cd6d \
  --split development
```

기본 split은 holdout이다. 빈 배열로 실행하면 현재 holdout은 BLOCKED이며 종료코드2다. PASS=0, FAIL=1, BLOCKED=2; 입력 오류(null criticalAudit/비객체 감사 항목 포함)는 traceback·점수·private 입력 출력 없이 실패 종료한다. DB/제공자 모듈을 불러오거나 모델을 호출하지 않는다. run을 생성하는 과정의 모델 호출 승인은 별도이며 이 작업에는 없다.

## 개인정보 검토 (metadata-only, 2026-10-31)

- 공개 PDF/판매페이지도 농가 담당자명·휴대전화·이메일·상세 주소·계좌·사업자 번호·사진 속 사람/EXIF가 포함될 수 있다. **공개 URL≠재배포/외부 전송 포괄 동의**다. 개인 신상·실제 사업자 값과 원문을 새로 git에 넣지 않는다.
- I2 진단의 `[가림]` span과 준비된 가림 PNG/vision JPEG 해시를 확인했다. 연락처·담당자·주소 등 당시 가림본을 식별하는 기록이지 모든 픽셀의 새 개인정보 PASS가 아니다. 원본 파일 해시는 가림 후 파일 해시와 구별한다.
- 합성 `14-private-contact`는 가상 전화/담당자/예약 도메인 이메일이 들어 있는 개인정보 방어 사례다. safeInput에서는 해당 항목을 가린다. `15-injection`은 악성지시가 포함된 비사실 자료이며 상품 주장이 아니다. 원문은 이미 추적된 합성 fixture만 사용하고 새 사적 자료는 추가하지 않는다.
- git 제외: private-sources 객체 전체, 공개자료 다운로드/원본/crop/PNG/PDF/TXT/HTML, raw gold/판매자 식별값, OCR/transcript/safeInput 전문, 실제 모델 응답·비용 원장/DB dump, 리뷰 화면/스크린샷, `.env`/키. 이 노트와 manifest에는 해시·공개 URL·기존 case ID·필드·위치만 남긴다. 저엔트로피 값의 해시는 익명화 보장이 아니다.
- 신규 holdout privacy/authorization: **BLOCKED**, 승인 증거 없음. DEV-172 담당자+원자료 소유자/개인정보 검토자가 재사용/보관/평가 권한과 모든 페이지 가림을 확인해야 한다. 이 작업에서 새 업로드/외부 전송은0회다.

## 다음 행동과 제한

holdout은 text/image/long_image/PDF **각3건, 총12건**을 기존3개 URL family와 무관한 새 출처에서 확보하는 제안이다(통계적 대표성 주장이 아님). 원자료 권한·개인정보 검토 → 예측을 보지 않는 두 사람의 gold/중요 사실/근거 합의 → ID·입력·gold 해시를 `i3-v2`에 잠금 → 이후 별도 승인된 측정 순서다. 담당자는 manifest의 `holdout.nextAction`에 명시한다. 기존11개 미연결 gold 위치도 사람이 원본에서 확인해야 한다.

독립 holdout, 전체 근거 위치 검수, 신규 자료 개인정보 승인은 **미완료**다. 기존 [source-v4](./source-extraction-v4-2026-10-17.json)·[모델 비교](./source-model-upgrade-2026-10-17.json)·[복구 실험](./source-recovery-2026-10-17.json)·[시각 평가](./source-visual-2026-10-16.json) 결과는 개발자료 반복평가로 유지하며 새 성능 수치로 교체하지 않는다.
