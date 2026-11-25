// 자료 작업(batch) 화면 공용 도우미. 예전 2탭 자료 작업 화면(SourceWorkspace)을 지우며(DEV-361 PR C)
// composer가 쓰던 것만 옮겼다.
import type { SourceBatch, SourceDraft, SourceReview, SourceRun } from "@farmclub/api";
import { tokens } from "@farmclub/ui";

export const panel = {
  padding: 16,
  gap: 12,
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: 16,
};
export const ACTIVE = ["QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW"];
export const states: Record<string, string> = {
  QUEUED: "대기",
  PREPARING: "자료 읽는 중",
  ANALYZING: "분석 중",
  PRIVACY_REVIEW: "개인정보 확인 필요",
  SUCCEEDED: "완료",
  PARTIAL: "일부 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  UPLOADED: "업로드됨",
  PREPARED: "자료 준비됨",
  RUNNING: "처리 중",
};

/** 마지막 분석이 현재 첨부와 맞고 편집할 내용이 있으면 상세 편집을 연다. */
export function canEditBatch(
  batch: SourceBatch | null,
  runs: SourceRun[],
  drafts: SourceDraft[],
  review: SourceReview | null,
  activeRun: SourceRun | undefined,
) {
  return (
    !!batch &&
    !activeRun &&
    (!!drafts.length ||
      (!!runs[0] &&
        (!runs[0].inputs?.length ||
          (runs[0].inputs.length === batch.sources.length &&
            runs[0].inputs.every((i) =>
              batch.sources.some(
                (s) =>
                  s.id === i.id &&
                  s.revision === i.revision &&
                  (s.description || "") === i.description,
              ),
            ))) &&
        (["SUCCEEDED", "PARTIAL"].includes(runs[0].status) ||
          (runs[0].status === "FAILED" &&
            batch.sources.some(
              (s) => s.originalPhoto && s.status === "PREPARED",
            ))) &&
        batch.sources
          .filter((s) => !s.originalPhoto)
          .every((s) =>
            runs[0].items.some(
              (i) => i.assetId === s.id && i.revision === s.revision,
            ),
          ) &&
        (batch.sources.some(
          (s) => s.originalPhoto && s.status === "PREPARED",
        ) ||
          !!review?.editorFields?.some(
            (e) =>
              (e.status === "conflict" || (e.status === "ready" &&
              (e.field.value || e.field.photoAssetIds.length))),
          ))))
  );
}

/** 파일마다 분석 안내(읽지 못한 쪽, 건너뛴 쪽, 비어 있는 이유). 예전 2탭 화면에서 옮겨 composer AI 시트가 쓴다(DEV-361 PR C) */
export function sourceNotices(item: SourceRun["items"][number]): string[] {
  const notes: string[] = [];
  const pages = (numbers?: number[]) => numbers?.length
    ? ` 확인할 쪽: ${numbers.join(", ")}쪽.` : "";
  if (item.status === "PARTIAL" && (item.pagesFailed ?? 0) > 0) {
    notes.push(`${item.pagesFailed}쪽을 읽지 못했어요.${pages(item.ocrFailedPageNumbers)} 다시 분석해 보세요.`);
  }
  if (item.status === "PARTIAL" && (item.chunksFailed ?? 0) > 0) {
    notes.push(`일부 내용을 읽지 못했어요.${pages(item.chunkFailedPageNumbers)} 다시 분석해 보세요.`);
  }
  if ((item.pagesSkipped ?? 0) > 0) {
    notes.push(
      `앞 ${item.pagesAnalysed}쪽만 분석했어요. 나머지 ${item.pagesSkipped}쪽은 필요하면 나눠서 올려 주세요.`,
    );
  }
  if (item.emptyReason && !item.error) {
    const messages: Record<string, string> = {
      NO_CANDIDATES: "추출할 내용을 찾지 못했어요. 원문을 확인해 주세요.",
      NO_SAFE_TEXT: "분석할 텍스트가 없어요. 자료 내용을 확인해 주세요.",
      NO_TARGET_CANDIDATES:
        "이 상품에 연결된 내용을 찾지 못했어요. 상품 연결을 확인해 주세요.",
      ALL_TEXTS_FILTERED:
        "상세에 넣을 수 있는 문구가 남지 않았어요. 원문을 확인해 주세요.",
      REFINE_INPUT_LIMIT:
        "내용이 많아 문구를 정리하지 못했어요. 자료를 나눠서 올려 주세요.",
    };
    notes.push(
      messages[item.emptyReason] ??
        "추출할 내용을 찾지 못했어요. 원문을 확인해 주세요.",
    );
  }
  if ((item.candidatesSkipped ?? 0) > 0) {
    notes.push(
      `내용이 많아 후보 ${item.candidatesSkipped}개는 문구 정리에서 생략했어요. 원문을 확인해 주세요.`,
    );
  }
  return notes;
}

