import { request, apiUrl, getToken } from "./client";
import type { DetailContent } from "./types";
import type { ModuleDetail } from "./sourceAnalysis";
export type PageSnapshot = {
  representativeUri?: string | null;
  hiddenSectionIds?: string[];
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
  uploadPhoto: async (
    productId: string,
    file: File,
  ): Promise<{ uri: string; alt: string }> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${apiUrl}${base}/${productId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!response.ok)
      throw new Error("사진을 올리지 못했어요. 다시 시도해 주세요.");
    return response.json();
  },
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
