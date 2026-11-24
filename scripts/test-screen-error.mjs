// DEV-473 (screens.md 3장 ‘화면 오류’): 화면 오류 안내 부품 ScreenError의 문구·버튼·개발 한 줄.
// 앱 번들 없이 부품만 그려 본다: tsx는 typescript로 옮기고 react-native는 웹 구현(react-native-web)으로 바꿔
// react-dom/server로 HTML을 만든다. 경계가 실제로 받는지는 scripts/e2e/screen-error-boundary.spec.ts가 본다.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const Module = require("module");
const ts = require("typescript");

// 웹 번들과 같은 해석: react-native → react-native-web, 같은 이름의 .web.js가 있으면 그것, 그림 파일은 빈 값
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === "react-native") request = "react-native-web";
  const found = resolve.call(this, request, parent, ...rest);
  const web = found.replace(/\.js$/, ".web.js");
  return found.includes(`${path.sep}node_modules${path.sep}`) && web !== found && existsSync(web) ? web : found;
};
for (const ext of [".png", ".jpg", ".webp", ".svg"]) Module._extensions[ext] = (m) => (m.exports = 1);
const compile = (m, file) => {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: file,
  });
  m._compile(outputText, file);
};
Module._extensions[".tsx"] = compile;
Module._extensions[".ts"] = compile;
globalThis.__DEV__ = false;

const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ScreenError } = require("../packages/ui/src/ScreenError.tsx");
const { SCREEN_ERROR_TEXT, devErrorLine } = require("../packages/ui/src/screenErrorText.ts");

const noop = () => {};
const markup = (props) => renderToStaticMarkup(createElement(ScreenError, { error: new Error("x"), retry: noop, home: noop, dev: false, ...props }));
const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** 보이는 글자 줄(태그 사이) */
const lines = (html) =>
  decode(html.replace(/<[^>]+>/g, "\n"))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
/** <button aria-label="이름" …> 여는 태그 */
const button = (html, name) => html.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? "";
const { tokens } = require("../packages/ui/src/tokens.ts");
const rgba = (hex) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",")},1.00)`;

test("DEV_473 screen error shows the approved title, body, link and two buttons in order", () => {
  assert.deepEqual(lines(markup({ support: noop })), [
    "이 화면을 열지 못했어요",
    "저장한 내용은 그대로 있어요.",
    "다시 시도해도 안 되면 운영팀에 알려 주세요.",
    "운영팀에 알리기",
    "다시 시도",
    "홈으로",
  ]);
});

test("DEV_473 same tone as EmptyState/LoadError: icon 32, title 18 bold, body 14", () => {
  const html = markup({ support: noop });
  assert.match(html, /<svg[^>]*width="32"[^>]*height="32"/);
  assert.match(html, /role="heading"[^>]*font-size:18px;[^>]*font-weight:700/);
  assert.match(html, /font-size:14px;[^>]*>저장한 내용은 그대로 있어요\./);
  assert.match(html, /role="link"[^>]*aria-label="운영팀에 알리기"|aria-label="운영팀에 알리기"[^>]*role="link"/);
});

test("DEV_473 only retry uses the accent color; home is the 48px outline button", () => {
  const html = markup({ support: noop });
  const retry = button(html, SCREEN_ERROR_TEXT.retry);
  const home = button(html, SCREEN_ERROR_TEXT.home);
  assert.ok(retry.includes(rgba(tokens.color.accent)), retry);
  assert.ok(retry.includes("min-height:52px"), retry);
  assert.ok(!home.includes(rgba(tokens.color.accent)), home);
  assert.ok(home.includes("min-height:48px") && home.includes("r-borderWidth"), home);
  assert.equal(html.split(rgba(tokens.color.accent)).length - 1, 1, "강조색은 한 곳");
});

test("DEV_473 store build never shows the error name, message or stack", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'map')");
  error.stack = "TypeError: Cannot read properties of undefined\n    at EditProduct (edit.tsx:12:3)";
  const text = decode(markup({ error, support: noop, dev: false }));
  for (const leak of ["TypeError", "Cannot read", "EditProduct", "edit.tsx"]) assert.ok(!text.includes(leak), leak);
});

test("DEV_473 development build shows only the first message line under the title", () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'map')\nsecond line");
  const text = lines(markup({ error, support: noop, dev: true }));
  assert.equal(text[0], SCREEN_ERROR_TEXT.title);
  assert.equal(text[1], "Cannot read properties of undefined (reading 'map')");
  assert.ok(!text.join(" ").includes("TypeError"));
  assert.ok(!text.join(" ").includes("second line"));
});

test("DEV_473 support link is hidden when the app gives no support route", () => {
  const text = lines(markup({}));
  assert.ok(!text.includes(SCREEN_ERROR_TEXT.support));
  assert.deepEqual(text.slice(-2), [SCREEN_ERROR_TEXT.retry, SCREEN_ERROR_TEXT.home]);
});

test("DEV_473 inside a tab the buttons sit above the tab bar", () => {
  const pad = (html) => html.match(/padding-bottom:calc\((\d+)px/)?.[1];
  assert.equal(pad(markup({ aboveTabs: true })), String(tokens.height.tabBar + 14));
  assert.equal(pad(markup({})), "14");
});

test("DEV_473 devErrorLine: store builds get nothing, dev builds one trimmed line", () => {
  assert.equal(devErrorLine(new Error("boom"), false), null);
  assert.equal(devErrorLine(new Error("  boom \n at x"), true), "boom");
  assert.equal(devErrorLine("plain", true), "plain");
  assert.equal(devErrorLine({ message: "not an Error" }, true), null);
  assert.equal(devErrorLine(new Error(""), true), null);
  const long = devErrorLine(new Error("a".repeat(300)), true);
  assert.equal(long.length, 120);
  assert.ok(long.endsWith("…"));
});
