# imagegen 구획선·사진 테두리

현재 구획선은 원래 CSS 선으로 원복했다. [역할별 3종](roles.md)과 section-divider.png는 기록용이며 photo-frame.png만 계속 사용한다.

2026-10-14 사용자 요청으로 내장 imagegen에서 개별 제작. 기존 harvest.png 아이콘을 질감 참고로 사용했다. 투명 PNG 생성 원본을 편집 없이 저장했다. 사진이나 판매 정보는 생성하지 않았다. 구획선은 CSS 배경으로, 테두리는 중앙을 채우지 않는 border-image로 표시한다.

## section-divider.png

최종 프롬프트:
Use case: stylized-concept. Make one restrained horizontal section-divider asset for a Korean farm editorial product page. Landscape 3:1 transparent PNG canvas. A SINGLE very thin, gently irregular hand-painted horizontal graphite/sage-beige stroke runs from 3% to 97% of the canvas width at the vertical center. Stroke thickness approximately 4% of canvas height, consistent quiet weight, slightly tapered ends, delicate paper grain. Color muted warm grey-sage #acae98. No botanical ornaments, icons, dots, text, letters, photos, shadows, gradients, border, or background. It should look like a dry gouache pencil mark on paper, matte and calm, visible on white. True transparent alpha everywhere except the single stroke. Match the subtle paper grain and muted palette of the supplied STYLE REFERENCE, not its subject.

## photo-frame.png

최종 프롬프트:
Use case: stylized-concept. Create a reusable square photo FRAME BORDER asset, transparent PNG. Four connected straight narrow bands of warm ivory handmade paper surround a completely TRANSPARENT empty center. A quiet subtle cut-paper/deckled edge frame for an editorial Korean farm product page, matching the matte paper grain of the supplied STYLE REFERENCE. Outer frame fills the canvas and reaches all four outer edges; no external margin. The paper band is approximately 6% of the canvas width on each edge. Inner boundary at 6% inset, gently rough fibers, near rectangular corners, no ornament. Paper tone warm cream #e6ddcc with light natural fiber variation, thin restrained sage-beige fibers. Center from x=8% to92%, y=8% to92% must be entirely transparent with no texture, fill, scene, icon or photo. No solid white/black/checkerboard background. No cast shadow, tape, clips, text, logo, shiny bevel, 3D, heavy grime or distressed grunge. Intended for CSS nine-slice border-image: keep edge thickness consistent and middle of each edge simple, corners coherent. This is ONLY the picture frame, never fill its opening.
