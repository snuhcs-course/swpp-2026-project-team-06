# I5 scorer 능력 진단 구현 결정

관련: FEAT-03/04/07, AC-SRC-2/3/5/10, M-11/18. 기존 제품·gold 계약은 docs/spec/source-analysis.md 및 validation/source-final-gold-format.md를 따른다.

| 날짜 | 결정 | 근거 |
| --- | --- | --- |
| 2026-11-24 | 공개 가능한 가상 positive/near-miss controls와 기존 scorer를 호출하는 오프라인 진단만 추가한다. 기존 scorer/gold/정규화/제품 코드는 바꾸지 않는다. | 사용자 go on 및 DEV-448 범위, 사람 gold 승인은 대기. |
| 2026-11-24 | 제안된 의미 판단과 관찰된 strict 지표를 분리하고, 위치만 다른 경우·correct-empty 계약을 의미 오류로 섞지 않는다. | 지표 축 혼동 방지. |
| 2026-11-24 | fixtures/관찰 결과/기준 코드 해시를 남기고 결과를 성능 추정·승인 evaluator로 부르지 않는다. | 합성·agent 제안/사람 판정 한계. |
| 2026-11-24 | 회귀는 이미 test-source-final에 포함되는 기존 test_final_score.py에 추가한다. DEV-445와 겹치는 Makefile/구현 spec은 수정하지 않는다. | 기존 실행 경로 사용, 병렬 PR 파일 분리. |
