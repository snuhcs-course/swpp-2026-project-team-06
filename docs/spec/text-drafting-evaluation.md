# DEV-448 텍스트 중심 평가 (명시적 opt-in)

FEAT-03/04/07 · AC-SRC-2/3/5/10/11 · M-11/18. 기존 strict scorer/gold는 변경하지 않는다. 새 text_score는 page-wide 보존·의미/근거·위치·반복·처리 결과를 분리하는 개발 진단이다. 승인되지 않은 gold/의미 판단을 human approved로 부르지 않는다. 판단 범위를 넘는 paraphrase는 UNKNOWN이며 lexical token만으로 의미 정확성을 인정하지 않는다. 실제 기존 정답/임계치는 변경하지 않고 새 결과와 나란히 기록한다.

가격·개인정보·효능·정책 경계는 현재 source-analysis.md 계약을 따른다. 정상 빈 결과는 명시된 빈 gold 계약에서만 구분한다. source/product/option/measurement/sample/time 조건이 다른 값은 같은 근거로 쓰지 않는다. support false를 token 일치로 덮지 않는다. 전체 출력의 추가 주장도 별도 검사한다. historical criticalGate는 95% 전체/형식별 recall 통과가 아니다. 미해결 의미와 처리 불완전은 새 acceptance에서 드러낸다.

이번 범위는 텍스트 출력과 점수다. 이미지/PDF의 글 읽기는 유지하되 사진 선택·크롭·시각 디자인 평가를 포함하지 않는다. 생산자 직접 수정·비공개 저장·명시 적용/권한은 그대로다. 실제 제품 채택/운영 배포는 별도이며 source/editor 계약 변경을 암묵적으로 수행하지 않는다.
