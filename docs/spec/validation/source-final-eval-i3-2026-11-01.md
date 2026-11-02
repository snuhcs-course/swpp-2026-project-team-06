# DEV-170 · I3-T11 최종 문장 평가 · 2026-11-01

**판정: FAIL.** 형식별 precision/recall ≥95% 목표를 충족하지 못했다. 개발 R4 사실 recall은 72/87(82.76%), holdout v1.1 최초1회는 59/261(22.61%)다. 두 split 모두 평가된 stage-2 출력의 unsupported critical facts 0과 forbidden content 0 목표는 충족했다. 이는 사람 근거 감사나 실제 적용 페이지 안전성을 입증하지 않으며, 해당 검증은 미완료다.

owner가 실행한 고정 평가 결과다. 원문·private gold·출력 문장·후보·worksheet는 저장소 밖에 보존한다. 동반 [JSON](source-final-eval-i3-2026-11-01.json)은 ID·형식·설정·해시·집계만 포함한다.

## 설정과 표본

- 관련: FEAT-03/04/07 · AC-SRC-2/3/5/6 · M-11/13/18. 채점은 DEV-187 final-text scorer이며 stage-1 필드 점수와 구분한다.
- 실제 제품 parse/OCR → extract → validate_candidates → refine → refinement.validate → 로컬 저장 stage-2 modules를 평가한다. 큐·상품 DB·공개 적용은 실행하지 않는다.
- 개발32건: 합성20 + 공개개발12. text21(추출17 + contract4), image6, long_image1, pdf4. EVALUATED26/EMPTY6.
- holdout v1.1은 형식별3건, 총12건(146 gold 문장·261사실·critical109). R4 버전을 고정한 뒤 **단 한 번** 실행했다. EVALUATED5/EMPTY1/FAILED6. 실패·빈 응답은 분모에 유지한다.

| 설정 | 버전/값 | SHA256 |
|---|---|---|
| 모델 / provider | `google/gemini-3-flash-preview / openrouter` | N/A |
| stage-1 | `source-v8-exact-numbers` | 846fdf7327c985a23a87f0555fe877ad94e615a00ac0a2facd43a037c547d4de |
| stage-2 | `source-refine-v6-exact-numbers` | dfd02bf9ab136d8d8836acffda527a15bb9031bd2ba9665dc0ebb0e48c41078e |
| OCR 모델 / prompt | `google/gemini-3-flash-preview` | 63176d0350e333499c1588dfb24812675be5806fe580f42ef02239695d6046c1 |
| OCR manifest | `metadata 고정값` | 6aa2338a8ecdd86cafd35e7d77a1f0478e3e9fe66abf80a3f7406ca4d264680a |
| 안전 목록 | `공유 JSON` | 7361062564d010b618842a60ca5f6a180114b0cbf2cfcaac0c7312a30cbd5bc7 |
| 전처리 | `source-parser-v3` | N/A |

두 실행의 위 설정·해시는 동일하며 metadata.json에서 읽었다. OCR에는 별도 prompt version 필드가 없어 prompt SHA256을 식별자로 기록한다. 입력/출력 해시는 private 실행에, metadata/score/critical-audit의 artifact 해시는 동반 JSON에 보존하며 private 본문은 복사하지 않는다.

## 형식별 최종 수치

사실 recall은 같은 section의 mustContain 일치다. precision proxy는 자동 문장 support 지표이며 의미 precision을 대신하지 않는다. 분모0은 N/A다. 오배치는 누락 사실과 겹칠 수 있어 합산하지 않는다. scorer의 failedRuns는 EMPTY도 포함하므로 실제 상태는 별도로 표시한다.

### 개발 r4

| 형식 | N | Facts recall | Critical recall | Misplaced | Forbidden | Unsupported | Precision proxy |
|---|---:|---:|---:|---:|---:|---:|---:|
| text | 21 | 27/31 (87.10%) | 14/17 (82.35%) | 0 | 0 | 0 | 22/22 (100.00%) |
| image | 6 | 19/25 (76.00%) | 11/14 (78.57%) | 6 | 0 | 0 | 19/21 (90.48%) |
| long_image | 1 | 16/18 (88.89%) | 5/5 (100.00%) | 0 | 0 | 0 | 11/11 (100.00%) |
| pdf | 4 | 10/13 (76.92%) | 5/6 (83.33%) | 1 | 0 | 0 | 13/13 (100.00%) |
| overall | 32 | 72/87 (82.76%) | 35/42 (83.33%) | 7 | 0 | 0 | 65/67 (97.01%) |

