export {
  uploadAttachment,
  privateImage,
  ApiError,
  apiUrl,
  isMock,
  configureApi,
  getToken,
  onAuthChange,
  onOnboardingRequired,
  onConsentRequired,
  onAccountGate,
  request,
  newIdempotencyKey,
  resetDemoData,
  sharedMockUrl,
  uploadMedia,
  appName,
  readStore,
  writeStore,
} from "./client";
export { CARRIERS, carrierLabel, trackingUrl, formatTrackingNumber, editTrackingNumber } from "./carriers";
export { auth, farms, engagement, catalog, orders, messaging, admin } from "./endpoints";
export type * from "./types";
export type { NativeFile, UploadFile } from "./upload";
export { appendFile, isNativeFile } from "./upload";
export { SUPPORT_ID } from "./types";
export * from "./orderConsents";
export * from "./passwordRules";

import { request } from "./client";

export function health(): Promise<{ status: "ok" }> {
  return request("GET", "/health");
}

export { allPages } from "./pagination";
export { serverNow } from "./serverClock";
export { priceDDay, priceFrom, referencePrice, productPrices } from "./productPresentation";

export * from "./sourceAnalysis";
export * from "./productWorkspace";
