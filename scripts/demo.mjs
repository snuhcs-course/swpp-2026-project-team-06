// Working demo (DEV-133): reset the seed, then run FastAPI + both Expo web apps against the real
// PostgreSQL stack (no Mock) until Ctrl+C. Same settings as scripts/run-integration.mjs.
// With ADMIN_WEB_PASSWORD set it also starts the admin page (scripts/admin-web) on the local API.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const serverDir = path.join(root, "server");
// 포트·DB는 환경 변수로 바꿀 수 있다(개발 서버와 같이 띄울 때). 기본값은 README와 같다
const apiPort = Number(process.env.DEMO_API_PORT ?? 8000);
const consumerPort = Number(process.env.DEMO_CONSUMER_PORT ?? 8081);
const producerPort = Number(process.env.DEMO_PRODUCER_PORT ?? 8082);
const adminPort = Number(process.env.DEMO_ADMIN_PORT ?? 8090);
const adminPassword = process.env.ADMIN_WEB_PASSWORD;
const apiUrl = `http://localhost:${apiPort}`;
const consumerUrl = `http://localhost:${consumerPort}`;
const producerUrl = `http://localhost:${producerPort}`;
const demoDb = process.env.DEMO_DB ?? "farmclub";
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

const ports = [[apiPort, "FastAPI"], [consumerPort, "consumer"], [producerPort, "producer"]];
if (adminPassword) ports.push([adminPort, "admin page"]);
for (const [port, name] of ports) {
  if (!(await available(port))) throw new Error(`Port ${port} (${name}) is in use. Stop that process and retry.`);
}

const serverEnv = {
  DATABASE_URL: process.env.DATABASE_URL ?? `postgresql+psycopg://farmclub:farmclub@127.0.0.1:5432/${demoDb}`,
  CONSUMER_APP_URL: consumerUrl,
  PRODUCER_APP_URL: producerUrl,
  MOCK_LOGIN_ENABLED: "true",
  FIXED_NOW: "2026-10-07T10:00:00+09:00",
  APP_ENV: "local",
};
await run("docker", ["compose", "up", "-d", "--wait"], { cwd: serverDir });
if (demoDb !== "farmclub") {
  // 데모 전용 DB: 시드 초기화가 개발용 DB를 지우지 않게 한다
  const exists = await run("docker", ["compose", "exec", "-T", "db", "psql", "-U", "farmclub", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${demoDb}'`], { cwd: serverDir, capture: true });
  if (exists !== "1") await run("docker", ["compose", "exec", "-T", "db", "createdb", "-U", "farmclub", demoDb], { cwd: serverDir });
}
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
service("uv", ["run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)], serverDir, serverEnv);
service(process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", String(consumerPort)], path.join(root, "apps", "consumer"), expoEnv);
service(process.execPath, [expo, "start", "--web", "--host", "localhost", "--port", String(producerPort)], path.join(root, "apps", "producer"), expoEnv);
const adminUrl = `http://127.0.0.1:${adminPort}`;
if (adminPassword) {
  service(process.execPath, [path.join(root, "scripts", "admin-web", "server.mjs")], root, {
    PORT: String(adminPort),
    ADMIN_WEB_PASSWORD: adminPassword,
    ADMIN_TOKEN: adminToken,
    FARMCLUB_API_URL: apiUrl,
  });
}
await Promise.all([
  waitFor(`${apiUrl}/health`, "FastAPI"),
  waitFor(consumerUrl, "consumer"),
  waitFor(producerUrl, "producer"),
  ...(adminPassword ? [waitFor(`${adminUrl}/login`, "admin page")] : []),
]);

process.stdout.write(`
farmclub demo is running (real FastAPI + PostgreSQL, demo date 2026-10-07)
  Consumer app : ${consumerUrl}
  Producer app : ${producerUrl}
  API (Swagger): ${apiUrl}/docs
  Admin token  : ${adminToken}
  Admin page   : ${adminPassword ? `${adminUrl}/login (ADMIN_WEB_PASSWORD)` : "off (set ADMIN_WEB_PASSWORD to start it)"}
Press Ctrl+C to stop.
`);
