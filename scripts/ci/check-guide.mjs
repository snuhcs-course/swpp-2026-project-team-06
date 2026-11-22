#!/usr/bin/env node
// DEV-437: 팀 안내 페이지(docs/guide/index.html)가 AGENTS.md·저장소와 어긋나지 않았는지 본다. 의존성 없음(node만).
//
//   node scripts/ci/check-guide.mjs     # CI guide job(PR·머지 큐에서 실패하면 ci-ok가 막는다), 로컬은 make test-ci
//
// 두 가지를 본다.
// 1) 값(KEYS 표): 페이지가 꼭 보여야 하는 AGENTS.md 값은 data-agents="키" 요소로 쓴다. 키마다 AGENTS.md의 절과
//    그 절에서 값을 뽑는 법을 KEYS에 선언하고, 페이지 요소와 같은지 비교한다. 방식은 셋이다.
//      text   <code data-agents="branch">…</code>                  요소의 글 = 절에서 뽑은 값 중 하나, 뽑은 값은 모두 페이지에 있어야 함
//      set    <code data-agents="checks" data-check="set">…</code>  같은 키의 set 요소를 모은 이름 집합 = 절에서 뽑은 집합
//      count  <b data-agents="steps" data-check="count">8</b>       숫자 = 절에서 센 수
//             <ol data-agents-list="steps">                         (있으면) 목록의 <li> 수도 같아야 함
//    부분 문자열 비교는 쓰지 않는다. 절을 못 찾거나, 절에서 값을 못 뽑거나, 선언한 방식의 요소가 페이지에 없거나,
//    요소가 비었으면 실패한다. HTML 주석은 지우고 보며, hidden·<template> 안의 요소는 실패다.
//    한계: CSS로 숨긴 요소(display:none 등)는 알아보지 못한다. 설명 문장은 검사하지 않는다.
// 2) 링크(checkLinks, 보고 키 sections): 저장소를 가리키는 링크는 https://github.com/<repo>/(blob|tree|commits)/main/<경로>
//    형태만 허용하고, 경로가 있는지·#앵커가 그 파일 제목의 GitHub 앵커와 같은지 본다. 페이지 안 #앵커는 id가 있어야 한다.
//    상대 경로·http://·다른 브랜치처럼 Pages에서 깨지거나 main과 갈라지는 링크는 실패다.
// 규칙을 바꾸면 같은 PR에서 페이지도 고친다. 값 키를 늘리려면 KEYS에 한 줄, test-check-guide.mjs에 fixture 시나리오를 더한다.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const PAGE = "docs/guide/index.html";
export const REPO_URL = "https://github.com/snuhcs-course/swpp-2026-project-team-06";

