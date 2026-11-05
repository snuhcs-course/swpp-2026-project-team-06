import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const serverDir = path.join(root, "server");
const artifacts = path.join(root, ".artifacts", "integration");
const logs = path.join(artifacts, "logs");
rmSync(artifacts, { recursive: true, force: true });
mkdirSync(logs, { recursive: true });

const apiUrl = process.env.FARMCLUB_API_URL ?? "http://localhost:8000";
const consumerUrl = process.env.FARMCLUB_CONSUMER_URL ?? "http://localhost:8081";
const producerUrl = process.env.FARMCLUB_PRODUCER_URL ?? "http://localhost:8082";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub";
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
for (const url of [apiUrl, consumerUrl, producerUrl]) {
  const parsed = new URL(url);
  if (!allowedHosts.has(parsed.hostname)) {
    throw new Error(`Full integration tests only run against localhost: ${url}`);
  }
}

const children = new Set();
let stopping = false;

function available(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function command(bin, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd: options.cwd ?? root,
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    if (options.capture) {
      child.stdout.on("data", (chunk) => (stdout += chunk));
      child.stderr.on("data", (chunk) => (stderr += chunk));
    }
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${bin} ${args.join(" ")} failed (${code})\n${stderr || stdout}`));
    });
  });
}

function service(name, bin, args, options = {}) {
  const log = createWriteStream(path.join(logs, `${name}.log`), { flags: "w" });
  const child = spawn(bin, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  children.add(child);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.once("exit", (code) => {
    children.delete(child);
    log.end();
    if (!stopping && code !== 0) {
      process.stderr.write(`${name} stopped unexpectedly (${code}); see ${logs}\n`);
    }
  });
  return child;
}

async function waitFor(url, name) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not become ready at ${url}; see ${logs}`);
}

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode != null) continue;
    if (process.platform === "win32") child.kill();
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill();
      }
    }
  }
}

process.on("SIGINT", () => {
  stop();
  process.exitCode = 130;
});
process.on("SIGTERM", () => {
  stop();
  process.exitCode = 143;
});

async function resetSeed(env) {
  await command("uv", ["run", "alembic", "upgrade", "head"], { cwd: serverDir, env });
  await command("uv", ["run", "python", "-m", "app.core.seed", "--reset"], {
    cwd: serverDir,
    env,
  });
}

// DEV-234: `file@k/n`(classify.mjs의 긴 spec 나누기) → 그 파일 test 줄 번호 목록의 k번째 몫을 `file:줄` 인자로.
// 줄 목록은 Playwright가 직접 읽는다(--list --reporter=json). 같은 줄의 test(반복문으로 만든 것)는 같은 몫에 든다.
const playwrightBin = path.join(root, "node_modules", ".bin", "playwright");
async function expandSplits(args) {
  const out = [];
  for (const arg of args) {
    const m = arg.match(/^(.+\.spec\.ts)@(\d+)\/(\d+)$/);
    if (!m) {
      out.push(arg);
      continue;
    }
    const [, file, k, n] = m;
    const { stdout } = await command(playwrightBin, ["test", "--list", "--reporter=json", file], { capture: true });
    const lines = new Set();
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) lines.add(spec.line);
      for (const child of suite.suites ?? []) walk(child);
    };
    for (const suite of JSON.parse(stdout).suites ?? []) walk(suite);
    const sorted = [...lines].sort((a, b) => a - b);
    const from = Math.floor(((Number(k) - 1) * sorted.length) / Number(n));
    const to = Math.floor((Number(k) * sorted.length) / Number(n));
    const picked = sorted.slice(from, to);
    process.stdout.write(`${arg}: ${picked.length} of ${sorted.length} test lines\n`);
    out.push(...picked.map((line) => `${file}:${line}`));
  }
  return out;
}

