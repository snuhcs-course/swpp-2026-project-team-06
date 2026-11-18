// DEV-361 상품 초안 Mock: 판매 중·승인 대기 상품의 상품 칸·판매 조건은 '상품에 반영'(apply-all) 전까지
// 비공개다. 서버 app/source_analysis/product_draft.py와 같은 규칙(칸별 기준값 충돌, R-18·R-21·R-25)을
// 따르되 판매페이지(composer batch) 초안은 Mock에 없어 page 반영은 받지 않는다. 서버와 다른 점: 초안 버전은
// workspace version이 아니라 상품마다 1부터이고, workspace를 먼저 열지 않아도 된다.
import type {
  ApplyAllResult,
  DraftStage,
  ProductChange,
  ProductChangeGroups,
  ProductDraftView,
} from "../productWorkspace";
import type { StageInput } from "../types";
import { db, nextId, nowIso, type DB, type ProductRec } from "./db";
import {
  MAX_PRODUCT_PHOTOS,
  PHOTO_LIMIT_MESSAGE,
  missing,
  myProduct,
  myProductRec,
} from "./catalog";
import { holdsStock, validatePeriods } from "./sales";
import type { Ctx } from "./router";
import { conflict, fail, idempotent, invalid, register } from "./router";

type Values = Record<string, unknown>;
type DraftRec = {
  version: number;
  values: Values;
  base: Values;
  savedAt: string;
};
type ChangeRec = {
  eventId: string;
  productId: string;
  productStatus: string;
  actorUserId: string;
  changes: ProductChange[];
  pageChanged: boolean;
  deliveryWindowProposed: boolean;
  reservedCount: number;
  createdAt: string;
};
// Additive optional fields: older saved Mock DBs simply have no drafts yet.
type DraftDB = DB & {
  productDrafts?: Record<string, DraftRec>;
  productChanges?: ChangeRec[];
};

const INFO_KEYS = [
  "origin",
  "producer",
  "size",
  "packedAt",
  "storage",
  "contact",
] as const;
const LABELS: Record<string, string> = {
  name: "상품명",
  photos: "사진",
  variety: "품종",
  description: "설명",
  grade: "등급",
  expectedBrix: "예상 당도",
  measuredBrix: "측정 당도",
  "info.origin": "원산지",
  "info.storage": "보관 방법",
  "info.producer": "생산자",
  "info.size": "크기",
  "info.packedAt": "포장일",
  "info.contact": "상담 안내",
  options: "중량 옵션",
  stages: "예약 기간·가격",
  shippingFeeType: "배송비 방식",
  shippingFee: "배송비",
  remoteAreaFee: "도서산간 추가 운임",
  maxDelayUntil: "전액 환불 날짜",
  deliveryWindow: "받는 시기",
};
// 옵션 이름은 기존 주문도 지금 값을 읽어(중량은 잠김) 옵션은 '바로 보임'이다(서버와 같음)
const NEW_ORDERS = new Set([
  "stages",
  "shippingFeeType",
  "shippingFee",
  "remoteAreaFee",
  "maxDelayUntil",
]);
const FORBIDDEN = ["maxQuantityPerOrder", "detailContent", "version"];
const PROPOSAL = ["AWAITING_DEPOSIT", "RESERVED", "PREPARING"];
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function drafts(): Record<string, DraftRec> {
  const d = db() as DraftDB;
  return (d.productDrafts ??= {});
}

function stageValue(s: StageInput) {
  return {
    stageId: s.stageId ?? null,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    options: Object.fromEntries(
      Object.entries(s.options)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([oid, v]) => [oid, { price: v.price, quantity: v.quantity }]),
    ),
  };
}

function current(p: ProductRec): Values {
  const values: Values = {
    name: p.name,
    photos: [...p.photos],
    variety: p.variety,
    description: p.description,
    grade: p.grade,
    expectedBrix: p.expectedBrix,
    measuredBrix: p.measuredBrix,
    options: p.options.map((o) => ({
      optionId: o.optionId,
      label: o.label,
      weightKg: o.weightKg,
      note: o.note ?? null,
    })),
    stages: p.stages.map((s) => stageValue(s)),
    shippingFeeType: p.shippingFeeType,
    shippingFee: p.shippingFee,
    remoteAreaFee: p.remoteAreaFee,
    maxDelayUntil: p.maxDelayUntil,
    deliveryWindow: p.deliveryWindow,
  };
  for (const k of INFO_KEYS) values[`info.${k}`] = p.info[k];
  return values;
}

function people(p: ProductRec) {
  return new Set(
    Object.values(db().orders)
      .filter((o) => o.productId === p.productId && PROPOSAL.includes(o.status))
      .map((o) => o.consumerId),
  ).size;
}

