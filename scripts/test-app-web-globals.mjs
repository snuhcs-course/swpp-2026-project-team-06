// 앱(apps/*/src)에서 웹 전용 전역(window·document 이벤트·DOM)을 쓰는 곳은 Platform 분기 안에 있어야 한다.
// DEV-471 원스토어 심사 반려(2026-11-23): 생산자 Android 앱에서 '새 상품'·'상품 수정'이 빈 화면이 됐다.
// 판매페이지 화면(NewProductComposer)의 beforeunload effect가 `typeof window === "undefined"`만 보고
// window.addEventListener를 불렀는데, React Native는 window를 전역 객체로 정의하고(setUpGlobals.js) addEventListener는
// 없어서 TypeError가 났다. 경계(ErrorBoundary)가 없어 화면 전체가 지워졌다.
// 그래서 window 쪽은 `typeof window` 검사를 분기로 치지 않는다. document는 RN에 없으니 `typeof document` 검사도 분기로 친다.
// 웹 전용 쌍(같은 이름의 .native.ts(x)가 있는 파일)과 *.web.ts(x)는 Metro가 앱 번들에 넣지 않으므로 보지 않는다.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const files = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (statSync(path.join(root, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(f) && !/\.(web|native)\.tsx?$/.test(f) ? [rel] : [];
  });
const hasNativePair = (rel) =>
  [".native.ts", ".native.tsx"].some((ext) => existsSync(path.join(root, rel.replace(/\.tsx?$/, ext))));
// 주석·문자열 안의 단어는 보지 않는다(줄 위치는 유지).
const stripComments = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, (m) => " ".repeat(m.length))
    .replace(/`[^`]*`/g, (m) => m.replace(/[^\n]/g, " "));
const strip = (s) => stripComments(s).replace(/"[^"\n]*"/g, (m) => `"${" ".repeat(m.length - 2)}"`);

// 웹에만 있는 것: window·document의 이벤트 구독, document의 DOM 접근, window의 창 크기.
const WEB_ONLY = /(?<![\w.$])(?:(window|document)\s*\.\s*(?:add|remove)EventListener|(document)\s*\.\s*\w+|(window)\s*\.\s*inner(?:Width|Height))/g;
// 웹에만 있는 DOM 요소(react-native-web만 그린다). 앱에서 그리면 "View config getter callback for component `input`"
// 오류로 화면 전체가 지워진다(DEV-471: 판매 조건 고치기의 DateInput <input type="date">).
const DOM_TAGS = "input|div|span|img|select|option|textarea|button|label|video|audio|iframe|canvas|form|style";
const DOM_JSX = new RegExp(`<(${DOM_TAGS})[\\s/>]`, "g");
const DOM_CREATE = new RegExp(`createElement\\(\\s*"(${DOM_TAGS})"`, "g");
// 가장 가까운 effect·함수 시작부터 그 줄까지를 분기 범위로 본다.
const SCOPE = /(?:useEffect|useLayoutEffect|useCallback|useMemo)\s*\(|function\s+\w*\s*\(/g;

/** 앱 코드에서 Platform 분기 없이 웹 전용 전역을 쓰는 곳 */
export function unguardedWebGlobals(rel, source) {
  const code = strip(source);
  const hits = [];
  const found = [
    ...code.matchAll(WEB_ONLY),
    ...(rel.endsWith(".tsx") ? [...code.matchAll(DOM_JSX)] : []),
    ...stripComments(source).matchAll(DOM_CREATE),
  ];
  for (const m of found) {
    const global = m[1] ?? m[2] ?? m[3];
    let start = 0;
    for (const s of code.slice(0, m.index).matchAll(SCOPE)) start = s.index;
    const scope = code.slice(start, m.index);
    const guarded =
      /Platform\.OS\s*[!=]==?\s*"/.test(scope) ||
      /\bisWeb\b/.test(scope) ||
      (global === "document" && /typeof\s+document\s*[!=]==?\s*"/.test(scope));
    if (!guarded) hits.push(`${rel}:${code.slice(0, m.index).split("\n").length}: ${m[0]}`);
  }
  return hits;
}

test("앱 화면 코드의 웹 전용 전역(window·document 이벤트, DOM 요소)은 Platform 분기 안에서만 쓴다", () => {
  const hits = [];
  for (const app of ["apps/consumer/src", "apps/producer/src", "packages/ui/src"])
    for (const f of files(app)) if (!hasNativePair(f)) hits.push(...unguardedWebGlobals(f, read(f)));
  assert.deepEqual(hits, []);
});

test("검사 자체: typeof window 검사만으로는 앱에서 통과하지 못한다(반려 원인 재발 방지)", () => {
  const bad = `useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);`;
  assert.equal(unguardedWebGlobals("x.tsx", bad).length, 2);
  const good = `useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);`;
  assert.deepEqual(unguardedWebGlobals("x.tsx", good), []);
  // document는 RN에 없으므로 typeof document 검사도 분기로 친다
  assert.deepEqual(unguardedWebGlobals("x.tsx", `function f() { if (typeof document === "undefined") return; document.querySelectorAll("a"); }`), []);
  // DOM 요소: 분기 없이 그리면 걸리고, Platform 분기가 같은 함수 안에 있으면 통과
  assert.equal(unguardedWebGlobals("x.tsx", `function DateInput() { return <View><input type="date" /></View>; }`).length, 1);
  assert.equal(unguardedWebGlobals("x.tsx", `function V() { return createElement("video", { src }); }`).length, 1);
  assert.deepEqual(unguardedWebGlobals("x.tsx", `function DateInput() { if (Platform.OS !== "web") return <Pressable />; return <input type="date" />; }`), []);
});

test("생산자 날짜 칸(DateInput)은 앱에서 DOM <input>을 그리지 않는다(판매 조건 고치기)", () => {
  const code = read("apps/producer/src/lib/fields.tsx");
  const fn = code.slice(code.indexOf("export function DateInput("), code.indexOf(`type="date"`));
  assert.match(fn, /if \(Platform\.OS !== "web"\)\s*return/);
  assert.match(fn, /<DateSheet/);
});

test("판매페이지 화면(새 상품·상품 수정)의 beforeunload는 웹에서만 구독한다", () => {
  const code = read("apps/producer/src/lib/NewProductComposer.tsx");
  const at = code.indexOf('window.addEventListener("beforeunload"');
  assert.ok(at > 0, "beforeunload 구독 위치");
  const effect = code.slice(code.lastIndexOf("useEffect(", at), at);
  assert.match(effect, /Platform\.OS\s*!==\s*"web"/);
});
