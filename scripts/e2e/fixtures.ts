// 생산자 화면 커버리지 수집(DEV-118). FARMCLUB_COVERAGE=1일 때만 켜지고, 꺼져 있으면 @playwright/test 그대로다.
// 테스트가 연 모든 페이지(기본 page·browser.newContext로 만든 페이지)의 V8 JS 커버리지를 모아
// 생산자 앱 번들만 소스맵과 함께 monocart 캐시에 넣는다. 보고서는 scripts/producer-ui-coverage.mjs가 만든다.
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { CoverageReport } from "monocart-coverage-reports";
import { producerUrl } from "./helpers";

export { expect };
export type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

const enabled = process.env.FARMCLUB_COVERAGE === "1";
export const coverageOptions = {
  name: "Producer screens/UI coverage (DEV-118)",
  outputDir: ".artifacts/coverage/producer-ui",
};

// 같은 번들의 소스맵은 한 번만 받는다(workers: 1)
const maps = new Map<string, Promise<unknown>>();
function sourceMapFor(url: string, source: string) {
  const ref = source.match(/\/\/# sourceMappingURL=(\S+)\s*$/)?.[1];
  if (!ref || ref.startsWith("data:")) return undefined;
  const mapUrl = new URL(ref, url).href;
  if (!maps.has(mapUrl)) maps.set(mapUrl, fetch(mapUrl).then((r) => (r.ok ? r.json() : undefined)));
  return maps.get(mapUrl);
}

async function collect(page: Page, report: CoverageReport) {
  if (page.isClosed()) return;
  const entries = await page.coverage.stopJSCoverage().catch(() => []);
  const own = entries.filter((e) => e.url.startsWith(producerUrl) && e.source);
  for (const e of own) Object.assign(e, { sourceMap: await sourceMapFor(e.url, e.source!) });
  if (own.length) await report.add(own);
}

export const test = base.extend<{ producerCoverage: void }>({
  producerCoverage: [
    async ({ browser, context }, use) => {
      if (!enabled) return use();
      const report = new CoverageReport(coverageOptions);
      const pending: Promise<void>[] = [];
      const track = (c: BrowserContext) => {
        const pages = new Set<Page>();
        c.on("page", (p) => {
          pages.add(p);
          pending.push(p.coverage.startJSCoverage({ resetOnNavigation: false }).catch(() => {}));
        });
        // 스펙이 직접 닫는 컨텍스트도 닫히기 전에 모은다
        const close = c.close.bind(c);
        c.close = async (...args) => {
          for (const p of pages) await collect(p, report);
          pages.clear();
          return close(...args);
        };
        return pages;
      };
      const tracked = [track(context)];
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (...args) => {
        const c = await newContext(...args);
        tracked.push(track(c));
        return c;
      };
      await use();
      browser.newContext = newContext;
      await Promise.all(pending);
      for (const pages of tracked) for (const p of pages) await collect(p, report);
    },
    { auto: true },
  ],
});
