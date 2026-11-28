import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { renderContactSheet } from './pdf-photo-contact-sheet.mjs';

const occurrence = (overrides = {}) => ({
  id: 'occ-1', page: 2, bounds: [0.1, 0.2, 0.8, 0.9], nativeWidth: 640, nativeHeight: 480,
  width: 320, height: 240, status: 'REVIEW_REQUIRED', reasonCodes: [], imagePath: 'assets/pic.png',
  duplicateOf: null, sourceObjectType: 'native_image', ...overrides,
});
const manifest = (id, status, occurrences = [], rest = {}) => ({
  schemaVersion: 1, extractorVersion: 'pdf-photo-v1', source: { id }, status, pageCount: 3,
  processedPages: [1, 2], skippedPages: [3], limits: { pageCap: 20 }, occurrences,
  warnings: [], errors: status === 'FAILED' ? ['PDF_READ_ERROR'] : [], metrics: { outputBytes: 123 }, ...rest,
});

test('AC-SRC-1/2/5/7/9/11: renders exact inventory across candidates and outcomes', () => {
  const html = renderContactSheet([
    manifest('ok', 'SUCCEEDED', [occurrence(), occurrence({ id: 'occ-2', status: 'FILTERED', reasonCodes: ['TINY'], imagePath: null }), occurrence({ id: 'occ-error', status: 'ERROR', reasonCodes: ['RENDER_ERROR'], imagePath: null })]),
    manifest('partial', 'PARTIAL', [occurrence({ id: 'occ-3', status: 'UNSUPPORTED', sourceObjectType: 'composite' })]),
    manifest('failed', 'FAILED'),
    manifest('empty', 'SUCCEEDED'),
  ]);
  for (const [label, value] of [['sources', 4], ['occurrences', 4], ['reviewRequired', 1], ['filtered', 1], ['unsupported', 1], ['errors', 1], ['failedSources', 1], ['partialSources', 1], ['emptySources', 1]]) assert.match(html, new RegExp(`<li><span>${label}</span><strong>${value}</strong></li>`));
  assert.match(html, /pages 1, 2 of 3; skipped 3; caps pageCap=20/);
  assert.match(html, /Human review: PENDING/);
  assert.match(html, /No photo candidates recorded\./);
  assert.match(html, /Source processing failed\./);
  assert.match(html, /unavailable \(no image path\)/);
  assert.match(html, /Duplicate of/);
  assert.match(html, /Native resolution/);
  assert.match(html, /Output resolution/);
  assert.match(html, /composite/);
});

test('AC-SRC-2/9: escapes hostile text and rejects unsafe image paths', () => {
  const hostile = `</title><script>alert('x')</script>&"`;
  const paths = ['/etc/passwd', '../outside.png', '%2e%2e/out.png', 'assets/%2f%2fevil', 'javascript:alert(1)', 'https://example.test/x.png', '\thttps://evil.example/a.png', '\nhttps://evil.example/a.png', ' https://evil.example/a.png', 'https://evil.example/a.png ', 'assets/\timage.png', 'assets/%09image.png', 'assets/%0aimage.png', 'assets/%0dimage.png', 'assets/%3fquery.png', 'assets/%23fragment.png', 'C:\\secret.png', '\\\\host\\share.png', 'assets\\x.png'];
  const html = renderContactSheet([manifest(hostile, 'PARTIAL', paths.map((imagePath, index) => occurrence({ id: String(index), imagePath, reasonCodes: [hostile] })))], { title: hostile });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
  assert.equal((html.match(/unsafe image path rejected/g) ?? []).length, paths.length);
  assert.doesNotMatch(html, /src="(?:javascript:|https?:|\/|\.\.)/i);
  assert.match(html, /&amp;&quot;/);
});

test('AC-SRC-5: renders optional page preview and explicit missing image status', () => {
  const html = renderContactSheet([manifest('preview', 'SUCCEEDED', [occurrence({ pageImagePath: 'preview/page-2.png', imagePath: null })])]);
  assert.match(html, /Original page\/region preview/);
  assert.match(html, /Recovered visible-region image: unavailable/);
  assert.match(html, /preview\/page-2\.png/);
});

test('AC-SRC-7/9: CLI writes portable links, aggregate-only stdout, and handles missing assets', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdf-contact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'reports', 'assets'), { recursive: true });
  await writeFile(path.join(root, 'reports', 'assets', 'pic.png'), 'not decoded; path check only');
  await writeFile(path.join(root, 'reports', 'manifest.json'), JSON.stringify(manifest('one', 'PARTIAL', [occurrence(), occurrence({ id: 'missing', imagePath: 'assets/gone.png' }), occurrence({ id: 'unsafe', imagePath: '../../escape.png' })])));
  const out = path.join(root, 'reports', 'contact.html');
  const result = spawnSync(process.execPath, [path.resolve('scripts/pdf-photo-contact-sheet.mjs'), path.join(root, 'reports', 'manifest.json'), '--output', out], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { sources: 1, occurrences: 3, failedSources: 0, partialSources: 1, emptySources: 0, missingAssets: 2 });
  const html = await readFile(out, 'utf8');
  assert.match(html, /src="assets\/pic\.png"/);
  assert.match(html, /no image path/);
  assert.doesNotMatch(html, /escape\.png/);
  assert.doesNotMatch(result.stdout, /manifest|pic\.png|escape/);
});

test('AC-SRC-9: CLI rejects symlink escapes and manifests outside the report tree', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pdf-contact-escape-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'tree', 'assets'), { recursive: true });
  await writeFile(path.join(root, 'outside.png'), 'private');
  await symlink(path.join(root, 'outside.png'), path.join(root, 'tree', 'assets', 'linked.png'));
  await writeFile(path.join(root, 'tree', 'manifest.json'), JSON.stringify(manifest('safe', 'SUCCEEDED', [occurrence({ imagePath: 'assets/linked.png' })])));
  const output = path.join(root, 'tree', 'contact.html');
  const ok = spawnSync(process.execPath, [path.resolve('scripts/pdf-photo-contact-sheet.mjs'), path.join(root, 'tree', 'manifest.json'), '--output', output], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(await readFile(output, 'utf8'), /no image path/);
  const outsideManifest = path.join(root, 'other.json');
  await writeFile(outsideManifest, JSON.stringify(manifest('outside', 'SUCCEEDED')));
  const rejected = spawnSync(process.execPath, [path.resolve('scripts/pdf-photo-contact-sheet.mjs'), outsideManifest, '--output', output], { encoding: 'utf8' });
  assert.notEqual(rejected.status, 0);
});
