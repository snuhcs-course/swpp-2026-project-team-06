# I3 최종 페이지 문장 gold·stage-2 채점 (DEV-187)

FEAT-03/04/07 · AC-SRC-1/2/3/5/6/8 · AC-03-2. 2026-11-01 결정. DEV-186의 broad verbatim 추출 뒤 refine 단계가 쓴 최종 페이지 문장을 평가한다. [기존 v1 corpus](source-corpus-i3-v1.md)의 exact 필드 채점은 stage-1 진단으로 유지하고, stage-2는 아래 사실 토큰 계약을 사용한다. 문장 품질은 DEV-170/T11 사람 감사다. 이 문서는 운영 동작·새 모델 호출을 추가하지 않는다.

## 파일과 보호

- [JSON schema](source-final-gold.schema.json): `Gold.model_json_schema()`로 재생성하며 테스트에서 동일성을 확인한다. JSON schema의 구조 검증에 더해 scorer가 모듈/섹션 대응, verbatim 및 scorer `contains`의 정규화 토큰 포함, 사실 ID 중복과 금액/전화/email 없는 gold 문장을 검증한다. 또한 정답 문장에 health·platform 금지어가 있거나 같은 source의 금지 구절이 정답 문장 안에 있으면 거절한다(정답을 그대로 낸 출력이 위반이 되는 자기모순 방지).
- [합성 개발 gold](source-final-gold-i3-dev-synthetic.json): 기존 manifest의 합성20건(기존 corpus 분류 기준 추출18+계약2). 원천은 `server/tests/fixtures/source-analysis/cases.json`과 `synthetic.material` 생성기다. 원천 숫자·단위·조건을 유지한 개발용 수작업 문장이다. 독립 측정이나 실제 모델 품질 결과가 아니다.
- [개발 final manifest](source-final-dev-manifest.json): 합성20건 `READY_SYNTHETIC`, 공개 개발12건 `LOCAL_PRIVATE`. 기존 corpus의 ID·format·safeInputSha256과 final gold의 바이트/정규 JSON SHA를 기록한다. 공개12건 gold는 로컬 전용이며 각 case의 goldSha256은 전체 private gold 파일 바이트 SHA다. 합성 case의 goldSha256(source 정규 JSON)과 구분한다. 안전 입력은 읽거나 복사하지 않는다.
- **holdout 원문·안전 입력·gold·로컬 run 봉투는 로컬 전용**이다. 독립 검토자3명이 원문만 보고 작성하고 2명 이상 동의한 사실을 채택하며 나머지는 담당자가 결정한다. PDF3건은 실제 인쇄된 PDF다. 페이지 근거는 로컬 검토 자료(검토자 결과의 `where`)에 남기고, 잠근 gold 문장에는 `where`를 두지 않는다(선택 필드). 개발/holdout은 함께 채점할 수 없다. holdout은 절대 튜닝에 사용하지 않는다.
- 저장소에 남길 holdout 정보는 **ID·형식·해시·집계 점수**뿐이다. lock 전에는 임의 ID·gold를 만들어 잠긴 것처럼 표시하지 않는다. [holdout lock](source-final-holdout-i3-lock.json)은 형식별3건의 ID/format·파일 SHA·140문장/253사실 및 정책만 담는다. 잠금은 채점 통과를 뜻하지 않는다. 안전 원문이 있어도 공개 복제 권한을 뜻하지 않는다.

## Gold 계약

봉투는 `{"schemaVersion":1,"split":"development|holdout","sources":[...]}`다. 여러 gold 파일을 함께 넘겨도 split이 같고 source ID가 유일해야 한다. 각 source:

```json
{
  "id": "synthetic-example",
  "format": "text",
  "product": "대표 감귤 상품",
  "sentences": [{
    "section": "composition",
    "module": "composition",
    "text": "감귤 3kg 한 상자입니다.",
    "where": "원문 1쪽 구성표 첫 행",
    "facts": [{
      "id": "weight-1",
      "statement": "감귤 중량 3kg",
      "mustContain": ["감귤", "3kg"],
      "critical": true
    }]
  }],
  "forbidden": [{"kind": "ui", "text": "장바구니 담기"}]
}
```

