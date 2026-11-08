// DEV-287: render app/PWA assets from the approved artwork without redrawing the logo.
// Run after `npx playwright install chromium`: node scripts/generate-brand-icons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const root = new URL("../", import.meta.url);
const original = await readFile(new URL("packages/ui/assets/brand/logo-paper-glow-clean.png", root));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const grayscale = await page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d"); ctx.filter = "grayscale(1)";
    ctx.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, `data:image/png;base64,${original.toString("base64")}`);
  await writeFile(new URL("packages/ui/assets/brand/logo-grayscale.png", root), Buffer.from(grayscale, "base64"));
  for (const app of ["consumer", "producer"]) {
    const targets = [
      ["assets/icon.png", 1024], ["assets/favicon.png", 48], ["assets/splash-icon.png", 512],
      ["assets/android-icon-foreground.png", 1024, false, true],
      ["assets/android-icon-background.png", 1024, false, false, true],
      ["assets/android-icon-monochrome.png", 1024, true, true],
      ["public/icons/icon-192.png", 192], ["public/icons/icon-512.png", 512],
      ["public/icons/apple-touch-icon.png", 180],
      ...[16, 32, 48].map(size => [`public/icons/favicon-${size}.png`, size]),
    ];
    for (const [file, size, monochrome = false, transparent = false, backgroundOnly = false] of targets) {
      const data = await page.evaluate(async ({ src, size, monochrome, transparent, backgroundOnly }) => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!transparent) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size); }
        if (!backgroundOnly) {
          const image = new Image();
          image.src = src;
          await image.decode();
          ctx.imageSmoothingQuality = "high";
          if (monochrome) ctx.filter = "grayscale(1)";
          // Fit within the maskable safe circle, maintaining the original aspect ratio.
          const width = size * 0.64;
          const height = width * image.naturalHeight / image.naturalWidth;
          ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        }
        return canvas.toDataURL("image/png").split(",")[1];
      }, { src: `data:image/png;base64,${original.toString("base64")}`, size, monochrome, transparent, backgroundOnly });
      await writeFile(new URL(`apps/${app}/${file}`, root), Buffer.from(data, "base64"));
    }
  }
} finally { await browser.close(); }
