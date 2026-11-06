// npm run demo:site (DEV-134): demo/scenario.mjs + demo/manifest.json으로 demo/site HTML의 손으로 쓰던 부분만 다시 쓴다.
//   - 전체 흐름(index.html): 흐름 목록(구간마다 한 줄), 영상 길이, 앱별 카드의 길이
//   - 앱 페이지(consumer·producer·admin): 단계 목록(시나리오 steps), 영상 길이
//   - 모든 페이지: 하단 문구(footer)
// 나머지(머리·제목·소개 문단·스타일)는 그대로 둔다. 페이지 구조가 바뀌어 자리를 못 찾으면 오류로 멈춘다.
//   npm run demo:site             → 파일을 고친다
//   npm run demo:site -- --check  → 고칠 것이 있으면 목록을 보이고 1로 끝난다(파일은 그대로)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ROLES, STORY, scenario as defaultScenario, segmentsByRole } from "../scenario.mjs";
import { demoDir, formatDuration, isMain, parseArgs, readManifest, repoRoot, runMain, siteDir } from "./lib.mjs";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** 앱 페이지용: "FEAT-06 · FEAT-12" */
export const idsFull = (ids) => ids.join(" · ");
/** 전체 흐름용: 같은 접두어가 이어지면 번호만 "FEAT-02 · 03 · 04" */
export function idsShort(ids) {
  let prev = null;
  return ids
    .map((id) => {
      const [prefix, num] = id.split("-");
      const out = prefix === prev ? num : id;
      prev = prefix;
      return out;
    })
    .join(" · ");
}

export function storyList(scenario) {
  return scenario.order
    .map((seg) => {
      const { story } = scenario.segments[seg];
      const who = ROLES[seg[0]].who;
      return `<li><span class="who">${esc(who)}</span><span class="t">${esc(story.title)}</span><span class="d">${esc(story.desc)}</span><span class="id">${esc(idsShort(story.feat))}</span></li>`;
    })
    .join("");
}

export function roleList(scenario, role) {
  const steps = segmentsByRole(scenario.order)[role].flatMap((seg) => scenario.segments[seg].steps);
  return steps
    .map((s, i) => `<li><span class="n">${i + 1}</span><span class="t">${esc(s.title)}</span><span class="d">${esc(s.desc)}</span><span class="id">${esc(idsFull(s.feat))}</span></li>`)
    .join("");
}

/** 정확히 한 번 나오는 자리를 바꾼다. 없거나 여러 번이면 페이지 구조가 바뀐 것이라 멈춘다 */
function replaceOnce(html, re, fn, what, page) {
  const n = [...html.matchAll(new RegExp(re.source, `${re.flags.replace("g", "")}g`))].length;
  if (n !== 1) throw new Error(`${page}: ${what} 자리를 ${n === 0 ? "찾지 못했어요" : `${n}곳에서 찾았어요`}(${re})`);
  return html.replace(re, fn);
}

function setDuration(html, seconds, page, warnings) {
  if (seconds == null) {
    warnings.push(`${page}: manifest에 길이가 없어 길이 표기를 그대로 둠`);
    return html;
  }
  return replaceOnce(html, /(<div class="meta"><span>)\d+:\d{2}( · )/, (_, a, b) => `${a}${formatDuration(seconds)}${b}`, "영상 길이", page);
}

/**
 * pages: { "index.html": html, "consumer/index.html": html, ... } → 같은 모양으로 고친 html과 경고
 * manifest: { videos: { "story.mp4": { seconds } ... } } (없어도 됨: 길이는 그대로 둔다)
 */
export function renderSite(pages, { scenario = defaultScenario, manifest = null } = {}) {
  const warnings = [];
  const seconds = (video) => manifest?.videos?.[video]?.seconds;
  const out = {};
  const footer = (html, page) => replaceOnce(html, /(<footer>)[\s\S]*?(<\/footer>)/, (_, a, b) => `${a}${esc(scenario.footer)}${b}`, "footer", page);
  const byRole = segmentsByRole(scenario.order);

  let index = pages[STORY.page];
  if (index == null) throw new Error(`${STORY.page}가 없어요`);
  index = replaceOnce(index, /(<ol class="story"[^>]*>)[\s\S]*?(<\/ol>)/, (_, a, b) => `${a}${storyList(scenario)}${b}`, "흐름 목록", STORY.page);
  index = setDuration(index, seconds(STORY.video), STORY.page, warnings);
  for (const role of Object.values(ROLES)) {
    const s = seconds(role.video);
    if (s == null) continue;
    const re = new RegExp(`(<a class="card" href="/${role.key}">(?:(?!</a>)[\\s\\S])*?· )\\d+:\\d{2}(</span>)`);
    index = replaceOnce(index, re, (_, a, b) => `${a}${formatDuration(s)}${b}`, `${role.key} 카드 길이`, STORY.page);
  }
  out[STORY.page] = footer(index, STORY.page);

  for (const [r, role] of Object.entries(ROLES)) {
    let html = pages[role.page];
    if (html == null) throw new Error(`${role.page}가 없어요`);
    if (!byRole[r].length) warnings.push(`${role.page}: 시나리오에 ${role.label} 구간이 없음`);
    html = replaceOnce(html, /(<ol aria-label="영상 단계">)[\s\S]*?(<\/ol>)/, (_, a, b) => `${a}${roleList(scenario, r)}${b}`, "단계 목록", role.page);
    html = setDuration(html, seconds(role.video), role.page, warnings);
    out[role.page] = footer(html, role.page);
  }
  return { pages: out, warnings };
}

