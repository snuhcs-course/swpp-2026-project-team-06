// DEV-471 앱 번들에 들어가는 코드에서 웹에만 있는 것(DOM 전역·window 멤버·DOM 요소)은 웹 분기 안에서만 쓴다.
// 원스토어 심사 반려(2026-11-23): 생산자 Android 앱에서 '새 상품'·'상품 수정'·'판매 조건 고치기'가 빈 화면이 됐다.
// - NewProductComposer의 beforeunload effect가 `typeof window === "undefined"`만 보고 window.addEventListener를 불렀다.
//   React Native는 window를 전역 객체로 두지만(setUpGlobals.js) addEventListener가 없어 TypeError.
// - DateInput이 DOM <input type="date">를 그려 "View config getter callback for component `input`" 오류.
// ErrorBoundary가 없어 화면 전체가 지워졌다.
//
// 정규식 대신 TypeScript 구문 트리를 걷는다(문자열·주석·JSX 텍스트는 코드가 아니라 저절로 빠진다).
// 걸리는 것
//   - RN에 없는 전역 이름을 그대로 씀: document, localStorage, sessionStorage, location, history, confirm, prompt,
//     matchMedia, getComputedStyle, ResizeObserver, IntersectionObserver, MutationObserver, HTMLElement, DOMParser
//     (지역 변수·매개변수·import로 가려진 이름은 제외, typeof 피연산자와 타입 위치는 제외)
//   - window.*·globalThis.*·navigator.* 멤버(RN에도 있는 몇 가지는 제외, 옵셔널 체이닝 포함)
//   - 소문자 JSX 태그(<input>, <a>, <p>, <svg> …)와 createElement("input") 같은 DOM 요소 만들기
// 웹 분기로 치는 것
//   - `Platform.OS === "web"` / `!== "web"`(== / != 포함)와 `isWeb` 이름. "ios"·"android" 비교는 치지 않는다.
//   - 존재 검사 `typeof document !== "undefined"`는 그 이름에 한해서만. RN에 window·navigator·globalThis는 있으므로
//     `typeof window`는 치지 않는다(이번 원인).
//   - 분기가 if·삼항·&&·|| 조건이거나, 걸린 곳을 감싸는 함수(화살표 포함, 가장 가까운 것부터 바깥 함수까지,
//     모듈 최상위는 제외) 안에서 걸린 곳보다 앞에 있으면 인정한다(이른 return).
//     가장 가까운 함수만 보면 Tour.tsx의 `tick`처럼 분기한 effect 안 콜백이 걸려서, 바깥 함수까지 본다.
// 대상 파일: apps/*/src, packages/ui·api·analytics/src의 .ts·.tsx. *.web.*은 앱에 안 들어가서, 같은 이름의
// 플랫폼 파일이 Metro 순서로 android·ios 모두에서 먼저 잡히는 웹 파일도 빼고, .native·.android·.ios 파일은
// 앱 전용이라 분기를 인정하지 않고 바로 건다. 짝 판정은 scripts/metro-resolve.mjs(DEV-474 검사와 함께 씀).
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { appRole } from "./metro-resolve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const ROOTS = ["apps/consumer/src", "apps/producer/src", "packages/ui/src", "packages/api/src", "packages/analytics/src"];
const files = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (statSync(path.join(root, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(f) && !/\.web\.tsx?$/.test(f) && !f.endsWith(".d.ts") ? [rel] : [];
  });

// ---- 무엇이 웹 전용인가 ----
const MISSING_GLOBALS = new Set([
  "document", "localStorage", "sessionStorage", "location", "history", "confirm", "prompt", "matchMedia",
  "getComputedStyle", "ResizeObserver", "IntersectionObserver", "MutationObserver", "HTMLElement", "DOMParser",
]);
// RN에도 있는 전역 객체: 멤버만 본다. 아래 멤버는 RN에도 있다.
const HOSTS = new Set(["window", "globalThis", "self", "navigator"]);
const HOST_OK = new Set([
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame",
  "fetch", "console", "Promise", "product", "alert", "queueMicrotask", "structuredClone", "FormData", "Blob",
  "FileReader", "URL", "URLSearchParams", "AbortController", "Headers", "Request", "Response", "XMLHttpRequest",
  "WebSocket", "TextEncoder", "TextDecoder", "performance", "crypto", "process", "__DEV__",
]);

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) ||
  ts.isGetAccessor(n) || ts.isSetAccessor(n) || ts.isConstructorDeclaration(n);

