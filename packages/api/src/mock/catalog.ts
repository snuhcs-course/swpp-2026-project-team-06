import { salesState, validatePeriods } from "./sales";
import { db, TODAY } from "./db";
// /api/products Mock (FEAT-03 AI 초안, 04 상품 편집, 05 단계·가격·물량, 07 상품 상세)
import type {
  Draft,
  DraftFields,
  MyProduct,
  MyProductCard,
  ProductPatch,
  Stage,
  StageInput,
  StagePreset,
} from "../types";
import { nextId, nowIso, type ProductRec } from "./db";
import { currentStage, productDetail } from "./derive";
import type { Ctx } from "./router";
import {
  conflict,
  idempotent,
  fail,
  invalid,
  notFound,
  paginate,
  register,
} from "./router";

export function myProductRec(ctx: Ctx): ProductRec {
  const u = ctx.me();
  const p = ctx.db.products[ctx.params.productId];
  if (!p || p.farmId !== u.farmId) notFound("찾을 수 없는 상품이에요.");
  return p;
}

export function missing(p: ProductRec): string[] {
  const m: string[] = [];
  if (!p.name.trim()) m.push("상품명");
  if (!p.variety.trim()) m.push("품종");
  if (!p.info.origin.trim()) m.push("원산지");
  if (!p.info.storage.trim()) m.push("보관 방법");
  if (!p.options.length) m.push("중량 옵션");
  if (!p.deliveryWindow) m.push("받는 시기");
  if (!p.maxDelayUntil) m.push("최대 지연 기한");
  if (
    !p.stages.length ||
    p.stages.some((s) => p.options.some((o) => !s.options[o.optionId]?.price))
  )
    m.push("예약 기간·가격");
  return m;
}

export function editable(p: ProductRec) {
  if (p.status === "PENDING_APPROVAL" || p.status === "CLOSED")
    conflict(
      "INVALID_TRANSITION",
      "심사 중에는 신청을 철회한 뒤 수정해 주세요. 종료 상품은 수정할 수 없어요.",
    );
}

function myProduct(p: ProductRec): MyProduct {
  return {
    ...salesState(db(), p),
    productId: p.productId,
    name: p.name,
    farmId: p.farmId,
    photo: p.photos[0] ?? null,
    photos: p.photos,
    expectedBrix: p.expectedBrix,
    variety: p.variety,
    description: p.description,
    grade: p.grade,
    measuredBrix: p.measuredBrix,
    measuredBrixAt: p.measuredBrixAt,
    options: p.options,
    stages: p.stages,
    shippingFeeType: p.shippingFeeType,
    shippingFee: p.shippingFee,
    remoteAreaFee: p.remoteAreaFee,
    maxQuantityPerOrder: p.maxQuantityPerOrder,
    deliveryWindow: p.deliveryWindow,
    maxDelayUntil: p.maxDelayUntil,
    info: p.info,
    status: p.status,
    rejectReason: p.rejectReason,
    pendingCapacityRequest:
      db().capacityRequests.find(
        (r) => r.productId === p.productId && r.status === "PENDING",
      ) ?? null,
    missingFields: missing(p),
    reservedCount: p.reservedCount,
  };
}

const ORDER: Record<string, number> = {
  REJECTED: 0,
  PENDING_APPROVAL: 1,
  PUBLISHED: 2,
  DRAFT: 3,
  CLOSED: 4,
};

