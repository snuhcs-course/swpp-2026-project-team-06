# 당도계 설명용 일러스트

2026-10-17 내장 `image_gen`으로 생성했다. 사용자 피드백에 따라 손 윤곽선 중심의 초기안을 교체했다. 아래 기존 자산4개를 실제 이미지 참조 입력으로 전달해 채워진 과슈·종이 질감, 크림·세이지·귤색을 맞추고 원근 없는 평면으로 생성했다.

- `docs/design/sales-templates/assets/icons/fruit.png`
- `packages/ui/assets/source/headings/taste.png`
- `packages/ui/assets/source/headings/storage.png`
- `packages/ui/assets/source/icons/select.png`

생성 PNG를 재가공 없이 복사하고 투명 알파를 보존했다. 실제 기기 사진/측정 증빙이 아닌 설명용 장식이며 LCD에는 수치를 넣지 않았다. 실측값이 있을 때만 표시하고 숫자·측정일은 API 값으로 따로 렌더한다.

## 최종 프롬프트

Use case: stylized-concept.
Create ONE small raster UI illustration of a digital fruit Brix refractometer to belong to the EXACT SAME ICON SET as the four supplied images.
References are STYLE references only: Image 1 whole tangerine, image 2 taste tangerines, image 3 cream refrigerator, image 4 magnifying glass. Match their MATTE GOUACHE / HANDMADE CUT-PAPER style, softly irregular filled silhouettes, visible fine paper grain, restrained orange #ee953f, sage #81876b, cream #e7dcc5 and tiny charcoal details. In particular use the refrigerator's flat filled cream body and sage details. These are filled colored paper shapes, NOT thin outline drawings.
Subject: one compact digital refractometer facing the viewer as a FLAT ORTHOGRAPHIC PLAN of its broad face. Upright rounded rectangular cream filled body, simple perfectly circular sage sample pad near the top with a tiny charcoal center, blank small sage LCD rectangle below, one orange circular button near the bottom. All shapes lie in ONE flat plane, no visible side or top planes, no foreshortening, no recessed 3D bowl, no dimensional edges. Same simple chunky friendly shapes and minimal details as the references, legible at 88px.
Do not copy any fruit, leaf, fridge or magnifying glass into the result. Only the meter. No thin contour outlines, no glossy plastic, no lighting gradients, no shadows, no photorealism, no perspective. No numbers, text, labels, logos, badges, or invented readings; leave the screen blank.
Centered, whole object visible, occupies 80% canvas height, square canvas. True TRANSPARENT BACKGROUND with preserved alpha, body itself filled cream textured paper.
