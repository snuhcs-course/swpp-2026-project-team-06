// npm run demo:record -- --target local|prod [구간…] (DEV-134): demo/record/story.mjs를 구간마다 차례로 돌리는 얇은 입구.
// 구간을 안 주면 시나리오 순서(demo/scenario.mjs order) 전체. 하나라도 실패하면 거기서 멈춘다. 결과는 demo/.raw/story/<구간>.(webm|mp4).
//
// local(기본): `npm run demo`가 띄운 로컬 스택(시드 초기화·테스트 계정·FIXED_NOW 2026-10-07)을 쓴다.
//   주소는 DEMO_API_PORT·DEMO_CONSUMER_PORT·DEMO_PRODUCER_PORT·DEMO_ADMIN_PORT(npm run demo와 같은 변수)로 정하고,
//   FARMCLUB_*_URL을 주면 그 값이 먼저다. 관리자 구간(a*)은 ADMIN_WEB_PASSWORD가 있어야 한다(npm run demo에 준 값).
//   p1부터 다시 찍을 때는 npm run demo를 다시 띄워 시드를 초기화한다(p1이 새 농가를 만든다).
// prod: 운영 주소(farmclub.kr 등) + DEMO_KAKAO=1. DEMO_PROFILE(prep-login.mjs로 카카오·관리자 로그인을 해 둔 프로필)이 있어야 한다.
//   운영 DB에 데모 데이터가 생기므로 --yes를 같이 줘야 돈다. 끝나면 README의 데모 농가 정리(retire_test_farm)를 한다.
// --dry-run: 실행할 명령과 주소만 보여 준다(비밀값은 가림). DEMO_HQ=1·DEMO_PACE는 그대로 story.mjs에 넘어간다.
import { spawnSync } from "node:child_process";
import path from "node:path";

import { scenario as defaultScenario, roleOf } from "../scenario.mjs";
import { isMain, parseArgs, repoRoot, runMain } from "./lib.mjs";

const PROD = {
  FARMCLUB_CONSUMER_URL: "https://farmclub.kr",
  FARMCLUB_PRODUCER_URL: "https://farm.farmclub.kr",
  FARMCLUB_API_URL: "https://api.farmclub.kr",
  FARMCLUB_ADMIN_URL: "https://admin.farmclub.kr",
};
const URL_KEYS = Object.keys(PROD);

/** 인자·환경 → 실행 계획 { target, segments, env(story.mjs에 더할 값), problems } */
export function planRecord(argv, env = process.env, scenario = defaultScenario) {
  const { opts, rest } = parseArgs(argv, { flags: ["dry-run", "yes"] });
  const target = opts.target ?? "local";
  const problems = [];
  if (!["local", "prod"].includes(target)) problems.push(`--target은 local 또는 prod (받은 값: ${target})`);
  const segments = rest.length ? rest : [...scenario.order];
  for (const seg of segments) {
    try {
      roleOf(seg);
    } catch {
      problems.push(`모르는 구간: ${seg}`);
    }
  }
  const unknown = segments.filter((s) => /^[pac]\d+$/.test(s) && !scenario.order.includes(s));
  // story.mjs에는 있지만 시나리오 순서에 없는 구간(예: I3에서 쓰는 p5·c4)도 찍을 수는 있다. stitch는 시나리오 순서만 잇는다
  const notes = unknown.length ? [`시나리오 순서에 없는 구간: ${unknown.join(", ")} (stitch는 order만 이어요)`] : [];
  const add = {};
  if (target === "local") {
    const port = (k, d) => env[k] ?? String(d);
    const defaults = {
      FARMCLUB_CONSUMER_URL: `http://localhost:${port("DEMO_CONSUMER_PORT", 8081)}`,
      FARMCLUB_PRODUCER_URL: `http://localhost:${port("DEMO_PRODUCER_PORT", 8082)}`,
      FARMCLUB_API_URL: `http://localhost:${port("DEMO_API_PORT", 8000)}`,
      FARMCLUB_ADMIN_URL: `http://127.0.0.1:${port("DEMO_ADMIN_PORT", 8090)}`,
    };
    for (const k of URL_KEYS) add[k] = env[k] ?? defaults[k];
    add.DEMO_KAKAO = "0";
    for (const k of URL_KEYS) {
      const host = new URL(add[k]).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) problems.push(`--target local인데 ${k}가 로컬 주소가 아니에요: ${add[k]}`);
    }
    if (segments.some((s) => s.startsWith("a")) && !env.ADMIN_WEB_PASSWORD) {
      problems.push("관리자 구간(a*)은 ADMIN_WEB_PASSWORD가 필요해요(npm run demo에 준 값). 없으면 story.mjs가 사람 입력을 5분 기다린다");
    }
  } else {
    for (const k of URL_KEYS) add[k] = env[k] ?? PROD[k];
    add.DEMO_KAKAO = "1";
    if (!env.DEMO_PROFILE) problems.push("--target prod는 DEMO_PROFILE이 필요해요(node demo/record/prep-login.mjs로 로그인해 둔 프로필)");
    if (!opts.yes && !opts["dry-run"]) problems.push("--target prod는 운영 DB에 데모 데이터를 만들어요. 확인했으면 --yes를 같이 주세요");
  }
  return { target, segments, env: add, problems, notes, dryRun: Boolean(opts["dry-run"]) };
}

async function apiUp(apiUrl) {
  try {
    return (await fetch(`${apiUrl}/health`)).ok;
  } catch {
    return false;
  }
}

if (isMain(import.meta.url)) {
  await runMain(async () => {
    const plan = planRecord(process.argv.slice(2));
    for (const n of plan.notes) console.warn(`note: ${n}`);
    if (plan.problems.length) throw new Error(plan.problems.join("\n  "));
    const shown = { ...plan.env, ...(process.env.DEMO_PROFILE ? { DEMO_PROFILE: process.env.DEMO_PROFILE } : {}), ...(process.env.ADMIN_WEB_PASSWORD ? { ADMIN_WEB_PASSWORD: "***" } : {}) };
    console.log(`target ${plan.target}: ${plan.segments.join(" ")}`);
    for (const [k, v] of Object.entries(shown)) console.log(`  ${k}=${v}`);
    if (plan.dryRun) {
      for (const seg of plan.segments) console.log(`  node demo/record/story.mjs ${seg}`);
      return;
    }
    if (plan.target === "local" && !(await apiUp(plan.env.FARMCLUB_API_URL))) {
      throw new Error(`${plan.env.FARMCLUB_API_URL}/health에 닿지 않아요. 다른 터미널에서 로컬 스택을 먼저 띄우세요: DEMO_DB=farmclub_demo ADMIN_WEB_PASSWORD=<값> npm run demo`);
    }
    for (const seg of plan.segments) {
      console.log(`\n== ${seg}`);
      const r = spawnSync(process.execPath, [path.join("demo", "record", "story.mjs"), seg], { cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...plan.env } });
      if (r.status !== 0) throw new Error(`${seg} 녹화 실패(demo/.raw/story/${seg}-fail.png). 고친 뒤 이 구간부터 다시: npm run demo:record -- --target ${plan.target} ${plan.segments.slice(plan.segments.indexOf(seg)).join(" ")}`);
    }
    console.log("\nDone. Next: npm run demo:stitch");
  });
}
