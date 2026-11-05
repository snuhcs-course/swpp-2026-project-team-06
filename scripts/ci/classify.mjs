#!/usr/bin/env node
// DEV-234: 바뀐 파일 목록과 길(lane)로 CI가 무엇을 돌릴지 정한다. 의존성 없음(node만).
// 규칙 원본은 scripts/ci/integration-map.json, 설명은 .github/README.md.
//
//   node scripts/ci/classify.mjs --lane pr --files changed.txt [--github-output] [--max-shards 3]
//   node scripts/ci/classify.mjs --lane full --github-output        # nightly·hotfix 사후: integration 전체
//   node scripts/ci/classify.mjs --check                            # 매핑·격리 목록 점검(CI changes job이 매번 돌림)
//
// 길(lane):
//   pr        PR. job은 바뀐 경로대로, integration은 영향받는 spec만.
//   queue     머지 큐(merge_group). job은 바뀐 경로대로, integration은 관련 변경이 있으면 전체.
//   push      main push인데 큐에서 검증된 기록이 없음(큐를 켜기 전·관리자 직접 머지). queue와 같다.
//   hotfix    hotfix 라벨 PR(PR·큐·main push). job은 바뀐 경로대로, integration 없음(ci-full.yml이 머지 뒤 전체).
//   validated main push인데 같은 커밋이 머지 큐에서 이미 전체 통과. 아무 job도 안 돎.
//   full      전체. 모든 job과 integration 전체(nightly, 수동 실행).
import { appendFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const LANES = ["pr", "queue", "push", "hotfix", "validated", "full"];
const JOBS = ["server", "apps", "admin", "deploy_scripts"];
const DEFAULT_SECONDS = 20;
// 샤드 하나가 맡을 Playwright 시간(초). 샤드마다 설치·서버 띄우기에 1분 남짓 들어서 너무 잘게 나누지 않는다.
const SECONDS_PER_SHARD = 200;

const globCache = new Map();
export function globToRegExp(glob) {
  if (globCache.has(glob)) return globCache.get(glob);
  let re = "";
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      if (glob[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 2;
      } else {
        re += ".*";
        i += 1;
      }
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  const compiled = new RegExp(`^${re}$`);
  globCache.set(glob, compiled);
  return compiled;
}

// 글롭 목록에 맞는지. "!"로 시작하는 항목은 빼는 규칙(하나라도 맞으면 false).
export function matches(file, globs = []) {
  let hit = false;
  for (const g of globs) {
    if (g.startsWith("!")) {
      if (globToRegExp(g.slice(1)).test(file)) return false;
    } else if (!hit && globToRegExp(g).test(file)) hit = true;
  }
  return hit;
}

export function loadConfig(dir = root) {
  const read = (p) => JSON.parse(readFileSync(path.join(dir, p), "utf8"));
  const specFiles = readdirSync(path.join(dir, "scripts/e2e"))
    .filter((f) => f.endsWith(".spec.ts"))
    .sort()
    .map((f) => `scripts/e2e/${f}`);
  const sources = Object.fromEntries(specFiles.map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));
  const timing = read("scripts/ci/spec-durations.json");
  return {
    map: read("scripts/ci/integration-map.json"),
    durations: timing.seconds ?? {},
    split: timing.split ?? {},
    quarantine: read("scripts/ci/quarantine.json"),
    specFiles,
    sources,
  };
}

// 규칙 하나가 고르는 spec 파일들
function ruleSpecs(rule, file, config) {
  if (rule.self) return config.specFiles.includes(file) ? [file] : [];
  const out = new Set();
  for (const f of config.specFiles) {
    if (rule.specs && matches(f, rule.specs)) out.add(f);
    if (rule.specsMatching && new RegExp(rule.specsMatching).test(config.sources[f] ?? "")) out.add(f);
  }
  return [...out];
}

// 파일 하나 → integration에서 돌릴 spec. "all" 또는 배열.
export function specsForFile(file, config) {
  const integration = config.map.integration;
  for (const rule of integration.map) {
    if (matches(file, rule.paths)) return ruleSpecs(rule, file, config);
  }
  if (matches(file, integration.all)) return "all";
  if (matches(file, integration.none)) return [];
  return "all"; // 모르는 경로는 안전하게 전체
}

// spec → 샤드에 넣을 단위. split에 적힌 긴 파일은 `file@k/n` 단위 n개로 나눈다. 실제 test 목록은 샤드 안에서
// scripts/run-integration.mjs가 `playwright test --list`로 읽어 k번째 몫을 `file:줄` 인자로 바꾼다(Playwright가 직접
// 읽으므로 소스 정규식이 test를 놓치는 일이 없다). 나머지는 파일 하나가 단위.
export function units(specs, config) {
  const seconds = (f) => config.durations[f] ?? DEFAULT_SECONDS;
  const out = [];
  for (const f of specs) {
    const parts = config.split?.[f] ?? 1;
    if (parts < 2) {
      out.push({ name: f, args: [f], seconds: seconds(f) });
      continue;
    }
    for (let p = 1; p <= parts; p += 1) {
      out.push({ name: `${f}@${p}/${parts}`, args: [`${f}@${p}/${parts}`], seconds: Math.round(seconds(f) / parts) });
    }
  }
  return out;
}

// 긴 것부터 가장 가벼운 샤드에 넣는다(LPT). 샤드 안은 이름 순.
export function shard(items, maxShards) {
  const total = items.reduce((sum, u) => sum + u.seconds, 0);
  const count = Math.max(1, Math.min(maxShards, items.length, Math.ceil(total / SECONDS_PER_SHARD)));
  const shards = Array.from({ length: count }, () => ({ seconds: 0, units: [] }));
  for (const u of [...items].sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name))) {
    const target = shards.reduce((min, s) => (s.seconds < min.seconds ? s : min), shards[0]);
    target.units.push(u);
    target.seconds += u.seconds;
  }
  return shards.map((s, i) => {
    const sorted = s.units.sort((a, b) => a.name.localeCompare(b.name));
    return {
      shard: i + 1,
      of: count,
      seconds: s.seconds,
      api: i === 0, // API 시나리오(test-integration.mjs, 6초)는 첫 샤드만
      names: sorted.map((u) => u.name).join(" "),
      specs: sorted.flatMap((u) => u.args).join(" "),
    };
  });
}

