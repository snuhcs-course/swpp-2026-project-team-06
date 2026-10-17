# 상품 크기 설명용 일러스트

윤곽선 소·중·대 3종만 공통 상세 렌더러에서 사용한다. [생성 프롬프트](outline-prompts.md)는 기존 디자인 작업에서 가져왔다. 실제 상품 사진이나 측정 증빙이 아니며, 손 길이 18cm는 비교용 가정이다. 원본 디자인 및 이전 제작 기록은 docs/design/sales-templates/assets/size-guide에 보존한다.

## DEV-57 단일 상세 템플릿 장식 (2026-10-17)

`headings/*.png` 7종, `decor/photo-frame.png`, `icons/{harvest,select,send}.png`는 기존 `docs/design/sales-templates/assets/`의 같은 파일을 바이트 변경 없이 복사했다. 새 이미지 생성/가공은 하지 않았다. 생성 도구·최종 프롬프트는 원본의 [소제목 기록](../../../../docs/design/sales-templates/assets/headings/README.md), [테두리 기록](../../../../docs/design/sales-templates/assets/decor/README.md), [아이콘 기록](../../../../docs/design/sales-templates/assets/icons/README.md)에 보존한다.

소제목 아이콘은 36px 장식이며 읽을 수 있는 제목을 별도로 둔다. 공정 아이콘은 원문 공정 설명 아래의 장식으로만 쓰며 수확·선별·출하 완료나 순서를 추가하지 않는다. 웹 사진 테두리는 원본과 같은 9% 분할/14px border-image로 사진 바깥에 표시하고 사진 비율을 보존한다. 네이티브에서는 기존 사진 표현을 유지한다. 이전 생성 구획선은 최종 디자인에서 사용자가 CSS 선으로 되돌려 이식하지 않았다. 원산지/품종 아이콘은 해당 구조화 정보가 없는 모듈에 임의로 붙이지 않는다.