async function main() {
  const requested = process.argv.slice(2);
  const playwrightArgs = await expandSplits(requested);
  // 나눈 몫이 비면 인자 없이 돌아 spec 전체가 도는 일을 막는다
  if (requested.length && !playwrightArgs.length) {
    process.stdout.write("No tests left for this shard; skipping the real-stack run.\n");
    return;
  }
  for (const [port, name] of [
    [8000, "FastAPI"],
    [8081, "consumer Expo"],
    [8082, "producer Expo"],
  ]) {
    if (!(await available(port))) {
      throw new Error(`Port ${port} is already in use (${name}). Stop the existing process and retry.`);
    }
  }

  if (process.env.FARMCLUB_INTEGRATION_SKIP_DOCKER !== "1") {
    await command("docker", ["compose", "up", "-d"], { cwd: serverDir });
  }

  const serverEnv = {
    DATABASE_URL: databaseUrl,
    MOCK_LOGIN_ENABLED: "true",
    FIXED_NOW: "2026-10-07T10:00:00+09:00",
    ENVIRONMENT: "local",
    // 기본은 켜짐. 운영처럼 꺼진 서버 흐름은 SOURCE_ANALYSIS_ENABLED=false로 실행한다(DEV-84)
    SOURCE_ANALYSIS_ENABLED: process.env.SOURCE_ANALYSIS_ENABLED ?? "true",
    SOURCE_ANALYSIS_PROVIDER: "mock",
  };
  await resetSeed(serverEnv);
  const tokenResult = await command(
    "uv",
    ["run", "python", "-m", "app.accounts.admin_token"],
    { cwd: serverDir, env: serverEnv, capture: true },
  );
  const adminToken = tokenResult.stdout.split(/\s+/).at(-1);
  if (!adminToken) throw new Error("Failed to generate the local admin token");

  const expoEnv = {
    EXPO_PUBLIC_API_MOCK: "0",
    EXPO_PUBLIC_API_URL: apiUrl,
    EXPO_PUBLIC_CONSUMER_URL: consumerUrl,
    EXPO_PUBLIC_PRODUCER_URL: producerUrl,
    EXPO_NO_TELEMETRY: "1",
    CI: "1",
  };
  service("api", "uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], {
    cwd: serverDir,
    env: serverEnv,
  });
  const expo = path.join(root, "node_modules", "expo", "bin", "cli");
  service("consumer", process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", "8081"], {
    cwd: path.join(root, "apps", "consumer"),
    env: expoEnv,
  });
  service("producer", process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", "8082"], {
    cwd: path.join(root, "apps", "producer"),
    env: expoEnv,
  });

  await Promise.all([
    waitFor(`${apiUrl}/health`, "FastAPI"),
    waitFor(consumerUrl, "consumer Expo"),
    waitFor(producerUrl, "producer Expo"),
  ]);

  const testEnv = {
    ...serverEnv,
    FARMCLUB_API_URL: apiUrl,
    FARMCLUB_CONSUMER_URL: consumerUrl,
    FARMCLUB_PRODUCER_URL: producerUrl,
    FARMCLUB_ADMIN_TOKEN: adminToken,
    FARMCLUB_INTEGRATION_ARTIFACTS: artifacts,
  };
  // DEV-234: CI 샤드는 첫 샤드만 API 시나리오를 돈다(FARMCLUB_INTEGRATION_API=0이면 건너뜀)
  if (process.env.FARMCLUB_INTEGRATION_API !== "0") {
    await command(process.execPath, ["scripts/test-integration.mjs"], { env: testEnv });
    await resetSeed(serverEnv);
  }
  // 뒤에 붙인 인자(spec 경로 등)는 Playwright에 넘긴다(DEV-84).
  // 격리 목록(scripts/ci/quarantine.json)으로 고른 spec의 테스트가 다 빠져도 실패로 보지 않는다(DEV-234).
  await command(playwrightBin, ["test", "--pass-with-no-tests", ...playwrightArgs], { env: testEnv });
}

try {
  await main();
  process.stdout.write(`\n✓ Full real-stack integration suite passed. Logs: ${logs}\n`);
} finally {
  stop();
}
