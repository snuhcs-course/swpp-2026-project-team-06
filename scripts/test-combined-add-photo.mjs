// DEV-452: "사진 추가" in the combined page adds an ordinary product photo; only an explicit
// "대표 사진 바꾸기" (pickCover) or a missing representative sets one. Source-shape guard: the
// real behaviour needs the browser (e2e / visual check).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const src = readFileSync(new URL('../apps/producer/src/lib/NewProductComposer.tsx', import.meta.url), 'utf8');

test('add-photo entry points do not make the photo the representative', () => {
  assert.match(src, /onAdd=\{\(\) => void pickPhoto\(false\)\}/);
  assert.match(src, /void pickPhoto\(false\)\)\} \/>/);
  assert.doesNotMatch(src, /onAdd=\{\(\) => void pickCover\(\)\}/);
  assert.match(src, /const pickCover = \(\) => pickPhoto\(true\)/);
});

test('representative is set only when asked for or when none exists', () => {
  assert.match(src, /if \(asCover \|\| !current\.targets\.find\(t => t\.id === target\.id\)\?\.representativeAssetId\)/);
  assert.match(src, /if \(asCover && !latest\.targets\.find/); // no previous-photo pinning for plain adds
});

test('setup page leaves room below the form for the fixed bottom bar', () => {
  const setup = readFileSync(new URL('../apps/producer/src/app/product-setup.tsx', import.meta.url), 'utf8');
  const room = Number(/const BOTTOM_BAR_ROOM = (\d+)/.exec(setup)?.[1]);
  assert.ok(room >= 160);
  assert.match(setup, /<Scroll bottom=\{BOTTOM_BAR_ROOM\}>/);
});