- format은 `text/image/long_image/pdf`. `where`는 선택이며 없으면 null이다(독립 PDF 원본/페이지 검토 책임은 유지). ID는 1~64자의 영문·숫자·점·밑줄·하이픈(첫 글자는 영문/숫자)이다. 문장당 사실1개 이상, 사실 ID는 source 안에서 유일하다. `statement`는 원자 사실 설명이며 자동 매칭에 사용하지 않는다.
- `mustContain`은 **1~3개의 verbatim 식별 조각**이다. 한 단어보다 긴 구절도 가능하며 각 조각은 공백을 무시했을 때 해당 gold 문장 안에 그대로 있어야 하며, **scorer의 `contains(mustContain, text)`도 참**이어야 한다. 문맥에 따른 정규화 때문에 식별 조각이 사라지면 gold 오류로 거절한다. 의미를 구별하는 숫자·단위·예상/실측·조건/부정을 함께 잡는다. `critical`은 수치·품종·인증·중요 조건 등 누락을 gate에 반영할 사실에 표시한다.
- `forbidden.kind`: `price/pii/ui/watermark/other_product/unsupported/platform/health/other`. `other`는 다른 종류에 맞지 않는 판매처 안내(해외구매대행 고지, 판매 브랜드 소개, 광고 구호 등)다. `text`에는 **구별되는 최소 구절**을 적는다. 긴 문장의 임의 일부나 의미 유사성은 추론하지 않는다. `워터마크:/watermark:/연락처:/전화:/이메일:/가격:/버튼:/UI:` 접두어는 제거한 식별 구절로도 비교한다. 금지 구절당 source당 1회 계산하며 regex와 중복 계수할 수 있다.
- 원문 사실만 사용하며 가벼운 문장 정돈을 허용한다. 숫자·단위·품종·인증·유보 표현은 그대로 보존한다. **금액은 과거/현재/배송비를 가리지 않고 전부 제외**한다. 금액만 빼도 뜻이 남으면 나머지는 유지한다. 개인정보·UI 버튼/탐색 문구는 제외한다. 판매점의 문의 채널/시간도 `platform`으로 제외한다. 중립적인 `건강하게 키운`은 효능 주장으로 보지 않는다.
- source마다 대표 상품1개. 과거 판매의 금액 없는 이력은 `farm/historicalSales`, 수확 시기는 `production/productionProcess`다. 서로 다른 자료의 충돌은 자료별 조건을 유지하고 임의로 하나를 사실로 확정하지 않는다.

2026-11-01 owner 규칙9~12도 적용한다. (9) 판매/선주문 기간, 품절/종료, 주문/결제, 중량·크기 옵션 선택, 배송비/무료배송 기준, 출고 소요일/택배사, 반품·교환·환불, 고객센터 시간·채널은 Farmclub이 처리하므로 `platform` 금지다. 재배 과정의 얼룩처럼 상품의 외관 사실은 appearanceFaq에 보존한다. (10) 상단 summary에 섞인 맛·크기는 taste로 분리한다. (11) 면역·소화 등 건강/효능 주장은 원문에 있어도 `health` 금지다. (12) `판매가` 셀에 기간이 들어 있으면 기간도 버린다. 기존 합성 원천에 없는 건강 주장이나 기간 셀을 gold 사실로 만들지 않는다.

| section | 텍스트 module |
|---|---|
| intro | name, hero, summary |
| composition | composition, pieceCount |
| taste | taste, specification |
| production | qualityEvidence, productionProcess |
| packing | delivery |
| storage | storage |
| faq | appearanceFaq, support |
| farm | farmStory, historicalSales |
| updates | farmUpdates |

제품 `SECTION_MODULES`에서 사진 전용4개를 제외하고, 평가 전용 alias `name→intro`, `historicalSales→farm`을 더한다. 제품 스키마는 바꾸지 않는다.

