// DEV-312 생산자 PostHog 이벤트 속성을 만드는 순수 함수(N-05, 트래킹 플랜 docs/spec/tech-design/README.md).
// 화면 글자·서버 메시지·사유는 받지 않거나 enum으로 바꿔서만 내보낸다. scripts/test-producer-events.mjs가 검사한다.
import type {
  DraftResult,
  FormErrorCode,
  ReplyKind,
} from "@farmclub/analytics";

/** AI 채우기 실행 상태 → `draft_created.result`. 아직 진행 중(개인정보 확인 대기 포함)이면 null */
export function draftResult(status: string): DraftResult | null {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "PARTIAL":
      return "partial";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "canceled";
    default:
      return null;
  }
}

/** SourceBasicInfo가 품종이 비었을 때 던지는 안내. 오류 코드를 정하려고 여기 한 곳에 둔다 */
export const VARIETY_REQUIRED_MESSAGE = "과일 품종명을 입력해 주세요.";

type ErrorLike = {
  details?: { fields?: Record<string, unknown> | null; reason?: unknown } | null;
  message?: unknown;
};

/** 새 상품 화면(NewProductComposer)에서 생산자에게 보인 오류 → 코드. 서버 칸 이름만 보고 글자는 내보내지 않는다 */
export function composerErrorCode(error: unknown): FormErrorCode {
  const e = (error ?? {}) as ErrorLike;
  const fields = Object.keys(e.details?.fields ?? {});
  if (fields.includes("representativePhoto")) return "photo_required";
  if (fields.includes("variety")) return "variety_required";
  // SourceBasicInfo의 화면 검사(서버에 보내기 전). 같은 상수를 쓴다
  if (e.message === VARIETY_REQUIRED_MESSAGE) return "variety_required";
  return "other";
}

/** 판매·가격 화면의 칸 묶음(sell.tsx check()의 키) → 코드 */
const GROUP_CODES: Record<string, FormErrorCode> = {
  options: "options_invalid",
  delivery: "delivery_invalid",
  prices: "prices_invalid",
  shipping: "shipping_invalid",
  quantity: "quantity_invalid",
};
export function sellErrorCode(key: string | null | undefined): FormErrorCode {
  return key && Object.hasOwn(GROUP_CODES, key) ? GROUP_CODES[key] : "other";
}

/** 서버 검증 오류의 칸 이름 → 판매·가격 칸 묶음. sell.tsx failure()가 칸 강조에 같은 표를 쓴다 */
export const SELL_FIELD_GROUPS: Record<string, string> = {
  options: "options",
  deliveryWindow: "delivery",
  maxDelayUntil: "delivery",
  shippingFee: "shipping",
  remoteAreaFee: "shipping",
  maxQuantityPerOrder: "quantity",
  requestedTotalGrams: "quantity",
  stages: "prices",
};

/**
 * 서버 오류 → 코드(판매·가격, 물량 신청, 상품 편집). 칸 이름과 사유 코드만 보고 메시지 글자는 쓰지 않는다.
 * 입금 계좌가 없으면 판매 요청이 막힌다(NO_FARM_ACCOUNT).
 */
export function serverErrorCode(error: unknown): FormErrorCode {
  const e = (error ?? {}) as ErrorLike;
  if (e.details?.reason === "NO_FARM_ACCOUNT") return "deposit_account_required";
  if (isFixableConflict(error)) return "quantity_invalid";
  const fields = Object.keys(e.details?.fields ?? {});
  if (fields.includes("variety")) return "variety_required";
  for (const f of fields)
    if (Object.hasOwn(SELL_FIELD_GROUPS, f)) return sellErrorCode(SELL_FIELD_GROUPS[f]);
  return "other";
}

type QuotedMessage = { senderType: string; checkState?: string | null; createdAt?: string };
type OpenEscalation = {
  status: string;
  reportedMessageId?: string | null;
  createdAt?: string;
};

/**
 * 생산자 답장의 종류(`producer_reply_sent.kind`). 서버(`server/app/messaging/service.py` `_producer_reply`)는
 * 인용한 메시지로만 전달을 닫는다: 인용한 소비자 질문의 전달(thread_message_id)을 답하고, 확인 요청된 AI 답변을
 * 인용하면 바로잡음(CORRECTED)으로 닫는다. 인용이 없으면 아무것도 닫지 않는다.
 * 화면의 전달 목록에는 질문 메시지 ID가 없어, 서버가 전달할 때 질문과 전달을 같은 시각으로 저장하는 점으로 맞춘다.
 */
export function replyKind(
  quoted: QuotedMessage | null | undefined,
  escalations: readonly OpenEscalation[] | null | undefined,
): ReplyKind {
  if (!quoted) return "plain";
  if (quoted.senderType === "AI" && quoted.checkState === "REQUESTED")
    return "check_corrected";
  if (
    quoted.senderType === "CONSUMER" &&
    !!quoted.createdAt &&
    (escalations ?? []).some(
      (e) =>
        e.status === "OPEN" &&
        !e.reportedMessageId &&
        e.createdAt === quoted.createdAt,
    )
  )
    return "forwarded";
  return "plain";
}

/**
 * 화면에 안내가 보이지만 입력 문제가 아닌 실패(연결 끊김·서버 오류·이미 바뀐 상태 409)인지.
 * 생산자가 고칠 수 있는 409(`isFixableConflict`: 판매 한도 거절, 입금 계좌 없음)는 false.
 * 이런 실패는 `form_error_shown`으로 세지 않는다(오류 안내 지표는 생산자가 고칠 수 있는 안내만).
 */
export function isServerTrouble(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== "number") return error instanceof TypeError;
  if (isFixableConflict(error)) return false;
  return status === 0 || status === 409 || status >= 500;
}

/**
 * 409이지만 생산자가 고치면 되는 거절(server/app/catalog/service.py): 판매 한도가 승인 물량을 넘음 ·
 * 이미 예약·출하한 물량보다 작음 · 입금 계좌가 없어 판매 요청이 막힘. 오류 안내로 센다.
 */
const FIXABLE_CONFLICTS = ["APPROVED_CAP_EXCEEDED", "CAP_BELOW_COMMITTED", "NO_FARM_ACCOUNT"];
function isFixableConflict(error: unknown): boolean {
  const reason = (error as ErrorLike | null)?.details?.reason;
  return typeof reason === "string" && FIXABLE_CONFLICTS.includes(reason);
}
