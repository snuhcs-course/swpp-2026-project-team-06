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
- source-v3 프롬프트는 구성/농장 소개와 불확실한 조건을 보존한다. 인용은 공백 배치만 정규화해 원문 오프셋으로 복원하며 숫자·문자·구두점 변경은 허용하지 않는다. 진단 사유는 비공개 평가에만 저장한다.
- 평가 도구는 고정 SHA 원문 manifest와 정답을 받는다. 실패·빈 결과를 분모에서 빼지 않으며 이미지/PDF도 형식별95% 게이트에 포함한다. 실제 공개자료 평가와 실제 농가 인수는 별개다. 현재 실제 시각 자료 정확도는 기준 미달이며 상세 결과는 docs/spec/validation/source-visual-2026-10-16.json을 따른다.