## 입력과 실행

개별 stage-2 파일:

```json
{"id":"synthetic-example","format":"text","modules":[{"module":"composition","texts":["감귤 3kg 한 상자입니다."]}]}
```

선택 `status`는 `EVALUATED`(기본), `PARTIAL`, `FAILED`, `EMPTY`, `REJECTED`, `NOT_RUN`이다. `PARTIAL`은 실제 남은 출력으로 채점한다. 미실행/실패 파일도 `modules:[]`로 기록할 수 있다. 선택 `supportJudgments`는 아래 precision 문단을 따른다. 스키마에 없는 키는 거절한다.

로컬 `runs.json` 봉투(경로는 이 파일의 디렉터리 기준, 절대 경로도 허용):

```json
{"schemaVersion":1,"sources":[{"id":"synthetic-example","safeTextPath":"safe/example.txt","outputPath":"stage2/example.json"}]}
```

선택한 gold의 **모든 source ID에** UTF-8 안전 원문 경로가 있어야 한다. `outputPath` 생략은 missing run이다. 경로가 있는데 파일이 없거나 ID/format이 다르면 입력 오류(종료2)로 거절한다. 이미지/PDF의 안전 원문은 검수한 OCR transcript이며 PDF 원본과의 사실 대조는 별도 사람 책임이다. OCR 누락을 gold로 대체하지 않는다. 안전 원문 파일과 gold/run 각각의 해시를 잠그고 보고서 SHA와 대조한다. 보고서의 safeTextSha256(UTF-8 text)은 기존 corpus의 구조화 safeInputSha256과 인코딩이 다르다. CLI가 corpus 해시를 대신 검증하지 않는다. goldSha256은 source 객체의 정규 JSON이고 outputSha256은 기본값을 포함한 검증 Run 객체의 정규 JSON이다(키 정렬·구분자 고정, UTF-8). 원래 JSON 파일 바이트 해시와 혼동하지 않는다.

```sh
cd server
uv run python -m app.source_analysis.final_score \
  --runs /private/path/runs.json \
  --report /private/path/final-report.json \
  --markdown /private/path/final-report.md
```

로컬 private gold(holdout·공개 개발)는 `runs.json`의 `gold` 배열에서만 받는다. `--gold`는 레포의 Gold 객체 봉투(합성 개발셋)용이며 `split: holdout`은 거절한다. import API `score()`는 holdout 진입점이 아니다(해시·lock을 확인하지 않는다). holdout은 CLI의 runs.json `gold` 경로로만 채점한다. 가격·전화·email·unsupported 토큰도 출력 문구 하나씩 검사한다. 반면 fact recall은 같은 section의 출력 문구를 이어 붙여 본다(조각으로 나뉜 사실도 맞음으로 셈, 관대한 방향). 금지어·금지 구절은 출력 문구 하나씩 비교한다(이어 붙인 문자열에서 경계를 넘는 구절은 세지 않는다). 아래 경로는 run 봉투 디렉터리 기준이며 sources에는 선택한 gold의 모든 ID/format과 안전 입력 경로를 적는다:

```json
{
  "schemaVersion": 1,
  "gold": [{
    "path": "../source-holdout-i3-private/final-gold-v1.json",
    "split": "holdout",
    "lockPath": "../source-holdout-i3-private/final-gold-v1.lock.json"
  }],
  "sources": [{"id":"h3-text-01","format":"text","safeTextPath":"safe/01.txt"}]
}
```

위 sources 1행은 설명용이며 실제로는12건 모두 필요하다. private 파일은 최상위 source 리스트이며 format 없이 `{id,product,sentences,forbidden}`다. scorer는 run 봉투의 format을 주입하고 where 없는 문장을 허용한 뒤 동일한 엄격 gold 검증을 실행한다. 알려지지 않은 필드/종류, 빈 product, verbatim/정규화 불일치를 자동 보정하지 않는다. 개발 파일은 `../source-dev-i3-private/final-gold-dev-public.json` 및 split=development를 사용한다.