function summary(
  key: string,
  value: unknown,
  labels: Record<string, string>,
): string | null {
  if (value === null || value === undefined) return null;
  const day = (v: string) => v.slice(5).replace("-", ".");
  if (key === "photos") return `${(value as string[]).length}장`;
  if (key === "options")
    return (
      (value as { label: string }[]).map((o) => o.label).join(", ") || "없음"
    );
  if (key === "stages")
    return (
      (value as ReturnType<typeof stageValue>[])
        .map(
          (s) =>
            `${day(s.startsAt)}~${day(s.endsAt)} ` +
            Object.entries(s.options)
              .map(
                ([oid, v]) =>
                  `${labels[oid] ?? oid} ${v.price.toLocaleString("ko-KR")}원·${v.quantity}박스`,
              )
              .join(", "),
        )
        .join(" / ") || "없음"
    );
  if (key === "deliveryWindow") {
    const w = value as { start: string; end: string };
    return `${w.start} ~ ${w.end}`;
  }
  if (key === "shippingFeeType")
    return value === "FREE"
      ? "무료"
      : value === "SEPARATE"
        ? "따로 받기"
        : String(value);
  if (key === "shippingFee" || key === "remoteAreaFee")
    return `${(value as number).toLocaleString("ko-KR")}원`;
  if (key === "expectedBrix" || key === "measuredBrix") return `${value}Brix`;
  const text = String(value);
  return text.length <= 80 ? text : `${text.slice(0, 80)}…`;
}

function photoChange(before: string[], after: string[]): ProductChange {
  return {
    field: "photos",
    label: LABELS.photos,
    before: `${before.length}장`,
    after: `${after.length}장${before[0] !== after[0] ? " · 대표사진 바뀜" : ""}`,
  };
}

function grouped(
  values: Values,
  now: Values,
  reserved: number,
): ProductChangeGroups {
  const label = (opts: unknown) =>
    Object.fromEntries(
      (opts as { optionId: string; label: string }[]).map((o) => [
        o.optionId,
        o.label,
      ]),
    );
  const before = label(now.options),
    after = label(values.options ?? now.options);
  const groups: ProductChangeGroups = { now: [], newOrders: [], consent: [] };
  for (const key of Object.keys(LABELS)) {
    if (!(key in values)) continue;
    const entry =
      key === "photos"
        ? photoChange(now.photos as string[], values.photos as string[])
        : {
            field: key,
            label: LABELS[key],
            before: summary(key, now[key], before),
            after: summary(key, values[key], after),
          };
    if (key === "deliveryWindow" && reserved) groups.consent.push(entry);
    else if (NEW_ORDERS.has(key) || key === "deliveryWindow")
      groups.newOrders.push(entry);
    else groups.now.push(entry);
  }
  return groups;
}

function conflicts(values: Values, base: Values, now: Values) {
  return Object.keys(values).filter(
    (k) => k in base && !same(now[k], base[k]) && !same(now[k], values[k]),
  );
}

function buyerVisible(p: ProductRec) {
  if (p.status === "CLOSED")
    conflict("INVALID_TRANSITION", "판매 종료 상품은 고칠 수 없어요.");
  if (p.status !== "PUBLISHED" && p.status !== "PENDING_APPROVAL")
    conflict(
      "INVALID_TRANSITION",
      "판매 전 상품은 저장하면 바로 상품에 들어가요. 상품 저장을 써 주세요.",
    );
}

function view(p: ProductRec): ProductDraftView {
  const rec = drafts()[p.productId];
  const values = rec?.values ?? {};
  const now = current(p);
  const reserved = people(p);
  const fields: Record<string, unknown> = {};
  const info: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k === "stages") continue;
    if (k.startsWith("info.")) info[k.slice(5)] = v;
    else fields[k] = v;
  }
  if (Object.keys(info).length) fields.info = info;
  return {
    productId: p.productId,
    version: rec?.version ?? 1,
    productStatus: p.status,
    draft: Object.keys(values).length
      ? {
          fields,
          stages: (values.stages as DraftStage[] | undefined) ?? null,
          savedAt: rec.savedAt,
        }
      : null,
    changes: grouped(values, now, reserved),
    reservedCount: reserved,
    conflicts: conflicts(values, rec?.base ?? {}, now),
  };
}

function version(p: ProductRec, expected: unknown) {
  const actual = drafts()[p.productId]?.version ?? 1;
  if (expected !== actual)
    conflict("VERSION_MISMATCH", "변경된 내용을 다시 확인해 주세요.", {
      version: actual,
    });
}

