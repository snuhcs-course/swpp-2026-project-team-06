# 당도계 설명용 일러스트

2026-10-17 내장 `image_gen`으로 생성하고 사용자가 최종안을 확인했다. 사용자가 지정한 당도계 윤곽 이미지의 형태·측정부·액정·버튼1개 위치를 보존하고 기존 귤·냉장고·선별 아이콘의 채색 종이 질감을 입혔다.

참조 입력:
- 형태/편집 대상: 사용자 지정 생성 이미지 `exec-3d996999-bcba-4148-9e13-21c4c17b9c9a.png`
- 스타일: `docs/design/sales-templates/assets/icons/fruit.png`
- 스타일: `packages/ui/assets/source/headings/storage.png`
- 스타일: `packages/ui/assets/source/icons/select.png`

생성 PNG를 재가공 없이 복사하고 투명 알파를 보존했다. 실제 기기 사진/측정 증빙이 아닌 설명용 장식이며 LCD에는 수치를 넣지 않았다. 실측값이 있을 때만 중앙에 크게 표시하고 숫자·측정일은 API 값으로 아래에 따로 렌더한다.

## 최종 프롬프트

Use case: style-transfer.
EDIT IMAGE 1. The user explicitly chose THIS EXACT METER SHAPE. Preserve its outer silhouette, proportions, symmetric waist, round upper sample stage and all its internal contours, rectangular LCD position and size, and SINGLE orange circular button position and size. Do not redesign the instrument. Do not add a second button or substitute a different device. Retain image 1's exact composition and orientation.
Images 2–4 are STYLE AND COLOR references only: existing tangerine, refrigerator and inspection icons. Apply their filled matte gouache / handmade cut-paper appearance, fine paper grain, warm cream body, restrained sage details and warm orange button to the exact geometry in image 1. Fill the currently transparent instrument interior with warm cream textured paper. Fill the sample area with flat nested muted cream/sage/gray paper shapes that follow the existing contours. LCD should be pale sage and completely blank. Preserve the existing body seams as subtle boundaries between paper shapes, not heavy dark outlines. The result should look like a colored paper illustration belonging to the same family as images 2–4, while anyone comparing it to image 1 sees the SAME instrument shape and all the same parts in the same locations.
Use flat colors and paper texture, no directional lighting, glossy reflections, photographic material, added shadows or added perspective. Do not simplify away the recognizable sample well, body seams, screen bezel or waisted silhouette. No text, numbers, logo, labels, readings, fruit, leaves or hands. Keep true transparent background and full object uncropped with the original margin.
