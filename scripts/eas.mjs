#!/usr/bin/env node
// EAS 네이티브 빌드 입구(DEV-483). Makefile의 `make apk`·`make eas-env`가 부른다(make/eas.mk).
//
//   node scripts/eas.mjs apk [consumer|producer] [--dry-run]   # internal 프로필 Android APK. 앱을 안 주면 둘 다 차례로
//   node scripts/eas.mjs env [consumer|producer] [--environment preview]   # EAS 환경 변수 이름만, 빠진 사업자 정보 표시
//
// 저장소 루트는 이 파일 위치로 찾으므로 어느 폴더에서 불러도 된다. eas는 앱 폴더(apps/<앱>)에서 돈다.
//
// apk
// - 작업 트리가 깨끗해야(git status --porcelain이 비어야) 시작한다. eas-cli는 git 방식이어도 requireCommit이 없으면
//   작업 트리를 그대로 복사해 올리므로(커밋 안 된 변경·새 파일 포함), 이 검사가 없으면 커밋 안 된 코드가 빌드에 섞인다.
// - 업로드 방식은 git(EAS_NO_VCS 없이)이다. 루트 .easignore가 .git·docs 등을 빼서 EAS_NO_VCS=1과 같은 파일이 올라가고,
//   빌드 페이지에 커밋이 남는다. 셸에 EAS_NO_VCS가 있어도 지운다.
// - 빌드가 시작되면 versionCode가 1 오른다(internal은 preview의 autoIncrement를 이어받음, 실패해도 안 돌아감).
//
// env
// - `eas env:list --format short` 출력(NAME=값)에서 이름만 꺼낸다. 값은 어떤 경우에도 화면에 내지 않는다.
//   eas가 실패하면 그 출력도 = 뒤를 가린 뒤에만 보인다.
// - 필수·경고 목록은 apps/<앱>/app.config.js의 checkStoreBusinessInfo로 고른다(목록을 여기 다시 쓰지 않음).
// - 필수 변수가 빠진 앱이 있으면 1로 끝난다. 값이 비었는지(공백뿐인지)는 이름만으로 알 수 없어 보지 않는다.
//
// FARMCLUB_EAS_BIN에 node 스크립트 경로를 주면 npx eas-cli@latest 대신 그것을 부른다(scripts/test-eas.mjs).
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const APPS = ["consumer", "producer"];
const require = createRequire(import.meta.url);

/** eas 실행 명령. 테스트는 FARMCLUB_EAS_BIN으로 가짜를 넣는다 */
function easCommand(args, env = process.env) {
  if (env.FARMCLUB_EAS_BIN) return [process.execPath, [env.FARMCLUB_EAS_BIN, ...args]];
  return ["npx", ["-y", "eas-cli@latest", ...args]];
}

/** 앱 인자를 목록으로. 없으면 두 앱 */
export function pickApps(app) {
  if (!app) return APPS;
  if (!APPS.includes(app)) throw new Error(`APP은 ${APPS.join(" 또는 ")}이어야 합니다: ${app}`);
  return [app];
}