- Holdout 파일 바이트 SHA-256: `5a906044cd642a4f40e52961cc9613de27901b5e719f7714d156e4e9a8fe338b`. 필수 lockPath의 `sha256`도 이 값과 일치해야 한다.
- Public development 파일 바이트 SHA-256: `3ed465971fb5579d10d8ee338e21c01c5d06c324d942acd8d36aba2635cf786f`.

위 값은 `final_score.LOCAL_GOLD_SHA256`에 고정한다. SHA/lock/검증 불일치면 종료2로 채점을 거절한다. private gold/lock도 보고서 덮어쓰기 대상이 될 수 없다. 개발과 holdout 혼합, source ID 중복은 거절한다. `load_local_gold(LocalGold(...), base_path, formats_by_id)`로 검증만 수행할 수 있다. 이 작업은 두 gold의 검증만 실행하며 **holdout 채점은 DEV-186 이후 T11/T23에서 한 번만**, 튜닝 금지다. private 본문·위치·원천은 repo에 복사하거나 stdout에 출력하지 않는다.

품종 사전에 추가할 단어는 `--cultivar 품종명`을 반복한다. import는 `score(gold_dict, records_list, safe_texts_by_id, cultivar_words=...)`, `markdown(report)`를 사용한다. 출력 위치는 기존 입력을 덮어쓸 수 없다. JSON 보고서를 파일에, 짧은 Markdown 표를 파일과 stdout에 쓴다. 입력 오류도 본문/경로를 출력하지 않는다. 정상 critical PASS는 종료0, FAIL/N/A는1, 잘못된 입력/쓰기 실패는2다. CLI는 모델·제공자·DB를 호출하지 않는다.

## 지표와 판정

모든 지표는 source별, text/image/long_image/pdf별, 전체에 보고한다. 각 source의 `caseType`은 gold 문장이 있으면 extraction, 없으면 contract다. `byCaseType`으로 두 묶음을 별도 micro 집계하고 모든 집계의 `extractionCases/contractCases`에 개수를 기록한다. Markdown에도 두 집계를 표시한다. 전체/형식 분모와 gate에서는 contract를 제외하지 않는다. recall/critical recall/misplacement는 section별도 제공한다. 전체·형식별은 **분자/분모를 합한 micro 집계**다. 분모0은 rate=null/N/A이며 source 없는 집계의 gate는 N/A다.

