# source_analysis

FEAT-03/04/07 · M-10~13/M-18 · AC-SRC-1~8. 제품 기준: docs/spec/source-analysis.md.

비공개 원본·분석 작업·출처 후보·생산자 검토·18개 요소 상세 초안을 소유한다. Product/주문은 변경하지 않는다. 외부 모델 호출은 app/ai/source_analysis.py에 한정한다.

PostgreSQL 작업 테이블과 독립 worker를 사용한다. 농가 소유권·revision·멱등 키를 검사하며 재분석은 확인한 값을 덮어쓰지 않는다. Mock은 명시적 fixture만 처리하고 실제 API 실패를 대체하지 않는다. 개인정보 검토를 통과한 파생 자료만 실제 모드에 전송한다.
