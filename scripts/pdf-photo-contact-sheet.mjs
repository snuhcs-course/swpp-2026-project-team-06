import { readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_STATUSES = new Set(['SUCCEEDED', 'PARTIAL', 'FAILED']);
const OCCURRENCE_STATUSES = new Set(['REVIEW_REQUIRED', 'FILTERED', 'UNSUPPORTED', 'ERROR']);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function safeRelativeAsset(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.startsWith('\\') || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes('\\') || value.includes('\0')) return false;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return false; }
  if (decoded.startsWith('/') || decoded.startsWith('\\') || decoded.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(decoded)) return false;
  return value.split('/').every((part) => part && part !== '.' && part !== '..') && decoded.split('/').every((part) => part && part !== '.' && part !== '..');
}

function assetMarkup(value, label, alt) {
  if (!value) return `<div class="unavailable">${esc(label)}: unavailable (no image path)</div>`;
  if (!safeRelativeAsset(value)) return `<div class="unavailable">${esc(label)}: unavailable (unsafe image path rejected)</div>`;
  return `<figure><img src="${esc(value)}" alt="${esc(alt)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`;
}

function metric(value) { return Number.isFinite(value) ? String(value) : 'unknown'; }

/** Render an offline, diagnostic-only contact sheet. It performs no file or network reads. */
export function renderContactSheet(manifests, options = {}) {
  if (!Array.isArray(manifests)) throw new TypeError('manifests must be an array');
  const title = options.title ?? 'PDF photo diagnostic contact sheet';
  const sources = [];
  const cards = [];
  const totals = { sources: manifests.length, occurrences: 0, reviewRequired: 0, filtered: 0, unsupported: 0, errors: 0, failedSources: 0, partialSources: 0, emptySources: 0 };

  manifests.forEach((manifest, sourceIndex) => {
    const source = manifest?.source && typeof manifest.source === 'object' ? manifest.source : {};
    const sourceId = source.id ?? `source-${sourceIndex + 1}`;
    const occurrences = Array.isArray(manifest?.occurrences) ? manifest.occurrences : [];
    const status = MANIFEST_STATUSES.has(manifest?.status) ? manifest.status : 'FAILED';
    const processed = Array.isArray(manifest?.processedPages) ? manifest.processedPages : [];
    const skipped = Array.isArray(manifest?.skippedPages) ? manifest.skippedPages : [];
    const errors = Array.isArray(manifest?.errors) ? manifest.errors : [];
    const warnings = Array.isArray(manifest?.warnings) ? manifest.warnings : [];
    const limits = manifest?.limits && typeof manifest.limits === 'object' ? manifest.limits : {};
    const metrics = manifest?.metrics && typeof manifest.metrics === 'object' ? manifest.metrics : {};
    if (status === 'FAILED') totals.failedSources += 1;
    if (status === 'PARTIAL') totals.partialSources += 1;
    if (status === 'SUCCEEDED' && occurrences.length === 0) totals.emptySources += 1;
    const capSummary = Object.entries(limits).map(([key, value]) => `${key}=${value}`).join(', ') || 'none recorded';
    sources.push(`<li><strong>${esc(sourceId)}</strong>: ${esc(status)}; ${occurrences.length} occurrences; pages ${esc(processed.join(', ') || 'none')} of ${esc(metric(manifest?.pageCount))}; skipped ${esc(skipped.join(', ') || 'none')}; caps ${esc(capSummary)}; objects visited ${esc(metric(metrics.objectsVisited))}; decoded images ${esc(metric(metrics.decodedImages))}; candidate count ${esc(metric(metrics.candidateCount))}; output bytes ${esc(metric(metrics.outputBytes))}; errors ${errors.length} (${errors.map(esc).join(', ') || 'none'}); warnings ${warnings.length} (${warnings.map(esc).join(', ') || 'none'})</li>`);
    if (!occurrences.length) {
      cards.push(`<article class="card source-card"><h3>${esc(sourceId)} · ${esc(status)}</h3><p>${status === 'FAILED' ? 'Source processing failed.' : status === 'PARTIAL' ? 'Partial source; no candidates were recorded.' : 'No photo candidates recorded.'}</p>${errors.length ? `<p>Failures: ${errors.map(esc).join(', ')}</p>` : ''}</article>`);
      return;
    }
    occurrences.forEach((occurrence, index) => {
      const item = occurrence && typeof occurrence === 'object' ? occurrence : {};
      const itemStatus = OCCURRENCE_STATUSES.has(item.status) ? item.status : 'ERROR';
      totals.occurrences += 1;
      if (itemStatus === 'REVIEW_REQUIRED') totals.reviewRequired += 1;
      if (itemStatus === 'FILTERED') totals.filtered += 1;
      if (itemStatus === 'UNSUPPORTED') totals.unsupported += 1;
      if (itemStatus === 'ERROR') totals.errors += 1;
      const native = `${metric(item.nativeWidth)} × ${metric(item.nativeHeight)}`;
      const output = `${metric(item.width)} × ${metric(item.height)}`;
      const reasons = Array.isArray(item.reasonCodes) ? item.reasonCodes : [];
      const pagePreview = item.pageImagePath ? assetMarkup(item.pageImagePath, 'Original page/region preview', `Page ${metric(item.page)} source preview`) : '';
      const picture = assetMarkup(item.imagePath, 'Recovered visible-region image', `Recovered image for ${esc(sourceId)}, page ${metric(item.page)}`);
      cards.push(`<article class="card"><header><div><p class="eyebrow">${esc(sourceId)} · page ${esc(metric(item.page))} · occurrence ${index + 1}</p><h3>${esc(itemStatus)}</h3></div><span class="badge">Human review: PENDING</span></header><div class="images">${pagePreview}${picture}</div><dl><dt>Native resolution</dt><dd>${esc(native)}</dd><dt>Output resolution</dt><dd>${esc(output)}</dd><dt>Type</dt><dd>${esc(item.sourceObjectType ?? 'unknown')}</dd><dt>Duplicate of</dt><dd>${esc(item.duplicateOf ?? 'none')}</dd><dt>Reason codes</dt><dd>${reasons.length ? reasons.map(esc).join(', ') : 'none recorded'}</dd><dt>Bounds</dt><dd>${esc(Array.isArray(item.bounds) ? item.bounds.join(', ') : 'unknown')}</dd></dl></article>`);
    });
  });

  const countList = Object.entries(totals).map(([key, value]) => `<li><span>${esc(key)}</span><strong>${esc(value)}</strong></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
:root{color-scheme:light;--ink:#202b36;--muted:#586675;--line:#d9e0e7;--panel:#fff;--wash:#f3f6f8;--accent:#174d62}*{box-sizing:border-box}body{margin:0;background:var(--wash);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif}main{max-width:1440px;margin:auto;padding:clamp(16px,3vw,40px)}h1{font-size:clamp(1.7rem,4vw,2.5rem);line-height:1.15;margin:0 0 12px}h2{font-size:1.2rem;margin:28px 0 12px}.notice{border-left:5px solid #c47419;background:#fff8ec;padding:14px 18px;margin:20px 0}.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;padding:0;list-style:none}.counts li,.summary,.card{background:var(--panel);border:1px solid var(--line);border-radius:12px}.counts li{padding:12px;display:flex;justify-content:space-between;gap:8px}.summary{padding:16px 20px}.summary ul{margin:0;padding-left:20px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr));gap:16px}.card{padding:16px;min-width:0}.card header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.card h3{margin:0;font-size:1.1rem;overflow-wrap:anywhere}.eyebrow{margin:0 0 4px;color:var(--muted);font-size:.9rem;overflow-wrap:anywhere}.badge{background:#eaf2f4;color:var(--accent);padding:5px 9px;border-radius:20px;font-size:.8rem;white-space:nowrap}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;margin:16px 0}.images figure{margin:0;min-width:0}.images img{width:100%;height:230px;object-fit:contain;background:#edf1f4;border:1px solid var(--line);border-radius:8px}.images figcaption{font-size:.82rem;color:var(--muted);margin-top:4px}.unavailable{min-height:90px;padding:14px;display:grid;place-items:center;text-align:center;color:#7c3b2c;border:1px dashed #c58c7f;border-radius:8px;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(115px, .7fr) minmax(0,1.3fr);gap:6px 12px;margin:0;font-size:.92rem}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}.source-card p{overflow-wrap:anywhere}.foot{color:var(--muted);font-size:.9rem;margin-top:24px}@media(max-width:480px){.card header{display:block}.badge{display:inline-block;margin-top:10px}dl{grid-template-columns:1fr;gap:1px}dd{margin-bottom:7px}}
</style></head><body><main><h1>${esc(title)}</h1><p>Offline diagnostic report for visible PDF photo candidates.</p><div class="notice"><strong>Diagnostic only.</strong> Every candidate is pending human review. No business judgment, caption, text/privacy verification, approval, or production-renderer claim is made by this report.</div><h2>Inventory</h2><ul class="counts">${countList}</ul><h2>Sources and processing</h2><section class="summary"><ul>${sources.join('') || '<li>No manifests supplied.</li>'}</ul></section><h2>Photo candidates and source outcomes</h2><section class="grid">${cards.join('') || '<article class="card">No manifests to display.</article>'}</section><p class="foot">Review the original document and visible regions before any use. Exported images may contain unverified document content.</p></main></body></html>`;
}

async function cli(args) {
  const outIndex = args.indexOf('--output');
  if (outIndex < 0 || !args[outIndex + 1]) throw new Error('usage: node scripts/pdf-photo-contact-sheet.mjs MANIFEST.json [more...] --output REPORT.html');
  const output = path.resolve(args[outIndex + 1]);
  const manifestPaths = args.filter((_, i) => i !== outIndex && i !== outIndex + 1).map((p) => path.resolve(p));
  if (!manifestPaths.length) throw new Error('at least one manifest is required');
  const resolvedRoot = await realpath(path.dirname(output));
  const manifests = [];
  const aggregate = { sources: 0, occurrences: 0, failedSources: 0, partialSources: 0, emptySources: 0, missingAssets: 0 };
  for (const manifestPath of manifestPaths) {
    const resolvedManifest = await realpath(manifestPath);
    if (path.relative(resolvedRoot, resolvedManifest).startsWith('..')) throw new Error('manifest must remain inside the report tree');
    const manifest = JSON.parse(await readFile(resolvedManifest, 'utf8'));
    const rewritten = structuredClone(manifest);
    for (const occurrence of rewritten.occurrences ?? []) {
      for (const key of ['imagePath', 'pageImagePath']) {
        const asset = occurrence?.[key];
        if (!asset) continue;
        if (!safeRelativeAsset(asset)) { aggregate.missingAssets += 1; continue; }
        const candidate = path.resolve(path.dirname(resolvedManifest), ...asset.split('/'));
        let resolvedAsset;
        try { resolvedAsset = await realpath(candidate); } catch { aggregate.missingAssets += 1; occurrence[key] = null; continue; }
        const relativeAsset = path.relative(resolvedRoot, resolvedAsset);
        if (relativeAsset.startsWith('..') || path.isAbsolute(relativeAsset) || !(await stat(resolvedAsset)).isFile()) { aggregate.missingAssets += 1; occurrence[key] = null; continue; }
        occurrence[key] = path.relative(resolvedRoot, resolvedAsset).split(path.sep).join('/');
        if (!safeRelativeAsset(occurrence[key])) { aggregate.missingAssets += 1; occurrence[key] = null; }
      }
    }
    const occ = Array.isArray(rewritten.occurrences) ? rewritten.occurrences : [];
    aggregate.sources += 1;
    aggregate.occurrences += occ.length;
    aggregate.failedSources += rewritten.status === 'FAILED' ? 1 : 0;
    aggregate.partialSources += rewritten.status === 'PARTIAL' ? 1 : 0;
    aggregate.emptySources += rewritten.status === 'SUCCEEDED' && occ.length === 0 ? 1 : 0;
    manifests.push(rewritten);
  }
  await writeFile(output, renderContactSheet(manifests), 'utf8');
  process.stdout.write(`${JSON.stringify(aggregate)}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) cli(process.argv.slice(2)).catch(() => { process.stderr.write('contact sheet generation failed; check arguments and report-tree files\n'); process.exitCode = 1; });
