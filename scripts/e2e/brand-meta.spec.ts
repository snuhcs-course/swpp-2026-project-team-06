import { test, expect } from "./fixtures";
import { consumerUrl, producerUrl } from "./helpers";

// DEV-358: 앱이 실제로 내보내는 <head>(제목·공유 미리보기 메타·파비콘)와 그 파일들이 열리는지 본다.
// 문구·그림 기준은 DEV-311 브랜드 통합안(docs/design/proposals/dev-311-brand-integrated.html). 숫자 검사는 scripts/test-brand-meta.mjs.
const apps = [
  {
    name: "consumer",
    url: consumerUrl,
    title: "farmclub · 좋아하는 농가를 수확 전에 예약해요",
    description: "농가가 기간마다 가격을 정하고, 지금 예약하면 지금 가격으로 받아요.",
  },
  // 생산자 메타·공유 카드는 통합안 보드에 문구가 없어 그대로 둔다(apps/consumer/tasks/DEV-358.md 판단 필요)
  {
    name: "producer",
    url: producerUrl,
    title: "farmclub 농가 · 수확 전에 예약받는 산지 직송",
    description: "농가가 정한 시기별 가격으로 수확 전에 예약을 받아요",
  },
];

for (const app of apps) {
  test(`DEV-358 ${app.name}: page title, share preview meta and icons are served`, async ({ page, request }) => {
    await page.goto(app.url);
    await expect(page).toHaveTitle(app.title);
    const content = (selector: string) => page.locator(selector).getAttribute("content");
    expect(await content('meta[property="og:title"]')).toBe(app.title);
    expect(await content('meta[property="og:description"]')).toBe(app.description);
    expect(await content('meta[name="description"]')).toBe(app.description);
    expect(await content('meta[property="og:site_name"]')).toBe("farmclub");
    expect(await content('meta[property="og:image:width"]')).toBe("1200");
    expect(await content('meta[property="og:image:height"]')).toBe("630");
    expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");

    const hrefs = await page.locator('link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")!),
    );
    expect(hrefs).toEqual(expect.arrayContaining(["/icons/favicon-16.png", "/icons/favicon-32.png", "/icons/apple-touch-icon.png", "/manifest.webmanifest"]));
    // og:image는 운영 도메인 주소라 따라가지 않고, 같은 파일을 로컬 앱에서 연다.
    for (const href of [...hrefs, "/og.jpg"]) {
      const response = await request.get(new URL(href, app.url).toString());
      expect(response.status(), href).toBe(200);
      if (href.endsWith(".png")) expect(response.headers()["content-type"], href).toContain("image/png");
      if (href.endsWith(".jpg")) expect(response.headers()["content-type"], href).toContain("image/jpeg");
    }
    const manifest = await (await request.get(new URL("/manifest.webmanifest", app.url).toString())).json();
    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, app.url).toString());
      expect(response.status(), icon.src).toBe(200);
    }
  });
}
