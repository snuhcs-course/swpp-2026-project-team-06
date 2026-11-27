// DEV-452 (PM 11/27): the same flagged phrase elsewhere is offered, never changed on its own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { josa } from '../apps/producer/src/lib/josa.ts';
const ts = createRequire(import.meta.url)('typescript');
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/CheckSheet.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (id) => {
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (id === '@farmclub/api') return { sourceAnalysis: {} };
  if (id === '@farmclub/ui') return { Button: 'Button', Input: 'Input', Sheet: 'Sheet', T: 'T', tokens: { color: {} }, SOURCE_MODULES: [['taste', '맛과 크기'], ['farmStory', '농가 이야기']] };
  if (id === 'react') return { useEffect: () => {}, useMemo: (f) => f(), useState: (v) => [v, () => {}] };
  if (id === 'react-native') return { Image: 'Image', View: 'View' };
  if (id === './SourceCopyReview') return { reasonMessages: {}, requiresNote: () => false };
  if (id === './sourcePhoto') return { sourcePhotoUrl: async () => '' };
  if (id === './josa') return { josa };
  throw new Error(id);
}});
const { changedPart, relatedItems, checkItems, highlightPart } = exports;
const reasons = (over = {}) => ({ COPY_EDIT: [], OWNER_CONFIRMATION: [], PLACEMENT: [], SAFETY: [], ...over });
const passage = (id, value, module, over = {}) => ({ id, bindingHash: `b-${id}`, value, originalValue: value, module, reviewPending: true, includedInDraft: true, reasonCodes: reasons(over), decision: null, candidateIds: [] });
const plan = (passages) => ({ plan: { planHash: 'h', passages, modules: [] }, reviewVersion: 1 });

test('DEV-452: the changed part of a sentence is found without its shared start and end', () => {
  assert.deepEqual({ ...changedPart('10년 전 귀촌했어요.', '2016년에 귀촌했어요.') }, { removed: '10년 전', added: '2016년에' });
  assert.deepEqual({ ...changedPart('같은 문장', '같은 문장') }, { removed: '', added: '' });
});

test('DEV-452: an edit is offered for the same phrase elsewhere, with a preview, and only there', () => {
  const a = passage('a', '10년 전 귀촌했어요.', 'farmStory', { OWNER_CONFIRMATION: ['RELATIVE_TIME'] });
  const b = passage('b', '아버지와 10년 전 시작한 농장이에요.', 'farmStory', { OWNER_CONFIRMATION: ['RELATIVE_TIME'] });
  const c = passage('c', '올해 첫 수확이에요.', 'taste', { OWNER_CONFIRMATION: ['RELATIVE_TIME'] });
  const data = plan([a, b, c]);
  const done = checkItems(data, [], null).find((i) => i.passage.id === 'a');
  const r = relatedItems(data, done, 'EDIT', a.value, '2016년에 귀촌했어요.');
  assert.equal(r.phrase, '10년 전');
  assert.equal(JSON.stringify(r.items.map((i) => [i.item.passage.id, i.after])), JSON.stringify([['b', '아버지와 2016년에 시작한 농장이에요.']]));
});

test('DEV-452: "괜찮아요" on a date flag offers the same date phrase with a shared date reason, never risky items', () => {
  const a = passage('a', '10년 동안 키웠어요.', 'farmStory', { OWNER_CONFIRMATION: ['RELATIVE_TIME'] });
  const b = passage('b', '10년 동안 같은 땅에서 재배했어요.', 'taste', { OWNER_CONFIRMATION: ['DATED_OR_HISTORICAL'] });
  const c = passage('c', '10년 동안 건강에 좋아요.', 'taste', { OWNER_CONFIRMATION: ['RELATIVE_TIME'], SAFETY: ['HEALTH_CLAIM'] });
  const d = passage('d', '10년 동안 서늘한 곳에.', 'taste', { COPY_EDIT: ['POSSIBLE_SPACING'] });
  const data = plan([a, b, c, d]);
  const done = checkItems(data, [], null).find((i) => i.passage.id === 'a');
  const r = relatedItems(data, done, 'KEEP', a.value, '');
  assert.equal(r.phrase, '10년 동안');
  assert.equal(JSON.stringify(r.items.map((i) => i.item.passage.id)), JSON.stringify(['b']));
});

test('DEV-452: nothing is offered for whole-sentence rewrites or non-date approvals', () => {
  const a = passage('a', '맛이 좋아요.', 'taste', { COPY_EDIT: ['POSSIBLE_SPACING'] });
  const b = passage('b', '맛이 좋아요. 정말로', 'taste', { COPY_EDIT: ['POSSIBLE_SPACING'] });
  const data = plan([a, b]);
  const done = checkItems(data, [], null).find((i) => i.passage.id === 'a');
  assert.equal(relatedItems(data, done, 'KEEP', a.value, ''), null);
  assert.equal(relatedItems(data, done, 'EDIT', a.value, '완전히 다른 새 문장으로 바꿔서 설명해 드릴게요 이렇게 길게'), null);
});

test('DEV-452 11/28: the asked sentence is marked inside a joined paragraph', () => {
  assert.equal(JSON.stringify(highlightPart('첫 문장입니다.\n둘째 문장입니다.', '둘째 문장입니다.')), JSON.stringify(['첫 문장입니다.\n', '둘째 문장입니다.', '']));
  assert.equal(highlightPart('한 문장입니다.', '한 문장입니다.'), null);
  assert.equal(highlightPart('다른 문장입니다.', '없는 문장'), null);
});
