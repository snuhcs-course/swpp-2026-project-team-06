// export한 웹 앱(dist)에 약관·처리방침 정적 HTML과 JS 없이 보이는 사업자 정보를 넣는다 (DEV-113, R-16).
// 두 앱은 SPA라 JS 없이는 빈 화면이다. 크롤러·심사자가 JS 없이도 읽도록 같은 문안(packages/ui/src/legalContent.ts)으로
// dist/privacy.html·dist/terms.html을 만들고(vercel.json이 /privacy·/terms를 여기로 rewrite), dist/index.html의 <noscript>에 사업자 정보를 넣는다.
// 사업자 정보는 빌드 환경 변수 EXPO_PUBLIC_BUSINESS_*·EXPO_PUBLIC_PRIVACY_OFFICER에서 읽는다(값은 레포에 두지 않는다).
// 사용: node scripts/legal-pages.mjs apps/consumer/dist
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BROKER_NOTICE,
  TEST_SERVICE,
  businessCheckUrl,
  businessLines,
  legalDocs,
  officerLines,
} from "../packages/ui/src/legalContent.ts";

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function businessHtml() {
  const lines = businessLines();
  return lines.length
    ? `<dl class="biz">${lines.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`
    : `<p>${esc(TEST_SERVICE)}</p>`;
}

/** 페이지 하단·noscript에 넣는 사업자 정보와 링크 */
export function footerHtml() {
  const check = businessCheckUrl();
  return [
    `<footer class="legal-footer">`,
    `<nav><a href="/terms">이용약관</a> · <a href="/privacy"><strong>개인정보 처리방침</strong></a>`,
    check ? ` · <a href="${esc(check)}" rel="noopener" target="_blank">사업자정보 확인</a>` : "",
    `</nav>`,
    businessHtml(),
    `<p class="muted">${esc(BROKER_NOTICE)}</p>`,
    `</footer>`,
  ].join("");
}

function blockHtml(block) {
  if (typeof block === "string") return `<p>${esc(block)}</p>`;
  if ("list" in block) return `<ul>${block.list.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  if ("table" in block) {
    const { head, rows } = block.table;
    return `<div class="table"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }
  if ("officer" in block) return officerLines().map((l) => `<p>${esc(l)}</p>`).join("");
  return businessHtml();
}

const STYLE = `
:root{color-scheme:light}
body{margin:0;background:#fff;color:#111;font:17px/1.6 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;word-break:keep-all}
main,.legal-footer{max-width:720px;margin:0 auto;padding:0 20px}
header{max-width:720px;margin:0 auto;padding:16px 20px;display:flex;gap:16px;align-items:center}
header a{color:#111;font-weight:700;text-decoration:none}
h1{font-size:28px;line-height:36px;margin:8px 0}
h2{font-size:20px;margin:36px 0 8px}
.muted,.effective{color:#6b6b6b;font-size:15px}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border:1px solid #e8e8e6;padding:8px;text-align:left;vertical-align:top}
th{background:#f5f5f3}
.legal-footer{border-top:1px solid #e8e8e6;margin-top:48px;padding-top:16px;padding-bottom:32px;font-size:13px;color:#6b6b6b}
.legal-footer a{color:#111}
.biz{margin:8px 0}.biz div{display:flex;gap:8px}.biz dt{min-width:9em}.biz dd{margin:0}
`;

/** 약관·처리방침 한 장의 정적 HTML */
export function pageHtml(doc) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} · farmclub</title>
<meta name="description" content="farmclub ${esc(doc.title)}">
<style>${STYLE}</style>
</head>
<body>
<header><a href="/">farmclub</a></header>
<main>
<h1>${esc(doc.title)}</h1>
<p class="effective">시행일 ${esc(doc.effective)}</p>
${doc.intro.map((p) => `<p>${esc(p)}</p>`).join("\n")}
${doc.sections.map((s) => `<section><h2>${esc(s.title)}</h2>${s.body.map(blockHtml).join("")}</section>`).join("\n")}
</main>
${footerHtml()}
</body>
</html>
`;
}

/** index.html의 <noscript>에 사업자 정보와 링크를 넣는다. 없으면 </body> 앞에 noscript를 만든다 */
export function withNoscriptFooter(indexHtml) {
  const block = `<noscript><p>farmclub을 쓰려면 JavaScript를 켜 주세요.</p>${footerHtml()}</noscript>`;
  if (/<noscript>[\s\S]*?<\/noscript>/.test(indexHtml))
    return indexHtml.replace(/<noscript>[\s\S]*?<\/noscript>/, block);
  return indexHtml.replace("</body>", `${block}</body>`);
}

export async function writeLegalPages(dist) {
  for (const doc of Object.values(legalDocs))
    await writeFile(path.join(dist, `${doc.path.slice(1)}.html`), pageHtml(doc));
  const index = path.join(dist, "index.html");
  await writeFile(index, withNoscriptFooter(await readFile(index, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2];
  if (!dist) throw new Error("Usage: node scripts/legal-pages.mjs <dist dir>");
  await writeLegalPages(path.resolve(dist));
  const n = businessLines().length;
  console.log(`legal pages: ${dist}/privacy.html, terms.html (business info lines: ${n})`);
}