/** `eas env:list --format short` 출력에서 변수 이름만. 값은 버린다 */
export function parseEnvNames(text) {
  const names = new Set();
  for (const raw of String(text).split(/\r?\n/)) {
    // eslint-disable-next-line no-control-regex
    const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** eas 오류 출력에 값이 섞여 있을 수 있어 = 뒤를 가린다 */
export function redact(text) {
  return String(text).replace(/=.*/g, "=<가림>");
}

/** 앱의 app.config.js 검사 함수로 필수·경고 변수 중 빠진 것을 고른다 */
export function businessCheck(app, names, environment) {
  const config = require(path.join(ROOT, "apps", app, "app.config.js"));
  const env = { EAS_BUILD: "true", EAS_BUILD_PROFILE: environment };
  for (const name of names) env[name] = "set";
  const all = config.checkStoreBusinessInfo({ EAS_BUILD: "true", EAS_BUILD_PROFILE: environment });
  const now = config.checkStoreBusinessInfo(env);
  return { required: all.missing, warnOnly: all.warnings, missing: now.missing, warnings: now.warnings };
}

function runEnv(apps, environment, env = process.env) {
  let failed = false;
  for (const app of apps) {
    const [cmd, args] = easCommand(["env:list", "--environment", environment, "--format", "short"], env);
    const r = spawnSync(cmd, args, {
      cwd: path.join(ROOT, "apps", app),
      encoding: "utf8",
      env: { ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    console.log(`\n${app} (EAS ${environment} 환경)`);
    if (r.status !== 0) {
      console.log(`  eas env:list 실패(종료 코드 ${r.status ?? r.signal}). 로그인 확인: npx eas-cli@latest whoami`);
      const detail = redact(`${r.stderr ?? ""}${r.error ? r.error.message : ""}`).trim();
      if (detail) console.log(detail.replace(/^/gm, "  | "));
      failed = true;
      continue;
    }
    const names = parseEnvNames(r.stdout);
    const check = businessCheck(app, names, environment);
    console.log(`  변수 ${names.length}개(이름만):`);
    for (const name of names) console.log(`    ${name}`);
    console.log(
      `  필수(app.config.js) ${check.required.length}개 중 빠짐: ${check.missing.length ? check.missing.join(", ") : "없음"}`,
    );
    console.log(`  경고만(아직 발급 전) 빠짐: ${check.warnings.length ? check.warnings.join(", ") : "없음"}`);
    if (check.missing.length) failed = true;
  }
  if (failed) console.log("\n빠진 필수 변수가 있거나 목록을 못 읽었습니다. 이 상태로 스토어용 빌드를 시작하면 app.config.js가 멈춥니다.");
  return failed ? 1 : 0;
}

/** 커밋 안 된 변경(새 파일 포함). .gitignore에 걸린 파일은 .easignore에도 있어 올라가지 않는다 */
export function uncommitted(cwd = ROOT) {
  const r = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git status 실패: ${r.stderr.trim()}`);
  return r.stdout.split("\n").filter(Boolean);
}

function runApk(apps, { dryRun = false, extraArgs = [] } = {}, env = process.env) {
  if (!existsSync(path.join(ROOT, ".easignore"))) {
    console.error("멈춤: 루트 .easignore가 없습니다. 없으면 .git·docs까지 올라가 묶음이 300MB 가까이 됩니다.");
    return 1;
  }
  const dirty = uncommitted();
  if (dirty.length) {
    console.error("멈춤: 커밋 안 된 변경이 있습니다. eas는 작업 트리를 그대로 올리므로 커밋하거나 되돌린 뒤 다시 실행하세요.");
    for (const line of dirty.slice(0, 20)) console.error(`  ${line}`);
    if (dirty.length > 20) console.error(`  … 외 ${dirty.length - 20}개`);
    return 1;
  }
  const head = spawnSync("git", ["log", "-1", "--format=%h %s"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const childEnv = { ...env };
  delete childEnv.EAS_NO_VCS;
  console.log(`커밋 ${head}`);
  console.log("빌드를 시작할 때마다 versionCode가 1 오릅니다(실패해도 돌아가지 않음).");
  for (const app of apps) {
    const [cmd, args] = easCommand(["build", "-p", "android", "--profile", "internal", ...extraArgs], env);
    console.log(`\n${app}: (cd apps/${app} && ${[cmd === process.execPath ? "node" : cmd, ...args].join(" ")})`);
    if (dryRun) continue;
    const r = spawnSync(cmd, args, { cwd: path.join(ROOT, "apps", app), stdio: "inherit", env: childEnv });
    if (r.status !== 0) {
      console.error(`멈춤: ${app} 빌드가 실패했습니다(종료 코드 ${r.status ?? r.signal}).`);
      return r.status || 1;
    }
  }
  if (dryRun) console.log("\nDRY_RUN: 위 명령을 실행하지 않았습니다.");
  return 0;
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const [command, ...rest] = argv;
  let app = "";
  let environment = "preview";
  let dryRun = false;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--dry-run") dryRun = true;
    else if (rest[i] === "--environment") environment = rest[++i] || environment;
    else app = rest[i];
  }
  let apps;
  try {
    apps = pickApps(app);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  if (command === "apk") {
    const extraArgs = (env.EAS_ARGS || "").split(/\s+/).filter(Boolean);
    return runApk(apps, { dryRun, extraArgs }, env);
  }
  if (command === "env") return runEnv(apps, environment, env);
  console.error("사용: node scripts/eas.mjs apk|env [consumer|producer] [--dry-run] [--environment <환경>]");
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
