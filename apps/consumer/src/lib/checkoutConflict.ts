// SCR-10 주문서의 409 안내·버튼(FEAT-08 E1·AC-08-8·AC-08-9, DEV-216·DEV-218).
// 문구는 서버 message를 그대로 쓰지 않고 응답 details.reason·details와 다시 읽은 상품 availability로 만든다.
// '바뀐 금액으로 예약하기'는 STAGE_CHANGED이면서 지금 예약 기간이 있을 때만 나온다.
// 날짜·금액 도우미는 화면에서 넘겨받아 이 파일은 순수 함수로 둔다(scripts/test-checkout-conflict.mjs).
import type {
  CurrentStageSnapshot,
  ErrorBody,
  ProductDetail,
  StageSnapshot,
} from "@farmclub/api";

type Details = ErrorBody["details"];
type Fmt = {
  md: (iso: string | null | undefined) => string;
  won: (n: number | null | undefined) => string;
};

/** 주문서가 기억하는 409. EXPIRED는 입금 기한이 지나 SCR-11에서 돌아온 경우(changed=1) */
export type CheckoutConflict = {
  reason: string;
  details: Details;
  /** 409를 받을 때 화면에 있던 합계. STAGE_CHANGED에서 '처음 본 합계'로 취소선 한 줄 */
  firstTotal?: number;
};

/** 안내 안의 글자 버튼(48 영역) */
export type InlineAction = "recheck" | "changeOption" | "changeQuantity";
/** 하단 버튼이 하는 일 */
export type PrimaryAction = "submit" | "backToProduct";

export type ConflictView = {
  title: string;
  body: string;
  inline: { label: string; action: InlineAction } | null;
  primary: { label: string; action: PrimaryAction; enabled: boolean };
  /** 하단 요약을 이 문구로 바꾼다(예약할 수 없을 때) */
  summary: string | null;
  /** 가격이 없으면(지금 예약 기간 없음) 금액 섹션을 숨긴다 */
  hideAmount: boolean;
  /** '처음 본 합계 29,000원'(취소선). STAGE_CHANGED에서만 */
  firstTotal: number | null;
};

type Ctx = {
  product: Pick<
    ProductDetail,
    "options" | "stages" | "currentStageId" | "remainingGrams"
  >;
  optionId: string;
  quantity: number;
};

const KEEP = "입력한 내용은 그대로 두었어요.";
const UNAVAILABLE = "지금은 예약할 수 없어요";

/** 받침 있으면 '은', 없으면 '는'. 한글이 아니면(예: 5kg) '은' */
export function eunNeun(word: string) {
  const c = word.trim().slice(-1).charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 ? "은" : "는";
  return "은";
}

const kg = (grams: number | null | undefined) =>
  grams == null ? "" : `${Number((grams / 1000).toFixed(3))}kg`;

const period = (
  f: Fmt,
  s: { startsAt: string; endsAt: string } | null | undefined,
) => (s ? `${f.md(s.startsAt)}~${f.md(s.endsAt)} ` : "");

/** 지금 기간에 이 옵션이 남았는지 */
const optionLeft = (ctx: Ctx, optionId: string) => {
  const stage = ctx.product.stages.find(
    (s) => s.stageId === ctx.product.currentStageId,
  );
  const v = stage?.options[optionId];
  return !!v && v.quantity - v.reservedCount > 0;
};

const blocked = (
  title: string,
  body: string,
  extra: Partial<ConflictView> = {},
): ConflictView => ({
  title,
  body,
  inline: null,
  primary: { label: "예약하기", action: "submit", enabled: false },
  summary: UNAVAILABLE,
  hideAmount: false,
  firstTotal: null,
  ...extra,
});

const ended = (title: string, body: string): ConflictView =>
  blocked(title, body, {
    primary: {
      label: "상품으로 돌아가기",
      action: "backToProduct",
      enabled: true,
    },
    hideAmount: true,
  });

/** STAGE_CHANGED(지금 기간 있음): 무엇이 바뀌었는지에 따라 제목 셋 */
function stageChanged(
  c: CheckoutConflict,
  ctx: Ctx,
  f: Fmt,
  previous: StageSnapshot,
  current: CurrentStageSnapshot,
): ConflictView {
  const label =
    ctx.product.options.find((o) => o.optionId === ctx.optionId)?.label ?? "";
  const prices = `${f.won(previous.unitPrice)} → ${f.won(current.unitPrice)}`;
  const tail = `${KEEP} 바뀐 금액으로 예약할지 확인해 주세요.`;
  let title: string, change: string;
  if (previous.stageId != null && previous.stageId !== current.stageId) {
    const before = ctx.product.stages.find(
      (s) => s.stageId === previous.stageId,
    );
    title = "예약 기간이 바뀌었어요";
    change = `${period(f, before)}${f.won(previous.unitPrice)} → ${period(f, current)}${f.won(current.unitPrice)}.`;
  } else if (
    previous.unitWeightGrams != null &&
    previous.unitWeightGrams !== current.unitWeightGrams
  ) {
    title = "상자 무게가 바뀌었어요";
    change = `${kg(previous.unitWeightGrams)} → ${kg(current.unitWeightGrams)}, ${prices}.`;
  } else {
    title = "가격이 바뀌었어요";
    change = `${label} 한 상자 ${prices}.`.trim();
  }
  return {
    title,
    body: `${change} ${tail}`,
    inline: null,
    primary: {
      label: "바뀐 금액으로 예약하기",
      action: "submit",
      enabled: true,
    },
    summary: null,
    hideAmount: false,
    firstTotal: c.firstTotal ?? null,
  };
}