### Holdout v1.1 · 최초1회

| 형식 | N | Facts recall | Critical recall | Misplaced | Forbidden | Unsupported | Precision proxy |
|---|---:|---:|---:|---:|---:|---:|---:|
| text | 3 | 0/67 (0.00%) | 0/27 (0.00%) | 0 | 0 | 0 | 0/0 (N/A) |
| image | 3 | 25/27 (92.59%) | 20/21 (95.24%) | 2 | 0 | 0 | 21/23 (91.30%) |
| long_image | 3 | 34/74 (45.95%) | 9/20 (45.00%) | 8 | 0 | 0 | 39/40 (97.50%) |
| pdf | 3 | 0/93 (0.00%) | 0/41 (0.00%) | 0 | 0 | 0 | 0/0 (N/A) |
| overall | 12 | 59/261 (22.61%) | 29/109 (26.61%) | 10 | 0 | 0 | 60/63 (95.24%) |

## 지연·비용

metadata.json의 source별 관측치로 계산했다. p50=median, p95=nearest rank(ceil(0.95×n)). latency 단위는 ms다. 실패/EMPTY도 E2E와 비용에 포함하며 미실행 단계(null)는 단계 집계에서 제외한다. stage2의 no-op 관측값은 그대로 포함한다. n은 stage1/stage2/E2E 순서다. cost는 source별 정산액의 p50/p95와 합계/평균이며 실패0비용도 포함한다. 특히 holdout PDF E2E p50은 전처리 즉시 실패2건 때문에 낮으므로 성공 처리 지연으로 해석하지 않는다.

| Split | 형식 | n (S1/S2/E2E) | Stage1 p50/p95 ms | Stage2 p50/p95 ms | E2E p50/p95 ms | Cost p50/p95 USD | Cost 합계/평균 USD |
|---|---|---|---:|---:|---:|---:|---:|
| dev r4 | text | 21/21/21 | 1731.242/2515.327 | 1441.633/2328.578 | 3326.187/5189.208 | 0.002687/0.003220 | 0.053179/0.002532 |
| dev r4 | image | 6/6/6 | 4490.124/6018.477 | 2450.328/3314.708 | 7692.226/9526.717 | 0.004557/0.005411 | 0.027511/0.004585 |
| dev r4 | long_image | 1/1/1 | 21442.200/21442.200 | 2931.625/2931.625 | 26554.619/26554.619 | 0.014352/0.014352 | 0.014352/0.014352 |
| dev r4 | pdf | 4/4/4 | 4989.648/5650.755 | 2103.788/3700.570 | 7657.699/8855.609 | 0.004532/0.005176 | 0.018440/0.004610 |
| dev r4 | overall | 32/32/32 | 2310.241/6018.477 | 1662.611/3700.570 | 3839.286/9526.717 | 0.002901/0.005411 | 0.113482/0.003546 |
| holdout | text | 3/1/3 | 11167.806/18678.535 | 0.034/0.034 | 11168.791/18678.594 | 0.010942/0.015985 | 0.033254/0.011085 |
| holdout | image | 3/3/3 | 14601.483/16143.916 | 2712.052/3917.833 | 19978.866/19998.453 | 0.008169/0.008707 | 0.023644/0.007881 |
| holdout | long_image | 3/2/3 | 61554.185/113799.981 | 4433.265/5024.179 | 72200.773/121947.545 | 0.027460/0.033962 | 0.079259/0.026420 |
| holdout | pdf | 1/0/3 | 31818.066/31818.066 | N/A | 0.337/34577.187 | 0.000000/0.020778 | 0.020778/0.006926 |
| holdout | overall | 10/6/12 | 17411.225/113799.981 | 3277.202/5024.179 | 19328.730/121947.545 | 0.009824/0.033962 | 0.156935/0.013078 |

