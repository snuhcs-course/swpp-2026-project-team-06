// DEV-230 (HE-02·HE-X4, FEAT-06 정상 흐름 4·AC-06-8, FEAT-15 AC-15-8): 팔로우는 확인 없이 끊고
// '팔로우를 끊었어요 · 되돌리기' 토스트를 띄운다. 소식방은 비우지 않고 내 답장을 흐리게 남기며,
// 팔로워 전용 소식은 숨기고 띠·잠긴 입력을 보인다. 채팅 목록에서는 빠지고, 다시 팔로우하면 모두 돌아온다.
// 실서버(FastAPI + 소비자 앱) 대상. 시드: 김민지(u-minji)는 강씨네 귤밭 팔로워, 10/7 팔로워 전용 소식 n-1과 내 답장 reply-1.
import { expect, test } from "./fixtures";
import type { Page } from "./fixtures";

import { apiLogin, apiUrl, consumerUrl, loginConsumer, monitor } from "./helpers";

const FOLLOWER_POST = "첫 바구니 따봤어요";
const MY_REPLY = "첫 바구니 사진 반가워요";

test.beforeEach(async ({ request }) => {
  // 앞 테스트가 끊은 채로 끝나도 팔로우 상태에서 시작한다
  const token = await apiLogin(request, "u-minji", "consumer");
  await request.put(`${apiUrl}/api/farms/f-kang/follow`, { headers: { Authorization: `Bearer ${token}` } });
});

async function openRoom(page: Page) {
  await page.goto(`${consumerUrl}/farms/f-kang`);
  await expect(page.getByText(MY_REPLY)).toBeVisible();
}

const dimmedReply = (page: Page) => page.getByTestId("room-dimmed-reply").filter({ hasText: MY_REPLY });
const followingButton = (page: Page) => page.getByRole("button", { name: "팔로잉, 누르면 팔로우를 끊어요" });
const followButton = (page: Page) => page.getByRole("button", { name: "팔로우", exact: true });

async function expectRestored(page: Page) {
  await expect(followingButton(page)).toBeVisible();
  await expect(page.getByText(FOLLOWER_POST)).toBeVisible();
  await expect(page.getByText(MY_REPLY)).toBeVisible();
  await expect(page.getByTestId("room-lapsed-banner")).toHaveCount(0);
  await expect(page.getByTestId("room-locked-input")).toHaveCount(0);
  await expect(page.getByTestId("room-dimmed-reply")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "농가에 답장" })).toBeVisible();
}

test("AC-06-8/AC-15-8: unfollow shows undo toast, keeps my reply dimmed, hides follower post; undo restores", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await openRoom(page);
  await expect(page.getByText(FOLLOWER_POST)).toBeVisible();

  await followingButton(page).click();

  await expect(page.getByText("팔로우를 끊었어요")).toBeVisible();
  const undo = page.getByRole("button", { name: "되돌리기" });
  await expect(undo).toBeVisible();
  await expect(page.getByTestId("room-lapsed-banner")).toContainText("팔로우를 끊어 새 소식이 오지 않아요");
  await expect(dimmedReply(page)).toBeVisible();
  await expect(dimmedReply(page)).toHaveCSS("opacity", "0.45");
  await expect(page.getByText(MY_REPLY)).toBeVisible();
  await expect(page.getByText(FOLLOWER_POST)).toHaveCount(0);
  await expect(page.getByTestId("room-locked-input")).toContainText("다시 팔로우하면 답장할 수 있어요");
  await expect(page.getByRole("button", { name: "팔로우하고 답장하기" })).toHaveCount(0);
  await expect(followButton(page)).toBeVisible();

  await undo.click();
  await expectRestored(page);
  assertClean();
});

test("AC-06-8: unfollowed farm leaves the chat list; banner re-follow restores room and list", async ({ page }) => {
  const assertClean = monitor(page);
  await loginConsumer(page);
  await openRoom(page);
  await followingButton(page).click();
  await expect(page.getByTestId("room-lapsed-banner")).toBeVisible();

  await page.goto(`${consumerUrl}/chats?view=news`);
  await expect(page.getByText("한라네 과수원").first()).toBeVisible();
  // 소식방 목록 줄만 본다. 숨겨 둔 1:1 목록에는 문의가 있는 방이 팔로우와 무관하게 남는다(consumer_chats `_has_inquiries`),
  // 앞 spec(AC-10-6 문의)이 같은 시드에서 돌면 getByText가 그 숨은 줄까지 세어 순서에 따라 실패했다
  await expect(page.getByRole("button", { name: /^강씨네 귤밭,/ })).toHaveCount(0);

  await openRoom(page);
  await expect(dimmedReply(page)).toBeVisible();
  await page.getByTestId("room-lapsed-banner").getByRole("button", { name: "다시 팔로우" }).click();
  await expectRestored(page);

  await page.goto(`${consumerUrl}/chats?view=news`);
  await expect(page.getByRole("button", { name: /^강씨네 귤밭,/ })).toBeVisible();
  assertClean();
});

test("AC-06-3: a consumer without replies who unfollows sees the first-visit room (no banner, join button)", async ({ page, request }) => {
  const assertClean = monitor(page);
  // 이서준(u-seojun)은 시드에서 강씨네에 답장(reply-2)이 있으므로 답장이 없는 한라 농가로 본다
  const token = await apiLogin(request, "u-minji", "consumer");
  const rooms = await (await request.get(`${apiUrl}/api/messaging/rooms/f-halla/messages`, { headers: { Authorization: `Bearer ${token}` } })).json();
  test.skip(
    rooms.items.some((m: { senderRole: string }) => m.senderRole === "CONSUMER"),
    "시드에 김민지의 한라 농가 답장이 있으면 이 경우를 만들 수 없다",
  );
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/farms/f-halla`);
  await followingButton(page).click();
  await expect(page.getByText("팔로우를 끊었어요")).toBeVisible();
  await expect(page.getByRole("button", { name: "팔로우하고 답장하기" })).toBeVisible();
  await expect(page.getByTestId("room-lapsed-banner")).toHaveCount(0);
  await expect(page.getByTestId("room-locked-input")).toHaveCount(0);
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(followingButton(page)).toBeVisible();
  assertClean();
});

test("HE-X4: order done screen unfollow uses the same undo toast", async ({ page, request }) => {
  const assertClean = monitor(page);
  // 완료 화면의 팔로우 카드는 처음에 팔로우하지 않은 농가에서만 보인다
  const token = await apiLogin(request, "u-minji", "consumer");
  await request.delete(`${apiUrl}/api/farms/f-kang/follow`, { headers: { Authorization: `Bearer ${token}` } });
  await loginConsumer(page);
  await page.goto(`${consumerUrl}/orders/o-42/done`);
  await followButton(page).click();
  await followingButton(page).click();
  await expect(page.getByText("팔로우를 끊었어요")).toBeVisible();
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect(followingButton(page)).toBeVisible();
  assertClean();
});
