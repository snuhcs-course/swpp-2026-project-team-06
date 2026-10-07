// /api/home, /api/farms Mock (FEAT-02, 06, 19)
import type { FollowState, Home, MyFarm } from "../types";
import { farmCard, farmSummary, productCard } from "./derive";
import type { Ctx } from "./router";
import { fail, notFound, paginate, register } from "./router";

// Mock에는 /s 미리보기 서버가 없으니 배포된 소비자 앱의 농가 주소로 공유한다
declare const process: { env: { EXPO_PUBLIC_CONSUMER_URL?: string } };
const SHARE_BASE = `${(process.env.EXPO_PUBLIC_CONSUMER_URL || "https://farmclub-consumer.vercel.app").replace(/\/+$/, "")}/farms`;

function approvedFarms(ctx: Ctx) {
  return Object.values(ctx.db.farms).filter((f) => f.status === "APPROVED");
}

/** FEAT-06 정렬: 지금 단계가 가장 일찍 끝나는 농가가 위, 판매 중 상품 없는 농가는 맨 아래 */
function sortedFarmCards(ctx: Ctx) {
  return approvedFarms(ctx)
    .map((f) => farmCard(ctx.db, f))
    .sort((a, b) => (a.featured?.dDay ?? 999) - (b.featured?.dDay ?? 999));
}

function myFarm(ctx: Ctx) {
  const u = ctx.me();
  const f = u.farmId ? ctx.db.farms[u.farmId] : null;
  if (!f) fail(403, "FORBIDDEN", "생산자만 볼 수 있어요.");
  return f;
}

function follow(ctx: Ctx, on: boolean): FollowState {
  const u = ctx.me();
  const f = ctx.db.farms[ctx.params.farmId];
  if (!f || f.status !== "APPROVED") notFound("찾을 수 없는 농가예요.");
  const has = ctx.db.follows.some(
    (x) => x.userId === u.userId && x.farmId === f.farmId,
  );
  if (on && !has) {
    ctx.db.follows.push({ userId: u.userId, farmId: f.farmId });
    f.followerCount += 1;
  }
  if (!on && has) {
    ctx.db.follows = ctx.db.follows.filter(
      (x) => !(x.userId === u.userId && x.farmId === f.farmId),
    );
    f.followerCount -= 1;
  }
  return { following: on, followerCount: f.followerCount };
}

register({
  "GET /api/home": (ctx): Home => {
    const recommended = Object.values(ctx.db.products)
      .filter(
        (p) =>
          p.status === "PUBLISHED" &&
          ctx.db.farms[p.farmId]?.status === "APPROVED",
      )
      .map((p) => productCard(ctx.db, p))
      .filter((c) => !c.soldOut)
      .sort((a, b) => (a.dDay ?? 99) - (b.dDay ?? 99))
      .slice(0, 6);
    return {
      hero: {
        label: "10월 · 수확 전 예약",
        title: "서귀포 하우스 귤이\n지금 익어가고 있어요",
        caption: "강씨네 귤밭 · 하우스 감귤 5kg 보러 가기",
        photo: "/photos/orchard-crate.jpg",
        productId: "p-house",
      },
      recommended,
      farms: sortedFarmCards(ctx).slice(0, 6),
    };
  },

  "GET /api/farms": (ctx) => {
    const q = (ctx.query.q ?? "").trim();
    let cards = sortedFarmCards(ctx);
    if (q) {
      cards = cards.filter((c) => {
        const f = ctx.db.farms[c.farmId];
        const varieties = Object.values(ctx.db.products)
          .filter((p) => p.farmId === c.farmId)
          .map((p) => `${p.name} ${p.variety}`)
          .join(" ");
        return `${f.name} ${f.region} ${f.mainItems} ${varieties}`.includes(q);
      });
    }
    return paginate(cards, ctx.query);
  },

  "GET /api/farms/following": (ctx) => {
    const uid = ctx.me().userId;
    const list = ctx.db.follows
      .filter((x) => x.userId === uid)
      .map((x) => farmSummary(ctx.db.farms[x.farmId]));
    return paginate(list, ctx.query);
  },

  "GET /api/farms/me": (ctx): MyFarm => {
    const f = myFarm(ctx);
    return {
      ...farmSummary(f),
      intro: f.intro,
      status: f.status,
      shareUrl: f.status === "APPROVED" ? `${SHARE_BASE}/${f.farmId}` : null,
    };
  },

  "PATCH /api/farms/me": (ctx): MyFarm => {
    const f = myFarm(ctx);
    const b = ctx.body as Partial<{
      name: string;
      region: string;
      intro: string;
      photo: string | null;
    }>;
    const fields: Record<string, string> = {};
    if (b.name !== undefined && !b.name.trim())
      fields.name = "농가 이름을 적어 주세요";
    if (b.region !== undefined && !b.region.trim())
      fields.region = "지역을 적어 주세요";
    if (Object.keys(fields).length)
      fail(400, "VALIDATION_ERROR", "빈 칸을 채워 주세요.", { fields });
    Object.assign(f, b);
    return {
      ...farmSummary(f),
      intro: f.intro,
      status: f.status,
      shareUrl: f.status === "APPROVED" ? `${SHARE_BASE}/${f.farmId}` : null,
    };
  },

  "GET /api/farms/:farmId": (ctx) => {
    const f = ctx.db.farms[ctx.params.farmId];
    if (!f || f.status !== "APPROVED") notFound("찾을 수 없는 농가예요.");
    const uid = ctx.user?.userId;
    return {
      ...farmSummary(f),
      intro: f.intro,
      isFollowing:
        !!uid &&
        ctx.db.follows.some((x) => x.userId === uid && x.farmId === f.farmId),
      products: Object.values(ctx.db.products)
        .filter((p) => p.farmId === f.farmId && p.status === "PUBLISHED")
        .map((p) => productCard(ctx.db, p))
        .sort(
          (a, b) =>
            Number(a.soldOut) - Number(b.soldOut) ||
            (a.dDay ?? 99) - (b.dDay ?? 99),
        ),
      shareUrl: `${SHARE_BASE}/${f.farmId}`,
    };
  },

  "PUT /api/farms/:farmId/follow": (ctx) => follow(ctx, true),
  "DELETE /api/farms/:farmId/follow": (ctx) => follow(ctx, false),
});