개발 정산 **$0.113482 (약 $0.113)**, holdout **$0.156935 (약 $0.157)**. 호출 수는 각각77/71회다. 모든 source costKnown=true, 미정산 예약0이다. 누적 총 예약액은 개발$2.143921/holdout$4.322365이며 정산액에 더하지 않는다. 비용은 owner의 해당 평가 실행 지출이다.

## 개발 이력 (전체 집계만)

| Round | Facts | Critical | Misplaced | Forbidden | Unsupported |
|---|---:|---:|---:|---:|---:|
| r2 | 57/87 | 23/42 | 12 | 2 | 0 |
| r3 | 71/87 | 35/42 | 4 | 1 | 4 |
| r4 | 72/87 | 35/42 | 7 | 0 | 0 |

R3 unsupported4개는 모두 scorer의 숫자 범위 정규화 차이로 기존 private 분석에서 분류되었다. image2개는 하이픈을 음수 부호로 읽는 차이, pdf2개는 범위를 양끝 월로 나눈 표현 차이다. 관련3문장의 끝점·단위는 안전 원문과 인용에 있으며 발명/계산·단위 변환·OCR-only 사실은0이었다. **scorer·gold·R3 원점수는 수정하지 않으며 unsupported4를0으로 재표시하지 않는다.** R3 금지1건은 실제 문의 채널 정책 누출이다. R4는 개발 튜닝 후의 결과이며 독립 측정이 아니다.

## Critical-claim 감사 집계

critical-audit.csv의 행 수·critical 플래그·supported 판정 칸만 집계했다. 문장·숫자·품종·인증 원문은 복사하지 않았다. 이는 gold critical 사실 수와 다른, 출력 중 숫자/날짜·품종·인증 detector에 걸린 **문장 수**다. 한 문장에 여러 범주가 있을 수 있으므로 범주별 사실 수로 해석하지 않는다.

| Split | text | image | long_image | pdf | Critical=true 행 | supported=true | supported=false | 미검토 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dev r4 | 7 | 13 | 2 | 8 | 30 | 0 | 0 | 30 |
| holdout | 0 | 21 | 24 | 0 | 45 | 0 | 0 | 45 |

두 CSV의 supported 칸은 모두 비어 있다. 따라서 사람 감사 상태는 **PENDING**이며, 자동 unsupported0을 사람 검증 완료로 간주하지 않는다. 전체 문장 근거100%, 원본/PDF 대조, 누락/충돌 blank/flag와 실제 적용 페이지 검증도 미완료다.

## 목표 대비 결과

| 목표 | 결과 | 근거/한계 |
|---|---|---|
| 형식별 precision/recall ≥95% | **FAIL** | 모든 형식의 사실 recall이 두 split 모두95% 미만. 의미 precision은 미검토이며 자동 proxy만으로 PASS 불가 |
| unsupported critical facts 0 | **충족 (두 split의 채점 출력)** | 수치·품종·인증 unsupported token 모두0. 실제 적용 페이지/사람 감사와 구분 |
| forbidden content 0 | **충족 (두 split)** | 금지 내용0 |
| accepted evidence 100% | PENDING | critical30/45문장 모두 미검토; 전체 문장/source 감사 필요 |
| 누락/충돌 critical blank/flag, 실제 적용 unsupported critical 0 | PENDING | runner가 공개 적용하지 않으며 source/적용 감사 미완료 |

## 형식별 실패 원인과 오류 코드

개발의 section별 누락/오배치와 holdout의 상태·errorCode만 사용한다. 코드만으로 OCR/모델 단계의 세부 의미 원인을 단정하지 않는다.

