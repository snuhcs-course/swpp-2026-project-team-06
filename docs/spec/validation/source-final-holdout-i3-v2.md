# I3 최종 문장 holdout v2 — DEV-194

FEAT-03/04/07 · AC-SRC-2/3/5/6. 현재 독립 평가용 holdout은 **v2**다. v1.1은 최초 평가와 부분 오염 T23 재실행 후 소진되었고 `RETIRED_TO_DEV`다. 기존 파일·키·marker·과거 점수는 그대로 보존하며 독립 품질의 새 증거로 재사용하지 않는다.

## 구축과 동결

owner가 제공한 구축 기록에 따르면, 튜닝에 참여하지 않는 독립 검토자 3명이 각각 작성하고 합의 패스를 거쳤다. 최종 gold는 **72문장·134사실(중요33)**이다. 논쟁 항목 **44개는 owner 결정으로 제외**했고 gold는 그 상태로 동결했다. 구현 에이전트는 이 기록과 hash-only lock만 받았으며 실제 원문·gold를 열거나 검증하지 않았다. 잠금은 모델 품질 통과를 뜻하지 않는다.

| 형식 | 자료 | 문장 | 사실 | 중요 사실 |
| --- | ---: | ---: | ---: | ---: |
| text | 3 | 24 | 49 | 15 |
| image | 3 | 12 | 25 | 6 |
| long_image | 3 | 17 | 24 | 3 |
| pdf | 3 | 19 | 36 | 9 |

[저장소 잠금](source-final-holdout-i3-v2-lock.json)은 ID·형식·hash·개수·동결 메타데이터만 담는다. gold 파일 바이트 SHA는 `goldSha256`, manifest 파일 바이트 SHA는 `manifestSha256`이다. v1.1의 `source-final-holdout-i3-lock.json`과 `sha256` 키는 바꾸지 않는다.

## 격리와 채점 담당자 지침

- 튜닝·구현 에이전트는 v2 원문, safe 입력, gold 문장·사실을 보거나 탐색하지 않는다. 테스트는 tmp 디렉터리에 만든 작은 합성 자료만 사용한다.
- 채점 담당자는 동결된 scorer/runner만 실행하고 **집계만 보고**한다. 원문/gold/실패 문장을 읽어 구현 개선안이나 예시를 작성하지 않는다. 오류를 분석해야 한다면 owner가 별도 정책을 결정한다. 모델 입력은 safe 자료이며 gold는 모델에 전달하지 않는다.
- stdout와 공유할 `report.json`, `report.md`, `score.json`, `score.md`에는 형식별 recall·중요 recall·오배치·금지·unsupported 수치·latency·cost 등 집계만 남긴다. 문장·인용·상품/자료 이름·ID별 결과·개인 경로·자유 서술 재실행 사유를 공유하지 않는다.
- `metadata.json`, 입력 snapshot, runs 봉투, stored/output/safe 파일, 감사 CSV 등 자료별 상세는 **저장소 밖 해당 run의 out 디렉터리 안에서만** 보관한다. 이 파일들은 Git·PR·이슈에 올리지 않는다. private gold/manifest/lock는 owner의 별도 private 입력 폴더에 유지한다.
- PDF도 개발 PDF와 같은 parser → OCR → 추출 → 정리 → 채점 경로를 거친다. 형식별 실패·빈 응답·미실행은 분모에서 빼지 않는다.

## private 디렉터리 계약

owner가 저장소 밖에 준비한 폴더를 `--holdout-dir`로 명시한다. 에이전트는 실제 경로를 찾아보지 않는다.

```text
<holdout-dir>/safe/<ID>.txt|.png|.jpg|.pdf
<holdout-dir>/manifest.json
<holdout-dir>/final-gold-v2.json
<holdout-dir>/final-gold-v2.lock.json
```

