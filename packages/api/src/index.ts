export {
  uploadAttachment,
  privateImage,
  ApiError,
  apiUrl,
  isMock,
  configureApi,
  getToken,
  onAuthChange,
  request,
  newIdempotencyKey,
  resetDemoData,
  sharedMockUrl,
  uploadMockMedia,
  appName,
} from "./client";
export { CARRIERS, carrierLabel, trackingUrl } from "./carriers";
export { auth, farms, catalog, orders, messaging, admin } from "./endpoints";
export type * from "./types";

import { request } from "./client";

export function health(): Promise<{ status: "ok" }> {
  return request("GET", "/health");
}

export { allPages } from "./pagination";
