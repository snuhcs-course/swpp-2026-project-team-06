#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

const fail = (message) => { throw new Error(message); };
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => typeof v === 'string' && v.trim().length > 0;
const arr = (v) => Array.isArray(v);
const rate = (hits, total) => total ? hits / total : null;

function validate(doc, label, permittedSourceIds = null) {
  if (!object(doc) || doc.schemaVersion !== 1 || !str(doc.datasetId)) fail(`${label}: invalid schemaVersion or datasetId`);
  if (!arr(doc.sources) || !arr(doc.items ?? doc.photos)) fail(`${label}: sources and records must be arrays`);
  const sourceStatus = label === 'reference' ? ['READY', 'FAILED', 'EMPTY'] : ['SUCCEEDED', 'PARTIAL', 'FAILED', 'EMPTY'];
  const sourceMap = new Map();
  for (const s of doc.sources) {
    if (!object(s) || !str(s.id) || !sourceStatus.includes(s.status) || sourceMap.has(s.id)) fail(`${label}: malformed or duplicate source ID`);
    sourceMap.set(s.id, s.status);
  }
  const rows = doc.items ?? doc.photos;
  const ids = new Set();
  for (const r of rows) {
    const sourceKnown = sourceMap.has(r?.sourceId) || (permittedSourceIds && permittedSourceIds.has(r?.sourceId));
    if (!object(r) || !str(r.id) || ids.has(r.id) || !str(r.sourceId) || !Number.isInteger(r.page) || r.page < 1 || !sourceKnown) fail(`${label}: malformed/duplicate record ID or invalid source/page`);
    ids.add(r.id);
  }
  if (label === 'reference') {
    if (!['PENDING', 'VERIFIED'].includes(doc.status)) fail('reference: invalid status');
    for (const p of rows) if (!['native', 'assisted'].includes(p.applicability) || typeof p.useful !== 'boolean' || !arr(p.allowedSections) || p.allowedSections.some(x => !str(x))) fail(`reference: malformed photo ${p.id}`);
    for (const [id, status] of sourceMap) if (status === 'EMPTY' && rows.some(p => p.sourceId === id)) fail(`reference: EMPTY source ${id} has photos`);
  } else {
    for (const i of rows) if (!(i.referenceId === null || str(i.referenceId)) || !['RECOVERED', 'FAILED', 'FILTERED', 'UNSUPPORTED'].includes(i.status) || typeof i.shown !== 'boolean' || !(i.section === null || str(i.section))) fail(`prediction: malformed item ${i.id}`);
    for (const [id, status] of sourceMap) if (status === 'EMPTY' && rows.some(i => i.sourceId === id)) fail(`prediction: EMPTY source ${id} has items`);
  }
  return { sourceMap, rows };
}

