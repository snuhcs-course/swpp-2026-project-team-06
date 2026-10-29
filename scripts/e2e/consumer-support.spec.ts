import { expect, test, type APIRequestContext } from "./fixtures";
import { apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

// 소비자 farmclub 문의 대화방(DEV-150, FEAT-34 AC-34-6~8). 운영자 쪽은 관리 API를 직접 부른다.
const adminToken = process.env.FARMCLUB_ADMIN_TOKEN ?? "";
const admin = (request: APIRequestContext) => ({
  get: (path: string) => request.get(`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${adminToken}` } }),
  post: (path: string, data: object) =>
    request.post(`${apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${adminToken}`, "Idempotency-Key": crypto.randomUUID() },
      data,
    }),
});

test.skip(!adminToken, "FARMCLUB_ADMIN_TOKEN이 있어야 운영자 API를 부를 수 있다");

test("AC-34-7: a consumer asks the farmclub team from the 1:1 list and sees the reply", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const assertClean = monitor(page);
  const ops = admin(request);

  await loginConsumer(page);
  await page.goto(`${consumerUrl}/chats?view=private`);
  const row = page.locator('[data-testid="chat-row-farmclub"]:visible');
  await expect(row).toBeVisible();
  await expect(row).toHaveAccessibleName(/^farmclub, /);
  await row.click();
  await expect(page).toHaveURL(/\/chats\/support/);
  await expect(page.getByTestId("support-intro")).toBeVisible();
  // 뒤에 남은 목록 화면의 미리보기와 겹치지 않게 방 안(마지막) 요소를 본다
  await expect(page.getByText(/가입을 환영해요/).last()).toBeVisible();
  // 사진 첨부는 받지 않는다
  await expect(page.getByRole("button", { name: "＋" })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("consumer-support-room.png") });

  const question = `입금 확인은 언제 되나요? ${Date.now()}`;
  await page.getByPlaceholder("메시지를 입력하세요").fill(question);
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText(question).last()).toBeVisible();

  const inbox = await (await ops.get("/admin/support")).json();
  const minji = inbox.find(
    (r: { kind: string; targetId: string }) => r.kind === "CONSUMER" && r.targetId === "u-minji",
  );
  expect(minji).toMatchObject({ waiting: true, lastMessage: question });
  const answer = `농가가 오늘 안에 확인할 예정이에요. ${Date.now()}`;
  expect((await ops.post("/admin/support/consumers/u-minji/messages", { text: answer })).ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByText(answer).last()).toBeVisible();
  await expect(page.getByText("farmclub", { exact: true }).last()).toBeVisible();
  assertClean();
});