manifest는 `{id, format, ...}` 항목의 최상위 list다(봉투 객체는 거절한다). private gold는 기존 최상위 source 리스트이며 format은 봉투에서 주입한다([형식 계약](source-final-gold-format.md)). private v2 lock은 gold 해시를 `sha256`, manifest 해시를 `manifestSha256`으로 두며 둘 다 repo lock과 같아야 한다(repo lock만 gold 해시를 `goldSha256`으로 부른다). v2에서는 `--holdout-dir`를 반드시 지정한다. 원문·gold·manifest를 결과에 맞춰 수정하지 않는다. hash·ID·format 불일치는 내용 없는 고정 오류 코드/FAIL과 종료2로 거절하며 제공자 호출 전에 차단한다.

## 실행 순서와 정확한 명령

owner/채점 담당자가 서버 의존성을 설치한 환경에서 아래 환경변수에 실제 **저장소 밖** 경로를 지정한다. `HOLDOUT_V2_DIR`은 입력 폴더, `HOLDOUT_V2_OUT`은 아직 존재하지 않는 새 run 폴더다. 유료 실행에는 기존 scratch 로컬 PostgreSQL·평가 예산·OCR 준비가 필요하다. 운영 DB는 사용하지 않는다. 이 문서 작성 작업에서는 어떤 실호출도 하지 않았다.

먼저 잠금만 검사한다. `--out`, API 키, 예산, 실행 동의는 필요하지 않으며 source 파일을 읽지 않고 gold/manifest/lock을 확인한다. stdout는 PASS/FAIL과 형식별 자료·문장·사실·중요 사실 개수뿐이다. 이 명령은 DB/모델을 호출하거나 run marker를 만들지 않는다.

```sh
cd server
uv run python -m app.source_analysis.final_eval \
  --split holdout --holdout-version v2 \
  --holdout-dir "$HOLDOUT_V2_DIR" --verify-lock
```

PASS를 확인하고 개발 튜닝·프롬프트·측정 버전을 동결한 다음 **한 번만** 실행한다. 아래는 $3 실행 상한을 사용하는 명령이다. 제공자 호출 동의는 실행자가 `--yes`로 명시한다.

```sh
uv run python -m app.source_analysis.final_eval \
  --split holdout --holdout-version v2 \
  --holdout-dir "$HOLDOUT_V2_DIR" --out "$HOLDOUT_V2_OUT" \
  --provider openrouter --model google/gemini-3-flash-preview \
  --max-usd 3 --yes --i-understand-holdout-runs-once
```

버전 기본값은 v2이며 경로는 명시하는 것을 원칙으로 한다. v1.1은 `--holdout-version v1.1`로만 선택하는 역사 재현용이다. marker는 `final-gold-v2.json.run-once.json`이며 v1.1 marker와 분리된다. 실패/중단도 marker를 소비한다. **다시 실행해 좋은 결과를 고르거나 튜닝하지 않는다.** 예외 재실행은 기존 `--force-rerun --rerun-reason '사유'`와 동의를 모두 요구하고 새 번호 marker로 이력을 추가한다. 원래 marker/최초 결과는 덮어쓰지 않으며 재실행은 독립 평가가 아니다. 자유 서술 사유는 private metadata에만 남긴다.

이미 저장한 run의 오프라인 재채점은 다음 명령으로 수행하며 모델 호출·새 claim은 없다. run metadata의 holdoutVersion을 사용하고 과거 v1.1 metadata에 버전이 없으면 v1.1로 해석한다. 채점 규칙을 바꾸면 과거 결과와 직접 비교할 수 없다.

```sh
uv run python -m app.source_analysis.final_eval \
  --out "$HOLDOUT_V2_OUT" --rescore
```

공유하는 수치에는 `v2`, 측정 버전, 최초/예외 재실행 구분, 형식별 분모·실패·비용·사람 감사 미완료 여부를 함께 적는다. 자동 precision proxy는 의미 정확도나 적용 페이지 안전성의 증거가 아니다.
