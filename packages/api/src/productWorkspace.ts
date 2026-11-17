import { request, apiUrl, getToken } from "./client";
import { blobUrl } from "./objectUrl";
import { PhotoTimeoutError, privatePhotoBlob } from "./privatePhoto";
import { appendFile, type UploadFile } from "./upload";
import type { DetailContent } from "./types";
import type { ModuleDetail } from "./sourceAnalysis";
export type PageSnapshot = {
  representativeUri: string | null;
  hiddenSectionIds: string[];
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
  /** DEV-346: composer로 열어 달라고 했을 때만. true면 batch 초안이 지금 상품 페이지를 담고 있다. */
  composer?: boolean;
  /** DEV-346: composer로 못 연 이유. LEGACY_REVISION = 기존 편집기 수정본이 composer 작업과 겹침 */
  composerBlocked?: "LEGACY_REVISION";
  /** DEV-346: 다른 화면에서 반영한 판매페이지로 composer 값을 새로 불러왔고 그 전 임시 저장이 있었다 */
  composerNotice?: "PAGE_REPLACED" | "PAGE_AND_AI_REPLACED";
};
const base = "/api/source-analysis/product-workspaces";
export const productWorkspace = {
  uploadPhoto: async (
    productId: string,
    file: UploadFile,
  ): Promise<{ uri: string; alt: string }> => {
    const form = new FormData();
    appendFile(form, "file", file);
    const response = await fetch(`${apiUrl}${base}/${productId}/photos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    });
    if (!response.ok)
      throw new Error("사진을 올리지 못했어요. 다시 시도해 주세요.");
    return response.json();
  },
  /** 작업 사진 주소. 사진 id 하나는 저장본 하나라 같은 id는 한 번만 받는다(DEV-341, 시간 제한 있음) */
  photo: async (productId: string, photoId: string) => {
    const blob = await privatePhotoBlob(
      `${apiUrl}${base}/${productId}/photos/${photoId}`,
    ).catch((e) => {
      throw e instanceof PhotoTimeoutError ? e : new Error("사진을 불러오지 못했어요.");
    });
    return blobUrl(blob);
  },
  open: (
    productId: string | undefined,
    key: string,
    discardChanges = false,
    version?: number,
    composer?: boolean,
  ) =>
    request<ProductWorkspace>("POST", base, {
      body: { productId, discardChanges, version, ...(composer ? { composer } : {}) },
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
