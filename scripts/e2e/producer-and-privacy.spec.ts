import { expect, test } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, loginProducer, monitor, producerUrl } from "./helpers";

test("AC-03/04/05: producer draft and sales controls are wired to the real server", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/products/manual`);
  await page
    .getByLabel("카톡·밴드에 쓰던 문구")
    .fill("DEV25 하우스 감귤 5kg, 예상 당도 12.5브릭스, 11월 중순 배송입니다.");
  await page.getByRole("button", { name: "초안 만들기" }).click();
  const generated = page.getByRole("heading", { name: "초안이 나왔어요" });
  await expect(generated.or(page.getByText("초안을 만들지 못했어요"))).toBeVisible();
  if (await generated.isVisible()) await page.getByRole("button", { name: "편집으로" }).click();
  else {
    await expect(page.getByText("초안을 만들지 못했어요")).toBeVisible();
    await expect(page.getByLabel("카톡·밴드에 쓰던 문구")).toHaveValue(/DEV25/);
    await page.getByRole("button", { name: "직접 입력하기" }).click();
  }
  await expect(page.getByLabel("상품명")).toBeVisible();

  await page.goto(`${producerUrl}/products/p-house/sales`);
  await expect(page.getByText("판매 설정", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "물량 추가 신청" })).toBeVisible();
  await page.getByRole("button", { name: "판매 중지" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "판매 재개" })).toBeVisible();
  await page.getByRole("button", { name: "판매 재개" }).click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByRole("button", { name: "판매 중지" })).toBeVisible();
  assertClean();
});

// DEV-300: 판매 현황은 중량 옵션마다 '5kg  32,000원   예약+출하 N박스 / 판매 M박스'(가격은 지금 기간, 박스는 모든 기간 합).
// 옵션끼리 더하지 않는다. 앞 spec이 주문을 만들 수 있어 기대값은 서버 값(기간·옵션별 reservedCount·quantity·price)으로 만든다.
test("AC-14-1(part)/AC-14-3 DEV-300: dashboard, product card and sales settings show price and sold boxes per weight option", async ({ page, request }) => {
  const assertClean = monitor(page);
  const asProducer = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const dash = await (await request.get(`${apiUrl}/api/orders/producer/dashboard`, { headers: asProducer })).json();
  const home = new Map<string, { label: string; price: number | null; sold: number; quantity: number }>();
  for (const stage of dash.stages)
    for (const o of stage.options) {
      const row = home.get(o.optionId) ?? { label: o.label, price: null, sold: 0, quantity: 0 };
      row.sold += o.reserved;
      row.quantity += o.quantity;
      if (stage.current) row.price = o.price;
      home.set(o.optionId, row);
    }
  expect(home.size).toBeGreaterThan(0);
  // 대표 상품은 앞 spec에 따라 바뀔 수 있다. 시드 대표 상품(하우스 감귤)이면 옵션 두 줄
  if (dash.product.productId === "p-house") expect(home.size).toBe(2);
  const cards = await (await request.get(`${apiUrl}/api/products/mine?limit=50`, { headers: asProducer })).json();
  const cardOf = cards.items.find((c: { productId: string }) => c.productId === "p-house");
  type Row = { optionId: string; label: string; price: number | null; sold: number; quantity: number };
  const house = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers: asProducer })).json();
  const current = house.stages.find(
    (s: { startsAt: string; endsAt: string }) => `${s.startsAt} ~ ${s.endsAt}` === cardOf.currentStageLabel,
  );
  const rows: Row[] = house.options.map((o: { optionId: string; label: string }) => ({
    optionId: o.optionId,
    label: o.label,
    price: current?.options[o.optionId]?.price ?? null,
    sold: house.stages.reduce((n: number, s: { options: Record<string, { reservedCount: number }> }) => n + (s.options[o.optionId]?.reservedCount ?? 0), 0),
    quantity: house.stages.reduce((n: number, s: { options: Record<string, { quantity: number }> }) => n + (s.options[o.optionId]?.quantity ?? 0), 0),
  }));
  expect(rows.map((r) => r.label)).toEqual(["5kg", "10kg"]);
  // 시드 하우스 감귤은 FIXED_NOW(10/07)에 1기간 판매 중이라 옵션마다 가격이 있다
  for (const r of rows) expect(r.price).not.toBeNull();
  // 목록 카드 options(서버 card_options)는 상품 화면 값으로 만든 줄과 같다
  expect(
    cardOf.options.map((o: { optionId: string; label: string; price: number | null; reserved: number; quantity: number }) => ({
      optionId: o.optionId,
      label: o.label,
      price: o.price,
      sold: o.reserved,
      quantity: o.quantity,
    })),
  ).toEqual(rows);

  const n = (v: number) => v.toLocaleString("ko-KR");
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const label = (r: { label: string; price: number | null; sold: number; quantity: number }) =>
    `${r.label}${r.price === null ? "" : ` ${n(r.price)}원,`} 예약·출하 ${n(r.sold)}박스, 판매 ${n(r.quantity)}박스`;
  await loginProducer(page, "강영수");
  const amount = page.getByRole("link", { name: new RegExp(`^${escape(dash.product.productName)} `) });
  // 옵션 숫자가 우연히 같을 수 있어 같은 글자는 옵션 수만큼 보이는지 센다
  const texts = new Map<string, number>();
  for (const r of home.values()) {
    expect(r.price).not.toBeNull();
    await expect(amount).toHaveAccessibleName(new RegExp(escape(label(r))));
    await expect(amount.getByText(`${n(r.price!)}원`, { exact: true }).first()).toBeVisible();
    const t = `${n(r.sold)}박스 / ${n(r.quantity)}박스`;
    texts.set(t, (texts.get(t) ?? 0) + 1);
  }
  for (const [t, count] of texts) await expect(amount.getByText(t, { exact: true })).toHaveCount(count);
  await expect(amount.getByText(/^총 [\d,.]+kg \/ [\d,.]+kg$/)).toBeVisible();

  // 상품 목록은 카드마다 상품 상세를 읽지 않는다(목록 API options만 쓴다)
  const detailReads: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/products/mine/")) detailReads.push(r.url());
  });
  const listed = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/products/mine");
  await page.goto(`${producerUrl}/products`);
  await listed;
  for (const r of rows) {
    await expect(page.getByText(`${n(r.price!)}원`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`${n(r.sold)}박스 / ${n(r.quantity)}박스`, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText(/^승인 [\d.]+kg · 추가 예약 가능 [\d.]+kg$/).first()).toBeVisible();
  // 목록 폴링(8초) 한 번을 더 기다려 늦게 나가는 상세 요청도 본다
  await page.waitForResponse((r) => new URL(r.url()).pathname === "/api/products/mine", { timeout: 15000 });
  expect(detailReads).toEqual([]);

  await page.goto(`${producerUrl}/products/p-house/sales`);
  for (const r of rows) await expect(page.getByLabel(label(r), { exact: true })).toBeVisible();
  // 판매 한도는 계속 kg
  await expect(page.getByText("현재 판매 한도 (kg)")).toBeVisible();

  // AC-14-1 중 대표 상품 물량 부분(DEV-300): 새 주문의 입금을 확인한 뒤 다시 열면 그 옵션의 박스만 하나 늘고
  // 다른 옵션은 그대로, 총 kg은 5kg 는다. 박스는 입금 안내 때 잡히므로 확인 뒤에도 +1이다(AC-14-1의 입금 대기 할 일·주문 지표 갱신은 이 테스트에서 보지 않는다)
  const run = Date.now();
  const asConsumer = { Authorization: `Bearer ${await apiLogin(request, "u-minji", "consumer")}` };
  const created = await request.post(`${apiUrl}/api/orders`, {
    headers: { ...asConsumer, "Idempotency-Key": `dev300-order-${run}` },
    data: {
      productId: "p-house",
      optionId: "opt-5",
      quantity: 1,
      recipientName: "DEV300 구매자",
      recipientPhone: "010-1234-5678",
      postalCode: "63584",
      address: "제주특별자치도 서귀포시 통합로 1",
      addressDetail: "101호",
      consents: { deliveryWindow: true, delayRefund: true, shortage: true, cancelPolicy: true, thirdParty: true },
      consentVersion: "dev300",
    },
  });
  expect(created.ok()).toBeTruthy();
  const { orderId } = await created.json();
  for (const step of ["deposit", "deposit-reported"])
    expect(
      (await request.post(`${apiUrl}/api/orders/${orderId}/${step}`, {
        headers: { ...asConsumer, "Idempotency-Key": `dev300-${step}-${run}` },
        data: {},
      })).ok(),
    ).toBeTruthy();
  expect((await request.post(`${apiUrl}/api/orders/${orderId}/confirm-deposit`, { headers: asProducer })).ok()).toBeTruthy();
  const [five, ten] = rows;
  await page.goto(`${producerUrl}/products/p-house/sales`);
  await expect(page.getByLabel(label({ ...five, sold: five.sold + 1 }), { exact: true })).toBeVisible();
  await expect(page.getByLabel(label(ten), { exact: true })).toBeVisible();
  if (dash.product.productId === "p-house") {
    await page.goto(producerUrl);
    const home5 = home.get("opt-5")!;
    await expect(amount).toHaveAccessibleName(new RegExp(escape(label({ ...home5, sold: home5.sold + 1 }))));
    const used = (dash.product.reservedGrams + dash.product.shippedGrams) / 1000 + 5;
    await expect(amount.getByText(`총 ${n(used)}kg / ${n(dash.product.salesLimitGrams / 1000)}kg`, { exact: true })).toBeVisible();
  }
  assertClean();
});

test("AC-12/15: public room does not auto-follow and private state clears with session", async ({ browser }) => {
  const anonymous = await browser.newContext();
  const anonymousPage = await anonymous.newPage();
  const assertAnonymousClean = monitor(anonymousPage);
  await anonymousPage.goto(`${consumerUrl}/news/f-kang`);
  await expect(anonymousPage.getByRole("button", { name: "로그인하고 참여하기" })).toBeVisible();
  await expect(anonymousPage.getByText("팔로워만", { exact: false })).toHaveCount(0);
  assertAnonymousClean();

  const follower = await browser.newContext();
  const followerPage = await follower.newPage();
  const assertFollowerClean = monitor(followerPage);
  await loginConsumer(followerPage);
  await followerPage.goto(`${consumerUrl}/news/f-kang`);
  await expect(followerPage.getByRole("button", { name: /농가 보기/ }).first()).toBeVisible();
  await followerPage.reload();
  await expect(followerPage.getByRole("button", { name: /농가 보기/ }).first()).toBeVisible();
  assertFollowerClean();

  await anonymous.close();
  await follower.close();
});

test("AC-02-4: farm storytelling editor loads without publishing a draft", async ({ page }) => {
  const assertClean = monitor(page);
  await loginProducer(page, "강영수");
  await page.goto(`${producerUrl}/farm/detail`);
  await expect(page.getByText("농가 상세 편집", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "상세 초안 생성" })).toBeVisible();
  assertClean();
});
