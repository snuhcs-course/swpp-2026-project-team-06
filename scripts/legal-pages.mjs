// export한 웹 앱(dist)에 약관·처리방침 정적 HTML과 JS 없이 보이는 사업자 정보를 넣는다 (DEV-113, R-16).
// 두 앱은 SPA라 JS 없이는 빈 화면이다. 크롤러·심사자가 JS 없이도 읽도록 같은 문안(packages/ui/src/legalContent.ts)으로
// dist/privacy.html·dist/terms.html을 만들고(vercel.json이 /privacy·/terms를 여기로 rewrite), dist/index.html의 <noscript>에 사업자 정보를 넣는다.
// 사업자 정보는 빌드 환경 변수 EXPO_PUBLIC_BUSINESS_*·EXPO_PUBLIC_PRIVACY_OFFICER에서 읽는다(값은 레포에 두지 않는다).
// 계정 삭제 안내(DEV-423, Google Play 계정 삭제 URL)도 dist/account-deletion.html로 만든다. 앱마다 내용이 달라서
// dist/../app.json의 slug로 소비자·생산자를 가른다(워크플로·local.mjs는 그대로).
// 사용: node scripts/legal-pages.mjs apps/consumer/dist
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_DELETION_PATH,
  BROKER_NOTICE,
  accountDeletionPage,
  TEST_SERVICE,
  businessCheckUrl,
  businessLines,
  legalDocs,
  officerLines,
  siteLines,
} from "../packages/ui/src/legalContent.ts";

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

function businessHtml() {
  // 사업자 정보(값 있는 것만) + 호스팅서비스 제공자. 사업자 정보가 없으면(로컬·값 없는 웹 배포) '테스트 서비스'를 앞에 둔다
  const lines = siteLines();
  const test = lines.length === 1 ? `<p>${esc(TEST_SERVICE)}</p>` : "";
  return `${test}<dl class="biz">${lines.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
}

/** 페이지 하단·noscript에 넣는 사업자 정보와 링크 */
export function footerHtml() {
  const check = businessCheckUrl();
  return [
    `<footer class="legal-footer">`,
    `<nav><a href="/terms">이용약관</a> · <a href="/privacy"><strong>개인정보 처리방침</strong></a>`,
    ` · <a href="${ACCOUNT_DELETION_PATH}">계정 삭제</a>`,
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

/** 계정 삭제 안내에만 더하는 요소 셋: 번호 단계, 이메일 상자, 테두리 로그인 버튼(DEV-423 보드 무브 3·4, 결정 c) */
const DELETION_STYLE = `
ol.steps{margin:16px 0;padding-left:0;list-style:none;counter-reset:s}
ol.steps li{counter-increment:s;display:grid;grid-template-columns:28px 1fr;gap:8px}
ol.steps li+li{margin-top:4px}
ol.steps li::before{content:counter(s);width:24px;height:24px;margin-top:2px;border-radius:999px;background:#111;color:#fff;font-size:13px;font-weight:700;display:grid;place-items:center;line-height:1}
ul{padding-left:26px}
li+li{margin-top:4px}
b{font-weight:700}
.ask{background:#f5f5f3;border:1px solid #e8e8e6;border-radius:12px;padding:12px 16px;margin:16px 0}
.ask dt{font-size:15px;color:#6b6b6b}
.ask dd{margin:0;font-weight:700;overflow-wrap:anywhere}
.ask div+div{margin-top:8px}
.btn{display:flex;align-items:center;justify-content:center;height:52px;border:1px solid #111;border-radius:12px;color:#111;font-weight:700;text-decoration:none;margin:16px 0 0}
main a{color:#111}
`;

const richHtml = (parts) =>
  parts
    .map((p) =>
      typeof p === "string" ? esc(p) : "b" in p ? `<b>${esc(p.b)}</b>` : `<a href="${esc(p.href)}">${esc(p.a)}</a>`,
    )
    .join("");

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

/** 계정 삭제 안내 한 장의 정적 HTML. role은 "CONSUMER" | "PRODUCER" */
export function accountDeletionHtml(role) {
  const d = accountDeletionPage(role);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.title)} · ${esc(d.appName)}</title>
<meta name="description" content="${esc(d.appName)} ${esc(d.title)}">
<style>${STYLE}${DELETION_STYLE}</style>
</head>
<body>
<header><a href="/">${esc(d.appName)}</a></header>
<main>
<h1>${esc(d.title)}</h1>
<p class="effective">${esc(d.byline)}</p>
<p>${esc(d.lead)}</p>
<section><h2>${esc(d.stepsTitle)}</h2>
<ol class="steps">${d.steps.map((s) => `<li><span>${richHtml(s)}</span></li>`).join("")}</ol>
<a class="btn" href="${esc(d.login.href)}">${esc(d.login.label)}</a></section>
<section><h2>${esc(d.noLoginTitle)}</h2>
<p>${esc(d.noLogin)}</p>
${
  d.contacts.length
    ? `<dl class="ask">${d.contacts.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`
    : `<p class="ask empty">${esc(d.notRegistered)}</p>`
}</section>
<section><h2>${esc(d.removedTitle)}</h2>
<ul>${d.removed.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>
<section><h2>${esc(d.keptTitle)}</h2>
<p>${esc(d.kept)}</p>
<div class="table"><table><thead><tr>${d.retainedHead.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${d.retained
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>
<p class="muted">${richHtml(d.retainedNote)}</p></section>
<section><h2>${esc(d.checkTitle)}</h2>
<ul>${d.checks.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>
<section><h2>${esc(d.partialTitle)}</h2>
<p>${esc(d.partial)}</p></section>
</main>
${footerHtml()}
</body>
</html>
`;
}

const ROLE_BY_SLUG = { "farmclub-consumer": "CONSUMER", "farmclub-producer": "PRODUCER" };

/** dist 옆 app.json의 slug로 앱을 고른다. 모르는 앱이면 멈춘다(다른 앱의 안내를 내보내지 않게) */
export async function appRoleOf(dist) {
  const slug = JSON.parse(await readFile(path.join(dist, "..", "app.json"), "utf8")).expo?.slug;
  const role = ROLE_BY_SLUG[slug];
  if (!role) throw new Error(`legal pages: unknown app slug ${slug} next to ${dist}`);
  return role;
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
  await writeFile(path.join(dist, `${ACCOUNT_DELETION_PATH.slice(1)}.html`), accountDeletionHtml(await appRoleOf(dist)));
  const index = path.join(dist, "index.html");
  await writeFile(index, withNoscriptFooter(await readFile(index, "utf8")));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2];
  if (!dist) throw new Error("Usage: node scripts/legal-pages.mjs <dist dir>");
  await writeLegalPages(path.resolve(dist));
  const n = businessLines().length;
  console.log(`legal pages: ${dist}/privacy.html, terms.html, account-deletion.html (business info lines: ${n})`);
}
