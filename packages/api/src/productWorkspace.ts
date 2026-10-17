import { request, apiUrl, getToken } from "./client";
import type { DetailContent } from "./types";
import type { ModuleDetail } from "./sourceAnalysis";
export type PageSnapshot = {
  kind: "modules" | "blocks";
  modules: (ModuleDetail["modules"][number] & { enabled: boolean })[];
  content: DetailContent;
};
export type ProductWorkspace = {
  productId: string;
  batchId: string;
  targetId: string;
  version: number;
  baseProductVersion: number;
  snapshot: PageSnapshot;
  publishedSnapshot: PageSnapshot;
  hasUnpublishedChanges: boolean;
};
const base = "/api/source-analysis/product-workspaces";
export const productWorkspace = {
  photo: async (productId: string, photoId: string) => {
    const response = await fetch(
      `${apiUrl}${base}/${productId}/photos/${photoId}`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (!response.ok) throw new Error("사진을 불러오지 못했어요.");
    return URL.createObjectURL(await response.blob());
  },
  open: (
    productId: string | undefined,
    key: string,
    discardChanges = false,
    version?: number,
  ) =>
    request<ProductWorkspace>("POST", base, {
      body: { productId, discardChanges, version },
      idempotencyKey: key,
    }),
  save: (
    productId: string,
    version: number,
    snapshot: PageSnapshot,
    key: string,
  ) =>
    request<ProductWorkspace>("PUT", `${base}/${productId}`, {
      body: { version, snapshot },
      idempotencyKey: key,
    }),
  apply: (productId: string, version: number, key: string) =>
    request<ProductWorkspace>("POST", `${base}/${productId}/apply`, {
      body: { version },
      idempotencyKey: key,
    }),
};
