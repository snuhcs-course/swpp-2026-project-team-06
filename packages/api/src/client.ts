// 서버 호출 클라이언트. 계약: docs/spec/screens.md 7.1
// - EXPO_PUBLIC_API_MOCK=1 이면 mock 전송(브라우저 localStorage에 상태 저장), 아니면 EXPO_PUBLIC_API_URL로 fetch.
// - 오류는 {code, message, details}를 ApiError로 꺼내 준다.
// - 토큰은 이 패키지가 보관하고 Authorization 헤더로 붙인다. 화면은 토큰을 다루지 않는다.
// Expo가 빌드 때 process.env.EXPO_PUBLIC_* 를 값으로 바꾼다. 앱 tsconfig에 Node 타입이 없어 여기서만 선언한다.
declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_API_MOCK?: string;
    EXPO_PUBLIC_SHARED_MOCK_URL?: string;
  };
};

import { mockTransport, resetMockState } from "./mock";
import type { ErrorBody, ErrorCode } from "./types";

const DEFAULT_API_URL = "http://localhost:8000";

export const sharedMockUrl = (
  process.env.EXPO_PUBLIC_SHARED_MOCK_URL || ""
).replace(/\/+$/, "");
export const apiUrl =
  sharedMockUrl ||
  (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
export const isMock =
  !!sharedMockUrl || process.env.EXPO_PUBLIC_API_MOCK === "1";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorBody["details"];
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    const b = (body ?? {}) as Partial<ErrorBody>;
    super(b.message ?? `API ${status}`);
    this.code =
      (b.code as ErrorCode) ??
      (status >= 500 ? "INTERNAL_ERROR" : "VALIDATION_ERROR");
    this.details = b.details ?? {};
  }
}

/* ---------------- storage (앱별 이름공간) ---------------- */

let namespace = "farmclub";
let currentApp: "consumer" | "producer" = "consumer";

/** 앱 시작 때 한 번 부른다. 앱마다 localStorage·토큰을 따로 쓴다(계정 분리, ADR 0010). */
export function configureApi(opts: { namespace: "consumer" | "producer" }) {
  namespace = `farmclub-${opts.namespace}${sharedMockUrl ? "-shared-v1" : ""}`;
  currentApp = opts.namespace;
}
/** 지금 앱(consumer·producer). 테스트 계정 목록·로그인에 쓴다 */
export function appName() {
  return currentApp;
}
export function storageKey(name: string) {
  return `${namespace}:${name}`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
export function readStore(name: string): string | null {
  try {
    return storage()?.getItem(storageKey(name)) ?? null;
  } catch {
    return null;
  }
}
export function writeStore(name: string, value: string | null) {
  try {
    const s = storage();
    if (!s) return;
    if (value === null) s.removeItem(storageKey(name));
    else s.setItem(storageKey(name), value);
  } catch {
    /* 저장 못 해도 화면은 동작 */
  }
}

/* ---------------- token ---------------- */

const listeners = new Set<() => void>();
export function getToken(): string | null {
  return readStore("token");
}
export function setToken(token: string | null) {
  writeStore("token", token);
  listeners.forEach((l) => l());
}
/** 로그인 상태가 바뀔 때 알림 */
export function onAuthChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/* ---------------- request ---------------- */

export type RequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  idempotencyKey?: string;
};

export type Transport = (req: {
  method: string;
  path: string;
  body?: unknown;
  headers: Record<string, string>;
}) => Promise<{ status: number; body: unknown }>;

const httpTransport: Transport = async ({ method, path, body, headers }) => {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data: unknown =
    res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, body: data };
};

export async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const q = opts.query
    ? Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join("&")
    : "";
  const fullPath = q ? `${path}?${q}` : path;
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const transport = isMock && !sharedMockUrl ? mockTransport : httpTransport;
  let res: { status: number; body: unknown };
  try {
    res = await transport({ method, path: fullPath, body: opts.body, headers });
  } catch {
    throw new ApiError(0, {
      code: "INTERNAL_ERROR",
      message: "인터넷 연결을 확인하고 다시 시도해 주세요.",
      details: {},
    });
  }
  if (res.status === 401) setToken(null);
  // 다른 앱 계정의 토큰이면 지우고 그 앱의 로그인으로(screens.md 7.1)
  if (
    res.status === 403 &&
    (res.body as { details?: { reason?: string } } | null)?.details?.reason ===
      "WRONG_APP"
  )
    setToken(null);
  if (res.status >= 400) throw new ApiError(res.status, res.body);
  return res.body as T;
}

/** 멱등 키(UUID v4). 재시도 때 같은 키를 다시 쓴다. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Mock 전용: 데모 데이터 초기화(로그인도 풀린다) */
export async function resetDemoData() {
  if (!isMock) return;
  if (sharedMockUrl) await request("POST", "/__mock/reset");
  else resetMockState();
  setToken(null);
}

export async function uploadMockMedia(dataUrl: string): Promise<string> {
  if (!sharedMockUrl) return dataUrl;
  const result = await request<{ url: string }>("POST", "/__mock/media", {
    body: { dataUrl },
  });
  return result.url;
}

/** Private images travel with authentication. Never use the public news-media endpoint. */
export async function uploadAttachment(
  file: File,
  resource: { orderId?: string; threadId?: string },
): Promise<import("./types").Attachment> {
  if (isMock && !sharedMockUrl) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
    return request("POST", "/api/messaging/attachments", {
      body: { ...resource, dataUrl },
    });
  }
  const form = new FormData();
  form.append("file", file);
  if (resource.orderId) form.append("orderId", resource.orderId);
  if (resource.threadId) form.append("threadId", resource.threadId);
  const res = await fetch(`${apiUrl}/api/messaging/attachments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}
export async function privateImage(id: string): Promise<string> {
  if (isMock && !sharedMockUrl)
    return (
      await request<{ dataUrl: string }>(
        "GET",
        `/api/messaging/attachments/${id}`,
      )
    ).dataUrl;
  const res = await fetch(`${apiUrl}/api/messaging/attachments/${id}`, {
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return URL.createObjectURL(await res.blob());
}