export function scorePdfPhotos(reference, prediction) {
  const ref = validate(reference, 'reference');
  const pred = validate(prediction, 'prediction', new Set(reference.sources.map(s => s.id)));
  if (reference.datasetId !== prediction.datasetId) fail('datasetId mismatch');
  const photos = ref.rows, items = pred.rows;
  const photoById = new Map(photos.map(p => [p.id, p]));
  const missingSourceIds = [...ref.sourceMap.keys()].filter(id => !pred.sourceMap.has(id));
  const extraSourceIds = [...pred.sourceMap.keys()].filter(id => !ref.sourceMap.has(id));
  if (extraSourceIds.length) fail(`prediction contains unknown source IDs: ${extraSourceIds.join(', ')}`);
  const unknownItemSources = [...new Set(items.filter(i => !ref.sourceMap.has(i.sourceId)).map(i => i.sourceId))];
  if (unknownItemSources.length) fail(`prediction items contain unknown source IDs: ${unknownItemSources.join(', ')}`);
  const failedSourceIds = [...new Set([
    ...[...ref.sourceMap].filter(([, s]) => s === 'FAILED').map(([id]) => id),
    ...[...pred.sourceMap].filter(([, s]) => s === 'FAILED').map(([id]) => id),
  ])];
  const warnings = [];
  let duplicateMatches = 0;
  for (const i of items) {
    if (i.referenceId === null) continue;
    const p = photoById.get(i.referenceId);
    if (!p) fail(`unknown referenceId on item ${i.id}`);
    if (p.sourceId !== i.sourceId || p.page !== i.page) fail(`source/page mismatch on item ${i.id}`);
  }
  const used = new Set();
  const goodItems = new Set();
  const placed = new Set();
  const placedItemIds = new Set();
  for (const i of items) {
    if (i.status !== 'RECOVERED' || !i.referenceId) continue;
    const p = photoById.get(i.referenceId);
    const unavailable = failedSourceIds.includes(i.sourceId) || missingSourceIds.includes(i.sourceId) || ref.sourceMap.get(i.sourceId) === 'EMPTY' || pred.sourceMap.get(i.sourceId) === 'EMPTY';
    if (unavailable || !p.useful) continue;
    if (used.has(p.id)) { duplicateMatches++; continue; }
    used.add(p.id); goodItems.add(i.id);
    if (i.shown && i.section !== null && p.allowedSections.includes(i.section)) { placed.add(p.id); placedItemIds.add(i.id); }
  }
  const shown = items.filter(i => i.shown);
  const relevantShown = shown.filter(i => goodItems.has(i.id)).length;
  const useful = photos.filter(p => p.useful);
  const native = useful.filter(p => p.applicability === 'native');
  const placedItems = items.filter(i => i.shown && i.section !== null);
  const placementHits = placed.size;
  const dateText = reference.reviewedAt;
  const validReviewDate = typeof dateText === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(dateText) && Number.isFinite(Date.parse(dateText));
  const pendingHuman = reference.status !== 'VERIFIED' || !str(reference.reviewer) || !validReviewDate;
  const sourceBlocked = missingSourceIds.length > 0 || failedSourceIds.length > 0;
  if (pendingHuman) warnings.push('Human reference review is pending or lacks a valid reviewer/date.');
  if (sourceBlocked) warnings.push('Source failure or missing prediction source blocks PASS.');
  if (duplicateMatches) warnings.push('Duplicate recovered mappings count once; additional displays remain in relevance denominator.');
  const allEmpty = photos.length === 0 && [...ref.sourceMap.values()].every(s => s === 'EMPTY') && [...pred.sourceMap.values()].every(s => s === 'EMPTY');
  if (!photos.length && !allEmpty) warnings.push('Reference contains no photos; zero-photo scoring is N/A only when sources are explicitly EMPTY.');
  const nativeRecovery = { hits: native.filter(p => used.has(p.id)).length, total: native.length };
  nativeRecovery.rate = rate(nativeRecovery.hits, nativeRecovery.total);
  const overallRecovery = { hits: useful.filter(p => used.has(p.id)).length, total: useful.length };
  overallRecovery.rate = rate(overallRecovery.hits, overallRecovery.total);
  const suggestionRelevance = { hits: relevantShown, total: shown.length };
  suggestionRelevance.rate = rate(suggestionRelevance.hits, suggestionRelevance.total);
  const placementAccuracy = { hits: placedItemIds.size, total: placedItems.length };
  placementAccuracy.rate = rate(placementAccuracy.hits, placementAccuracy.total);
  const placementCoverage = { hits: placementHits, total: native.length };
  placementCoverage.rate = rate(placementCoverage.hits, placementCoverage.total);
  const placementGoal = { targets: { accuracy: 0.85, coverage: 0.7 }, met: placementAccuracy.rate !== null && placementCoverage.rate !== null && placementAccuracy.rate >= 0.85 && placementCoverage.rate >= 0.7 };
  const targets = { nativeRecovery: 0.9, suggestionRelevance: 0.9 };
  const integrityBlocked = sourceBlocked || missingSourceIds.length > 0;
  const decision = pendingHuman ? 'PENDING_HUMAN_REVIEW' : (allEmpty ? 'N/A' : (integrityBlocked ? 'BLOCKED' : (nativeRecovery.rate !== null && nativeRecovery.rate >= targets.nativeRecovery && suggestionRelevance.rate !== null && suggestionRelevance.rate >= targets.suggestionRelevance ? 'PASS' : 'FAIL')));
  return {
    schemaVersion: 1, datasetId: reference.datasetId,
    status: pendingHuman ? 'PROVISIONAL' : 'EVALUATED', decision,
    targets, metrics: { nativeRecovery, overallRecovery, suggestionRelevance, placementAccuracy, placementCoverage }, placementGoal,
    counts: { references: photos.length, usefulReferences: useful.length, nativeUsefulReferences: native.length, predictionItems: items.length, displayedPredictions: shown.length, duplicateRecoveredMatches: duplicateMatches },
    sources: { failedSourceIds, missingSourceIds },
    diagnostics: { warnings, limits: ['Human-provided referenceId mappings only; no image/token matching.', 'All source failures and missing sources deny recovery credit.', 'Displayed predictions are individually counted; repeated mappings receive no extra credit.', 'Does not establish full-corpus accuracy or release adoption.'] },
  };
}

async function main(args) {
  if (args.length !== 4 || args[2] !== '--output') fail('usage: node scripts/pdf-photo-score.mjs REFERENCE.json PREDICTION.json --output REPORT.json');
  const [referencePath, predictionPath, , outputPath] = args;
  const [r, p] = await Promise.all([readFile(referencePath, 'utf8'), readFile(predictionPath, 'utf8')]);
  const report = scorePdfPhotos(JSON.parse(r), JSON.parse(p));
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${report.status} ${report.decision}\n`);
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) main(process.argv.slice(2)).catch(e => { process.stderr.write(`pdf-photo-score: ${e.message}\n`); process.exitCode = 1; });
