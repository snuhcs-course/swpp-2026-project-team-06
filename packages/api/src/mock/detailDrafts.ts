import { detailDraft } from "./detailContent";
import { myProductRec, editable } from "./catalog";
import { register, notFound, fail } from "./router";
register({
  "POST /api/farms/me/detail-draft": (ctx) => {
    const u = ctx.me(),
      f = u.farmId ? ctx.db.farms[u.farmId] : null;
    if (u.role !== "PRODUCER" || !f || f.ownerId !== u.userId) notFound();
    if (f.status !== "APPROVED")
      fail(403, "FORBIDDEN", "승인된 농가만 만들 수 있어요.");
    return detailDraft(ctx.body, f.name, f.intro, f.photo ? [f.photo] : [], [
      f.region,
    ]);
  },
  "POST /api/products/mine/:productId/detail-draft": (ctx) => {
    const p = myProductRec(ctx);
    editable(p);
    return detailDraft(ctx.body, p.name, p.description, p.photos, [
      p.variety,
      p.info.origin,
      p.info.storage,
    ]);
  },
});
