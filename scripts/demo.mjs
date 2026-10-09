// Iteration 1 demo: reset the I1 seed, then run FastAPI + both Expo web apps against the real
// PostgreSQL stack (no Mock) until Ctrl+C. Same settings as scripts/run-integration.mjs.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const serverDir = path.join(root, "server");
const apiUrl = "http://localhost:8000";
const consumerUrl = "http://localhost:8081";
const producerUrl = "http://localhost:8082";
const children = new Set();

function available(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

function run(bin, args, { cwd = root, env = {}, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit", windowsHide: true });
    let out = "";
    if (capture) child.stdout.on("data", (d) => (out += d));
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${bin} ${args.join(" ")} failed (${code})`))));
  });
}

function service(bin, args, cwd, env) {
  const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit", detached: process.platform !== "win32", windowsHide: true });
  children.add(child);
  child.once("exit", () => children.delete(child));
}

async function waitFor(url, name) {
  for (let i = 0; i < 240; i += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${name} did not start at ${url}`);
}

function stop() {
  for (const child of children) {
    try {
      if (process.platform === "win32") child.kill();
      else process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill();
    }
  }
}
process.on("SIGINT", () => (stop(), process.exit(130)));
process.on("SIGTERM", () => (stop(), process.exit(143)));

for (const [port, name] of [[8000, "FastAPI"], [8081, "consumer"], [8082, "producer"]]) {
  if (!(await available(port))) throw new Error(`Port ${port} (${name}) is in use. Stop that process and retry.`);
}

const serverEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? "postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/farmclub",
  MOCK_LOGIN_ENABLED: "true",
  FIXED_NOW: "2026-10-07T10:00:00+09:00",
  ENVIRONMENT: "local",
};
await run("docker", ["compose", "up", "-d"], { cwd: serverDir });
await run("uv", ["run", "alembic", "upgrade", "head"], { cwd: serverDir, env: serverEnv });
await run("uv", ["run", "python", "-m", "app.core.seed", "--reset"], { cwd: serverDir, env: serverEnv });
const adminToken = (await run("uv", ["run", "python", "-m", "app.accounts.admin_token"], { cwd: serverDir, env: serverEnv, capture: true })).split(/\s+/).at(-1);

const expoEnv = {
  EXPO_PUBLIC_API_MOCK: "0",
  EXPO_PUBLIC_API_URL: apiUrl,
  EXPO_PUBLIC_CONSUMER_URL: consumerUrl,
  EXPO_PUBLIC_PRODUCER_URL: producerUrl,
  EXPO_NO_TELEMETRY: "1",
  CI: "1",
};
const expo = path.join(root, "node_modules", "expo", "bin", "cli");
service("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], serverDir, serverEnv);
service(process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", "8081"], path.join(root, "apps", "consumer"), expoEnv);
service(process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", "8082"], path.join(root, "apps", "producer"), expoEnv);
await Promise.all([waitFor(`${apiUrl}/health`, "FastAPI"), waitFor(consumerUrl, "consumer"), waitFor(producerUrl, "producer")]);

process.stdout.write(`
farmclub Iteration 1 demo is running (real FastAPI + PostgreSQL, demo date 2026-10-07)
  Consumer app : ${consumerUrl}
  Producer app : ${producerUrl}
  API (Swagger): ${apiUrl}/docs
  Admin token  : ${adminToken}
Press Ctrl+C to stop.
`);
