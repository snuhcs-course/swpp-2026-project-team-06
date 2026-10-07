import { spawn } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const [mode = "start", selected] = process.argv.slice(2);
const apps = selected ? [selected] : ["consumer", "producer"];
if (
  !["start", "export"].includes(mode) ||
  apps.some((a) => !["consumer", "producer"].includes(a))
) {
  throw new Error(
    "Usage: node scripts/local.mjs start|export [consumer|producer]",
  );
}
const expo = path.join(root, "node_modules/expo/bin/cli");
const ports = { consumer: 8081, producer: 8082 };
async function available(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}
if (mode === "start") {
  for (const app of apps) {
    while (
      !(await available(ports[app])) ||
      (app === "producer" && ports.producer === ports.consumer)
    )
      ports[app]++;
  }
}
let mockPort = 8083;
while (!(await available(mockPort)) || Object.values(ports).includes(mockPort))
  mockPort++;
const env = {
  ...process.env,
  EXPO_PUBLIC_API_MOCK: "1",
  EXPO_PUBLIC_SHARED_MOCK_URL:
    mode === "start" ? `http://127.0.0.1:${mockPort}` : "",
  FARMCLUB_MOCK_PORT: String(mockPort),
  FARMCLUB_APP_ORIGINS: Object.values(ports)
    .map((p) => `http://localhost:${p}`)
    .join(","),
  EXPO_PUBLIC_CONSUMER_URL: `http://localhost:${ports.consumer}`,
  EXPO_PUBLIC_PRODUCER_URL: `http://localhost:${ports.producer}`,
  EXPO_NO_TELEMETRY: "1",
  EXPO_OFFLINE: "1",
};
const children = new Set();
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function run(app) {
  const cwd = path.join(root, "apps", app);
  const args =
    mode === "start"
      ? ["start", "--web", "--host", "localhost", "--port", String(ports[app])]
      : ["export", "-p", "web"];
  if (mode === "start")
    console.log(`${app}: http://localhost:${ports[app]} (Mock)`);
  const child = spawn(process.execPath, [expo, ...args], {
    cwd,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(child);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
  children.delete(child);
  if (code !== 0) {
    process.exitCode = code;
    stop();
    return;
  }
  if (mode === "export")
    await copyFile(
      path.join(cwd, "vercel.json"),
      path.join(cwd, "dist/vercel.json"),
    );
}
if (mode === "start") {
  const build = spawn(
    process.execPath,
    ["node_modules/typescript/bin/tsc", "-p", "scripts/mock-tsconfig.json"],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  if ((await new Promise((resolve) => build.on("exit", resolve))) !== 0)
    process.exit(1);
  const backend = spawn(process.execPath, ["scripts/mock-server.mjs"], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  children.add(backend);
  backend.on("exit", () => {
    children.delete(backend);
    stop();
  });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      ready = (await fetch(env.EXPO_PUBLIC_SHARED_MOCK_URL + "/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) {
    stop();
    throw new Error("Shared Mock failed to start");
  }
  await Promise.all(apps.map(run));
} else
  for (const app of apps) {
    await run(app);
    if (process.exitCode) break;
  }
