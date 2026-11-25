// DEV-483: `make eas-env`는 EAS 환경 변수 이름만 보이고 값은 어떤 경우에도 내지 않는다. `make apk`는 커밋 안 된 변경이 있으면 멈춘다.
// eas는 부르지 않는다. 가짜 `eas env:list` 스크립트(FARMCLUB_EAS_BIN)가 NAME=값 줄을 내고, 값은 가짜(SECRET-…)만 쓴다.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { businessCheck, parseEnvNames, pickApps, redact, uncommitted } from "./eas.mjs";

const require = createRequire(import.meta.url);
const SCRIPT = fileURLToPath(new URL("./eas.mjs", import.meta.url));
const { REQUIRED } = require("../apps/consumer/app.config.js");
const WARN_ONLY = businessCheck("consumer", [], "preview").warnOnly;

const value = (name) => `SECRET-${name.toLowerCase()}-값`;

/** 가짜 eas: FAKE_EAS_NAMES의 이름마다 NAME=값을 short 형식으로 낸다. FAKE_EAS_FAIL이면 값이 섞인 오류로 끝난다 */
function fakeEas(dir) {
  const file = path.join(dir, "fake-eas.mjs");
  writeFileSync(
    file,
    `const names = (process.env.FAKE_EAS_NAMES || "").split(",").filter(Boolean);
const env = process.argv[process.argv.indexOf("--environment") + 1];
if (process.env.FAKE_EAS_FAIL) {
  console.log(names.map((n) => n + "=SECRET-" + n.toLowerCase() + "-값").join("\\n"));
  console.error("Error: request failed EXPO_PUBLIC_BUSINESS_NAME=SECRET-in-error");
  process.exit(1);
}
console.log("Environment: " + env);
for (const n of names) console.log("\\u001b[1m" + n + "\\u001b[22m=SECRET-" + n.toLowerCase() + "-값");
`,
  );
  return file;
}

function runEnv(names, extra = {}, args = []) {
  const dir = mkdtempSync(path.join(tmpdir(), "eas-env-"));
  try {
    const r = spawnSync(process.execPath, [SCRIPT, "env", ...args], {
      encoding: "utf8",
      env: { ...process.env, FARMCLUB_EAS_BIN: fakeEas(dir), FAKE_EAS_NAMES: names.join(","), ...extra },
    });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const assertNoValues = (out, names) => {
  assert.doesNotMatch(out, /SECRET-/);
  for (const n of names) assert.ok(!out.includes(value(n)), n);
};

test("DEV-483: parseEnvNames keeps names from `NAME=value` lines and drops values, colors and other lines", () => {
  const text = "Environment: preview\n\u001b[1mEXPO_PUBLIC_API_URL\u001b[22m=https://x\nB=a=b\nnot a var\n=nope\nA_1=\n";
  assert.deepEqual(parseEnvNames(text), ["A_1", "B", "EXPO_PUBLIC_API_URL"]);
});

test("DEV-483: redact hides everything after = in eas error output", () => {
  assert.equal(redact("X=secret value\nplain line"), "X=<가림>\nplain line");
});

test("DEV-483: the required and warn-only lists come from app.config.js, not a copy", () => {
  for (const app of ["consumer", "producer"]) {
    const check = businessCheck(app, [], "preview");
    assert.deepEqual(check.required, REQUIRED, app);
    assert.ok(check.warnOnly.length > 0, app);
    assert.deepEqual(businessCheck(app, [...REQUIRED, ...WARN_ONLY], "preview").missing, []);
  }
});

test("DEV-483: make eas-env prints names for both apps and never a value", () => {
  const names = [...REQUIRED, ...WARN_ONLY, "EXPO_PUBLIC_API_URL"];
  const r = runEnv(names);
  assert.equal(r.status, 0, r.out);
  assertNoValues(r.out, names);
  for (const app of ["consumer", "producer"]) assert.match(r.out, new RegExp(`${app} \\(EAS preview`));
  for (const n of names) assert.match(r.out, new RegExp(`^ {4}${n}$`, "m"));
  assert.match(r.out, /빠짐: 없음/);
});

test("DEV-483: missing required names are listed by name and the command fails", () => {
  const present = REQUIRED.slice(1);
  const r = runEnv(present, {}, ["consumer", "--environment", "production"]);
  assert.equal(r.status, 1, r.out);
  assertNoValues(r.out, present);
  assert.match(r.out, /consumer \(EAS production/);
  assert.doesNotMatch(r.out, /producer/);
  assert.match(r.out, new RegExp(`빠짐: ${REQUIRED[0]}\\b`));
  for (const n of WARN_ONLY) assert.match(r.out, new RegExp(`경고만.*${n}`));
});

test("DEV-483: when eas fails, its output is not passed through with values", () => {
  const r = runEnv(REQUIRED, { FAKE_EAS_FAIL: "1" });
  assert.equal(r.status, 1, r.out);
  assertNoValues(r.out, REQUIRED);
  assert.match(r.out, /eas env:list 실패/);
  assert.match(r.out, /EXPO_PUBLIC_BUSINESS_NAME=<가림>/);
});

test("DEV-483: APP must be consumer or producer", () => {
  assert.deepEqual(pickApps(""), ["consumer", "producer"]);
  assert.deepEqual(pickApps("producer"), ["producer"]);
  assert.throws(() => pickApps("admin"), /consumer 또는 producer/);
  const r = spawnSync(process.execPath, [SCRIPT, "apk", "admin", "--dry-run"], { encoding: "utf8" });
  assert.equal(r.status, 2);
});

test("DEV-483: make apk sees uncommitted and untracked files, but not gitignored ones", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "eas-apk-"));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  try {
    git("init", "-q");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n");
    writeFileSync(path.join(dir, "a.txt"), "1\n");
    git("add", ".");
    git("commit", "-qm", "init");
    assert.deepEqual(uncommitted(dir), []);
    writeFileSync(path.join(dir, "a.txt"), "2\n");
    writeFileSync(path.join(dir, "new.txt"), "x\n");
    spawnSync("mkdir", ["-p", path.join(dir, "node_modules")]);
    writeFileSync(path.join(dir, "node_modules", "x.js"), "x\n");
    assert.deepEqual(uncommitted(dir).sort(), [" M a.txt", "?? new.txt"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
