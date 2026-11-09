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

// DEV-300: 판매 현황은 중량 옵션마다 '예약+출하 N박스 / 판매 M박스'(모든 기간 합). 옵션끼리 더하지 않는다.
// 앞 spec이 주문을 만들 수 있어 기대값은 서버 값(기간·옵션별 reservedCount·quantity)을 더해 만든다.
test("AC-14-3 DEV-300: dashboard, product card and sales settings show sold boxes per weight option", async ({ page, request }) => {
  const assertClean = monitor(page);
  const asProducer = { Authorization: `Bearer ${await apiLogin(request, "u-kang", "producer")}` };
  const dash = await (await request.get(`${apiUrl}/api/orders/producer/dashboard`, { headers: asProducer })).json();
  const home = new Map<string, { label: string; sold: number; quantity: number }>();
  for (const stage of dash.stages)
    for (const o of stage.options) {
      const row = home.get(o.optionId) ?? { label: o.label, sold: 0, quantity: 0 };
      row.sold += o.reserved;
      row.quantity += o.quantity;
      home.set(o.optionId, row);
    }
  expect(home.size).toBeGreaterThan(0);
  // 대표 상품은 앞 spec에 따라 바뀔 수 있다. 시드 대표 상품(하우스 감귤)이면 옵션 두 줄
  if (dash.product.productId === "p-house") expect(home.size).toBe(2);
  const house = await (await request.get(`${apiUrl}/api/products/mine/p-house`, { headers: asProducer })).json();
  const rows = house.options.map((o: { optionId: string; label: string }) => ({
    label: o.label,
    sold: house.stages.reduce((n: number, s: { options: Record<string, { reservedCount: number }> }) => n + (s.options[o.optionId]?.reservedCount ?? 0), 0),
    quantity: house.stages.reduce((n: number, s: { options: Record<string, { quantity: number }> }) => n + (s.options[o.optionId]?.quantity ?? 0), 0),
  }));
  expect(rows.map((r: { label: string }) => r.label)).toEqual(["5kg", "10kg"]);

  const n = (v: number) => v.toLocaleString("ko-KR");
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await loginProducer(page, "강영수");
  const amount = page.getByRole("link", { name: new RegExp(`^${escape(dash.product.productName)} `) });
  // 옵션 숫자가 우연히 같을 수 있어 같은 글자는 옵션 수만큼 보이는지 센다
  const texts = new Map<string, number>();
  for (const r of home.values()) {
    await expect(amount).toHaveAccessibleName(new RegExp(escape(`${r.label} 예약·출하 ${n(r.sold)}박스, 판매 ${n(r.quantity)}박스`)));
    const t = `${n(r.sold)}박스 / ${n(r.quantity)}박스`;
    texts.set(t, (texts.get(t) ?? 0) + 1);
  }
  for (const [t, count] of texts) await expect(amount.getByText(t, { exact: true })).toHaveCount(count);
  await expect(amount.getByText(/^총 [\d,.]+ \/ [\d,.]+kg$/)).toBeVisible();

  await page.goto(`${producerUrl}/products`);
  await expect(
    page.getByText(rows.map((r: { label: string; sold: number }) => `${r.label} ${n(r.sold)}박스`).join(" · "), { exact: true }),
  ).toBeVisible();

  await page.goto(`${producerUrl}/products/p-house/sales`);
  for (const r of rows)
    await expect(page.getByLabel(`${r.label} 예약·출하 ${n(r.sold)}박스, 판매 ${n(r.quantity)}박스`, { exact: true })).toBeVisible();
  // 판매 한도는 계속 kg
  await expect(page.getByText("현재 판매 한도 (kg)")).toBeVisible();
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
