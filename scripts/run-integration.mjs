import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const serverDir = path.join(root, "server");
const artifacts = path.join(root, ".artifacts", "integration");
const logs = path.join(artifacts, "logs");
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

async function main() {
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
  await command(process.execPath, ["scripts/test-integration.mjs"], { env: testEnv });
  await resetSeed(serverEnv);
  await command(path.join(root, "node_modules", ".bin", "playwright"), ["test"], { env: testEnv });
}

try {
  await main();
  process.stdout.write(`\n✓ Full real-stack integration suite passed. Logs: ${logs}\n`);
} finally {
  stop();
}