export function sourceError(code: string, phase?: string, rejectedCount = 0) {
  if (phase === "REFINE") {
    const messages: Record<string, string> = {
      SOURCE_CHANGED:
        "자료가 바뀌어 문구 정리를 사용하지 않았어요. 다시 분석해 주세요.",
      PRIVACY_CHANGED:
        "가림 내용이 바뀌어 문구 정리를 사용하지 않았어요. 확인 후 다시 분석해 주세요.",
      PROMPT_CHANGED: "문구 정리 방식이 바뀌었어요. 다시 분석해 주세요.",
      INVALID_MODEL_OUTPUT:
        "문구 정리 결과를 읽지 못해 원문 그대로 보여 드려요.",
      INCOMPLETE_OR_REFUSED:
        "문구 정리를 마치지 못해 원문 그대로 보여 드려요.",
      REQUEST_UNCERTAIN:
        "문구 정리 요청의 완료 여부를 확인하지 못해 원문 그대로 보여 드려요.",
      PROVIDER_REJECTED:
        "문구 정리 요청이 거절되어 원문 그대로 보여 드려요.",
      PROVIDER_AUTH:
        "AI 연결 설정에 문제가 있어 문구 정리 대신 원문 그대로 보여 드려요. 운영팀에 알려 주세요.",
    };
    return messages[code] ?? "문구 정리에 실패해서 원문 그대로 보여 드려요.";
  }
  const messages: Record<string, string> = {
    PROVIDER_AUTH: "AI 연결 설정에 문제가 있어요. 운영팀에 알려 주세요.",
    BUDGET_EXCEEDED:
      "자료 분석 예산 한도에 도달했어요. 담당자에게 확인해 주세요.",
    INVALID_EVIDENCE:
      "자료에서 근거를 확인하지 못했어요. 선명한 자료를 넣거나 직접 내용을 확인해 주세요.",
    CANDIDATES_REJECTED:
      rejectedCount > 0
        ? `근거를 확인하지 못한 후보 ${rejectedCount}개는 제외했어요. 원문을 확인해 주세요.`
        : "근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.",
    REQUEST_UNCERTAIN: "분석 요청의 완료 여부를 확인하지 못했어요.",
    UNSUPPORTED_NUMBER: "자료에 없는 수치가 포함되어 결과를 사용하지 않았어요.",
    UNSUPPORTED_PIECE_COUNT: "상품 개수의 근거를 확인하지 못했어요.",
    PRIVACY_CHANGED: "가림 내용이 바뀌었어요. 다시 확인한 후 분석해 주세요.",
    UNKNOWN_MOCK_SOURCE: "테스트 환경에서 지원하지 않는 자료예요.",
  };
  return (
    messages[code] ??
    "자료를 처리하지 못했어요. 내용을 확인한 후 다시 시도해 주세요."
  );
}


/** Authoritative unresolved work; optional for older servers. */
export function processingIssues(review: SourceReview | null, targetId?: string) {
  return (review?.processingIssues ?? []).filter((i) => !targetId || i.targetIds.includes(targetId));
}

export function readingRetryItems(run: SourceRun, unresolvedIds?: string[]) {
  const permanent = new Set(["PROVIDER_AUTH", "BUDGET_EXCEEDED", "UNSUPPORTED_MODEL", "UNSUPPORTED_TYPE", "UNSUPPORTED_FILE", "INVALID_IMAGE", "INVALID_OR_ENCRYPTED_PDF", "INVALID_TEXT", "INVALID_UTF8", "IMAGE_LIMIT", "PDF_PAGE_LIMIT", "TEXT_LIMIT", "OCR_NOT_CONFIGURED", "OCR_MODEL_MISMATCH", "IMAGE_PRIVACY_NOT_CONFIGURED", "OCR_IMAGE_LIMIT", "OCR_TEXT_LIMIT", "PAGE_IMAGE_MISSING", "PRIVACY_CHANGED", "SOURCE_CHANGED"]);
  return run.items.filter((i) => ["PREPARE", "EXTRACT"].includes(i.phase) &&
    ["FAILED", "PARTIAL"].includes(i.status) && (!unresolvedIds || unresolvedIds.includes(i.id)) &&
    !permanent.has(i.error ?? "") && !(i.pagesSkipped ?? 0));
}
