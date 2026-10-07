import { request } from "./client";

export { ApiError, apiUrl, request } from "./client";

export function health(): Promise<{ status: "ok" }> {
  return request("/health");
}
