// DEV-493 앱의 파일 업로드는 postForm(packages/api/src/formPost*.ts)으로만 보낸다.
// 원스토어 2차 반려(2026-11-26): 농가 Android 앱에서 새 상품·상품 수정의 대표 사진을 고르면
// "Unsupported FormDataPart implementation"이 뜨고 상품 등록이 안 됐다.
// - Expo SDK 57은 전역 fetch를 expo/fetch로 바꾼다(node_modules/expo/src/winter/runtime.native.ts).
// - expo/fetch는 FormData 파트로 문자열·Blob·bytes()가 있는 객체만 받는다. RN 방식 {uri, name, type} 파트는
//   expo/src/winter/fetch/convertFormData.ts에서 그 오류로 거절한다. 앱 Mock은 업로드 요청을 보내지 않아 놓쳤다.
// 고친 길: FormData는 appendFile(upload.ts)로 만들고, 앱은 RN XMLHttpRequest(formPost.native.ts), 웹은 fetch(formPost.ts)로 보낸다.
//
// 이 파일의 검사(TypeScript 구문 트리, 앱 번들에 들어가는 apps/*/src·packages/*/src)
//   1. fetch(…, { body: <FormData> })를 쓰지 않는다. FormData는 `new FormData()`를 바로 넣었거나 그것으로 만든 변수.
//   2. FormData에 {uri…} 객체를 직접 붙이지 않는다(append·set의 둘째 인자 객체에 uri 칸, 펼치기 포함). upload.ts만 예외.
//   3. 직접 fetch(…)는 허용 목록(FETCH_OK) 파일에서만 쓴다. 새 서버 호출은 client.ts request()나 postForm으로.
//   4. expo-image-picker를 쓰는 파일은 사진 형식·이름을 pickedImage로 정하고, 결과의 mimeType·fileName을 직접 읽지 않는다
//      (quality < 1이면 다시 압축한 JPEG인데 원본 HEIC·WebP 형식이 남아 서버가 400, DEV-493). 영상만 예외(PICKER_RAW_OK).
// 그리고 expo/fetch 파트 판정(원인 고정), postForm 두 구현, appendFile·pickedImage의 단위 테스트.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { appRole } from "./metro-resolve.mjs";

const root = path.resolve(import.meta.dirname, "..");
const ROOTS = ["apps/consumer/src", "apps/producer/src", "packages/ui/src", "packages/api/src", "packages/analytics/src"];
const APPEND_OK = new Set(["packages/api/src/upload.ts"]);
const FETCH_OK = new Set(["packages/api/src/client.ts", "packages/api/src/formPost.ts", "packages/api/src/privatePhoto.ts"]);
// 영상은 다시 만들지 않으므로 원본 이름·형식을 쓴다(pick.native.ts의 두 줄)
const PICKER_RAW_OK = { "apps/producer/src/lib/pick.native.ts": 2 };
const files = (dir) =>
  readdirSync(path.join(root, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (statSync(path.join(root, rel)).isDirectory()) return files(rel);
    return /\.tsx?$/.test(f) && !f.endsWith(".d.ts") ? [rel] : [];
  });

const unwrap = (n) => {
  while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n) ||
    ts.isSatisfiesExpression?.(n) || ts.isNonNullExpression(n))) n = n.expression;
  return n;
};
const isNewFormData = (n) => {
  n = unwrap(n);
  return !!n && ts.isNewExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "FormData";
};
const isFetch = (callee) => {
  callee = unwrap(callee);
  if (ts.isIdentifier(callee)) return callee.text === "fetch";
  return ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch" &&
    ts.isIdentifier(callee.expression) && ["globalThis", "window", "global", "self"].includes(callee.expression.text);
};
/** 객체 리터럴에 uri 칸이 있거나 펼치기(…file)가 있는가 */
const looksLikeUriPart = (n) => {
  n = unwrap(n);
  if (!n || !ts.isObjectLiteralExpression(n)) return false;
  return n.properties.some((p) =>
    ts.isSpreadAssignment(p) ||
    ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name && ts.isIdentifier(p.name) && p.name.text === "uri"));
};

