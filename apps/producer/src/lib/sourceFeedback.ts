import { ApiError } from "@farmclub/api";

export type SourceActionError = { message: string; canRefresh: boolean };

/** Share the composer's field reason with every source apply/review action. */
export function sourceActionError(error: unknown): SourceActionError {
  if (error instanceof ApiError) {
    const fields = error.details.fields;
    const reason = fields?.representativePhoto || Object.values(fields ?? {}).find(Boolean);
    return {
      message: reason || error.message,
      // Only input validation is fixed by editing; conflicts and failures are worth re-reading.
      canRefresh: !(error.status === 400 && reason),
    };
  }
  // Raw fetch failures (uploads) surface as TypeError; never show the browser's English text.
  if (error instanceof TypeError)
    return { message: "서버에 연결하지 못했어요. 연결을 확인하고 다시 확인해 주세요.", canRefresh: true };
  // Plain Errors are client-side checks written in Korean (e.g. missing variety).
  if (error instanceof Error && error.message)
    return { message: error.message, canRefresh: false };
  return { message: "처리하지 못했어요. 다시 시도해 주세요.", canRefresh: true };
}
