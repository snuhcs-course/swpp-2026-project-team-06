// DEV-483: 루트 .easignore가 EAS 빌드에 필요한 파일을 빼지 않는지, .gitignore 규칙을 빠뜨리지 않는지 본다.
// - 앱·패키지 코드의 상대 경로 import(예: packages/api → server/app/source_analysis/*.json)가 .easignore에 걸리면 실패한다.
//   EAS 번들 단계에서야 "Unable to resolve module"로 드러나는 것을 PR에서 잡는다.
// - .easignore가 있으면 eas-cli는 .gitignore(하위 폴더 것 포함)를 읽지 않으므로, .gitignore에 걸리는 경로는 .easignore에도 걸려야 한다.
// 판정은 git의 gitignore 규칙으로 한다(빈 임시 저장소에 .easignore를 .gitignore로 두고 git check-ignore --no-index).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EASIGNORE = path.join(ROOT, ".easignore");
const git = (args, cwd = ROOT, input) => spawnSync("git", args, { cwd, input, encoding: "utf8", maxBuffer: 64 << 20 });
const tracked = (...paths) => git(["ls-files", "-z", "--", ...paths]).stdout.split("\0").filter(Boolean);

const probe = mkdtempSync(path.join(tmpdir(), "easignore-"));
after(() => rmSync(probe, { recursive: true, force: true }));
git(["init", "-q"], probe);

/** rules(.gitignore 형식 파일)에 걸리는 경로만 돌려준다 */
function ignoredBy(rulesFile, paths) {
  if (!paths.length) return [];
  copyFileSync(rulesFile, path.join(probe, ".gitignore"));
  const r = git(["check-ignore", "--no-index", "--stdin", "-z"], probe, paths.join("\0") + "\0");
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  return r.stdout.split("\0").filter(Boolean);
}
const easIgnored = (paths) => ignoredBy(EASIGNORE, paths);

const CODE = /\.(?:[cm]?[jt]sx?)$/;
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
const EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".native.ts", ".native.tsx", "/index.ts", "/index.tsx", "/index.js"];

/** 소스 파일들의 상대 경로 import를 저장소 상대 경로로. 있는 파일이면 확장자까지 찾는다 */
function relativeImports(files, read, exists = () => false) {
  const out = [];
  for (const file of files) {
    for (const m of read(file).matchAll(SPEC)) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1]));
      if (base.startsWith("../")) continue; // 저장소 밖
      const target = EXTS.map((e) => base + e).find(exists) ?? base;
      out.push({ file, spec: m[1], target });
    }
  }
  return out;
}

const isFile = (p) => existsSync(path.join(ROOT, p)) && statSync(path.join(ROOT, p)).isFile();
const sources = tracked("apps", "packages").filter((f) => CODE.test(f));
const imports = relativeImports(sources, (f) => readFileSync(path.join(ROOT, f), "utf8"), isFile);

test("DEV-483: .easignore exists and drops .git as a bare name (`.git/` would leave the shallow clone in the upload)", () => {
  const lines = readFileSync(EASIGNORE, "utf8").split("\n").map((l) => l.trim());
  assert.ok(lines.includes(".git"));
  assert.ok(!lines.includes(".git/"));
});

test("DEV-483: no tracked app or package file, root manifest or lock file is dropped from the upload", () => {
  const keep = [...tracked("apps", "packages"), "package.json", "package-lock.json", ".nvmrc"];
  assert.ok(keep.length > 100);
  assert.deepEqual(easIgnored(keep), []);
});

test("DEV-483: relative imports in apps and packages never point at a path .easignore drops", () => {
  const known = imports.find((i) => i.target === "server/app/source_analysis/text_safety_lists.json");
  assert.ok(known, "packages/api/src/sourceTextSafety.ts의 server import를 찾지 못했다(검사 정규식 확인)");
  const outside = imports.filter((i) => !/^(apps|packages)\//.test(i.target));
  assert.ok(outside.every((i) => isFile(i.target)), "앱 밖 import 대상이 없는 파일이다");
  const dropped = new Set(easIgnored([...new Set(imports.map((i) => i.target))]));
  const bad = imports.filter((i) => dropped.has(i.target)).map((i) => `${i.file} → ${i.spec}`);
  assert.deepEqual(bad, [], `.easignore가 빼는 경로를 import한다. .easignore를 좁히거나 파일을 옮긴다`);
});

test("DEV-483: the import check catches an import into a dropped folder", () => {
  const fake = { "packages/api/src/x.ts": 'import a from "../../../docs/spec/a.json";\nconst b = require("../../../server/tests/b");\nimport "./ok";' };
  const found = relativeImports(Object.keys(fake), (f) => fake[f]);
  assert.deepEqual(found.map((i) => i.target), ["docs/spec/a.json", "server/tests/b", "packages/api/src/ok"]);
  assert.deepEqual(easIgnored(found.map((i) => i.target)), ["docs/spec/a.json", "server/tests/b"]);
});

/** .gitignore 줄 하나로 그 규칙에 걸리는 예시 경로를 만든다(* → x, 앞뒤 / 정리, 폴더 규칙은 안의 파일) */
function samplePath(dir, line) {
  const dirOnly = line.endsWith("/");
  let p = line.replace(/\*\*/g, "x").replace(/\*/g, "x").replace(/\/$/, "");
  if (p.startsWith("/")) p = p.slice(1);
  p = dir ? `${dir}/${p}` : p;
  return dirOnly || !p.includes(".") ? `${p}/f` : p;
}

test("DEV-483: every .gitignore rule in the repo still applies with .easignore (eas-cli reads only .easignore)", () => {
  const ignoreFiles = tracked(".gitignore", "**/.gitignore");
  assert.ok(ignoreFiles.includes(".gitignore"));
  const samples = [];
  for (const file of ignoreFiles) {
    const dir = path.posix.dirname(file) === "." ? "" : path.posix.dirname(file);
    for (const raw of readFileSync(path.join(ROOT, file), "utf8").split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      const sample = samplePath(dir, line);
      // 예시가 원래 .gitignore에 걸리는지 먼저 본다(예시 만들기가 틀리면 아래 비교가 무의미)
      assert.deepEqual(ignoredBy(path.join(ROOT, file), [dir ? sample.slice(dir.length + 1) : sample]).length, 1, `${file}: ${line} → ${sample}`);
      samples.push({ file, line, sample });
    }
  }
  const dropped = new Set(easIgnored(samples.map((s) => s.sample)));
  const missed = samples.filter((s) => !dropped.has(s.sample)).map((s) => `${s.file}: ${s.line} (${s.sample})`);
  assert.deepEqual(missed, [], ".gitignore 규칙을 .easignore 1·2절에도 넣는다");
  // 예외 규칙(!.env.example)도 같아야 한다
  assert.deepEqual(easIgnored([".env.example", "apps/consumer/.env.example"]), []);
});