| 형식 | 개발 r4 | Holdout 최초1회 |
|---|---|---|
| text | 누락4/31(critical3), 오배치0. EMPTY6(추출/contract는 별도 분모) | 0/67: CANDIDATES_REJECTED1, EMPTY1, INCOMPLETE_OR_REFUSED1. 후보 일괄 거절/빈 결과/불완전 또는 거절 응답. EMPTY 상세 원인은 metadata로 확정 불가 |
| image | 누락6/25, 오배치6: section 배치가 주된 관측 오류 | 3/3 EVALUATED이나 누락2/27·오배치2; 사실 recall92.59%, proxy91.30%로 목표 미달 |
| long_image | 누락2/18, critical5/5, 오배치0. 표본1건 | 2 EVALUATED + 1 FAILED CANDIDATES_REJECTED. 누락40/74, 오배치8; 부분 후보 거절이 항목 전체 실패로 전파 |
| pdf | 누락3/13(critical1), 오배치1 | PREPROCESS_FAILED2: 22·41페이지 웹 인쇄 PDF가 제품20페이지 한도 초과. CANDIDATES_REJECTED1. 0/93, 모두 FAILED |

Holdout source별 상태는 다음과 같다. EMPTY는 errorCode가 아니라 status다.

| ID | 형식 | 상태 | errorCode |
|---|---|---|---|
| h3-text-01 | text | FAILED | CANDIDATES_REJECTED |
| h3-text-02 | text | EMPTY | — |
| h3-text-03 | text | FAILED | INCOMPLETE_OR_REFUSED |
| h3-image-01 | image | EVALUATED | — |
| h3-image-02 | image | EVALUATED | — |
| h3-image-03 | image | EVALUATED | — |
| h3-long_image-01 | long_image | EVALUATED | — |
| h3-long_image-02 | long_image | EVALUATED | — |
| h3-long_image-03 | long_image | FAILED | CANDIDATES_REJECTED |
| h3-pdf-01 | pdf | FAILED | PREPROCESS_FAILED |
| h3-pdf-02 | pdf | FAILED | PREPROCESS_FAILED |
| h3-pdf-03 | pdf | FAILED | CANDIDATES_REJECTED |

## 한계

- 개발32건에는 긴 실제 text/PDF가 부족하다. 합성·짧은 자료에서의 개선을 긴 실제 자료 성능으로 일반화하지 않는다.
- scorer의 숫자 범위 정규화 공백이 있으며 R3의4개 자동 flag를 보존한다. 자동 proxy·mustContain은 의미 precision/recall과 동일하지 않다.
- mock E2E는 성공적인 시각 자료 추출을 검증하지 못한다. parser/OCR 성공 경로와 실제 시각 추출 품질은 별도다.
- holdout은 형식별3건의 single-run이다. 반복성·변동성·일반 성능을 추정할 수 없으며 실패/EMPTY도 분모에 남는다.
- 사람 critical/전체 문장·source 감사와 실제 공개 적용 검증은 미완료다. E2E는 in-process 경로라 worker subprocess·큐·DB·공개 적용 지연을 포함하지 않는다.
- 허용된 T23 재실행1회 뒤 holdout은 **spent**다. 향후 독립 측정은 새 holdout v2가 필요하다.

## T23 (DEV-182) 계획

다음은 오류 유형에 대한 후속 일반 수정 계획이다.

1. 일부 후보가 거절되어도 유효 후보를 유지하여 항목 전체 실패를 막는다.
2. 20페이지 초과 PDF는 **첫20페이지를 분석하고 나머지 생략을 생산자에게 알린다** (owner 결정 2026-11-01). 이 결정은 후속 구현 계획이며 이번 결과의 PREPROCESS_FAILED/분모를 소급 변경하지 않는다.
3. 긴 text를 chunk로 나누어 모델 출력 잘림을 방지한다. INCOMPLETE_OR_REFUSED가 모든 경우 truncation임을 확정한 것은 아니다.

## Bias and reuse

- The single holdout run above is the only uncontaminated independent measurement for I3.
- T23 fixes are chosen from holdout failure **types** (error codes), not holdout content. Even so, any later holdout rerun is partially contaminated, so it must be reported as such and must not replace the first result.
- After the one allowed T23 rerun, the 12 holdout sources move into the development set (32 → 44) for regression and tuning. Any future independent claim needs a new holdout v2 built with the same 3-reviewer process.
- The owner explicitly flagged the risk of bias in this plan. Record that the risk is acknowledged and not resolved.
- **Known indirect contamination of the first holdout run (disclosed 2026-11-01):**
  1. Product rules 9–12 (exclude seller-shop operational text and periods, block health claims, keep delivery method, split taste/size from the summary) were decided while the owner and Claude reviewed holdout gold. The stage-2 prompt encodes these rules, so the holdout was not fully unseen by the product design.
  2. Claude built and reviewed the holdout gold and also directed development tuning.
  3. Some Codex runs (the runner build and this report) had read access to the private holdout folder. The tuning runs did not.
  The product model never saw gold, and no prompt or code was changed after the holdout run. Even so, the first holdout result should be read as optimistic for the rule-driven parts (forbidden content, placement).
