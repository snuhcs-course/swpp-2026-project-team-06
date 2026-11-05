// DEV-224 (ia.md 4장 뒤로 규칙, 5장 예외 경로, screens.md 3장): 헤더 뒤로 목적지 표와 맨 router.back() 금지.
// 앱 안 이전 화면이 없으면(주소로 바로 열기·새로고침) parentOf 표의 부모 화면으로 간다(PM 결정 c1).
// 상품·농가 정보·주문 상세에서 연 1:1 방은 연 화면으로 간다(a1).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { parentOf as consumerParent, roomBackTarget } from "../apps/consumer/src/lib/backTargets.ts";
import { parentOf as producerParent } from "../apps/producer/src/lib/backTargets.ts";

test("DEV-224 c1: consumer parent screen for every stacked screen", () => {
  const rows = [
    ["/farms", {}, "/"],
    ["/farms/f-kang", {}, "/"],
    ["/farms/f-nope", {}, "/"],
    ["/farms/f-kang/info", {}, "/farms/f-kang"],
    ["/news/f-kang", {}, "/"],
    ["/products/p-house", {}, "/"],
    ["/checkout/p-house", { optionId: "opt-5" }, "/products/p-house"],
    ["/checkout/p-house/address", {}, "/checkout/p-house"],
    ["/checkout/p-house/pay", { orderId: "o-11" }, "/orders/o-11"], // 주문이 이미 있으니 주문 상세
    ["/checkout/p-house/pay", {}, "/products/p-house"],
    ["/orders/o-11", {}, "/orders"],
    ["/orders/o-11/done", {}, "/orders"],
    ["/orders/o-11/inquiry", {}, "/orders/o-11"],
    ["/chats/f-kang", {}, "/chats?view=private"],
    ["/chats/support", {}, "/chats?view=private"],
    ["/me/profile", {}, "/me"],
    ["/me/addresses", {}, "/me"],
    ["/me/addresses/edit", {}, "/me/addresses"],
    ["/privacy", {}, "/"],
    ["/terms", {}, "/"],
    ["/orders/", {}, "/orders"],
    ["/unknown/deep", {}, "/"],
  ];
  for (const [p, params, want] of rows) assert.equal(consumerParent(p, params), want, p);
});

test("DEV-224 c1: producer sub-screens go to their fixed list", () => {
  const rows = [
    ["/products/new", "/products"],
    ["/products/manual", "/products"],
    ["/products/source-analysis", "/products"],
    ["/products/p-house/edit", "/products"],
    ["/products/p-house/sell", "/products"],
    ["/products/p-house/stages", "/products"],
    ["/products/p-house/sales", "/products"],
    ["/products/p-house/detail", "/products"],
    ["/chats/u-minji", "/chats?view=private"],
    ["/broadcast/new", "/chats?view=news"],
    ["/ship", "/"],
    ["/farm", "/settings"],
    ["/farm/ai-settings", "/settings"],
    ["/farm/account", "/farm"],
    ["/farm/edit/name", "/farm"],
    ["/farm/detail", "/farm"],
    ["/privacy", "/"],
  ];
  for (const [p, want] of rows) assert.equal(producerParent(p), want, p);
});

test("DEV-224 a1: a 1:1 room opened from a product, farm info or order goes back there", () => {
  assert.equal(roomBackTarget({ farmId: "f-kang", start: "1", productId: "p-house" }), "/products/p-house");
  assert.equal(roomBackTarget({ farmId: "f-kang", start: "1", from: "info" }), "/farms/f-kang/info");
  assert.equal(roomBackTarget({ farmId: "f-kang", from: "order", fromOrder: "o-11" }), "/orders/o-11");
  // 채팅 목록에서 열었거나 주소로 연 방은 보통 규칙(목록)
  assert.equal(roomBackTarget({ farmId: "f-kang" }), null);
  assert.equal(roomBackTarget({ farmId: "f-kang", from: "order" }), null);
});

test("DEV-224 HE-X1: no bare router.back() without a fallback in either app", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) {
        const lines = readFileSync(p, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!line.includes("router.back()") || /^\s*(\/\/|\/\*|\*)/.test(line)) return;
          // canGoBack 삼항식(같은 줄이나 바로 위 두 줄)이나 goBackOr 정의 안에서만 허용
          const near = lines.slice(Math.max(0, i - 2), i + 1).join("\n");
          if (!/canGoBack\(\)/.test(near)) offenders.push(`${p}:${i + 1}`);
        });
      }
    }
  };
  walk("apps/consumer/src");
  walk("apps/producer/src");
  assert.deepEqual(offenders, []);
});
