# Farmclub emoticons · DEV-468

Selected by Jinwoo: original A orange idol + stone fan; no held microphone/lightstick; eight situations and two emotions. Selected generation v4 retains rounded baked-in Korean lettering. The rejected separate-font v3 is excluded.

originals/*.png retains all ten approved 1254×1254 transparent imagegen originals. *.display.webp is the app asset, generated with cwebp -resize 480 480 -q 82 -alpha_q 90 -m 6. Total display size: 323,680 bytes versus 13,200,069 bytes of originals. Keep original PNGs for later edits. Asset order and captions map to packages/api/src/emoticons.ts; both clients use the same IDs.

UI: 160px message / 112px selection / 64px picker; contain, transparent, image lettering intact. Never put a second text caption beneath the image.