- **Separation rule from now on:** holdout sources and gold are readable only by the scoring script run by the owner. Tuning agents receive only aggregate scores and error codes. Product rules are decided on the development set only. The gold builder does not direct tuning.

## 검증

**최종(샌드박스 밖, 2026-11-01):** 로컬 `.env` 없이 `cd server && uv run --extra ocr pytest` → **1056 passed / 0 failed**, `uv run ruff check .` 통과. Playwright `source-review-regressions`·`new-product-composer`·`source-workspace-ui` → **23 passed**. 아래 항목은 수정 중간의 sandbox 기록이다.

owner가 sandbox 밖에서 실행한 전체 pytest는 **1045 passed / 1 failed**였으며, 실패는 숫자 형식 집계 키를 차단한 `test_AC_SRC_6_validation_json_excludes_holdout_payloads_except_metadata_lock`이었다. `test_core` 실패는 로컬 `.env` 설정만 원인이었고 해당 파일 없이 통과했다. 아래 결과는 이 guard 수정 후 로컬 `.env`를 임시 분리하고 복원한 검증이다. 전체 suite의 수정 후 통과를 추정하지 않는다.

- `cd server && uv run ruff check . && uv run pytest tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py --tb=short` → Ruff 통과, **525 passed / 6 failed (71.96s)**. 수정한 개인정보 guard는 **1 passed / 0 failed**이며 final_eval·final_score·source_refine 세 파일은 모두 통과했다.
- 실패6건은 기존 worker PREPARE 경로다. 독립 합성 입력의 `prepare`도 sandbox에서 `PermissionError(errno 1)`와 `sysctl` 접근 오류를 재현했다. parser 보호와 기존 assertion을 유지했으며 sandbox 밖 최종 재검증이 필요하다. 상세 실패 ID는 동반 JSON에 기록한다.
- `npm run typecheck && npm run test:mock` → typecheck 통과, mock **47 passed / 0 failed**.
- `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts` → **0 passed / 8 failed**. Chromium의 `bootstrap_check_in` / MachPortRendezvousServer 권한 오류(1100)로 브라우저가 시작하지 못했고 화면 assertion은 실행되지 않았다.
- 변경20파일 추가 내용을 기존 private/holdout 문장 패턴으로 검사한 결과 일치0건이다. 비공개 본문을 출력하거나 보고서에 복사하지 않았다.

전체 검증은 **환경 차단으로 미완료**다. 품질 목표·사람 감사·운영 배포/머지 완료와 구분한다. Figma v6의 인증 오류 안내 문구 동기화는 후속 작업이다.

runner는 mock holdout을 거절한다. 강제 재실행은 비어 있지 않은 사유가 필수이고 기존 marker 수+1과 사유를 marker·metadata에 남긴다. 예상 밖 source 오류는 메시지 없이 `SOURCE_FAILED`로 기록하며, 실행 중단 시에도 부분 metadata·runs와 누적 비용을 보존한다. 회귀 테스트는 합성 입력과 stub만 사용한다.


## DEV-182 측정 수정 기록 (2026-11-02)

T11 개발 실행의 월 범위 표현에서 발생한 unsupported 오탐4건은 final scorer의 범위 토큰 비교 결함이었다. `3-5월`/`3~5월`/`3월–5월`/`3월에서 5월 사이`를 한 범위로 비교하는 합성 회귀를 추가했다. 원문 범위의 단일 끝점만 출력하면 main처럼 미지원이며, 단일 끝점으로 출력 범위를 지원하지도 않는다. 모델 프롬프트는 변경하지 않았다. 위의 과거 점수·JSON 산출물을 소급 변경하지 않으며 수정 scorer의 개발 재측정 결과는 아직 없다.

