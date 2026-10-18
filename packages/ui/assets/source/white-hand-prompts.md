# 손 내부 흰색 채움 (DEV-57)

- Mode: built-in ImageGen, precise-object-edit, transparent_background=true.
- Edit targets: original outline-small.png, outline-medium.png, outline-large.png. Originals are preserved in docs/design/sales-templates/assets/size-guide/.
- Outputs: outline-small.png, outline-medium.png, outline-large.png in this directory. Generated PNGs copied without image post-processing.
- Generated output IDs: small f6d329bb-d805-43cc-ac76-79c92a39babd; medium b3777448-3375-401e-a0a3-7d6015fe1ccc; large cf63bd3a-bafe-4197-8135-2391bf209dc8.

## Final prompt (one separate edit per size)

Use case: precise-object-edit. Edit this supplied illustration with ONE change only: fill the entire enclosed hand silhouette interior (all fingers, palm and wrist) with opaque pure white #FFFFFF. Keep the thin dark gray-brown outline exactly in the same shape, position and weight. Keep the orange tangerine, leaf, stem, their size and position, paper texture and colors unchanged. Preserve the same canvas and framing. Everything OUTSIDE the hand remains truly transparent, including the gaps between fingers. No new lines, fingernails, palm creases, skin shading, gradients, shadows, objects or text. This is flat white infill inside the existing contour, not a redesign. Fruit remains on top of the white palm.
