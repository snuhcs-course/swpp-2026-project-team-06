import test from 'node:test';
import assert from 'node:assert/strict';
import { scorePdfPhotos } from './pdf-photo-score.mjs';

const ref = (photos = [], sources = [{ id: 's1', status: 'READY' }], extra = {}) => ({ schemaVersion: 1, datasetId: 'set-a', status: 'VERIFIED', reviewer: 'reviewer', reviewedAt: '2026-11-24T12:00:00Z', photos, sources, ...extra });
const photo = (id='p1', extra={}) => ({ id, sourceId: 's1', page: 1, applicability: 'native', useful: true, allowedSections: ['gallery'], ...extra });
const pred = (items=[], sources=[{ id: 's1', status: 'SUCCEEDED' }], extra={}) => ({ schemaVersion: 1, datasetId: 'set-a', items, sources, ...extra });
const item = (id='i1', referenceId='p1', extra={}) => ({ id, sourceId: 's1', page: 1, referenceId, status: 'RECOVERED', shown: true, section: 'gallery', ...extra });
const score = (r=ref([photo()]), p=pred([item()])) => scorePdfPhotos(r,p);
const throws = (fn, pattern) => assert.throws(fn, pattern);

test('AC-SRC-1 validates shapes, duplicate IDs, source/page relations, and integral pages', () => {
  throws(() => score(ref([photo(), photo()]), pred([])), /duplicate record/);
  throws(() => score(ref([photo()], [{id:'s1',status:'READY'},{id:'s1',status:'READY'}]), pred([])), /duplicate source/);
  throws(() => score(ref([photo()]), pred([item('i1','p1',{page:2})])), /source\/page mismatch/);
  throws(() => score(ref([photo()]), pred([item('i1','p1',{page:1.5})])), /invalid source\/page/);
  throws(() => score(ref([photo()]), pred([item('i1','unknown')])), /unknown referenceId/);
  throws(() => score(ref([photo()]), pred([item(), item()])), /duplicate record/);
  throws(() => score(ref(), pred([], [], {datasetId:'old'})), /datasetId mismatch/);
  throws(() => score(ref([photo()], [{id:'s2',status:'READY'}]), pred([])), /invalid source\/page/);
});

test('AC-SRC-5 all-failed sources retain misses and failed leftovers get no credit', () => {
  const r = ref([photo()], [{id:'s1',status:'FAILED'}]);
  const p = pred([item()], [{id:'s1',status:'FAILED'}]);
  const s = scorePdfPhotos(r,p);
  assert.deepEqual(s.metrics.overallRecovery, {hits:0,total:1,rate:0});
  assert.deepEqual(s.metrics.suggestionRelevance, {hits:0,total:1,rate:0});
  assert.deepEqual(s.sources.failedSourceIds, ['s1']);
  assert.equal(s.decision, 'BLOCKED');
});

test('AC-SRC-2 counts each useful reference once; displayed duplicates are unwanted', () => {
  const s = score(ref([photo()]), pred([item(), item('i2')]));
  assert.deepEqual(s.metrics.nativeRecovery, {hits:1,total:1,rate:1});
  assert.deepEqual(s.metrics.suggestionRelevance, {hits:1,total:2,rate:0.5});
  assert.equal(s.counts.duplicateRecoveredMatches, 1);
  assert.equal(s.decision, 'FAIL');
});

test('AC-SRC-5 retains failed and missing source references in denominators and gives leftovers no credit', () => {
  const r = ref([photo(), photo('p2',{sourceId:'s2',page:2})], [{id:'s1',status:'READY'},{id:'s2',status:'FAILED'}]);
  const p = pred([item()], [{id:'s1',status:'SUCCEEDED'}]);
  p.items.push({...item('i2','p2'), sourceId:'s2',page:2});
  const s = scorePdfPhotos(r,p);
  assert.deepEqual(s.metrics.overallRecovery, {hits:1,total:2,rate:0.5});
  assert.deepEqual(s.sources, {failedSourceIds:['s2'],missingSourceIds:['s2']});
  assert.equal(s.metrics.suggestionRelevance.rate, 0.5);
  assert.equal(s.decision, 'BLOCKED');
});

test('AC-SRC-7 pending or incomplete human review stays provisional regardless of scores', () => {
  for (const patch of [{status:'PENDING'}, {reviewer:null}, {reviewedAt:null}, {reviewedAt:'yesterday'}]) {
    const s = score(ref([photo()], undefined, patch), pred([item()]));
    assert.equal(s.status, 'PROVISIONAL');
    assert.equal(s.decision, 'PENDING_HUMAN_REVIEW');
  }
  assert.equal(score().status, 'EVALUATED');
});

test('AC-SRC-9 reports null zero denominators and all-empty as valid N/A', () => {
  const noSuggestions = score(ref([photo()]), pred([]));
  assert.equal(noSuggestions.metrics.suggestionRelevance.rate, null);
  assert.equal(noSuggestions.metrics.nativeRecovery.rate, 0);
  const empty = score(ref([], [{id:'s1',status:'EMPTY'}]), pred([], [{id:'s1',status:'EMPTY'}]));
  assert.equal(empty.decision, 'N/A');
  assert.equal(empty.metrics.overallRecovery.rate, null);
  throws(() => score(ref([photo()], [{id:'s1',status:'EMPTY'}]), pred([], [{id:'s1',status:'EMPTY'}])), /EMPTY source/);
});

test('AC-SRC-11 placement needs correct section, is measured over shown predictions and all native refs', () => {
  const r = ref([photo(), photo('p2',{page:2})]);
  const p = pred([item(), {...item('i2','p2'),page:2,section:'wrong'}]);
  const s = scorePdfPhotos(r,p);
  assert.deepEqual(s.metrics.placementAccuracy, {hits:1,total:2,rate:0.5});
  assert.deepEqual(s.metrics.placementCoverage, {hits:1,total:2,rate:0.5});
  const abstains = scorePdfPhotos(r,pred([item('i1','p1',{section:null}), {...item('i2','p2',{section:null}),page:2}]));
  assert.equal(abstains.metrics.placementAccuracy.rate, null);
  assert.equal(abstains.placementGoal.met, false);
});

test('AC-SRC-11 unknown source IDs and invalid verified reviewer dates are handled strictly', () => {
  throws(() => score(ref(), pred([], [{id:'s9',status:'SUCCEEDED'}])), /unknown source IDs/);
  const invalidDate = score(ref([photo()], [{id:'s1',status:'READY'}], {reviewer:'r',reviewedAt:'not a date'}), pred([item()]));
  assert.equal(invalidDate.status, 'PROVISIONAL');
  assert.equal(invalidDate.decision, 'PENDING_HUMAN_REVIEW');
});