일반 제품 수정은 유효 후보가 남은 EXTRACT PARTIAL/명시적 retry 보존과 refine 허용, PDF 첫20쪽과 생략 안내, 일반 텍스트4000자 chunk, refine 입력 상한/REFINE_INPUT_LIMIT 진단, 파일 전체가 빈 경우에만 한 번 표시하는 안내다. retry로 후보 집합이 바뀌면 이전 정리를 outdated로 취급하고 새 정리를 실행하며 실패/불확실 요청은 자동 재생하지 않는다. 신규 개발 합성 사례 `21-long-text`/`22-pdf-25-pages`/`23-partial-validation`과 규칙9–12를 따른 gold를 추가하여 합성23건/전체35건이 되었다. 기존 개발 private 항목과 holdout 잠금은 그대로다. holdout private 자료 접근·실행 및 live/유료 호출은 하지 않았다. 합성 mock 검증은 모델 품질 측정이 아니다.

사람용 재측정 명령(저장소 루트에서 server로 이동, 기존 설정 키 사용; 이번 세션에서 실행하지 않음):

```sh
cd server
DATABASE_URL=postgresql+psycopg://farmclub:farmclub@127.0.0.1:55484/farmclub_dev182 \
uv run python -m app.source_analysis.final_eval \
  --split development --subset all --provider openrouter \
  --model google/gemini-3-flash-preview \
  --max-usd 3 --yes --out ../../source-dev-i3-private/dev182-live-dev
```

`--inputs-from`은 기존32건 snapshot에 새3건이 없으면 ID 불일치로 거절되므로 위 명령에서는 생략한다. 갱신 manifest의 synthetic subset이 새3건을 자동 생성하며 기존 public12건은 development safe 폴더에서 읽는다. 출력 폴더는 새 전용 폴더여야 한다. PDF/이미지는 기존 로컬 OCR 모델 준비가 필요하며 자동 설치/다운로드하지 않는다. 합성 입력 해시 계약은 [제품 spec](../source-analysis.md#synthetic-input-definition)을 따른다. 초기 T11 결과를 대체하거나 독립 holdout 성능으로 해석하지 않는다.



DEV-182 리뷰 후 로컬 검증(2026-11-02): `cd server && uv run ruff check . && uv run pytest tests/test_source_recovery.py tests/test_final_eval.py tests/test_final_score.py tests/test_source_refine.py tests/test_source_analysis.py tests/test_source_integration.py --tb=short` → **Ruff 통과; 627 passed / 17 failed (97.78s)**. 실패는 모두 추출 전 PREPARE 경로(source_recovery3/source_analysis6/source_integration8)이며 독립 합성 prepare에서도 `PermissionError(errno 1, sysctl malloc 1/3)`를 재현했다. 두 기존 PARTIAL retry 회귀도 이 환경 문제로 추출 전에 막혔으므로 sandbox 밖 재검증이 필요하다. 기존 recovery assertion·parser 보호는 변경하지 않았다. 준비된 합성 입력의 PARTIAL→refine·명시적 retry 후 동일 집합 성공 재사용/변경 집합 outdated 회귀는 통과했다. 중간 chunk에 실제 상품 사실이 없는 긴 텍스트로 fixture를 강화한 뒤 집중 회귀 **2 passed / 0 failed (1.66s)**를 확인했다.

`npm run typecheck && npm run test:mock` → **5 workspace typecheck 통과; mock47 passed / 0 failed / 0 skipped (28.07s)**. Playwright spec TypeScript 검사는 종료0. `npm run test:e2e -- scripts/e2e/source-review-regressions.spec.ts --grep DEV-182 --max-failures=1` → **0 passed / 1 failed / 5 did not run**. Chromium MachPort 권한 오류1100으로 브라우저가 시작하지 못해 화면 assertion은 실행되지 않았다. 전체 검증은 미완료이며 모델 품질·독립 holdout 성능·배포 완료로 간주하지 않는다. 이번 수정은 미커밋 상태로 유지했고 push·PR·live 호출·holdout 접근은 하지 않았다.
