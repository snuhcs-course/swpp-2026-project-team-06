// Local development only: shared fixture backend, never a production auth service.
import { createServer } from "node:http";
import { createRequire } from "node:module";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { mockTransport } = require("../.expo/mock-build/mock/index.js");
const {
  db,
  reset,
  configureMockStorage,
} = require("../.expo/mock-build/mock/db.js");
const root = fileURLToPath(new URL("../", import.meta.url));
const dir =
  process.env.FARMCLUB_MOCK_DIR || path.join(root, ".expo/shared-mock");
const mediaDir = path.join(dir, "media");
mkdirSync(mediaDir, { recursive: true });
const statePath = path.join(dir, "state.json");
configureMockStorage({
  read: () => (existsSync(statePath) ? readFileSync(statePath, "utf8") : null),
  write: (value) => {
    writeFileSync(`${statePath}.tmp`, value);
    renameSync(`${statePath}.tmp`, statePath);
  },
});
const port = Number(process.env.FARMCLUB_MOCK_PORT || 8083);
const base = `http://127.0.0.1:${port}`;
const origins = new Set(
  (
    process.env.FARMCLUB_APP_ORIGINS ||
    "http://localhost:8081,http://localhost:8082"
  ).split(","),
);
const contentTypes = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
};
function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function error(res, status, message) {
  json(res, status, {
    code:
      status === 401
        ? "UNAUTHENTICATED"
        : status === 403
          ? "FORBIDDEN"
          : "VALIDATION_ERROR",
    message,
    details: {},
  });
}
async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 140 * 1024 * 1024) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : undefined;
}
const server = createServer(async (req, res) => {
  if (
    req.headers.host !== `127.0.0.1:${port}` &&
    req.headers.host !== `localhost:${port}`
  )
    return error(res, 403, "Local host only");
  const origin = req.headers.origin;
  if (origin && !origins.has(origin))
    return error(res, 403, "Local app origin required");
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Idempotency-Key",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const pathname = new URL(req.url, base).pathname;
  try {
    if (req.method === "GET" && pathname === "/health")
      return json(res, 200, { status: "ok", mode: "shared-mock" });
    if (
      req.method === "GET" &&
      /^\/__mock\/media\/[a-f0-9-]+\.(jpg|png|webp|gif|mp4|webm)$/.test(
        pathname,
      )
    ) {
      const name = path.basename(pathname),
        target = path.join(mediaDir, name);
      if (!existsSync(target)) return error(res, 404, "Media not found");
      res.writeHead(200, {
        "Content-Type": contentTypes[name.split(".").at(-1)],
        "Cache-Control": "private, max-age=3600",
      });
      return res.end(readFileSync(target));
    }
    let body;
    if (req.method === "POST" && pathname === "/api/messaging/attachments") {
      if (Number(req.headers["content-length"] || 0) > 11 * 1024 * 1024)
        return error(res, 413, "사진은 10MB까지예요.");
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 11 * 1024 * 1024)
          return error(res, 413, "사진은 10MB까지예요.");
        chunks.push(chunk);
      }
      const request = new Request(base + pathname, {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] },
        body: Buffer.concat(chunks),
      });
      const form = await request.formData(),
        file = form.get("file");
      if (!file || typeof file === "string")
        return error(res, 400, "사진을 선택해 주세요.");
      body = {
        orderId: form.get("orderId") || undefined,
        threadId: form.get("threadId") || undefined,
        dataUrl: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
      };
    } else body = await readBody(req);
    if (pathname.startsWith("/__mock/")) {
      const token = (req.headers.authorization || "").replace(/^Bearer /, "");
      const user = db().users[db().tokens[token]];
      if (!user) return error(res, 401, "로그인이 필요해요.");
      if (req.method === "POST" && pathname === "/__mock/reset") {
        reset();
        return json(res, 200, { reset: true });
      }
      if (req.method === "POST" && pathname === "/__mock/media") {
        if (
          user.role !== "PRODUCER" ||
          db().farms[user.farmId]?.status !== "APPROVED"
        )
          return error(res, 403, "승인된 농가만 첨부할 수 있어요.");
        const match =
          /^data:(image\/(?:jpeg|png|webp|gif)|video\/(?:mp4|webm));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
            body?.dataUrl || "",
          );
        if (!match) return error(res, 400, "지원하지 않는 첨부예요.");
        const bytes = Buffer.from(match[2], "base64");
        if (
          bytes.length >
          (match[1].startsWith("video/") ? 100 : 10) * 1024 * 1024
        )
          return error(res, 413, "첨부 용량을 초과했어요.");
        const ext = Object.keys(contentTypes).find(
          (k) => contentTypes[k] === match[1],
        );
        const name = `${randomUUID()}.${ext}`;
        writeFileSync(path.join(mediaDir, name), bytes);
        return json(res, 200, { url: `${base}/__mock/media/${name}` });
      }
      return error(res, 404, "Unknown Mock endpoint");
    }
    const result = await mockTransport({
      method: req.method,
      path: req.url,
      body,
      headers: {
        Authorization: req.headers.authorization || "",
        "Idempotency-Key": req.headers["idempotency-key"] || "",
      },
    });
    if (
      req.method === "GET" &&
      pathname.startsWith("/api/messaging/attachments/") &&
      result.status === 200
    ) {
      const match = /^data:([^;]+);base64,(.*)$/.exec(result.body.dataUrl);
      res.writeHead(200, {
        "Content-Type": match[1],
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      return res.end(Buffer.from(match[2], "base64"));
    }
    json(res, result.status, result.body);
  } catch (e) {
    console.error(e.message);
    error(res, 400, "요청을 처리하지 못했어요.");
  }
});
server.listen(port, "127.0.0.1", () => console.log(`Shared Mock: ${base}`));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit()));