function bindingNames(name, out = []) {
  if (!name) return out;
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const el of name.elements ?? []) if (!ts.isOmittedExpression(el)) bindingNames(el.name, out);
  return out;
}
/** 이 범위 노드가 name을 선언하는가(var·let·const·function·class·import·매개변수·catch) */
function declares(scope, name) {
  if (isFunctionLike(scope)) {
    if (scope.parameters.some((p) => bindingNames(p.name).includes(name))) return true;
    if (scope.name && ts.isIdentifier(scope.name) && scope.name.text === name && !ts.isFunctionDeclaration(scope)) return true;
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration && bindingNames(scope.variableDeclaration.name).includes(name)) return true;
  if ((ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) && scope.initializer && ts.isVariableDeclarationList(scope.initializer))
    if (scope.initializer.declarations.some((d) => bindingNames(d.name).includes(name))) return true;
  const statements = ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope) ? scope.statements : null;
  if (!statements) return false;
  for (const s of statements) {
    if (ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => bindingNames(d.name).includes(name))) return true;
    if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name?.text === name) return true;
    if (ts.isImportDeclaration(s) && s.importClause) {
      const c = s.importClause;
      if (c.name?.text === name) return true;
      const b = c.namedBindings;
      if (b && ts.isNamespaceImport(b) && b.name.text === name) return true;
      if (b && ts.isNamedImports(b) && b.elements.some((e) => e.name.text === name)) return true;
    }
  }
  return false;
}
function shadowed(node, name) {
  for (let p = node.parent; p; p = p.parent) if (declares(p, name)) return true;
  return false;
}
/** 값으로 쓰인 전역 이름인가(속성 이름·선언 이름·타입·typeof 피연산자가 아님) */
function isValueReference(id) {
  const p = id.parent;
  if (ts.isPropertyAccessExpression(p) && p.name === id) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodDeclaration(p) || ts.isJsxAttribute(p) || ts.isEnumMember(p)) && p.name === id) return false;
  if ((ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isBindingElement(p) || ts.isClassDeclaration(p)) && p.name === id) return false;
  if (ts.isBindingElement(p) && p.propertyName === id) return false;
  if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return false;
  if (ts.isTypeOfExpression(p)) return false;
  if (ts.isQualifiedName(p)) return false;
  for (let a = p; a; a = a.parent) if (ts.isTypeNode(a) || ts.isTypeAliasDeclaration(a) || ts.isInterfaceDeclaration(a)) return false;
  return true;
}

