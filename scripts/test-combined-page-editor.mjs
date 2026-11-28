// DEV-452: names read from material drop form labels ("1. 품목 또는 명칭"); facts compare input vs material.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/CombinedPageEditor.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (id) => {
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (id === '@farmclub/ui') return { Button: 'Button', T: 'T', tokens: { color: {}, space: {} } };
  if (id === 'react') return { useEffect: () => {}, useState: (v) => [v, () => {}] };
  if (id === 'react-native') return { Image: 'Image', ScrollView: 'ScrollView', View: 'View' };
  if (id === './sourcePhoto') return { sourcePhotoUrl: async () => '' };
  if (id === './SourceCopyReview') return { sourceCopyOnce: async () => ({}) };
  if (id === '@farmclub/api') return {};
  throw new Error(id);
}});
const { cleanProductName, differs, isDocPrice, isDocWeight, PRICE_KEEP_NOTE } = exports;

test('DEV-452: product names drop 상품정보 labels and line breaks', () => {
  assert.equal(cleanProductName('1. 품목 또는 명칭\n고당도 황금향'), '고당도 황금향');
  assert.equal(cleanProductName('품명: 서귀포 천혜향'), '서귀포 천혜향');
  assert.equal(cleanProductName('상품명\n카라향 3kg'), '카라향 3kg');
  assert.equal(cleanProductName('한라봉'), '한라봉');
  assert.equal(cleanProductName('1. 품목 또는 명칭'), '');
});

test('DEV-452: material values show only when they really differ from the input', () => {
  assert.equal(differs('제주 서귀포', '서귀포'), false);
  assert.equal(differs('천혜향', '친혜향'), true);
  assert.equal(differs('한라봉', ''), false);
});

test('DEV-452: ② rows follow server exclusions and the producer\'s own toggles', () => {
  assert.equal(isDocPrice({ inputPreferred: 'PRICE', decision: null }), true);
  assert.equal(isDocPrice({ inputPreferred: 'WEIGHT', decision: null }), false);
  assert.equal(isDocWeight({ inputPreferred: 'WEIGHT', decision: null }), true);
  assert.equal(isDocPrice({ decision: { action: 'KEEP', note: PRICE_KEEP_NOTE } }), true);
  assert.equal(isDocPrice({ decision: { action: 'KEEP', note: '다른 확인' } }), false);
});
