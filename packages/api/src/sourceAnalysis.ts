import { ApiError, apiUrl, getToken, isMock, request } from "./client";
export type SourceBasicInfo = {
  variety: string;
  size: string;
  expectedBrix: number | null;
};
export type SourceTarget = {
  id: string;
  name: string;
  productId: string | null;
  basicInfo?: SourceBasicInfo;
  representativeAssetId?: string | null;
};
export type SourceAsset = {
  id: string;
  filename: string;
  mime: string;
  targetIds: string[];
  common: boolean;
  originalPhoto: boolean;
  description?: string;
  descriptionVersion?: number;
  placement?: { revision?: number; fieldKey?: string | null };
  revision: number;
  sanitizationVersion: number;
  privacyApproved: boolean;
  status: string;
  pageCount: number;
  error: string | null;
};
export type SourceBatch = {
  id: string;
  version: number;
  reviewVersion: number;
  targets: SourceTarget[];
  sources: SourceAsset[];
};
export type SourceSpan = { id: string; text: string; box?: number[] };
export type SourcePage = {
  sourceRevision: number;
  sanitizationVersion: number;
  privacyApproved: boolean;
  spans: SourceSpan[];
  redactedSpans: SourceSpan[];
  redactions: number[][];
  hasImage: boolean;
};
export type SourceEvidence = {
  sourceId: string;
  sourceRevision: number;
  page: number;
  spanIds: string[];
  quote: string;
};
export type SourceField = {
  targetId: string;
  fieldKey: string;
  value: string;
  state: "CONFIRMED" | "EXCLUDED" | "UNREVIEWED";
  provenance: "EXTRACTED" | "PRODUCER";
  candidateIds: string[];
  photoAssetIds: string[];
  illustrationId: string | null;
};
export type SourceCandidate = {
  id: string;
  targetId: string | null;
  fieldKey: string;
  value: string;
  candidateIds: string[];
  evidence: SourceEvidence[];
  outdated: boolean;
  historical: boolean;
};
export type SourceEditorField = {
  field: SourceField;
  status: "ready" | "missing" | "conflict" | "outdated" | "unassigned";
};
export type SourceReview = {
  editorFields: SourceEditorField[];
  reviewVersion: number;
  targets: SourceTarget[];
  fields: SourceField[];
  candidates: SourceCandidate[];
  sourcePhotoRequests: {
    sourceId: string;
    targetIds: string[];
    requests: string[];
  }[];
  conflicts: {
    targetId: string | null;
    fieldKey: string;
    candidateIds: string[];
  }[];
};
export type SourceRun = {
  inputs?: { id: string; revision: number; description: string }[];
  id: string;
  mode: string;
  model: string;
  status: string;
  completed: number;
  total: number;
  items: {
    id: string;
    assetId: string;
    revision: number;
    status: string;
    error: string | null;
    phase: string;
    acceptedCount: number;
    rejectedCount: number;
  }[];
};
export type ModuleDetail = {
  schemaVersion: number;
  modules: {
    id: string;
    texts: { fieldKey: string; value: string }[];
    photos: { uri: string; alt: string }[];
    illustrationId?: string | null;
  }[];
};
export type SourceDraft = {
  id: string;
  targetId: string;
  version: number;
  snapshot: {
    representativeAssetId?: string | null;
    hiddenSectionIds?: string[];
    reviewVersion: number;
    mode: string;
    warnings: { moduleId: string; code: string }[];
    modules: { id: string; enabled: boolean }[];
    previewModules: {
      id: string;
      texts: { fieldKey: string; value: string }[];
      photoAssetIds: string[];
      illustrationId: string | null;
    }[];
  };
};
const base = "/api/source-analysis/batches";
const at = (bid: string) => `${base}/${encodeURIComponent(bid)}`;
export const sourceAnalysis = {
  text: (bid: string, sid: string) =>
    request<{ text: string; sourceVersion: number }>(
      "GET",
      `${at(bid)}/sources/${sid}/text`,
    ),
  editSource: (
    bid: string,
    source: SourceAsset,
    values: { text?: string; description?: string },
  ) =>
    request<SourceAsset>("PUT", `${at(bid)}/sources/${source.id}/details`, {
      body: {
        sourceVersion: source.revision,
        descriptionVersion: source.descriptionVersion,
        ...values,
      },
    }),
  list: (cursor?: string) =>
    request<{ items: SourceBatch[]; nextCursor: string | null }>("GET", base, {
      query: { cursor, limit: 50 },
    }),
  create: (targets: { name: string; productId?: string }[], key: string) =>
    request<SourceBatch>("POST", base, {
      body: { targets },
      idempotencyKey: key,
    }),
  setRepresentative: (
    bid: string,
    version: number,
    targetIds: string[],
    assetId: string,
  ) =>
    request<SourceBatch>("PUT", `${at(bid)}/representative`, {
      body: { version, targetIds, assetId },
    }),
  saveBasicInfo: (
    bid: string,
    version: number,
    targets: { targetId: string; basicInfo: SourceBasicInfo }[],
  ) =>
    request<SourceBatch>("PUT", `${at(bid)}/basic-info`, {
      body: { version, targets },
    }),
  get: (bid: string) => request<SourceBatch>("GET", at(bid)),
  page: (bid: string, sid: string, number: number) =>
    request<SourcePage>("GET", `${at(bid)}/sources/${sid}/pages/${number}`),
  runs: (bid: string) =>
    request<{ items: SourceRun[] }>("GET", `${at(bid)}/runs`),
  start: (
    bid: string,
    batchVersion: number,
    key: string,
    visualPages: Record<string, number[]> = {},
  ) =>
    request<SourceRun>("POST", `${at(bid)}/runs`, {
      body: { batchVersion, visualPages },
      idempotencyKey: key,
    }),
  cancel: (bid: string, rid: string) =>
    request<SourceRun>("POST", `${at(bid)}/runs/${rid}/cancel`),
  retry: (
    bid: string,
    rid: string,
    itemIds: string[],
    acknowledgeUncertain: boolean,
    key: string,
  ) =>
    request<SourceRun>("POST", `${at(bid)}/runs/${rid}/retry`, {
      body: { itemIds, acknowledgeUncertain },
      idempotencyKey: key,
    }),
  review: (bid: string) => request<SourceReview>("GET", `${at(bid)}/review`),
  saveReview: (bid: string, reviewVersion: number, fields: SourceField[]) =>
    request<SourceReview>("PATCH", `${at(bid)}/review`, {
      body: { reviewVersion, fields },
    }),
  privacy: (
    bid: string,
    sid: string,
    body: {
      sourceRevision: number;
      sanitizationVersion: number;
      approved: boolean;
      spanIds: string[];
      regions: { page: number; box: number[] }[];
    },
  ) =>
    request<SourceAsset>("PATCH", `${at(bid)}/sources/${sid}/privacy`, {
      body,
    }),
  assign: (
    bid: string,
    source: SourceAsset,
    targetIds: string[],
    common: boolean,
  ) =>
    request<SourceAsset>("PATCH", `${at(bid)}/sources/${source.id}`, {
      body: {
        sourceVersion: source.revision,
        targetIds,
        common,
        originalPhoto: source.originalPhoto,
      },
    }),
  removeSource: (bid: string, source: SourceAsset) =>
    request("DELETE", `${at(bid)}/sources/${source.id}`, {
      query: { version: source.revision },
    }),
  drafts: (bid: string) =>
    request<{ items: SourceDraft[] }>("GET", `${at(bid)}/drafts`),
  saveEditor: (
    bid: string,
    reviewVersion: number,
    fields: SourceField[],
    targets: {
      targetId: string;
      enabledModuleIds: string[];
      hiddenSectionIds?: string[];
    }[],
    key: string,
  ) =>
    request<{ drafts: SourceDraft[] }>("PUT", `${at(bid)}/editor`, {
      body: { reviewVersion, fields, targets },
      idempotencyKey: key,
    }),
  saveDraft: (
    bid: string,
    reviewVersion: number,
    targets: {
      targetId: string;
      enabledModuleIds: string[];
      hiddenSectionIds?: string[];
    }[],
    key: string,
  ) =>
    request<{ drafts: SourceDraft[] }>("POST", `${at(bid)}/drafts`, {
      body: { reviewVersion, targets },
      idempotencyKey: key,
    }),
  deleteDraft: (bid: string, draft: SourceDraft) =>
    request("DELETE", `${at(bid)}/drafts/${draft.id}`, {
      query: { version: draft.version },
    }),
  apply: (
    bid: string,
    draft: SourceDraft,
    productId: string,
    productVersion: number,
    key: string,
  ) =>
    request<{ productId: string; version: number; moduleDetail: ModuleDetail }>(
      "POST",
      `${at(bid)}/drafts/${draft.id}/apply`,
      {
        body: { productId, productVersion, draftVersion: draft.version },
        idempotencyKey: key,
      },
    ),
};
export async function uploadSource(
  bid: string,
  version: number,
  targets: string[],
  common: boolean,
  original: boolean,
  input: File | string,
) {
  if (isMock)
    throw new Error("자료 업로드는 로컬 API 검증 환경에서 사용할 수 있어요.");
  const form = new FormData();
  form.append("batchVersion", String(version));
  targets.forEach((id) => form.append("targetIds", id));
  form.append("common", String(common));
  form.append("originalPhoto", String(original));
  if (typeof input === "string") form.append("text", input);
  else form.append("file", input);
  const res = await fetch(`${apiUrl}${at(bid)}/sources`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken() ?? ""}` },
    body: form,
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body);
  return body as SourceAsset;
}
export async function sourcePageImage(bid: string, sid: string, page: number) {
  const res = await fetch(
    `${apiUrl}${at(bid)}/sources/${sid}/pages/${page}/image`,
    { headers: { Authorization: `Bearer ${getToken() ?? ""}` } },
  );
  if (!res.ok) throw new ApiError(res.status, await res.json());
  return URL.createObjectURL(await res.blob());
}