/** 걸린 곳 목록 ["파일:줄 설명"] */
export function nativeUploadProblems(rel, source) {
  const usesPicker = /from\s+["']expo-image-picker["']/.test(source);
  const sf = ts.createSourceFile(rel, source, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const forms = new Set(); // new FormData()로 만든 변수 이름(파일 안)
  const visitDecl = (n) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && isNewFormData(n.initializer)) forms.add(n.name.text);
    ts.forEachChild(n, visitDecl);
  };
  visitDecl(sf);
  const out = [];
  const at = (n, what) => out.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} ${what}`);
  const raw = [];
  let picked = false;
  const visit = (n) => {
    if (usesPicker && ts.isPropertyAccessExpression(n) && ["mimeType", "fileName"].includes(n.name.text)) raw.push(n);
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "pickedImage") picked = true;
    if (ts.isCallExpression(n) && isFetch(n.expression) && !FETCH_OK.has(rel))
      at(n, "허용 목록 밖에서 fetch를 바로 씀 → request()나 postForm을 쓴다");
    if (ts.isCallExpression(n)) {
      const init = unwrap(n.arguments[1]);
      if (isFetch(n.expression) && init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          const name = p.name && ts.isIdentifier(p.name) ? p.name.text : "";
          if (name !== "body") continue;
          const value = ts.isShorthandPropertyAssignment(p) ? p.name : ts.isPropertyAssignment(p) ? unwrap(p.initializer) : null;
          if (value && (isNewFormData(value) || (ts.isIdentifier(value) && forms.has(value.text))))
            at(n, "fetch에 FormData를 보냄 → postForm을 쓴다");
        }
      }
      const callee = n.expression;
      if (!APPEND_OK.has(rel) && ts.isPropertyAccessExpression(callee) && ["append", "set"].includes(callee.name.text) &&
        n.arguments.length >= 2 && looksLikeUriPart(n.arguments[1]))
        at(n, "FormData에 {uri} 객체를 직접 붙임 → appendFile을 쓴다");
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (usesPicker) {
    if (!picked) out.push(`${rel} expo-image-picker 결과를 pickedImage로 바꾸지 않음`);
    const allowed = PICKER_RAW_OK[rel] ?? 0;
    if (raw.length > allowed) for (const n of raw) at(n, "picker 결과의 mimeType·fileName을 직접 씀 → pickedImage를 쓴다");
  }
  return out;
}

const exists = (rel) => existsSync(path.join(root, rel));
export function scanRepo() {
  return ROOTS.flatMap(files)
    .filter((rel) => appRole(rel, exists) !== "none")
    .flatMap((rel) => nativeUploadProblems(rel, readFileSync(path.join(root, rel), "utf8")));
}

test("DEV-493 앱 번들 코드는 FormData를 fetch로 보내지 않고, {uri} 파트는 appendFile로만 붙인다", () => {
  assert.deepEqual(scanRepo(), []);
});

test("DEV-493 검사 자체: 반려 원인 모양이 걸린다", () => {
  const p = (src) => nativeUploadProblems("x.ts", src);
  const caught = {
    // 고치기 전 client.ts uploadMedia·sourceAnalysis.ts uploadSource와 같은 모양
    variable: `async function u(){ const form = new FormData(); appendFile(form, "file", f); await fetch(url, { method: "POST", body: form }); }`,
    inline: `function u(){ return fetch(url, { body: new FormData() }); }`,
    shorthand: `function u(){ const body = new FormData(); return fetch(url, { method: "POST", body }); }`,
    global_fetch: `function u(){ const f = new FormData(); return globalThis.fetch(url, { body: f }); }`,
    cast: `function u(){ const f = new FormData(); return fetch(url, { body: f as any }); }`,
    uri_part: `function u(form){ form.append("file", { uri, name, type } as unknown as Blob); }`,
    spread_part: `function u(form){ form.append("file", { ...file, name }); }`,
    set_part: `function u(form){ form.set("file", { uri: a.uri }); }`,
    direct_fetch: `function u(){ return fetch(url).then(r => r.json()); }`,
    picker_raw: `import * as ImagePicker from "expo-image-picker";\nfunction u(a){ return pickedImage(a) && { type: a.mimeType || "image/jpeg" }; }`,
    picker_without_helper: `import * as ImagePicker from "expo-image-picker";\nfunction u(a){ return { uri: a.uri }; }`,
  };
  for (const [k, src] of Object.entries(caught)) assert.ok(p(src).length > 0, k);
});

test("DEV-493 검사 자체: postForm·문자열 파트·JSON fetch는 걸리지 않는다", () => {
  const p = (src) => nativeUploadProblems("x.ts", src);
  const clean = {
    post_form: `async function u(){ const form = new FormData(); appendFile(form, "file", f); await postForm(url, form, h); }`,
    string_part: `function u(form){ form.append("orderId", id); form.append("common", String(true)); }`,
    params_append: `function u(q){ q.append("k", "v"); }`,
    picker_helper: `import * as ImagePicker from "expo-image-picker";\nfunction u(res){ return res.assets.map((a) => pickedImage(a)); }`,
  };
  for (const [k, src] of Object.entries(clean)) assert.deepEqual(p(src), [], k);
  // 허용 목록 파일의 JSON fetch는 걸리지 않는다
  const c = (src) => nativeUploadProblems("packages/api/src/client.ts", src);
  assert.deepEqual(c(`function u(){ return fetch(url, { method: "POST", body: JSON.stringify({ uri: "x" }) }); }`), []);
  assert.deepEqual(c(`function u(){ const body = "x"; return fetch(url, { body }); }`), []);
  assert.deepEqual(nativeUploadProblems("packages/api/src/upload.ts", `function a(form){ form.append("f", { uri }); }`), []);
});

// ---- 전송 함수 단위 테스트(scripts/mock-tsconfig.json 빌드) ----
process.env.EXPO_PUBLIC_API_MOCK = "0";
process.env.EXPO_PUBLIC_SHARED_MOCK_URL = "";
const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
} });
const require = createRequire(import.meta.url);
const build = (m) => require(`../.expo/mock-build/packages/api/src/${m}.js`);
const client = build("client");
const nativePost = build("formPost.native");
const webPost = build("formPost");
const upload = build("upload");
const source = build("sourceAnalysis");

/** RN XMLHttpRequest 흉내: open·setRequestHeader·send를 적고, 정한 응답(또는 오류)을 낸다 */
function fakeXhr(respond) {
  const sent = [];
  const old = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = class {
    constructor() { this.headers = {}; sent.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k] = v; }
    send(body) {
      this.body = body;
      queueMicrotask(() => {
        const r = respond(this);
        if (r === "error") this.onerror?.();
        else if (r === "timeout") this.ontimeout?.();
        else { this.status = r.status; this.responseText = r.text; this.onload?.(); }
      });
    }
  };
  return { sent, restore: () => { globalThis.XMLHttpRequest = old; } };
}
function quietWarn() {
  const warned = [];
  const old = console.warn;
  console.warn = (...a) => warned.push(a);
  return { warned, restore: () => { console.warn = old; } };
}

test("DEV-493 앱 postForm: XMLHttpRequest로 같은 FormData와 헤더를 POST하고 JSON 본문을 돌려준다", async () => {
  const x = fakeXhr(() => ({ status: 201, text: JSON.stringify({ url: "/media/a.jpg" }) }));
  try {
    const form = { parts: [] };
    const res = await nativePost.postForm("https://api.example/api/media", form, { Authorization: "Bearer t" });
    assert.deepEqual(res, { status: 201, ok: true, body: { url: "/media/a.jpg" } });
    assert.equal(x.sent.length, 1);
    assert.equal(x.sent[0].method, "POST");
    assert.equal(x.sent[0].url, "https://api.example/api/media");
    assert.equal(x.sent[0].headers.Authorization, "Bearer t");
    assert.equal(x.sent[0].body, form, "FormData를 바꾸지 않고 그대로 보낸다(RN 네트워킹이 {uri} 파트를 읽는다)");
  } finally {
    x.restore();
  }
});

test("DEV-493 앱 postForm: JSON이 아닌 오류 응답은 본문 {}로 상태를 돌려준다", async () => {
  const x = fakeXhr(() => ({ status: 413, text: "<html>Request Entity Too Large</html>" }));
  try {
    assert.deepEqual(await nativePost.postForm("https://api.example/x", {}, {}), { status: 413, ok: false, body: {} });
  } finally {
    x.restore();
  }
});

test("DEV-493 앱 postForm: 연결 실패·시간 초과·보내기 예외는 한국어 ApiError(0), 원인은 cause와 경고 로그에", async () => {
  for (const kind of ["error", "timeout", "throw"]) {
    const x = fakeXhr((xhr) => {
      if (kind === "throw") throw new Error("Unsupported FormDataPart implementation");
      return kind;
    });
    if (kind === "throw") {
      globalThis.XMLHttpRequest.prototype.send = function () { throw new Error("Unsupported FormDataPart implementation"); };
    }
    const w = quietWarn();
    try {
      await assert.rejects(nativePost.postForm("https://api.example/api/media", {}, {}), (e) => {
        assert.ok(e instanceof client.ApiError, kind);
        assert.equal(e.status, 0);
        assert.match(e.message, /[가-힣]/, "화면 문구는 한국어");
        assert.doesNotMatch(e.message, /Unsupported|Network/);
        assert.ok(e.cause instanceof Error, "원인을 잃지 않는다");
        return true;
      });
      assert.equal(w.warned.length, 1);
      assert.match(String(w.warned[0][0]), /\/api\/media/, "로그에는 경로만(호스트·토큰 없음)");
    } finally {
      w.restore();
      x.restore();
    }
  }
});

test("DEV-493 웹 postForm: fetch로 보내고 JSON이 아닌 응답은 본문 {}", async () => {
  const old = globalThis.fetch;
  const calls = [];
  globalThis.fetch = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response("<html>bad gateway</html>", { status: 502 }));
  };
  try {
    const form = new FormData();
    assert.deepEqual(await webPost.postForm("http://x/y", form, { Authorization: "Bearer t" }), { status: 502, ok: false, body: {} });
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, form);
    assert.equal(calls[0].init.headers.Authorization, "Bearer t");
  } finally {
    globalThis.fetch = old;
  }
});

test("DEV-493 appendFile: 앱 파일은 uri·name·type 세 칸만, 이름을 주면 그 이름", () => {
  const parts = [];
  const form = { append: (...a) => parts.push(a) };
  upload.appendFile(form, "file", { uri: "file:///c/a.jpg", name: "a.jpg", type: "image/jpeg", size: 123 });
  upload.appendFile(form, "file", { uri: "file:///c/b.jpg", name: "b.jpg", type: "image/jpeg" }, "cover.jpg");
  assert.deepEqual(parts, [
    ["file", { uri: "file:///c/a.jpg", name: "a.jpg", type: "image/jpeg" }],
    ["file", { uri: "file:///c/b.jpg", name: "cover.jpg", type: "image/jpeg" }],
  ]);
});

test("DEV-493 uploadSource: 프록시의 JSON 아닌 413도 ApiError(상태 그대로)로 넘긴다", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response("<html>too large</html>", { status: 413 }));
  try {
    await assert.rejects(
      source.uploadSource("b1", 1, [], false, true, new Blob([new Uint8Array([1])], { type: "image/jpeg" })),
      (e) => e instanceof client.ApiError && e.status === 413,
    );
  } finally {
    globalThis.fetch = old;
  }
});

// ---- 원인 고정: expo/fetch의 FormData 변환이 RN {uri} 파트를 거절한다 ----
function loadExpoConvertFormData() {
  const file = path.join(root, "node_modules/expo/src/winter/fetch/convertFormData.ts");
  const js = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id.endsWith("blobUtils")) return { blobToArrayBufferAsync: (b) => b.arrayBuffer() };
    throw new Error(`unexpected import ${id}`);
  };
  new Function("module", "exports", "require", js)(mod, mod.exports, req);
  return mod.exports;
}
/** Expo가 패치한 FormData(_parts에 [이름, 값])와 같은 모양 */
const expoForm = (parts) => ({ entries: () => parts });

test("DEV-493 원인: expo/fetch(SDK 57) FormData 변환은 {uri,name,type} 파트를 거절하고 문자열·Blob·bytes()만 받는다", async () => {
  const { convertFormDataAsync } = loadExpoConvertFormData();
  await assert.rejects(
    convertFormDataAsync(expoForm([["file", { uri: "file:///c/a.jpg", name: "a.jpg", type: "image/jpeg" }]])),
    /Unsupported FormDataPart implementation/,
  );
  const ok = await convertFormDataAsync(expoForm([
    ["batchVersion", "1"],
    ["file", new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" })],
    ["file2", { name: "b.png", type: "image/png", bytes: async () => new Uint8Array([137, 80]) }],
  ]), "B");
  const text = Buffer.from(ok.body).toString("latin1");
  assert.match(text, /name="batchVersion"\r\n\r\n1\r\n/);
  assert.match(text, /filename="b\.png"\r\ncontent-type: image\/png/);
});

test("DEV-493 pickedImage: 형식·이름은 다시 압축한 파일(uri) 기준, 원본 HEIC·WebP 형식은 버린다", () => {
  const cache = "file:///data/user/0/kr.farmclub.producer/cache/ImagePicker";
  // Android quality 0.8: HEIC는 .jpeg로, WebP는 .webp 이름의 JPEG 바이트로 나온다(mimeType·fileName은 원본)
  assert.deepEqual(upload.pickedImage({ uri: `${cache}/a.jpeg`, fileName: "IMG_0001.heic", mimeType: "image/heic", fileSize: 10 }),
    { uri: `${cache}/a.jpeg`, name: "IMG_0001.jpg", type: "image/jpeg", size: 10 });
  assert.deepEqual(upload.pickedImage({ uri: `${cache}/b.webp`, fileName: "leaf.webp", mimeType: "image/webp" }),
    { uri: `${cache}/b.webp`, name: "leaf.jpg", type: "image/jpeg", size: 0 });
  assert.deepEqual(upload.pickedImage({ uri: `${cache}/c.png`, fileName: "c.png", mimeType: "image/png", fileSize: 5 }),
    { uri: `${cache}/c.png`, name: "c.png", type: "image/png", size: 5 });
  const jpeg = upload.pickedImage({ uri: `${cache}/d.jpeg`, fileName: null, mimeType: null });
  assert.equal(jpeg.type, "image/jpeg");
  assert.match(jpeg.name, /^photo-\d+\.jpg$/);
  assert.ok(upload.PICK_QUALITY < 1, "형식 판단은 다시 압축할 때만 맞다");
});