/* ---- 가짜 AI 초안: 붙여넣은 글에서 이름·무게·당도·품종을 뽑는다(가격은 채우지 않음, AC-03-2) ---- */
function extract(text: string): { fields: DraftFields; price: string | null } {
  const t = text.replace(/\r/g, "");
  const weights = Array.from(
    new Set(
      Array.from(t.matchAll(/(\d{1,2})\s*(?:키로|킬로|kg|KG|㎏)/g)).map(
        (m) => `${m[1]}kg`,
      ),
    ),
  );
  const brix = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:브릭스|brix|Brix|BRIX)/);
  const varieties = [
    "궁천조생",
    "온주밀감",
    "레드향",
    "천혜향",
    "한라봉",
    "황금향",
    "청견",
    "조생",
    "카라향",
  ];
  const variety = varieties.find((v) => t.includes(v)) ?? null;
  const kind = t.includes("하우스")
    ? "하우스 감귤"
    : t.includes("노지")
      ? "노지 감귤"
      : (variety ?? (t.includes("감귤") || t.includes("귤") ? "감귤" : null));
  const name = kind
    ? `${kind}${weights.length ? ` ${weights.join(" / ")}` : ""}`
    : null;
  const priceMatch = t.match(
    /(\d+(?:\.\d+)?\s*만\s*원|\d{1,3}(?:,\d{3})+\s*원|\d{4,6}\s*원)/,
  );
  const when = t.match(
    /(\d{1,2}월\s*(?:초|중순|말|\d{1,2}일)?)[^\n]*(?:보내|출하|배송|받)/,
  );
  const grade = t.match(/(특|상|중)\s*(?:품|등급)/);
  const firstLine = t
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const fields: DraftFields = {
    name,
    variety,
    options: weights.length ? weights : null,
    expectedBrix: brix ? Number(brix[1]) : null,
    grade: grade ? grade[1] : null,
    deliveryWindow: when ? when[1].replace(/\s+/g, " ") : null,
    description: kind
      ? `${kind}${variety && variety !== kind ? `(${variety})` : ""}이에요. ${firstLine.slice(1, 3).join(" ").slice(0, 80)}`.trim()
      : null,
  };
  return {
    fields,
    price: priceMatch ? priceMatch[1].replace(/\s+/g, "") : null,
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

register({
  "GET /api/products/stage-presets": (): StagePreset[] => [
    { presetId: "three", label: "3단계 기본", stageCount: 3, stepPrice: 4000 },
    { presetId: "two", label: "2단계", stageCount: 2, stepPrice: 4000 },
    { presetId: "custom", label: "직접", stageCount: 1, stepPrice: 0 },
  ],

  "GET /api/products/mine": (ctx) => {
    const u = ctx.me();
    if (!u.farmId) fail(403, "FORBIDDEN", "생산자만 볼 수 있어요.");
    const list: MyProductCard[] = Object.values(ctx.db.products)
      .filter(
        (p) =>
          p.farmId === u.farmId &&
          (!ctx.query.status || p.status === ctx.query.status),
      )
      .sort(
        (a, b) =>
          ORDER[a.status] - ORDER[b.status] ||
          b.updatedAt.localeCompare(a.updatedAt),
      )
      .map((p) => ({
        ...salesState(ctx.db, p),
        productId: p.productId,
        name: p.name,
        photo: p.photos[0] ?? null,
        status: p.status,
        rejectReason: p.rejectReason,
        pendingCapacityRequest:
          db().capacityRequests.find(
            (r) => r.productId === p.productId && r.status === "PENDING",
          ) ?? null,
        reservedCount: p.reservedCount,
        currentStageLabel: (() => {
          const s = currentStage(p);
          return s ? `${s.startsAt} ~ ${s.endsAt}` : null;
        })(),
        updatedAt: p.updatedAt,
      }));
    return paginate(list, ctx.query);
  },

  "GET /api/products/mine/:productId": (ctx) => myProduct(myProductRec(ctx)),

  "POST /api/products/drafts": (ctx): Draft => {
    ctx.me();
    const inputText = String(ctx.body.inputText ?? "");
    if (!inputText.trim()) invalid({ inputText: "문구를 붙여넣어 주세요" });
    if (inputText.length > 3000)
      invalid({ inputText: "3,000자까지 넣을 수 있어요" });
    const { fields, price } = extract(inputText);
    const found = Object.values(fields).filter((v) => v !== null).length;
    const failed = found === 0; // 뽑을 게 없으면 AI 실패로 처리(N-04 대체 동작)
    const missingFields = (Object.keys(fields) as (keyof DraftFields)[]).filter(
      (k) => fields[k] === null,
    );
    const draft: Draft = {
      draftId: nextId("d"),
      inputText,
      extracted: failed
        ? {
            name: null,
            variety: null,
            options: null,
            expectedBrix: null,
            grade: null,
            deliveryWindow: null,
            description: null,
          }
        : fields,
      missingFields: failed
        ? (Object.keys(fields) as (keyof DraftFields)[])
        : missingFields,
      failed,
      priceMentioned: price,
    };
    ctx.db.drafts[draft.draftId] = draft;
    return draft;
  },

  "POST /api/products": (ctx) => {
    const u = ctx.me();
    if (!u.farmId) fail(403, "FORBIDDEN", "생산자만 만들 수 있어요.");
    const draft = ctx.body.draftId
      ? ctx.db.drafts[String(ctx.body.draftId)]
      : null;
    const x = draft && !draft.failed ? draft.extracted : null;
    const f = ctx.db.farms[u.farmId];
    const p: ProductRec = {
      productId: nextId("p"),
      farmId: u.farmId,
      name: x?.name ?? "",
      variety: x?.variety ?? "",
      description: x?.description ?? "",
      photos: [],
      grade: x?.grade ?? null,
      expectedBrix: x?.expectedBrix ?? null,
      measuredBrix: null,
      measuredBrixAt: null,
      brixRecordCount: 0,
      farmerNote: "",
      options: (x?.options ?? []).map((label) => ({
        optionId: `opt-${label.replace("kg", "")}`,
        label,
        weightKg: Number(label.replace("kg", "")),
      })),
      stages: [],
      approvedSupplyGrams: 0,
      salesLimitGrams: 0,
      salesPaused: false,
      version: 1,
      shippingFeeType: "FREE",
      shippingFee: 0,
      remoteAreaFee: 3000,
      maxQuantityPerOrder: 3,
      deliveryWindow: null,
      maxDelayUntil: null,
      info: {
        origin: f.region,
        producer: f.name,
        size: (x?.options ?? []).join(" / "),
        packedAt: "출하 당일",
        storage: "서늘하고 통풍되는 곳",
        contact: "farmclub 고객센터",
      },
      status: "DRAFT",
      rejectReason: null,
      reservedCount: 0,
      updatedAt: nowIso(),
    };
    ctx.db.products[p.productId] = p;
    return myProduct(p);
  },

  "PATCH /api/products/:productId": (ctx) => {
    const p = myProductRec(ctx);
    return idempotent(ctx, `product:${p.productId}`, () => {
      const b = ctx.body as ProductPatch;
      if (b.version !== p.version)
        conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.");
      editable(p);
      if (
        b.deliveryWindow &&
        (!DATE.test(b.deliveryWindow.start) ||
          !DATE.test(b.deliveryWindow.end) ||
          b.deliveryWindow.start > b.deliveryWindow.end)
      )
        invalid({ deliveryWindow: "받는 시기를 날짜로 정해 주세요" });
      if (b.options) {
        if (
          !Array.isArray(b.options) ||
          new Set(b.options.map((o) => o.optionId)).size !== b.options.length ||
          b.options.some(
            (o) =>
              !o.optionId ||
              !o.label?.trim() ||
              !/^\d+(?:\.\d{1,3})?$/.test(String(o.weightKg)) ||
              !Number.isSafeInteger(Math.round(o.weightKg * 1000)) ||
              o.weightKg <= 0,
          )
        )
          invalid({
            options:
              "중복 없는 옵션과 소수 셋째 자리 이내의 kg을 입력해 주세요",
          });
        for (const o of Object.values(ctx.db.orders).filter(
          (o) => o.productId === p.productId && o.paidAt,
        )) {
          const opt = b.options.find((v) => v.optionId === o.optionId);
          if (!opt || Math.round(opt.weightKg * 1000) !== o.unitWeightGrams)
            conflict(
              "PERIOD_LOCKED",
              "주문에 연결된 옵션의 삭제·중량 변경은 할 수 없어요.",
            );
        }
      }
      const next = structuredClone(p);
      for (const k of [
        "name",
        "variety",
        "description",
        "grade",
        "expectedBrix",
        "measuredBrix",
        "options",
        "deliveryWindow",
        "maxDelayUntil",
        "shippingFeeType",
        "shippingFee",
        "remoteAreaFee",
        "photos",
      ] as const)
        if (k in b) Object.assign(next, { [k]: b[k] });
      if (b.info) next.info = { ...next.info, ...b.info };
      for (const k of ["shippingFee", "remoteAreaFee"] as const)
        if (!Number.isSafeInteger(next[k]) || next[k] < 0)
          invalid({ [k]: "0 이상의 정수로 입력해 주세요" });
      if (next.status === "PUBLISHED") {
        const fields = missing(next);
        if (fields.length)
          invalid(
            Object.fromEntries(fields.map((f) => [f, "필수 항목이에요"])),
          );
        validatePeriods(ctx.db, next, next.stages);
      }
      if (
        b.deliveryWindow &&
        JSON.stringify(b.deliveryWindow) !== JSON.stringify(p.deliveryWindow)
      ) {
        for (const order of Object.values(ctx.db.orders)) {
          if (
            order.productId === p.productId &&
            ["RESERVED", "PREPARING"].includes(order.status)
          )
            order.proposedDeliveryWindow = { ...b.deliveryWindow };
        }
      }
      next.version++;
      next.updatedAt = nowIso();
      if (next.status === "REJECTED") next.status = "DRAFT";
      Object.assign(p, next);
      return myProduct(p);
    });
  },

  "PUT /api/products/:productId/sales-settings": (ctx) => {
    const p = myProductRec(ctx);
    return idempotent(ctx, `sales:${p.productId}`, () => {
      const b = ctx.body,
        state = salesState(ctx.db, p);
      if (b.version !== p.version)
        conflict("STALE_VERSION", "최신 판매 설정을 불러와 주세요.");
      editable(p);
      if (
        !Number.isSafeInteger(b.salesLimitGrams) ||
        Number(b.salesLimitGrams) < 0
      )
        invalid({ salesLimitGrams: "0 이상의 중량을 입력해 주세요" });
      if (
        !Number.isSafeInteger(b.maxQuantityPerOrder) ||
        Number(b.maxQuantityPerOrder) < 1
      )
        invalid({ maxQuantityPerOrder: "1 이상의 정수로 입력해 주세요" });
      if (typeof b.salesPaused !== "boolean")
        invalid({ salesPaused: "판매 상태를 확인해 주세요" });
      if (Number(b.salesLimitGrams) > p.approvedSupplyGrams)
        conflict(
          "APPROVED_CAP_EXCEEDED",
          "승인 물량을 넘어요. 물량 추가를 신청해 주세요.",
        );
      if (Number(b.salesLimitGrams) < state.reservedGrams + state.shippedGrams)
        conflict("CAP_BELOW_COMMITTED", "예약·출하된 물량보다 줄일 수 없어요.");
      if (b.salesPaused !== p.salesPaused) {
        if (p.status !== "PUBLISHED")
          conflict(
            "INVALID_TRANSITION",
            "승인된 상품에서만 중지·재개할 수 있어요.",
          );
        const left =
          Number(b.salesLimitGrams) - state.reservedGrams - state.shippedGrams;
        if (
          !b.salesPaused &&
          !p.stages.some(
            (s) =>
              s.endsAt >= TODAY &&
              p.options.some(
                (o) =>
                  Math.round(o.weightKg * 1000) <= left &&
                  s.options[o.optionId]?.quantity >
                    s.options[o.optionId]?.reservedCount,
              ),
          )
        )
          conflict(
            "NOT_RESUMABLE",
            "판매 가능한 기간과 물량을 먼저 확인해 주세요.",
          );
      }
      p.salesLimitGrams = Number(b.salesLimitGrams);
      p.maxQuantityPerOrder = Number(b.maxQuantityPerOrder);
      p.salesPaused = b.salesPaused;
      p.version++;
      p.updatedAt = nowIso();
      return {
        productId: p.productId,
        maxQuantityPerOrder: p.maxQuantityPerOrder,
        ...salesState(ctx.db, p),
      };
    });
  },
  "PUT /api/products/:productId/stages": (ctx) => {
    const p = myProductRec(ctx);
    return idempotent(ctx, `stages:${p.productId}`, () => {
      if (ctx.body.version !== p.version)
        conflict("STALE_VERSION", "최신 상품을 다시 불러와 주세요.");
      editable(p);
      const stages = validatePeriods(
        ctx.db,
        p,
        ctx.body.stages as StageInput[],
      );
      p.stages = stages;
      p.version++;
      p.updatedAt = nowIso();
      return {
        version: p.version,
        stages: p.stages,
      };
    });
  },

  "GET /api/products/:productId": (ctx) => {
    const p = ctx.db.products[ctx.params.productId];
    if (
      !p ||
      p.status !== "PUBLISHED" ||
      ctx.db.farms[p.farmId]?.status !== "APPROVED"
    )
      notFound("판매 중이 아닌 상품이에요.");
    return productDetail(ctx.db, p, ctx.user?.userId ?? null);
  },
});
