# DEV-453 인용 근거의 한글 줄바꿈 보정

관련: FEAT-03/04/07, AC-SRC-2/3/5/8/10, M-11/18. 기존 [자료 분석](source-analysis.md)의 근거/저장/공개 계약을 유지하며 아래의 레이아웃 처리만 추가한다. gold/scorer·모델·prompt 본문·가격/건강/개인정보 정책을 바꾸지 않는다.

## 허용 범위

추출 quote를 cited page/span의 연결 원문에서 찾을 때 기존 exact match와 공백 묶음 정규화를 먼저 적용한다. 추가 fallback은 **한글 완성형 음절 양옆의 단일 물리 개행**만 접는다. LF/CRLF 및 개행 주변 space/tab은 같은 줄바꿈으로 본다. query와 원문의 같은 제한적 레이아웃 표현을 비교하고, 성공하면 **원문의 실제 substring을 그대로** evidence.quote에 저장한다. span ID·page·revision·source 연결과 candidate.value는 변경하지 않는다.

예시(가상): 원문 `과즙이 풍부\n합니다.`와 모델 quote `과즙이 풍부합니다.`는 연결할 수 있고 저장 quote는 원래 개행이 있는 원문이다. 문자나 부정/조건을 새로 만들거나 삭제하지 않는다. 이 처리는 의미/현재성/사실 정확성을 인증하지 않는다.

일반 띄어쓰기 삭제, 두 번 이상 개행/문단 경계 삭제, 숫자·단위·영문·기호 경계 접기는 허용하지 않는다. 예: `2\n4kg`→`24kg`, `4\nkg`→`4kg`, `2024\n년`→`2024년`은 이 fallback에서 거절한다. 원문에 없는 단어·숫자·구두점·따옴표·표 구분자·불확실성 변경도 계속 거절한다.

## 유지하는 검증·편집 계약

- 다른 source/revision/page/span, 가림표시, 근거 없는 숫자/개수/인증, 잘못된 target, 개인정보 및 historical/field 충돌 검사는 그대로다.
- 가격이 있는 historical composition을 현재 상품 구성으로 자동변환하지 않는다. 현재성/정책 판정은 사람 검토로 남긴다.
- stage-1 근거 복구가 stage-2 게시 허가를 뜻하지 않는다. 기존 금액·건강·과장·정책·범위 등 검사를 통과해야 하며 안전성 때문에 거절된 문구/원문 후보를 자동복원하지 않는다.
- 생산자가 확정/제외/수정한 값과 명시적 상품반영·버전충돌 보호를 유지한다. 저장된 과거 후보나 공개페이지를 이 수정으로 자동 재작성하지 않는다.

추출 pipeline version은 `source-v9-coverage-wrap1`이다. prompt 본문은 그대로이며 version 변경으로 이전 추출의 재사용을 피한다. 기존 worker의 version 불일치 보호가 적용되고 자동 재호출은 없다. 재분석은 기존 사용자 시작/비용/검토 계약을 따른다. 이 PR의 로컬 prototype은 운영 배포/사람 인수·릴리스 범위 승인이 아니다.

원인별 추적/고정출력 replay와 한계는 [진단 보고](../evaluation/i5-evidence-layout/README.md), 영문 요약은 [wiki](../wiki/Source-Evidence-Layout.md)에 기록한다. 원문과 상세 trace는 git 밖 비공개 보관한다.
