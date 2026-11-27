// DEV-452: the waiting bar is built from real work counts and never goes past 99 before the end.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
const ts = createRequire(import.meta.url)('typescript');
const exports = {};
const code = ts.transpileModule(readFileSync(new URL('../apps/producer/src/lib/SourceRunProgress.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(code, { exports, require: (id) => {
  if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  if (id === '@farmclub/ui') return { T: 'T', tokens: { color: { border: 'gray', accent: 'orange' } } };
  if (id === 'react') return { useRef: (v) => ({ current: v }) };
  if (id === 'react-native') return { View: 'View' };
  throw new Error(id);
}});
const { runPercent, runStage } = exports;
const batch = { sources: [{ id: 'doc', originalPhoto: false }, { id: 'photo', originalPhoto: true }] };
const item = (assetId, phase, status, progress) => ({ assetId, phase, status, progress, acceptedCount: 0, rejectedCount: 0 });

test('DEV-452: preparing a document counts its pending analysis, so the bar does not jump back', () => {
  const run = { items: [item('doc', 'PREPARE', 'RUNNING')] };
  const early = runPercent(batch, run);
  assert.ok(early < 10, String(early));
  assert.equal(runStage(run), '자료를 열고 사진을 찾고 있어요');
  const prepared = { items: [item('doc', 'PREPARE', 'SUCCEEDED'), item('doc', 'EXTRACT', 'QUEUED')] };
  assert.equal(runPercent(batch, prepared), Math.floor(100 / 7));
});

test('DEV-452: reading pages and analysing text move the bar by real counts', () => {
  const reading = { items: [item('doc', 'PREPARE', 'SUCCEEDED'), item('doc', 'EXTRACT', 'RUNNING', { stage: 'READ', done: 20, total: 40 })] };
  assert.equal(runPercent(batch, reading), Math.floor((100 * (1 + 6 * 0.3)) / 7));
  assert.equal(runStage(reading), '자료를 읽고 있어요 · 20/40쪽');
  const analysing = { items: [item('doc', 'PREPARE', 'SUCCEEDED'), item('doc', 'EXTRACT', 'RUNNING', { stage: 'ANALYSE', done: 5, total: 10 })] };
  assert.equal(runPercent(batch, analysing), Math.floor((100 * (1 + 6 * 0.8)) / 7));
  assert.equal(runStage(analysing), '내용을 정리하고 있어요 · 5/10');
});

test('DEV-452: 100% only when every item has finished; text files split into several items', () => {
  const almost = { items: [item('doc', 'PREPARE', 'SUCCEEDED'), item('doc', 'EXTRACT', 'SUCCEEDED'), item('doc', 'EXTRACT', 'SUCCEEDED'), item('doc', 'ASSEMBLE', 'QUEUED')] };
  assert.ok(runPercent(batch, almost) <= 99);
  assert.equal(runStage(almost), '페이지를 구성하고 있어요');
  const done = { items: almost.items.map((i) => ({ ...i, status: 'SUCCEEDED' })) };
  assert.equal(runPercent(batch, done), 100);
  const photoOnly = { items: [item('photo', 'PREPARE', 'RUNNING')] };
  assert.equal(runPercent(batch, photoOnly), 5);
});