function wanted(body: Record<string, unknown>): Values {
  const fields = (body.fields ?? {}) as Record<string, unknown>;
  const bad = Object.keys(fields).filter(
    (k) =>
      FORBIDDEN.includes(k) ||
      k.startsWith("info.") ||
      !(k in LABELS || k === "info"),
  );
  if (bad.length)
    invalid(
      Object.fromEntries(
        bad.map((k) => [`fields.${k}`, "초안에 넣을 수 없는 칸이에요"]),
      ),
    );
  const values: Values = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "info") {
      const unknown = Object.keys(v as object).filter(
        (ik) => !(INFO_KEYS as readonly string[]).includes(ik),
      );
      if (unknown.length)
        invalid({ "fields.info": "모르는 상품정보 칸이에요" });
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>))
        values[`info.${ik}`] = iv;
    } else if (k === "options") {
      const options = v as {
        optionId?: string;
        label: string;
        weightKg: number;
        note?: string | null;
      }[];
      if (
        options.some((o) => !o.optionId) ||
        new Set(options.map((o) => o.optionId)).size !== options.length
      )
        invalid({
          "fields.options": "중량 옵션마다 겹치지 않는 ID가 필요해요",
        });
      values.options = options.map((o) => ({
        optionId: o.optionId,
        label: o.label,
        weightKg: o.weightKg,
        note: o.note ?? null,
      }));
    } else if (k === "photos") {
      if (!Array.isArray(v) || v.length > MAX_PRODUCT_PHOTOS)
        invalid({ "fields.photos": PHOTO_LIMIT_MESSAGE });
      values.photos = v;
    } else values[k] = v;
  }
  if (Array.isArray(body.stages))
    values.stages = [...(body.stages as StageInput[])]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(stageValue);
  return values;
}

function actor(ctx: Ctx) {
  return ctx.me().userId;
}