// ---- 녹화 스크립트 자막과 시나리오가 어긋났는지(story.mjs가 시나리오를 읽게 바뀌기 전까지 쓰는 점검) ----

const STR = String.raw`("(?:[^"\\]|\\.)*"|\x60(?:[^\x60\\]|\\.)*\x60)`;
const CAP = new RegExp(String.raw`\bcap\(\s*${STR}(?:\s*,\s*${STR})?(?:\s*,\s*${STR})?\s*\)`, "g");
const unquote = (lit) =>
  lit == null
    ? ""
    : lit
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\(["'`\\])/g, "$1")
        .replace(/\$\{FARM\.name\}/g, "{farm}")
        .replace(/\$\{state\.productName\}/g, "{product}");

/** story.mjs 소스 → { 구간: [{title, desc, ids}], "*": 구간 밖(공용 함수)의 자막 } */
export function storyCaptions(src) {
  const bodies = {};
  const starts = [...src.matchAll(/^\s{2}async (\w+)\(\) \{$/gm)].map((m) => ({ seg: m[1], at: m.index }));
  const segOf = (at) => [...starts].reverse().find((s) => s.at <= at)?.seg;
  const segsStart = src.indexOf("const segments = {");
  for (const m of src.matchAll(CAP)) {
    const key = segsStart >= 0 && m.index > segsStart ? segOf(m.index) ?? "*" : "*";
    (bodies[key] ??= []).push({ title: unquote(m[1]), desc: unquote(m[2]), ids: unquote(m[3]) });
  }
  return bodies;
}

/** 시나리오 자막과 story.mjs 자막의 차이(문장 목록). 빈 배열이면 같다 */
export function captionDrift(src, scenario = defaultScenario) {
  const found = storyCaptions(src);
  const key = (c) => JSON.stringify([c.title, c.desc, c.ids ?? ""]);
  const shared = new Set((found["*"] ?? []).map(key));
  const drift = [];
  for (const seg of scenario.order) {
    const want = scenario.segments[seg].steps.flatMap((s) => s.captions);
    const inStory = (found[seg] ?? []).map(key);
    const inScenario = want.filter((c) => !(c.when === "prod" && shared.has(key(c)))).map(key);
    for (const k of inScenario) if (!inStory.includes(k)) drift.push(`${seg}: 시나리오에만 있음 ${k}`);
    for (const k of inStory) if (!inScenario.includes(k)) drift.push(`${seg}: story.mjs에만 있음 ${k}`);
    if (!drift.some((d) => d.startsWith(`${seg}:`)) && inStory.join() !== inScenario.join()) drift.push(`${seg}: 자막 순서가 다름`);
  }
  return drift;
}

export function readPages(dir = siteDir) {
  return Object.fromEntries([STORY.page, ...Object.values(ROLES).map((r) => r.page)].map((p) => [p, readFileSync(path.join(dir, p), "utf8")]));
}

if (isMain(import.meta.url)) {
  await runMain(async () => {
    const { opts } = parseArgs(process.argv.slice(2), { flags: ["check"] });
    const dir = opts.dir ? path.resolve(opts.dir) : siteDir;
    const manifest = readManifest(opts.manifest ? path.resolve(opts.manifest) : undefined);
    if (!manifest) console.warn("warning: demo/manifest.json이 없어 영상 길이는 그대로 둬요(npm run demo:stitch가 만든다)");
    else if (manifest.iteration !== defaultScenario.iteration) console.warn(`warning: manifest(${manifest.iteration})와 시나리오(${defaultScenario.iteration})의 iteration이 달라요`);
    const before = readPages(dir);
    const { pages, warnings } = renderSite(before, { manifest });
    for (const w of warnings) console.warn(`warning: ${w}`);
    const drift = captionDrift(readFileSync(path.join(demoDir, "record", "story.mjs"), "utf8"));
    for (const d of drift) console.warn(`warning: 자막 불일치 ${d}`);
    const changed = Object.keys(pages).filter((p) => pages[p] !== before[p]);
    if (opts.check) {
      if (changed.length) {
        console.error(`demo/site가 시나리오와 달라요: ${changed.join(", ")} (npm run demo:site로 고친다)`);
        process.exitCode = 1;
      } else console.log("demo/site matches the scenario.");
      return;
    }
    for (const p of changed) writeFileSync(path.join(dir, p), pages[p]);
    console.log(changed.length ? `Updated ${changed.map((p) => path.relative(repoRoot, path.join(dir, p))).join(", ")}` : "demo/site already matches the scenario.");
  });
}