export function classify({ files, lane, config, maxShards = 3 }) {
  if (!LANES.includes(lane)) throw new Error(`unknown lane: ${lane} (${LANES.join(", ")})`);
  const { map } = config;
  const quarantined = new Set((config.quarantine.specs ?? []).map((q) => q.file));
  const result = {
    lane,
    docs_only: false,
    core: false,
    unknown: [],
    jobs: Object.fromEntries(JOBS.map((j) => [j, false])),
    specs: [],
    integration_reason: "",
  };
  const finish = (specs, reason) => {
    result.specs = specs.filter((f) => !quarantined.has(f)).sort();
    result.quarantined = specs.filter((f) => quarantined.has(f)).sort();
    result.integration_reason = reason;
    result.matrix = result.specs.length ? shard(units(result.specs, config), maxShards) : [];
    result.integration = result.matrix.length > 0;
    return result;
  };

  if (lane === "validated") return finish([], "main push already validated by the merge queue");
  if (lane === "full") {
    for (const j of JOBS) result.jobs[j] = true;
    return finish(config.specFiles, "full run");
  }

  const relevant = files.filter((f) => f && !matches(f, map.docs));
  result.docs_only = relevant.length === 0;
  result.core = relevant.some((f) => matches(f, map.core));
  result.unknown = relevant.filter(
    (f) => !matches(f, map.core) && !JOBS.some((j) => matches(f, map.jobs[j])),
  );
  const everything = result.core || result.unknown.length > 0;
  for (const j of JOBS) result.jobs[j] = everything || relevant.some((f) => matches(f, map.jobs[j]));

  if (result.docs_only) return finish([], "docs-only change");
  if (lane === "hotfix") return finish([], "hotfix lane: integration runs after merge (ci-full.yml)");
  if (everything) {
    return finish(config.specFiles, result.core ? "CI files changed" : `unknown paths: ${result.unknown.join(", ")}`);
  }
  const picked = new Set();
  for (const f of relevant) {
    const specs = specsForFile(f, config);
    if (specs === "all") return finish(config.specFiles, `${f} affects every spec`);
    for (const s of specs) picked.add(s);
  }
  if (picked.size && (lane === "queue" || lane === "push")) {
    return finish(config.specFiles, `${lane} lane runs every spec`);
  }
  return finish([...picked], picked.size ? "affected specs" : "no integration-relevant change");
}

