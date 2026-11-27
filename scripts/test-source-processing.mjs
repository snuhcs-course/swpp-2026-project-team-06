// DEV-452 AC-SRC-5/10/11: recovery actions and private incomplete-page guidance.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
function load(path) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const element = (type, props) => ({ type, props });
  vm.runInNewContext(code, { exports, require: (id) => {
    if (id === 'react/jsx-runtime') return { jsx: element, jsxs: element };
    if (id === '@farmclub/ui') return { Button: 'Button', T: 'T', tokens: { color: { border: 'gray' } } };
    if (id === 'react-native') return { View: 'View' };
    throw new Error(id);
  }});
  return exports;
}
const helpers = load('../apps/producer/src/lib/sourceBatch.ts');
const item = (id, more={}) => ({ id, phase: 'EXTRACT', status: 'FAILED', error: 'REQUEST_UNCERTAIN', ...more });
test('DEV-452 AC-SRC-5: retry only unresolved reading; exclude optional assembly and permanent failures', () => {
  const run = { items: [item('a'), item('other'), item('budget', { error: 'BUDGET_EXCEEDED' }), item('auth', { error: 'PROVIDER_AUTH' }), item('skipped', { pagesSkipped: 2 }), item('assembly', { phase: 'ASSEMBLE' }), item('refine', { phase: 'REFINE' })] };
  assert.equal(JSON.stringify(helpers.readingRetryItems(run, ['a', 'budget', 'auth', 'skipped', 'assembly', 'refine']).map(i=>i.id)), '["a"]');
});
test('DEV-452 AC-SRC-5: other target gaps do not block this product, common sources do', () => {
  const review = { processingIssues: [{ itemId: 'a', targetIds: ['a'], common: false }, { itemId: 'b', targetIds: ['b'], common: false }, { itemId: 'all', targetIds: ['a', 'b'], common: true }] };
  assert.equal(JSON.stringify(helpers.processingIssues(review, 'a').map(i=>i.itemId)), '["a","all"]');
  assert.equal(helpers.processingIssues(null).length, 0);
});
test('DEV-452 AC-SRC-11: incomplete notice offers private view and explicit exclusion, never publication', () => {
  const { SourceProcessingNotice } = load('../apps/producer/src/lib/SourceProcessingNotice.tsx');
  let opened = 0;
  const tree = SourceProcessingNotice({ disabled: false, onView: ()=>opened++ });
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const all = nodes(tree);
  assert.equal(tree.props.accessibilityRole, 'alert');
  assert.match(JSON.stringify(tree), /비공개로 보관/);
  assert.match(JSON.stringify(tree), /해당 자료를 첨부 목록에서 제외/);
  const buttons = all.filter(n=>n.type==='Button');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.label, '미완성 초안 보기');
  buttons[0].props.onPress();
  assert.equal(opened, 1);
  assert.equal(nodes(SourceProcessingNotice({ disabled: true, onView: ()=>{} })).find(n=>n.type==='Button').props.disabled, true);
});

test('DEV-452 AC-SRC-5: failed PDF pages and skipped page count identify the needed recovery', () => {
  const { SourceProcessingNotice } = load('../apps/producer/src/lib/SourceProcessingNotice.tsx');
  const tree=SourceProcessingNotice({disabled:false,onView:()=>{},sources:[{id:'pdf',filename:'farm.pdf'}],issues:[{itemId:'failed',sourceId:'pdf',pagesSkipped:21,failedPages:[{number:3,code:'INCOMPLETE_OCR'}]}]});
  const text=JSON.stringify(tree);
  assert.match(text,/farm.pdf/);assert.match(text,/21쪽/);assert.match(text,/3/);assert.match(text,/PDF를 나눠/);assert.match(text,/글자 읽기가 끝나지/);
});