- **Fact recall**: 같은 section의 모든 출력 text를 묶고 gold 사실의 mustContain **전부**가 있으면1, 아니면0. 모듈이 달라도 같은 section이면 인정한다. 사실당 최대1회이며 전체/critical 사실을 별도 집계한다.
- **Misplacement**: 같은 section에는 완전한 토큰 세트가 없고, 다른 section 하나에 전부 있으면1. 여러 다른 section에 나뉜 조각을 합쳐 인정하지 않는다. 분모는 전체 gold 사실 수다.
- **Normalization**: `final_score.normalize_final`은 frozen `corpus_score.normalize` 전에 NFC, 한국어 한/두/세/네 개·상자·박스(뒤 조사/어미 허용), 정확한 천 단위 쉼표 제거를 양쪽 token/text에 동일하게 적용한다. 이후 기존 NFC·곡선 따옴표·공백·kg/g/brix 정규화를 재사용한다. `한 상자`와 `한 상자입니다` 모두1상자로 비교하고 `1,000g`와 `1000g`도 같다. 쉼표 뒤 공백은 천 단위로 합치지 않는다. stage-1 frozen 함수는 바꾸지 않는다. 그 뒤 공백을 제거한 부분문자열로 비교한다. 범위기호 `-`/`~`, 예상/실측·조건은 의미적으로 통합하지 않는다. 따라서 `3kg`가 `13kg` 안에서 recall에 잡히는 한계가 있으며 unsupported의 수치 토큰 대조와 사람 감사가 보완한다.
- **Forbidden violations**: 가격은 DEV-186 `text_safety.MONEY`(공유 JSON의 `moneyPattern`)(원·달러·엔·유로·KRW 등 통화, 억·만·천 배수, ₩￦$€¥ 접두)으로 발생 횟수를 센다. 전화는 한국 휴대전화/지역/070·080·050x 안심번호·15/16/18 대표번호 및 +82 형식(하이픈 앞뒤 공백·en dash·괄호 지역번호 포함. 전각 하이픈·em dash는 못 잡고, 대표번호 바로 뒤에 원·년·개·상자·박스가 붙은 경우는 범위 표기로 보고 뺀다), email은 일반 이메일 regex로 탐지한다. gold forbidden은 위 식별 구절의 정규화 부분문자열 일치다. 추가 단어 탐지는 `final_score.FORBIDDEN_WORDS` 상수 하나에 둔다. 목록은 DEV-186 `text_safety_lists.json`과 같다: health=`면역, 소화를 돕, 소화 촉진, 피로 회복, 다이어트, 피부 미용, 미용 효과, 질병 예방, 질환 예방, 효능`(문맥 있는 표현이라 `소화기`·`피부처럼`은 걸리지 않는다); platform=`반품, 교환, 환불, 고객센터, 운영 시간, 배송비, 무료배송, 품절, 판매 종료, 예약 판매 기간, 택배사`. 공백 제거 뒤 같은 단어는 한 번만 세고 발생 횟수를 센다. 채점기는 이 목록과 금액 식을 제품과 같은 `server/app/source_analysis/text_safety_lists.json`에서 직접 읽는다(DEV-186 머지로 하나로 합침). gold 금지와 중복 계수할 수 있고, 안전 원문에 있어도 위반이다. 합계 목표0. 부분문자열 매칭이라 금지 구절 `5kg`가 `2.5kg`·`15kg`에, 금지어 `교환`이 `정보 교환`에도 걸린다(오탐 방향, 사람 검토로 확인). 금액 식은 `원` 뒤에 산·주·물·예·료·래·두·형·리·칙이 오면 금액으로 보지 않는다(`1 원산지`, `원주`, `제2원칙`). 이 때문에 금액 뒤에 바로 붙은 단어는 놓친다(`39,000원주문시`, `3만원예약가`, `3,000원리필`: 놓침 방향, 사람 검토로 확인). 당도 단위(`브릭스`, `Brix`, `°Bx`)는 앞뒤 글자와 상관없이 `brix`로 맞춘 뒤 비교한다. 다른 통화·한글 금액·비표준 연락처·이름/주소는 이 regex만으로 포괄하지 못하므로 gold forbidden과 사람 검토가 필요하다.
- **Unsupported tokens**: 출력과 안전 원문에서 각각 숫자/단위(범위·소수·kg/g/mg/μg/ml/l/cm/mm·년/일/시간/과/개·% 포함), 고정 품종 사전, GAP/HACCP/무농약/유기농/친환경/인증 단어를 뽑아 출력에만 있는 **고유 토큰 수**를 종류별로 센다. 숫자는 완전한 토큰 단위이며 단위 변경도 잡는다. 영문 단위 뒤 영문자가 이어지면 단위로 읽지 않는다(`3 Large`의 수치 토큰은3이며3l이 아님). 대소문자는 무시한다. 품종은 `final_score.CULTIVARS`의 감귤·일부 과수 품종과 명시적 추가 단어만 탐지하며 미등록 품종은 놓친다. 타이벡은 재배 표현이지만 중요한 고유어로 함께 추적한다. 원문에 단어가 있다는 것만 확인하므로 부정/다른 상품/다른 숫자 문맥/악성 지시문은 gold forbidden과 사람이 판정해야 한다.
- **Precision proxy**: 개행/문장부호로 분리한 출력 문장 중, (a) gold 사실 토큰 세트를1개 이상 포함하거나 (b) 안전 원문에 정규화 부분문자열로 있거나 (c) 로컬 사람이 supported로 판정한 문장 비율. 분모는 비어 있지 않은 출력 문장 수다. 소수점은 유지하고 출력 배열의 각 값 경계도 문장 경계다. 숫자 뒤 마침표 다음에 공백이 와도 나누지 않는다(`수량은 12. 다음`: 날짜·번호 목록 보호, precision 분모가 줄 수 있음). 마침표 바로 뒤에 한글이 오면 분리하지 않는다(`첫 문장입니다.다음 문장입니다.`는1문장). 이로 인해 문장 분모와 사람 판정 인덱스가 일반적인 문장 수와 다를 수 있다. 로컬 판단은 `supportJudgments:[{sentenceIndex:0,sentenceSha256:"<64 hex>",supported:true}]`로 입력한다. 인덱스는 modules/texts 순서대로 `split_sentences`가 만든 strip된 문장이고 SHA는 그 UTF-8 문자열이다. 중복/범위 밖/해시 불일치는 오류다. 사람 판정도 금지/unsupported가 탐지된 문장을 통과시키지 못한다. false는 추가 지원 인정이 없다는 뜻이다. 단어 세트가 맞아도 문장 전체나 논리·인과가 참임을 보장하지 않는다. 이는 실제 precision 또는 문장 품질 점수가 아니다.
- **실패·빈 run**: 누락/실패/거절/미실행과 빈 출력은 gold의 모든 fact/critical fact를 miss로 분모에 유지한다. 실패 run에 출력이 남으면 forbidden/unsupported/precision 감사를 계속하고 recall에는 인정하지 않는다. 빈 run의 precision 분모는0(null)이며 전체 source·사실 분모에서 제외하지 않는다.
- **Critical gate**: critical miss 또는 forbidden1건 이상 또는 unsupported1개 이상 또는 실패/빈/missing source가 있으면 FAIL. source가 있고 위 실패가 없으면 PASS. 일반 recall에 임의95% 기준을 추가하지 않는다. critical PASS는 문장 품질·모든 사실 근거·배포 readiness 또는 농가 인수 완료를 뜻하지 않는다.