const ticks = (s) => [...(s ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const first = (re) => (s) => [re.exec(s)?.[1]].filter(Boolean);
const ticksIn = (re) => (s) => ticks(re.exec(s)?.[1]);
const highRisk = ticksIn(/고위험 경로:(.*?)하나라도/s);

// 값 키 → AGENTS.md 절(제목 앞부분) · 방식 · 절에서 값을 뽑는 법. 이 표가 값 검사의 전부다.
export const KEYS = {
  branch:       { section: "브랜치·커밋·PR",     text: first(/브랜치 이름은 `([^`]+)`/) },
  commit:       { section: "브랜치·커밋·PR",     text: first(/커밋: `([^`]+)`/), set: ticksIn(/type은([^.]*)\./) },
  "pr-title":   { section: "브랜치·커밋·PR",     text: first(/PR 제목: `([^`]+)`/) },
  checks:       { section: "브랜치·커밋·PR",     set: ticksIn(/필수 체크 ([^)]*)\)/) },
  "high-risk":  { section: "사람·에이전트 역할", set: highRisk, count: (s) => highRisk(s).length },
  steps:        { section: "작업 순서",          count: (s) => s.split("\n").filter((l) => /^\d+\. /.test(l)).length },
  skills:       { section: "공용 스킬",          set: (s) => s.split("\n").map((l) => /^\|\s*`([^`]+)`\s*\|/.exec(l)?.[1]).filter(Boolean) },
  "ai-log":     { section: "AI 사용 기록",       text: (s) => [...ticksIn(/AI를 쓴 작업은[^`]*(`[^`]+`)/)(s), ...first(/시간은 ([0-9.]+시간 단위)/)(s)] },
  "spec-check": { section: "브랜치·커밋·PR",     text: first(/처리 결정\(([^)]+)\)/) },
  "test-urls":  { section: "Spec-Anchored 원칙", text: ticksIn(/Vercel 기본 주소\(([^)]*)\)/) },
  stacking:     { section: "브랜치·커밋·PR",     text: first(/\*\*([A-Z]+-\d+\([^*]*?\) 전까지는 쌓지 않는다)\.\*\*/) },
};
const HOWS = ["text", "set", "count"];

// AGENTS.md를 `## 제목` 절로 나눈다(코드 펜스 안은 제목으로 보지 않는다).
export function sections(md) {
  const out = new Map();
  let name = null;
  for (const [line, fenced] of lines(md)) {
    const m = !fenced && /^## (.+)$/.exec(line);
    if (m) out.set((name = m[1].trim()), []);
    else if (name) out.get(name).push(line);
  }
  return new Map([...out].map(([k, v]) => [k, v.join("\n")]));
}

function* lines(md) {
  let fence = null;
  for (const line of md.split("\n")) {
    const f = /^\s*(```|~~~)/.exec(line)?.[1];
    if (f && (!fence || fence === f)) {
      fence = fence ? null : f;
      yield [line, true];
    } else yield [line, Boolean(fence)];
  }
}

// 절 이름은 괄호 앞까지만 적어도 된다: "사람·에이전트 역할" → "사람·에이전트 역할 (SWPP-126)".
function findSection(secs, name) {
  for (const [k, v] of secs) if (k === name || k.startsWith(`${name} (`)) return v;
  return null;
}

const plain = (s) => s.replace(/\*\*/g, "").replace(/`/g, "").replace(/\s+/g, " ").trim();

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

// 주석을 같은 길이의 공백으로 바꾼다(줄 번호를 지키려고 줄바꿈은 남긴다).
export const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const attr = (tag, name) => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)?.slice(1).find((v) => v !== undefined);

// 여는 태그 위치에서 짝이 맞는 닫는 태그 끝까지(같은 이름 태그가 겹쳐도 센다).
function elementEnd(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (const m of html.matchAll(re)) {
    if (m.index < start) continue;
    if (m[0].endsWith("/>")) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { inner: html.indexOf(">", start) + 1, close: m.index, end: m.index + m[0].length };
  }
  return null;
}

// hidden 속성이나 <template>로 감춘 범위.
function hiddenRanges(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    const t = m[0];
    if (t.startsWith("</")) continue;
    if (m[1].toLowerCase() === "template" || /\shidden(\s|=|>|\/)/i.test(t) || attr(t, "aria-hidden") === "true") {
      const e = elementEnd(html, m.index, m[1]);
      out.push([m.index, e ? e.end : html.length]);
    }
  }
  return out;
}

// 페이지의 data-agents 요소. 문제(빈 값·감춘 요소·짝 없는 태그·놓친 출현)는 problems에 담는다.
export function pageValues(html) {
  const src = stripComments(html);
  const hidden = hiddenRanges(src);
  const values = [];
  const problems = [];
  const re = /<([a-z][a-z0-9-]*)\b[^>]*\sdata-agents\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi;
  for (const m of src.matchAll(re)) {
    const key = m[2] ?? m[3];
    const how = attr(m[0], "data-check") ?? "text";
    const line = lineOf(src, m.index);
    const e = elementEnd(src, m.index, m[1]);
    if (!e) {
      problems.push({ key, line, actual: m[0], expected: `닫는 </${m[1]}>가 있어야 한다` });
      continue;
    }
    const text = decodeEntities(src.slice(e.inner, e.close).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (hidden.some(([a, b]) => m.index >= a && m.index < b)) problems.push({ key, line, actual: text, expected: "보이는 요소여야 한다(hidden·<template> 안은 안 됨)" });
    else if (!text) problems.push({ key, line, actual: "(빈 요소)", expected: "값이 있어야 한다" });
    else values.push({ key, how, text, line });
  }
  const seen = (src.match(/\sdata-agents\s*=/gi) ?? []).length;
  const parsed = [...src.matchAll(re)].length;
  if (seen !== parsed) problems.push({ key: "(형식)", line: null, actual: `data-agents ${seen}번 출현, 요소로 읽은 것 ${parsed}개`, expected: 'data-agents="키"는 여는 태그 안의 속성으로만 쓴다' });
  // <ol data-agents-list="steps">: 목록의 <li> 수도 count 값과 같아야 한다(목록 안에 <li>를 겹쳐 쓰지 않는다는 전제).
  const lists = [];
  for (const l of src.matchAll(/<(ol|ul)\b[^>]*\sdata-agents-list\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/gi)) {
    const e = elementEnd(src, l.index, l[1]);
    const items = e ? (src.slice(e.inner, e.close).match(/<li\b/gi) ?? []).length : 0;
    lists.push({ key: l[2] ?? l[3], items, line: lineOf(src, l.index) });
  }
  return { values, problems, lists };
}

// GitHub 제목 앵커(github-slugger 규칙): 소문자, 글자·숫자·_·-·공백만 남기고 공백은 -. 같은 제목은 -1, -2를 붙인다.
export function slug(heading) {
  return plain(heading)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

export function anchors(md) {
  const count = new Map();
  const out = [];
  for (const [line, fenced] of lines(md)) {
    const h = !fenced && /^#{1,6} (.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!h) continue;
    const s = slug(h);
    const n = count.get(s) ?? 0;
    count.set(s, n + 1);
    out.push(n ? `${s}-${n}` : s);
  }
  return out;
}

const err = (key, line, actual, expected) => ({ key, line, actual, expected });

function checkKey(key, def, secs, mine, lists = []) {
  const sec = findSection(secs, def.section);
  const at = mine[0]?.line ?? null;
  if (sec === null) return [err(key, at, mine.map((v) => v.text).join(" | ") || "(요소 없음)", `AGENTS.md에 "## ${def.section}" 절이 있어야 한다`)];
  const out = [];
  for (const v of mine.filter((x) => !def[x.how])) out.push(err(key, v.line, `data-check="${v.how}"`, `이 키가 받는 방식: ${HOWS.filter((h) => def[h]).join(", ")}`));
  for (const how of HOWS.filter((h) => def[h])) {
    const els = mine.filter((x) => x.how === how);
    const attrs = how === "text" ? "" : ` data-check="${how}"`;
    if (els.length === 0) {
      out.push(err(key, null, "(요소 없음)", `페이지에 data-agents="${key}"${attrs} 요소가 있어야 한다(AGENTS.md "${def.section}")`));
      continue;
    }
    const want = def[how](sec);
    if (how !== "count" && want.length === 0) {
      out.push(err(key, els[0].line, els.map((x) => x.text).join(" | "), `"${def.section}" 절에서 값을 뽑지 못했다(문장 모양이 바뀌었으면 KEYS의 뽑는 법과 페이지를 함께 고친다)`));
      continue;
    }
    if (how === "text") {
      const wrong = els.filter((x) => !want.includes(x.text));
      for (const v of wrong) out.push(err(key, v.line, v.text, want.join(" | ")));
      // 틀린 요소가 없을 때만 빠진 값을 따로 알린다(같은 어긋남을 두 번 세지 않게).
      if (!wrong.length) for (const w of want.filter((w) => !els.some((x) => x.text === w))) out.push(err(key, els[0].line, "(페이지에 없음)", w));
    } else if (how === "set") {
      const got = new Set(els.flatMap((x) => x.text.split(/[\s·,]+/).filter(Boolean)));
      const missing = want.filter((x) => !got.has(x));
      const extra = [...got].filter((x) => !want.includes(x));
      if (missing.length || extra.length) {
        const diff = [missing.length && `페이지에 없음: ${missing.join(" ")}`, extra.length && `AGENTS.md에 없음: ${extra.join(" ")}`].filter(Boolean).join(" / ");
        out.push(err(key, els[0].line, [...got].join(" "), `${want.join(" ")} (${diff})`));
      }
    } else {
      if (want === 0) {
        out.push(err(key, els[0].line, els[0].text, `"${def.section}" 절에서 셀 것을 찾지 못했다(KEYS의 세는 법을 고친다)`));
        continue;
      }
      for (const v of els.filter((x) => x.text !== String(want))) out.push(err(key, v.line, v.text, `${want} ("${def.section}" 절에서 센 수)`));
      for (const l of lists.filter((x) => x.key === key && x.items !== want)) out.push(err(key, l.line, `목록 항목 ${l.items}개`, `${want} ("${def.section}" 절에서 센 수)`));
    }
  }
  return out;
}

export function checkValues(agents, html) {
  const secs = sections(agents);
  const { values, problems, lists } = pageValues(html);
  const errors = [...problems];
  for (const v of values.filter((x) => !KEYS[x.key])) errors.push(err(v.key, v.line, v.text, `알려진 키: ${Object.keys(KEYS).join(", ")}`));
  for (const [key, def] of Object.entries(KEYS)) errors.push(...checkKey(key, def, secs, values.filter((v) => v.key === key), lists));
  return errors;
}

// 링크 검사. links는 확인한 저장소 링크 수.
export function checkLinks(html, readRepoFile) {
  const src = stripComments(html);
  const errors = [];
  const ids = new Set([...src.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]));
  const ok = new RegExp(`^${REPO_URL.replace(/[.]/g, "\\.")}/(blob|tree|commits)/main/([^#?]+)(?:#(.*))?$`);
  let links = 0;
  for (const m of src.matchAll(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    const href = decodeEntities(m[1] ?? m[2]);
    const line = lineOf(src, m.index);
    const bad = (expected) => errors.push(err("sections", line, href, expected));
    if (href.startsWith("#")) {
      if (!ids.has(href.slice(1))) bad("페이지에 이 id가 있어야 한다");
      continue;
    }
    if (/^(https:\/\/|mailto:)/i.test(href) && !href.toLowerCase().includes("snuhcs-course/swpp-2026-project-team-06")) continue;
    const r = ok.exec(href);
    if (!r) {
      bad(`저장소 링크는 ${REPO_URL}/blob/main/<경로>(#앵커) 형태로 쓴다(상대 경로·http·다른 브랜치는 Pages나 main과 어긋난다)`);
      continue;
    }
    links++;
    let file;
    let frag;
    try {
      file = decodeURIComponent(r[2]).replace(/\/$/, "");
      frag = r[3] === undefined ? "" : decodeURIComponent(r[3]);
    } catch {
      bad("URL 인코딩이 올바라야 한다");
      continue;
    }
    const md = readRepoFile(file);
    if (md === undefined) bad("저장소에 이 경로가 있어야 한다");
    else if (frag && md === null) bad("폴더 링크에는 #앵커를 쓰지 않는다");
    else if (frag && !anchors(md).includes(frag)) bad(`${file}의 제목 앵커 중 하나: ${anchors(md).map((a) => `#${a}`).join(" ").slice(0, 300)}`);
  }
  if (links === 0) errors.push(err("sections", null, "(저장소 링크 없음)", "규칙 원문을 가리키는 저장소 링크가 있어야 한다"));
  return { errors, links };
}

export function checkGuide({ agents, html, readRepoFile }) {
  return [...checkValues(agents, html), ...checkLinks(html, readRepoFile).errors];
}

// 저장소 파일 읽기: 파일이면 내용, 폴더면 null, 없으면 undefined.
export function repoReader(dir = root) {
  return (rel) => {
    const p = path.join(dir, rel);
    if (!existsSync(p)) return undefined;
    return statSync(p).isDirectory() ? null : readFileSync(p, "utf8");
  };
}

const where = (e) => (e.line ? `${PAGE}:${e.line}` : `${PAGE}(위치 없음)`);

export function format(errors) {
  const out = [`check-guide: ${PAGE}가 AGENTS.md·저장소와 ${errors.length}곳 어긋난다.`];
  for (const e of errors) out.push(`  [${e.key}] ${where(e)}`, `    실제(페이지): ${e.actual}`, `    기대: ${e.expected}`);
  out.push("규칙이 바뀌었으면 같은 PR에서 페이지의 data-agents 요소나 링크를 고친다(scripts/ci/check-guide.mjs 머리 설명).");
  return out.join("\n");
}

// GitHub Actions 어노테이션(PR 파일 화면에 표시).
export const annotations = (errors) =>
  errors.map((e) => `::error file=${PAGE}${e.line ? `,line=${e.line}` : ""}::[${e.key}] 실제 ${e.actual} / 기대 ${e.expected}`.replace(/\r?\n/g, " "));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = repoReader();
  const agents = read("AGENTS.md");
  const html = read(PAGE);
  if (typeof agents !== "string" || typeof html !== "string") {
    console.error(`check-guide: AGENTS.md 또는 ${PAGE}를 읽지 못했다.`);
    process.exit(1);
  }
  const link = checkLinks(html, read);
  const errors = [...checkValues(agents, html), ...link.errors];
  if (errors.length) {
    console.error(format(errors));
    if (process.env.GITHUB_ACTIONS === "true") console.log(annotations(errors).join("\n"));
    process.exit(1);
  }
  console.log(`check-guide: OK — 값 키 ${Object.keys(KEYS).length}개의 요소 ${pageValues(html).values.length}개, 저장소 링크 ${link.links}개(sections)가 맞다.`);
}