// ---- 웹 분기 ----
const isPlatformOS = (n) => ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "Platform" && n.name.text === "OS";
const EQ = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken]);
function isWebCheck(n, name) {
  if (ts.isIdentifier(n) && n.text === "isWeb") return true;
  if (!ts.isBinaryExpression(n) || !EQ.has(n.operatorToken.kind)) return false;
  const pair = [n.left, n.right];
  const str = (x, v) => ts.isStringLiteralLike(x) && x.text === v;
  if (pair.some(isPlatformOS) && pair.some((x) => str(x, "web"))) return true;
  // 존재 검사는 RN에 아예 없는 그 이름에 한해서만
  if (name && MISSING_GLOBALS.has(name))
    return pair.some((x) => ts.isTypeOfExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === name) && pair.some((x) => str(x, "undefined"));
  return false;
}
function containsWebCheck(node, name, before = Infinity) {
  let found = false;
  const visit = (n) => {
    if (found || n.pos >= before) return;
    if (n.end <= before && isWebCheck(n, name)) { found = true; return; }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}
function guarded(hit, name) {
  // 1) if·삼항·&&·|| 조건 안쪽
  for (let child = hit, p = hit.parent; p; child = p, p = p.parent) {
    if (ts.isIfStatement(p) && child !== p.expression && containsWebCheck(p.expression, name)) return true;
    if (ts.isConditionalExpression(p) && child !== p.condition && containsWebCheck(p.condition, name)) return true;
    if (ts.isBinaryExpression(p) && child === p.right && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(p.operatorToken.kind) && containsWebCheck(p.left, name)) return true;
  }
  // 2) 감싸는 함수 안에서 앞에 있는 분기(이른 return). 모듈 최상위는 보지 않는다
  for (let p = hit.parent; p; p = p.parent)
    if (isFunctionLike(p) && p.body && containsWebCheck(p.body, name, hit.getStart())) return true;
  return false;
}

/** 앱에서 죽을 수 있는 웹 전용 사용처. role: "shared"(웹·앱 공용) | "native"(앱 전용, 분기 불인정) */
export function unguardedWebGlobals(rel, source, role = "shared") {
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const hits = [];
  const report = (node, what, name) => {
    if (role !== "native" && guarded(node, name)) return;
    hits.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}: ${what}`);
  };
  const visit = (n) => {
    if (ts.isIdentifier(n) && MISSING_GLOBALS.has(n.text) && isValueReference(n) && !shadowed(n, n.text))
      report(n, n.text, n.text);
    else if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && HOSTS.has(n.expression.text) &&
      !HOST_OK.has(n.name.text) && !shadowed(n, n.expression.text))
      report(n, `${n.expression.text}.${n.name.text}`, n.expression.text);
    else if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && ts.isIdentifier(n.tagName) && /^[a-z]/.test(n.tagName.text))
      report(n, `<${n.tagName.text}>`);
    else if (ts.isCallExpression(n) && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0]) && /^[a-z]/.test(n.arguments[0].text) &&
      ((ts.isIdentifier(n.expression) && n.expression.text === "createElement") ||
        (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "createElement" &&
          !(ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "document"))))
      report(n, `createElement("${n.arguments[0].text}")`);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

/** 저장소 전체 */
export function scanRepo() {
  const exists = (rel) => existsSync(path.join(root, rel));
  const hits = [];
  for (const dir of ROOTS)
    for (const f of files(dir)) {
      const role = appRole(f, exists);
      if (role !== "none") hits.push(...unguardedWebGlobals(f, read(f), role));
    }
  return hits;
}

test("DEV-471 앱 번들 코드의 웹 전용 전역·window 멤버·DOM 요소는 웹 분기 안에서만 쓴다", () => {
  assert.deepEqual(scanRepo(), []);
});

const u = (src, role) => unguardedWebGlobals("x.tsx", src, role);
test("DEV-471 검사 자체: 반려 원인과 리뷰 실험 경우가 걸린다", () => {
  const caught = {
    // 반려 원인 두 가지(수정 전 모양)
    beforeunload_typeof_window: `useEffect(() => { if (typeof window === "undefined") return; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, []);`,
    date_input: `export function DateInput() { return <View><input type="date" /></View>; }`,
    // 분기가 아닌 것
    ios_guard: `function A(){ if (Platform.OS === "ios") return; window.addEventListener("x", h); }`,
    arrow_after_module_platform: `const isNative = Platform.OS !== "web";\nconst onShare = () => { window.addEventListener("x", h); };`,
    // window·globalThis·navigator 멤버
    optional_chain: `function A(){ window?.addEventListener("x", h); }`,
    window_document: `function A(){ return window.document.title; }`,
    window_location: `function A(){ window.location.href = "/"; }`,
    window_open: `function A(){ window.open(url); }`,
    window_matchMedia: `function A(){ return window.matchMedia("(x)").matches; }`,
    globalThis: `function A(){ globalThis.addEventListener("x", h); }`,
    navigator_clip: `function A(){ navigator.clipboard.writeText(s); }`,
    // 앞에 window.가 없는 전역
    bare_localStorage: `function A(){ return localStorage.getItem("k"); }`,
    bare_confirm: `function A(){ if (confirm("삭제?")) del(); }`,
    bare_location: `function A(){ return location.origin; }`,
    ResizeObserver: `function A(){ new ResizeObserver(cb); }`,
    try_storage: `function A(){ try { return sessionStorage.getItem("k"); } catch { return ""; } }`,
    template_doc: "function A(){ return `${document.title}`; }",
    comment_after_url: `function A(){ const u = "http://x"; window.addEventListener("x", h); }`,
    // DOM 요소
    a_tag: `function A(){ return <a href={u}>x</a>; }`,
    p_tag: `function A(){ return <p>x</p>; }`,
    svg_tag: `function A(){ return <svg width={1} />; }`,
    list_tag: `function A(){ return <ul><li>x</li></ul>; }`,
    create_input: `function A(){ return createElement("input", {}); }`,
    react_create_video: `function A(){ return React.createElement("video", {}); }`,
  };
  for (const [k, src] of Object.entries(caught)) assert.ok(u(src).length > 0, k);
  // 앱 전용 파일은 분기가 있어도 건다
  assert.ok(u(`function A(){ if (Platform.OS === "web") document.title = "x"; }`, "native").length > 0, "native file");
});

test("DEV-471 검사 자체: 웹 분기·가려진 이름·글자는 걸리지 않는다", () => {
  const clean = {
    beforeunload_fixed: `useEffect(() => { if (Platform.OS !== "web" || typeof window === "undefined") return; window.addEventListener("beforeunload", h); }, []);`,
    date_input_fixed: `export function DateInput() { const [o] = useState(false); if (Platform.OS !== "web") return <Pressable />; return <input type="date" />; }`,
    ternary: `function A(){ return Platform.OS === "web" ? createElement("div", {}) : <View />; }`,
    and_guard: `function A(){ if (isWeb && typeof document !== "undefined") document.addEventListener("keydown", f); }`,
    or_guard: `useEffect(() => { if (Platform.OS !== "web" || document.getElementById("x")) return; }, []);`,
    typeof_document: `function f() { if (typeof document === "undefined") return null; return document.querySelectorAll("a"); }`,
    inner_callback: `useEffect(() => { if (Platform.OS !== "web") return; const tick = () => { if (window.innerHeight) {} }; }, []);`,
    shadowed_param: `function A(location: string) { return location.length; }`,
    shadowed_local: `function A() { const history = []; return history.length; }`,
    imported: `import { confirm } from "./dialog";\nfunction A() { return confirm(); }`,
    single_quote: `function A(){ const s = 'document.title'; }`,
    jsx_text: `function A(){ return <T>see document.title</T>; }`,
    comment: `// window.addEventListener("x")\nfunction A(){}`,
    type_only: `function A(e: KeyboardEvent, el: HTMLElement | null): Document | null { return null; }`,
    rn_globals: `function A(){ window.setTimeout(f, 1); navigator.product; globalThis.fetch(u); }`,
    member_named_like_global: `function A(o){ return o.document + o.location; }`,
    component_tag: `function A(){ return <View><T>x</T></View>; }`,
  };
  for (const [k, src] of Object.entries(clean)) assert.deepEqual(u(src), [], k);
  // typeof window는 분기가 아니다(RN에 window가 있다)
  assert.ok(u(`function A(){ if (typeof window !== "undefined") window.open(u); }`).length > 0);
});

test("DEV-471 짝 판정: 앱이 실제로 잡는 파일만 앱 번들로 본다(Metro 순서)", () => {
  const has = (xs) => (f) => xs.includes(f);
  assert.equal(appRole("a/x.ts", has(["a/x.ts", "a/x.native.ts"])), "none");
  assert.equal(appRole("a/x.ts", has(["a/x.ts", "a/x.native.tsx"])), "shared", "ts가 .native.tsx보다 먼저 잡힌다(DEV-474)");
  assert.equal(appRole("a/x.native.tsx", has(["a/x.tsx", "a/x.native.tsx"])), "native");
  assert.equal(appRole("a/x.web.tsx", has(["a/x.tsx", "a/x.web.tsx"])), "none");
  assert.equal(appRole("a/x.tsx", has(["a/x.tsx", "a/x.android.tsx"])), "shared", "ios는 여전히 웹 파일");
});
