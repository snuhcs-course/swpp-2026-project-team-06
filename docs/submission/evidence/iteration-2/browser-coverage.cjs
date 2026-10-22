// Coverage-only preload for the unchanged Playwright test suite.
// Usage: FARMCLUB_BROWSER_COVERAGE=1 NODE_OPTIONS="--require <this file>" ...
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

if (process.env.FARMCLUB_BROWSER_COVERAGE === '1') {
  const root = process.cwd();
  const output = path.resolve(process.env.FARMCLUB_COVERAGE_DIR || '.artifacts/i2-coverage');
  const bundles = path.join(output, 'bundles');
  const raw = path.join(output, 'v8');
  fs.mkdirSync(bundles, { recursive: true });
  fs.mkdirSync(raw, { recursive: true });
  const originalLoad = Module._load;
  const wrapped = new WeakMap();
  const written = new Set();

  async function capture(page) {
    if (page.isClosed()) return;
    const entries = await page.coverage.stopJSCoverage();
    const result = [];
    for (const entry of entries) {
      if (!entry.source || !entry.url.startsWith('http')) continue;
      const url = new URL(entry.url);
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) continue;
      if (!['8081', '8082'].includes(url.port)) continue;
      const digest = crypto.createHash('sha256').update(entry.source).digest('hex');
      const target = path.join(bundles, digest + '.js');
      if (!written.has(digest)) {
        const match = [...entry.source.matchAll(/[#@]\s*sourceMappingURL=([^\s]+)/g)].at(-1);
        let map;
        try {
          if (match?.[1].startsWith('data:')) {
            map = JSON.parse(Buffer.from(match[1].split(',')[1], 'base64').toString());
          } else {
            const mapUrl = match ? new URL(match[1], entry.url).href : entry.url.replace('.bundle', '.map');
            const parsed = new URL(mapUrl);
            if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) throw new Error('Nonlocal map refused');
            const response = await fetch(mapUrl);
            if (!response.ok) throw new Error('Source map HTTP ' + response.status);
            map = await response.json();
          }
          function normalize(m) {
            if (m.sections) { for (const s of m.sections) normalize(s.map); return; }
            m.sources = m.sources.map(s => {
              if (s.startsWith(root + '/')) return s;
              if (/^\/?(?:apps|packages|node_modules)\//.test(s)) return path.resolve(root, s.replace(/^\//, ''));
              return s;
            });
          }
          normalize(map);
          fs.writeFileSync(target + '.map', JSON.stringify(map));
          const clean = entry.source.replace(/\/\/[#@]\s*sourceMappingURL=[^\n]*/g, '');
          fs.writeFileSync(target, clean + '\n//# sourceMappingURL=' + digest + '.js.map\n');
          written.add(digest);
        } catch (error) {
          fs.appendFileSync(path.join(output, 'browser-collection-errors.log'), `${entry.url}: ${error.message}\n`);
          continue;
        }
      }
      result.push({ scriptId: digest, url: pathToFileURL(target).href, functions: entry.functions });
    }
    if (result.length) {
      fs.writeFileSync(path.join(raw, `browser-${process.pid}-${crypto.randomUUID()}.json`), JSON.stringify({ result }));
    }
  }

  Module._load = function(request, parent, isMain) {
    const value = originalLoad.apply(this, arguments);
    if (request !== '@playwright/test' || !parent?.filename.includes(path.join('scripts', 'e2e'))) return value;
    if (wrapped.has(value)) return wrapped.get(value);
    const test = value.test.extend({
      browser: [async ({ browser }, use) => {
        const originalContext = browser.newContext.bind(browser);
        const pending = new Map();
        const finish = async page => {
          if (!pending.has(page)) return;
          pending.delete(page);
          await capture(page);
        };
        browser.newContext = async (...args) => {
          const context = await originalContext(...args);
          const originalPage = context.newPage.bind(context);
          const originalClose = context.close.bind(context);
          const pages = new Set();
          context.newPage = async (...pageArgs) => {
            const page = await originalPage(...pageArgs);
            await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
            pending.set(page, true);
            pages.add(page);
            const closePage = page.close.bind(page);
            page.close = async (...closeArgs) => { await finish(page); return closePage(...closeArgs); };
            return page;
          };
          context.close = async (...closeArgs) => {
            for (const page of pages) await finish(page);
            return originalClose(...closeArgs);
          };
          return context;
        };
        try { await use(browser); }
        finally {
          for (const page of pending.keys()) await finish(page);
          browser.newContext = originalContext;
        }
      }, { scope: 'worker' }],
    });
    const proxy = new Proxy(value, { get(target, key, receiver) {
      if (key === 'test' || key === 'default') return test;
      return Reflect.get(target, key, receiver);
    }});
    wrapped.set(value, proxy);
    return proxy;
  };
}
