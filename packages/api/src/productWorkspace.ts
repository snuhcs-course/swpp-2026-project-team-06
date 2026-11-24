import { request, apiUrl, getToken } from "./client";
import { blobUrl } from "./objectUrl";
import { PhotoTimeoutError, privatePhotoBlob } from "./privatePhoto";
import { appendFile, type UploadFile } from "./upload";
import type {
  DetailContent,
  MyProduct,
  ProductPatch,
  ProductStatus,
  StageInput,
} from "./types";
import type { ModuleDetail } from "./sourceAnalysis";
export type PageSnapshot = {
  /** Server-owned source review fence for private legacy pages. */
  sourceReviewVersion?: number | null;
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
  /** DEV-361: 구매자에게 보이는 상품에 반영 안 한 상품 초안이 있다(내용은 productDraft()) */
  hasProductDraft?: boolean;
};

/**
 * DEV-361 상품 초안 칸(판매 중·승인 대기 상품). PATCH /api/products와 같은 이름이고, 한 주문 최대 박스
 * (판매 설정)와 상세(판매페이지 초안)는 없다. 새 중량 옵션도 optionId를 앱이 정해 넣는다(기간 가격이 가리킴).
 */
export type ProductDraftFields = Omit<
  ProductPatch,
  "version" | "maxQuantityPerOrder" | "detailContent" | "options"
> & {
  options?: { optionId: string; label: string; weightKg: number; note?: string | null }[];
};
/** 초안의 기간 하나(날짜순). 새 기간은 stageId가 null */
export type DraftStage = Omit<StageInput, "stageId" | "name"> & {
  stageId: string | null;
};
/** 바뀐 칸 하나. before·after는 보여 줄 요약 문구(없으면 null) */
export type ProductChange = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};
/** 반영 확인 시트 묶음: 바로 보임 / 새 예약부터(R-25) / 예약자 동의 필요(R-21) */
export type ProductChangeGroups = {
  now: ProductChange[];
  newOrders: ProductChange[];
  consent: ProductChange[];
};
export type ProductDraftView = {
  productId: string;
  /** workspace version. 저장·버리기·반영에 그대로 보낸다 */
  version: number;
  productStatus: ProductStatus;
  draft: {
    fields: ProductDraftFields;
    stages: DraftStage[] | null;
    savedAt: string | null;
  } | null;
  /** 판매페이지(상세)·대표사진 변경은 여기 없다. 앱이 판매페이지 초안으로 따로 보인다 */
  changes: ProductChangeGroups;
  /** 받는 시기를 바꾸면 동의를 물을 사람 수 */
  reservedCount: number;
  /** 초안 뒤 다른 곳에서 바뀐 칸. 있으면 반영이 PRODUCT_CHANGED로 거절된다(저장 때 rebase로 풂) */
  conflicts: string[];
};
export type ApplyAllResult = {
  productId: string;
  version: number;
  productVersion: number;
  changes: ProductChangeGroups;
  pageApplied: boolean;
  deliveryWindowProposed: boolean;
  reservedCount: number;
  /** 운영자 변경 기록 ID. 반영할 때 남은 변경이 없으면 null */
  changeId: string | null;
  product: MyProduct;
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
      body: { productId, discardChanges, version, ...(composer ? { composer, sourceCopyEnabled: true } : {}) },
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
  /** DEV-361: 비공개 상품 초안. 저장은 판매 중·승인 대기 상품만(판매 전·종료는 409) */
  productDraft: (productId: string) =>
    request<ProductDraftView>("GET", `${base}/${productId}/product-draft`),
  /**
   * 초안 전체를 바꾼다. 상품과 같은 값은 초안에서 빠지고, stages를 빼면 초안의 기간·가격 변경도 지워진다.
   * PRODUCT_CHANGED 뒤에는 확인한 칸을 rebase에 넣어 다시 저장한다(넣지 않으면 충돌이 남는다)
   */
  saveProductDraft: (
    productId: string,
    version: number,
    fields: ProductDraftFields,
    stages: (StageInput | DraftStage)[] | undefined,
    key: string,
    rebase?: string[],
  ) =>
    request<ProductDraftView>("PUT", `${base}/${productId}/product-draft`, {
      body: {
        version,
        fields,
        ...(stages ? { stages } : {}),
        ...(rebase?.length ? { rebase } : {}),
      },
      idempotencyKey: key,
    }),
  discardProductDraft: (productId: string, version: number) =>
    request<ProductDraftView>("DELETE", `${base}/${productId}/product-draft`, {
      query: { version },
    }),
  /**
   * '상품에 반영': 상품 초안과 판매페이지 초안(page)을 한 번에. 받는 시기를 바꾸고 예약자가 있으면
   * confirmDeliveryChange 없이 409 DELIVERY_CONSENT_REQUIRED(details.reservedCount). page와 photos 초안을
   * 함께 보내면 상품에 이미 있던 사진이 판매페이지 대표사진일 때 photos 첫 장과 같아야 한다(아니면 409
   * PHOTO_CHANGED). composer에서 새로 올린 대표사진은 photos 초안 순서 앞에 들어간다
   */
  applyAll: (
    productId: string,
    body: {
      version: number;
      page?: { draftId: string; draftVersion: number };
      confirmDeliveryChange?: boolean;
      /** 확인 시트에서 본 사람 수. 지금 수와 다르면 다시 409 DELIVERY_CONSENT_REQUIRED */
      confirmedReservedCount?: number;
    },
    key: string,
  ) =>
    request<ApplyAllResult>("POST", `${base}/${productId}/apply-all`, {
      body,
      idempotencyKey: key,
    }),
};
