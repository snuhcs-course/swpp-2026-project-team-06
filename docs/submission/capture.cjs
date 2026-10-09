/* Capture existing static design frames; requires Playwright Chromium. */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const repo = path.resolve(__dirname, '../..');
const output = path.resolve(process.argv[2] || 'tmp/screens');
const frames = [
  ['scr-01', 'top'], ['scr-04', 'top'], ['scr-10', 'bottom'],
  ['p-scr-22', 'top'], ['p-scr-25-sales', 'top'], ['p-scr-28-room', 'bottom'],
  ['s-10-noconsent', 'bottom'], ['s-10-stagechanged', 'bottom'], ['s-21-rejected', 'top'],
];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    // Use the local Korean system font; renders do not require remote font requests.
    await page.route('https://**/*', route => route.abort());
    for (const [name, crop] of frames) {
      await page.goto(pathToFileURL(path.join(repo, 'docs/design/screens', name + '.html')).href);
      await page.addStyleTag({ content: 'body{font-family:"Malgun Gothic","Apple SD Gothic Neo","Noto Sans KR",sans-serif!important}' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
      if (crop === 'bottom') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.screenshot({ path: path.join(output, name + '.png') });
      console.log(name + ': ' + crop + ' viewport excerpt');
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