## 합성 라벨 결정

20건은17문장/23사실이다. 15-injection은 사실이 없고 17-duplicate/18-empty는 API 계약 오류 사례이므로0문장이다. 규칙9에 따라06-delivery와09-support의 운영 문구도 gold에서 제거하고 forbidden(platform)으로 옮겼다. 따라서 report의 contract는5건, extraction은15건이다(기존 corpus의 extraction18/API-contract2 분류와 목적이 다름). 이5건에서 기대하는 빈 최종 출력은 전체 gate를 PASS할 수 없고 critical FAIL이다. `byCaseType.extraction`을 함께 읽되 전체 실패를 숨기지 않는다. contract가 모두 text 형식이라 `byFormat.text`와 `overall` gate는 합성 개발셋에서 항상 FAIL이며 CLI 종료 코드도 1이다. 품질 판단에는 `byCaseType.extraction`을 쓴다. 합성 원천에 해당 내용이 없어 규칙10(요약/맛 분리)·12(판매가 칸 기간)·health 사례는 합성 gold에 없다(규칙9만 06/09/20에 있음).

11-conflict는 A/B 각 중량을 문장에 명시해 확정값을 만들지 않는다. 12-mixed-products는 A/3kg를 대표로, B/5kg는 other_product 금지로 둔다. 13-common-farm은 대표 A에 공통 농가 사실만 사용한다. 10-historical은 지난해/2025년/5kg 행사 이력을 farm에 남기고 금액을 금지한다. 19의 수량 미확인은 유지하고20의 배송일 미확정은 운영 안내로 금지한다. 02-weight는 자연스러운 `감귤 5kg 한 상자입니다.`로 복원했다. 나머지 사례도 규칙9~12와 대조했으며, 과거 판매 이력/실측 근거는 판매 기간·효능 주장과 구분해 보존한다. 합성 가상 연락처는 기존 공개 fixture에 이미 있는 값만 forbidden에 사용한다.
