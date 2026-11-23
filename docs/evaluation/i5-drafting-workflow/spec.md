# I5 초안 편집·저장·반영 검증 결정

관련: FEAT-03/04/07, AC-SRC-1/2/3/5/6/7/9/11, M-11/13/18. 동작 계약은 docs/spec/source-integration.md·source-editor.md를 따른다.

| 날짜 | 결정 | 근거 |
| --- | --- | --- |
| 2026-11-24 | Jinwoo 판정을 기다리는 동안 현행 baseline의 로컬 workflow를 검증한다. 신규 writer 선택/품질·농가 인수는 포함하지 않는다. | 사용자 go on 지시, DEV-452 독립 진단 slice. |
| 2026-11-24 | origin/main ef390bde에서 독립 worktree, mock모델·local storage·격리DB를 사용한다. 미머지 DEV-445/453 통합빌드가 아니라고 명시한다. | 운영 데이터/비용 보호와 빌드 식별. |
| 2026-11-24 | 기존 API/pytest/Playwright 실제stack suite로 생성→직접수정→저장/재개→미리보기→명시적적용 및 실패/재분석을 확인한다. 필요 없는 테스트 중복은 추가하지 않는다. | 기존 실패복구·모바일·소비자render 시나리오 활용. |
| 2026-11-24 | 발견된 실제 결함은 먼저 task 범위를 추가한 뒤 수정한다. 기존테스트를 지우거나 약화하지 않는다. | Spec-anchored 범위/완료 규칙. |