/** 409(또는 기한 만료 복귀)를 안내·버튼으로. null이면 안내 없음 */
export function conflictView(
  c: CheckoutConflict | null,
  ctx: Ctx,
  f: Fmt,
): ConflictView | null {
  if (!c) return null;
  const d = c.details;
  const label =
    ctx.product.options.find((o) => o.optionId === ctx.optionId)?.label ?? "";
  switch (c.reason) {
    case "EXPIRED":
      return {
        title: "입금 기한이 지나 예약이 취소됐어요",
        body: "같은 내용으로 다시 예약할 수 있어요.",
        inline: null,
        primary: { label: "다시 예약하기", action: "submit", enabled: true },
        summary: null,
        hideAmount: false,
        firstTotal: null,
      };
    case "STAGE_CHANGED": {
      if (d.current && d.previous)
        return stageChanged(c, ctx, f, d.previous, d.current);
      if (d.current === undefined && !d.previous)
        // 예전 서버(상세 없음): 다시 읽은 상품 값으로 고친 금액을 보이고 다시 묻는다
        return {
          title: "예약 기간 또는 가격이 바뀌었어요",
          body: `${KEEP} 바뀐 금액으로 예약할지 확인해 주세요.`,
          inline: null,
          primary: {
            label: "바뀐 금액으로 예약하기",
            action: "submit",
            enabled: !!ctx.product.currentStageId,
          },
          summary: null,
          hideAmount: false,
          firstTotal: c.firstTotal ?? null,
        };
      return ended(
        "예약 기간이 끝났어요",
        d.nextStageStartsAt
          ? `다음 예약은 ${f.md(d.nextStageStartsAt)}에 열려요. 그때 다시 예약해 주세요.`
          : "이번 예약은 모두 끝났어요.",
      );
    }
    case "SALES_PAUSED":
      return blocked(
        "농가가 잠시 예약을 쉬고 있어요",
        `예약을 다시 열면 이 주문서에서 그대로 예약할 수 있어요. ${KEEP}`,
        { inline: { label: "다시 확인하기", action: "recheck" } },
      );
    case "SOLD_OUT": {
      const others = ctx.product.options.filter(
        (o) => o.optionId !== ctx.optionId && optionLeft(ctx, o.optionId),
      );
      if (!others.length)
        return ended(
          "이번 기간 물량이 다 팔렸어요",
          "다음 예약 기간이 열리면 다시 예약해 주세요.",
        );
      const names = others.map((o) => o.label).join("·");
      return blocked(
        `${label}${eunNeun(label)} 이번 기간 물량이 다 팔렸어요`,
        `${names}${eunNeun(names)} 아직 예약할 수 있어요. ${KEEP}`,
        {
          inline: { label: "옵션 바꾸기", action: "changeOption" },
          summary: "다른 옵션을 고르면 예약할 수 있어요",
        },
      );
    }
    case "TOTAL_LIMIT_REACHED": {
      const weight =
        (ctx.product.options.find((o) => o.optionId === ctx.optionId)
          ?.weightKg ?? 0) * 1000;
      if (
        ctx.quantity > 1 &&
        weight > 0 &&
        ctx.product.remainingGrams >= weight
      )
        return blocked(
          "남은 예약 물량이 부족해요",
          "수량을 줄이면 예약할 수 있어요.",
          {
            inline: { label: "수량 바꾸기", action: "changeQuantity" },
            summary: "수량을 줄이면 예약할 수 있어요",
          },
        );
      return ended("예약 물량이 다 찼어요", "이번 예약은 모두 끝났어요.");
    }
    case "QUANTITY_LIMIT":
      return blocked(
        `한 번에 최대 ${typeof d.maxQuantity === "number" ? d.maxQuantity : ""}개까지 예약할 수 있어요`,
        KEEP,
        {
          inline: { label: "수량 바꾸기", action: "changeQuantity" },
          summary: "수량을 바꾸면 예약할 수 있어요",
        },
      );
    case "NO_FARM_ACCOUNT":
      return blocked(
        "농가가 아직 입금 계좌를 등록하지 않았어요",
        "등록되면 이 주문서에서 그대로 예약할 수 있어요.",
        { inline: { label: "다시 확인하기", action: "recheck" } },
      );
    default:
      return {
        title: "예약하지 못했어요",
        body: `${KEEP} 다시 시도해 주세요.`,
        inline: null,
        primary: { label: "예약하기", action: "submit", enabled: true },
        summary: null,
        hideAmount: false,
        firstTotal: null,
      };
  }
}