// 매핑이 모든 spec을 덮는지, 격리 목록이 바른지
export function check(config) {
  const errors = [];
  const { map } = config;
  for (const f of config.specFiles) {
    const covered = map.integration.map.some((rule) => !rule.self && ruleSpecs(rule, null, config).includes(f));
    if (!covered) errors.push(`${f}: no integration.map rule (other than self) selects it; add it to a group`);
  }
  for (const key of ["specs", "tests"]) {
    for (const q of config.quarantine[key] ?? []) {
      if (!/^(DEV|SWPP)-\d+$/.test(q.issue ?? "")) errors.push(`quarantine.${key}: ${JSON.stringify(q)} needs issue DEV-xx`);
      if (key === "specs" && !config.specFiles.includes(q.file)) errors.push(`quarantine.specs: ${q.file} does not exist`);
      if (key === "tests" && !q.title) errors.push(`quarantine.tests: ${JSON.stringify(q)} needs title`);
    }
  }
  for (const [f, parts] of Object.entries(config.split ?? {})) {
    if (!config.specFiles.includes(f)) errors.push(`spec-durations split: ${f} does not exist`);
    else if (!Number.isInteger(parts) || parts < 2) errors.push(`spec-durations split: ${f} must be an integer >= 2`);
  }
  for (const rule of map.integration.map) {
    if (!rule.self && !rule.specs && !rule.specsMatching) errors.push(`integration.map rule ${JSON.stringify(rule.paths)} selects nothing`);
  }
  return errors;
}

function summary(r) {
  const yes = (b) => (b ? "실행" : "건너뜀");
  const lines = [
    `### CI 분류 (lane: \`${r.lane}\`)`,
    "",
    `- 문서 전용: ${r.docs_only ? "예" : "아니오"}${r.core ? " · CI 파일 변경(전부 실행)" : ""}`,
    ...(r.unknown?.length ? [`- 모르는 경로(전부 실행): ${r.unknown.map((f) => `\`${f}\``).join(", ")}`] : []),
    `- server: ${yes(r.jobs.server)} · apps: ${yes(r.jobs.apps)} · admin-web: ${yes(r.jobs.admin || r.jobs.deploy_scripts)}`,
    `- integration: ${r.integration ? `${r.specs.length}개 spec, 샤드 ${r.matrix.length}개` : "건너뜀"} — ${r.integration_reason}`,
  ];
  for (const m of r.matrix) lines.push(`  - 샤드 ${m.shard}/${m.of} (~${m.seconds}초${m.api ? ", API 시나리오 포함" : ""}): ${m.names.split(" ").map((f) => path.basename(f).replace(".spec.ts", "")).join(", ")}`);
  if (r.quarantined?.length) lines.push(`- 격리(건너뜀): ${r.quarantined.join(", ")}`);
  return lines.join("\n") + "\n";
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const config = loadConfig();
  if (argv.includes("--check")) {
    const errors = check(config);
    for (const e of errors) console.error(`::error::${e}`);
    if (errors.length) process.exit(1);
    console.log(`integration map OK: ${config.specFiles.length} specs covered`);
    return;
  }
  const lane = arg("--lane", "pr");
  const filesArg = arg("--files");
  const files = filesArg
    ? readFileSync(filesArg === "-" ? 0 : filesArg, "utf8").split("\n").map((s) => s.trim()).filter(Boolean)
    : [];
  const result = classify({ files, lane, config, maxShards: Number(arg("--max-shards", "3")) });
  if (argv.includes("--github-output")) {
    const out = process.env.GITHUB_OUTPUT;
    const lines = [
      `lane=${lane}`,
      `docs_only=${result.docs_only}`,
      ...JOBS.map((j) => `${j}=${result.jobs[j]}`),
      `integration=${result.integration}`,
      `matrix=${JSON.stringify(result.matrix)}`,
    ];
    if (out) appendFileSync(out, lines.join("\n") + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary(result));
  }
  process.stdout.write(summary(result));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && existsSync(root)) {
  main(process.argv.slice(2));
}
