import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, expect } from "@playwright/test";

const repo = fileURLToPath(new URL("../", import.meta.url));
const apps = {
  consumer: { userId: "fixture-consumer", name: "이서준", role: "CONSUMER", farmName: null, farmStatus: null },
  producer: { userId: "fixture-producer", name: "강영수", role: "PRODUCER", farmName: "테스트 농장", farmStatus: "APPROVED" },
};
const cases = [
  { label: "plain" },
  { label: "retired query", query: true },
  { label: "retired localStorage", local: true },
  { label: "retired sessionStorage", session: true },
  { label: "all retired browser inputs", query: true, local: true, session: true },
];
const configPath = "/api/auth/kakao/config";
const seedAccountsPath = "/api/auth/test-accounts";
const seedLoginPath = "/api/auth/test-login";
const passwordPath = "/api/auth/login";
const timeout = 8_000;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};

function exportApp(app, directory, apiUrl) {
  const cwd = path.join(repo, "apps", app);
  const require = createRequire(path.join(cwd, "package.json"));
  const expo = path.join(path.dirname(require.resolve("expo/package.json")), "bin", "cli");
  console.log(`Exporting ${app} for web with EXPO_PUBLIC_EVALUATOR_LOGIN=1`);
  const result = spawnSync(process.execPath, [expo, "export", "--platform", "web", "--output-dir", directory], {
    cwd,
    stdio: "inherit",
    timeout: 300_000,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      CI: "1",
      NODE_ENV: "production",
      EXPO_OFFLINE: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_NO_DOTENV: "1",
      EXPO_PUBLIC_API_MOCK: "0",
      EXPO_PUBLIC_SHARED_MOCK_URL: "",
      EXPO_PUBLIC_API_URL: apiUrl,
      EXPO_PUBLIC_EVALUATOR_LOGIN: "1",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${app} Expo export exited with ${result.signal ?? result.status}`);
}

async function serve(directory) {
  const root = await realpath(directory);
  const server = createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405).end();
      return;
    }

    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const requested = path.resolve(root, "." + pathname);
      if (pathname.startsWith("/api/") || (requested !== root && !requested.startsWith(root + path.sep))) {
        response.writeHead(404).end();
        return;
      }
      const found = await realpath(requested).catch((error) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
        throw error;
      });
      if (found && found !== root && !found.startsWith(root + path.sep)) {
        response.writeHead(404).end();
        return;
      }

      let file = found && (await stat(found)).isFile() ? found : null;
      if (!file && !path.extname(pathname)) file = await realpath(path.join(root, "index.html"));
      if (!file?.startsWith(root + path.sep)) {
        response.writeHead(404).end();
        return;
      }
      const body = await readFile(file);
      response.writeHead(200, {
        "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      }).end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      response.writeHead(error instanceof URIError ? 400 : error.code === "ENOENT" ? 404 : 500).end();
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

const counters = { passed: 0, failed: 0, assertions: 0, assertionFailures: 0 };

async function runCase(browser, base, app, kakao, input) {
  const name = `${app} / Kakao ${kakao} / ${input.label}`;
  const failures = [];
  async function check(label, assertion) {
    counters.assertions++;
    try {
      await assertion();
    } catch (error) {
      counters.assertionFailures++;
      failures.push(`${label}: ${error.message}`);
    }
  }

  const seedRequests = [];
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);
    const configStatus = kakao === "error" ? 500 : 200;
    await context.route("**/*", (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const endpoint = url.pathname.replace(/\/+$/, "");
      const method = request.method();
      if (!endpoint.startsWith("/api/")) {
        return url.origin === base ? route.continue() : route.abort();
      }

      const requestHeaders = request.headers();
      const headers = {
        "access-control-allow-origin": requestHeaders.origin ?? base,
        "access-control-allow-credentials": "true",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": requestHeaders["access-control-request-headers"] ?? "content-type, authorization",
        "cache-control": "no-store",
      };
      if (endpoint === seedAccountsPath || endpoint === seedLoginPath) seedRequests.push(`${method} ${endpoint}`);
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });

      if (endpoint === configPath && method === "GET") {
        const enabled = kakao === "enabled";
        const json = kakao === "error"
          ? { code: "INTERNAL_ERROR", message: "Fixture error" }
          : { enabled, clientId: enabled ? "test-client" : null, redirectPath: "/auth/kakao" };
        return route.fulfill({ status: configStatus, headers, json });
      }
      if (endpoint === seedAccountsPath) {
        const requestedApp = url.searchParams.get("app");
        return route.fulfill({ headers, json: [Object.hasOwn(apps, requestedApp) ? apps[requestedApp] : apps[app]] });
      }
      if (endpoint === seedLoginPath) {
        return route.fulfill({ status: 401, headers, json: { code: "UNAUTHORIZED", message: "Seed login attempted" } });
      }
      if (endpoint === passwordPath && method === "POST") {
        return route.fulfill({ status: 401, headers, json: { code: "INVALID_CREDENTIALS", message: "Fixture credentials rejected" } });
      }
      return route.fulfill({ status: 404, headers, json: { code: "NOT_FOUND", message: "No fixture for this endpoint" } });
    });

    await page.addInitScript(({ app, input }) => {
      if (app === "producer") localStorage.setItem("farmclub-producer:help-guide-seen", "1");
      if (input.local) localStorage.setItem("farmclub:evaluator", "1");
      if (input.session) sessionStorage.setItem("farmclub:evaluator", "1");
    }, { app, input });

    const kakaoButton = page.getByRole("button", { name: "카카오로 시작하기", exact: true });
    const form = page.getByTestId("password-login-section");
    async function checkScreen(phase) {
      await check(`${phase} ID form`, () => expect(form).toBeVisible({ timeout }));
      // Observe any seed request or controls rendered after the initial login screen.
      await page.waitForLoadState("networkidle");
      await Promise.all([
        kakao === "enabled" && check(`${phase} Kakao button`, () => expect(kakaoButton).toBeVisible({ timeout })),
        kakao === "disabled" && check(`${phase} Kakao button`, () => expect(kakaoButton).toHaveCount(0, { timeout })),
        check(`${phase} seed radios`, () => expect(page.getByRole("radio")).toHaveCount(0, { timeout })),
        check(`${phase} seed action`, () => expect(page.getByTestId("login-bottom-bar")).toHaveCount(0, { timeout })),
        app === "producer" && check(`${phase} seed application shortcut`, () =>
          expect(page.getByText("처음이세요? 농가로 가입 신청 ›", { exact: true })).toHaveCount(0, { timeout }),
        ),
      ]);
    }

    const loginUrl = base + "/login" + (input.query ? "?evaluator=1" : "");
    await Promise.all([
      check("initial Kakao fixture response", async () => {
        const response = await page.waitForResponse((item) =>
          item.request().method() === "GET" && new URL(item.url()).pathname === configPath,
        );
        expect(response.status()).toBe(configStatus);
      }),
      page.goto(loginUrl),
    ]);
    await checkScreen("initial load");
    await page.reload();
    await checkScreen("reload");

    if (kakao === "disabled" && input.label === "plain") {
      await check("ID login submits the app and credentials", async () => {
        const username = "releasetest1";
        const password = "Release-Test-77";
        await form.getByTestId("login-username").fill(username);
        await form.getByTestId("login-password").fill(password);
        const [submission] = await Promise.all([
          page.waitForResponse((response) =>
            response.request().method() === "POST" && new URL(response.url()).pathname === passwordPath,
          ),
          form.getByRole("button", { name: "로그인하기", exact: true }).click(),
        ]);
        expect(submission.request().postDataJSON()).toEqual({ app, username, password });
      });
    }
  } catch (error) {
    failures.push(error.message);
  } finally {
    await check("zero seed endpoint requests across the case", () => expect(seedRequests).toEqual([]));
    await context?.close();
  }

  if (failures.length) {
    counters.failed++;
    console.error(`FAIL ${name}\n${failures.join("\n")}`);
  } else {
    counters.passed++;
    console.log(`PASS ${name}`);
  }
}

const servers = [];
let browser;
let temp;
try {
  const { values } = parseArgs({ options: { "consumer-dir": { type: "string" }, "producer-dir": { type: "string" }, "fail-fast": { type: "boolean", default: false } } });
  const consumerDir = values["consumer-dir"];
  const producerDir = values["producer-dir"];
  if (Boolean(consumerDir) !== Boolean(producerDir)) {
    throw new Error("Use --consumer-dir PATH and --producer-dir PATH together, or omit both to export.");
  }
  const prebuilt = consumerDir && producerDir ? { consumer: consumerDir, producer: producerDir } : null;
  if (!prebuilt) temp = await mkdtemp(path.join(tmpdir(), "farmclub-release-login-"));

  const origins = {};
  for (const app of Object.keys(apps)) {
    const directory = prebuilt ? path.resolve(prebuilt[app]) : path.join(temp, app);
    if (!prebuilt) await mkdir(directory);
    const { server, url } = await serve(directory);
    servers.push(server);
    if (!prebuilt) exportApp(app, directory, url);
    if (!(await stat(path.join(directory, "index.html"))).isFile()) throw new Error(`Missing ${app} export index.html`);
    origins[app] = url;
  }

  browser = await chromium.launch();
  casesLoop: for (const app of Object.keys(apps)) {
    for (const kakao of ["enabled", "disabled", "error"]) {
      for (const input of cases) {
        await runCase(browser, origins[app], app, kakao, input);
        if (values["fail-fast"] && counters.failed) break casesLoop;
      }
    }
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  const cleanup = [
    async () => browser?.close(),
    ...servers.map((server) => () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    })),
    async () => {
      if (temp) await rm(temp, { recursive: true, force: true });
    },
  ];
  for (const close of cleanup) {
    try {
      await close();
    } catch (error) {
      console.error(error);
      process.exitCode = 1;
    }
  }
  const { passed, failed, assertions, assertionFailures } = counters;
  console.log(`${passed + failed} cases (${passed} passed, ${failed} failed), ${assertions} assertions (${assertionFailures} failed)`);
  if (failed > 0) process.exitCode = 1;
}