/** 옵션·수량을 바꾸면 사라지는 안내(바꾸면 다시 예약할 수 있다) */
export const clearsOnSelection = (c: CheckoutConflict | null) =>
  !!c &&
  ["SOLD_OUT", "TOTAL_LIMIT_REACHED", "QUANTITY_LIMIT"].includes(c.reason);

/**
 * 409 없이 상품만 보고 예약할 수 없는 이유(availability). 서버 soldOut은 판매 중지·전체 소진을 보지 않아
 * (DEV-215 전) 앱은 availability로 판단한다. AVAILABLE이면 null
 */
export function availabilityConflict(
  p: Pick<ProductDetail, "availability" | "nextStageStartsAt">,
): CheckoutConflict | null {
  switch (p.availability) {
    case "AVAILABLE":
      return null;
    case "PAUSED":
      return { reason: "SALES_PAUSED", details: { reason: "SALES_PAUSED" } };
    case "TOTAL_SOLD_OUT":
      return {
        reason: "TOTAL_LIMIT_REACHED",
        details: { reason: "TOTAL_LIMIT_REACHED" },
      };
    case "PERIOD_SOLD_OUT":
      return { reason: "SOLD_OUT", details: { reason: "SOLD_OUT" } };
    default:
      // ENDED·NOT_OPEN: 지금 예약 기간이 없다
      return {
        reason: "STAGE_CHANGED",
        details: {
          reason: "STAGE_CHANGED",
          previous: { stageId: null, unitPrice: null, unitWeightGrams: null },
          current: null,
          nextStageStartsAt: p.nextStageStartsAt ?? null,
        },
      };
  }
}

/** 주문서가 지금 보고 있는 값(주문 생성 본문의 expected 3개) */
export function seenValues(
  p: Pick<ProductDetail, "options" | "stages" | "currentStageId">,
  optionId: string,
): StageSnapshot | null {
  const stage = p.stages.find((s) => s.stageId === p.currentStageId);
  const opt = p.options.find((o) => o.optionId === optionId);
  const price = stage?.options[optionId]?.price;
  if (!stage || !opt || price == null) return null;
  return {
    stageId: stage.stageId,
    unitPrice: price,
    unitWeightGrams: Math.round(opt.weightKg * 1000),
  };
}

/**
 * '다시 확인하기' 뒤: 예약할 수 있게 됐지만 처음 보낸 값과 지금 값이 다르면 STAGE_CHANGED 안내로 바꾼다
 * (보드 화면 2 무브 4). 같으면 null(안내를 지운다)
 */
export function recheckedConflict(
  sent: StageSnapshot | null,
  p: Pick<ProductDetail, "options" | "stages" | "currentStageId">,
  optionId: string,
  firstTotal?: number,
): CheckoutConflict | null {
  const now = seenValues(p, optionId);
  const stage = p.stages.find((s) => s.stageId === p.currentStageId);
  if (!sent || !now || !stage) return null;
  const same =
    sent.stageId === now.stageId &&
    sent.unitPrice === now.unitPrice &&
    sent.unitWeightGrams === now.unitWeightGrams;
  if (same) return null;
  return {
    reason: "STAGE_CHANGED",
    details: {
      reason: "STAGE_CHANGED",
      optionId,
      previous: sent,
      current: { ...now, startsAt: stage.startsAt, endsAt: stage.endsAt },
      nextStageStartsAt: null,
    },
    firstTotal,
  };
}

/**
 * 같은 멱등 키에 다른 내용(409 IDEMPOTENCY_MISMATCH)이 왔을 때 할 일(FEAT-08 E2, DEV-291).
 * 입금 안내에서 뒤로 와 옵션·수량을 바꿔 다시 내면 이렇게 된다. 이때 새 키로 다시 보내면 두 번째 주문이 생기고
 * 첫 주문은 입금 대기로 24시간 물량을 잡는다. 그래서 이 주문서로 만든 주문이 있으면 다시 보내지 않고 그 주문을 알린다.
 * 만든 주문이 없을 때(앱 버그)만 새 키로 한 번 다시 보낸다.
 */
export function mismatchStep(
  placedOrderId: string | null,
  retried: boolean,
): "showPlaced" | "retry" | "fail" {
  if (placedOrderId) return "showPlaced";
  return retried ? "fail" : "retry";
}