register({
  "GET /api/source-analysis/product-workspaces/:productId/product-draft": (
    ctx,
  ) => view(myProductRec(ctx)),

  "PUT /api/source-analysis/product-workspaces/:productId/product-draft": (
    ctx,
  ) => {
    const p = myProductRec(ctx);
    return idempotent(ctx, `product-draft:${p.productId}`, () => {
      version(p, ctx.body.version);
      buyerVisible(p);
      const rebase = (ctx.body.rebase ?? []) as string[];
      if (rebase.some((k) => !(k in LABELS)))
        invalid({ rebase: "모르는 칸이에요" });
      const now = current(p);
      const next = Object.fromEntries(
        Object.entries(wanted(ctx.body)).filter(([k, v]) => !same(v, now[k])),
      );
      const old = drafts()[p.productId];
      const base = Object.fromEntries(
        Object.keys(next).map((k) => [
          k,
          old &&
          k in old.values &&
          k in old.base &&
          !((ctx.body.rebase ?? []) as string[]).includes(k)
            ? old.base[k]
            : now[k],
        ]),
      );
      drafts()[p.productId] = {
        version: (old?.version ?? 1) + 1,
        values: next,
        base,
        savedAt: nowIso(),
      };
      return view(p);
    });
  },

  "DELETE /api/source-analysis/product-workspaces/:productId/product-draft": (
    ctx,
  ) => {
    const p = myProductRec(ctx);
    version(p, Number(ctx.query.version));
    const old = drafts()[p.productId];
    drafts()[p.productId] = {
      version: (old?.version ?? 1) + 1,
      values: {},
      base: {},
      savedAt: nowIso(),
    };
    return view(p);
  },

  "POST /api/source-analysis/product-workspaces/:productId/apply-all": (
    ctx,
  ) => {
    const p = myProductRec(ctx);
    return idempotent(ctx, `apply-all:${p.productId}`, (): ApplyAllResult => {
      version(p, ctx.body.version);
      const rec = drafts()[p.productId];
      const saved = rec?.values ?? {};
      const listed =
        p.status === "PUBLISHED" || p.status === "PENDING_APPROVAL";
      // 판매 전 상품은 심사 중에 담아 두고 남은 초안만 반영한다(서버와 같음)
      if (!listed && (p.status === "CLOSED" || !Object.keys(saved).length))
        buyerVisible(p);
      if (ctx.body.page) invalid({ page: "Mock에는 판매페이지 초안이 없어요" });
      if (!Object.keys(saved).length)
        invalid({ productDraft: "반영할 수정이 없어요." });
      const now = current(p);
      const stale = conflicts(saved, rec.base, now);
      if (stale.length)
        conflict(
          "PRODUCT_CHANGED",
          listed
            ? "다른 곳에서 상품이 바뀌었어요. 바뀐 칸을 확인한 뒤 다시 저장해 주세요."
            : "다른 곳에서 상품이 바뀌었어요. 남은 수정을 버리고 상품에서 직접 고쳐 주세요.",
          { fields: stale },
        );
      // 그사이 초안 값과 같아진 칸은 더 이상 변경이 아니다(서버와 같음)
      const values = Object.fromEntries(
        Object.entries(saved).filter(([k, v]) => !same(v, now[k])),
      );
      const reserved = people(p);
      // values에는 지금 값과 다른 칸만 남았다(서버와 같은 판단)
      const windowChanged = "deliveryWindow" in values;
      if (
        windowChanged &&
        reserved &&
        (!ctx.body.confirmDeliveryChange ||
          (ctx.body.confirmedReservedCount != null &&
            ctx.body.confirmedReservedCount !== reserved))
      )
        conflict(
          "DELIVERY_CONSENT_REQUIRED",
          `예약한 ${reserved}명에게 새 받는 시기 동의를 물어요. 확인한 뒤 반영해 주세요.`,
          { reservedCount: reserved },
        );
      const changes = grouped(values, now, reserved);
      const next = structuredClone(p);
      for (const [k, v] of Object.entries(values)) {
        if (k === "stages") continue;
        if (k.startsWith("info."))
          Object.assign(next.info, { [k.slice(5)]: v });
        else Object.assign(next, { [k]: v });
      }
      if (values.options) {
        // 주문이 걸린 옵션은 지우거나 무게를 바꿀 수 없다(PATCH와 같음)
        for (const o of Object.values(ctx.db.orders).filter(
          (o) => o.productId === p.productId && holdsStock(o),
        )) {
          const opt = next.options.find((v) => v.optionId === o.optionId);
          if (!opt || Math.round(opt.weightKg * 1000) !== o.unitWeightGrams)
            conflict(
              "PERIOD_LOCKED",
              "주문에 연결된 옵션의 삭제·중량 변경은 할 수 없어요.",
            );
        }
      }
      if (
        "stages" in values ||
        "options" in values ||
        "deliveryWindow" in values
      )
        next.stages = validatePeriods(
          ctx.db,
          next,
          (values.stages as StageInput[] | undefined) ?? next.stages,
        );
      const end = next.deliveryWindow?.end;
      if (end && next.maxDelayUntil && next.maxDelayUntil < end)
        invalid({
          maxDelayUntil: "최대 지연 기한은 받는 시기 끝날 이후여야 해요",
        });
      const fields = listed ? missing(next) : [];
      if (fields.length)
        invalid(Object.fromEntries(fields.map((f) => [f, "필수 항목이에요"])));
      if (next.status === "REJECTED") next.status = "DRAFT";
      if (windowChanged && next.deliveryWindow)
        for (const order of Object.values(ctx.db.orders))
          if (
            order.productId === p.productId &&
            PROPOSAL.includes(order.status)
          )
            order.proposedDeliveryWindow = { ...next.deliveryWindow };
      if (Object.keys(values).length) {
        // 서버와 같다: 남은 변경이 없으면 상품(버전·수정 시각)은 그대로다
        next.version++;
        next.updatedAt = nowIso();
        Object.assign(p, next);
      }
      const d = db() as DraftDB;
      const entries = [
        ...changes.now,
        ...changes.newOrders,
        ...changes.consent,
      ];
      const event: ChangeRec = {
        eventId: nextId("pchg"),
        productId: p.productId,
        productStatus: p.status,
        actorUserId: actor(ctx),
        changes: entries,
        pageChanged: false,
        // 서버와 같다: 동의를 물을 예약이 있을 때만 제안한 것으로 본다
        deliveryWindowProposed:
          windowChanged && !!next.deliveryWindow && reserved > 0,
        reservedCount: windowChanged && next.deliveryWindow ? reserved : 0,
        createdAt: nowIso(),
      };
      if (entries.length) (d.productChanges ??= []).push(event); // 남는 변경이 없으면 기록하지 않는다
      drafts()[p.productId] = {
        version: rec.version + 1,
        values: {},
        base: {},
        savedAt: nowIso(),
      };
      const mine = ctx.db.products[p.productId];
      return {
        productId: p.productId,
        version: rec.version + 1,
        productVersion: mine.version,
        changes,
        pageApplied: false,
        deliveryWindowProposed: event.deliveryWindowProposed,
        reservedCount: reserved,
        changeId: entries.length ? event.eventId : null,
        product: myProduct(mine),
      };
    });
  },

  "GET /admin/products/:productId/changes": (ctx) => {
    if (ctx.me().role !== "ADMIN")
      fail(403, "FORBIDDEN", "운영자 권한이 필요해요.");
    if (!ctx.db.products[ctx.params.productId])
      fail(404, "NOT_FOUND", "상품을 찾을 수 없어요.");
    return ((db() as DraftDB).productChanges ?? [])
      .filter((e) => e.productId === ctx.params.productId)
      .reverse();
  },
});
