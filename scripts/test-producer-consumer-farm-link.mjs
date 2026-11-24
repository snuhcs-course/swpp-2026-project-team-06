// DEV-477: '소비자 앱에서 내 농가 보기'는 공유 링크(shareUrl)가 있는 농가만(SCR-30·SCR-33, FEAT-02 AC-02-3).
// 받는 중·조회 실패·링크 없음이면 줄을 두지 않는다(눌러도 반응 없는 줄을 만들지 않음).
import assert from "node:assert/strict";
import { test } from "node:test";
import { consumerFarmTarget } from "../apps/producer/src/lib/consumerFarmLink.ts";

test("AC-02-3 DEV-477 no row while the farm is loading or failed to load", () => {
  assert.equal(consumerFarmTarget(null), null); // useAsync data is null before the first response and after a failed first load
  assert.equal(consumerFarmTarget(undefined), null);
});

test("AC-02-3 DEV-477 no row for a farm without a share link (not approved, or hidden test/review farm)", () => {
  assert.equal(consumerFarmTarget({ farmId: "f-1", shareUrl: null }), null);
  assert.equal(consumerFarmTarget({ farmId: "f-1", shareUrl: "" }), null);
});

test("AC-02-3 DEV-477 the row opens the farm when the share link exists", () => {
  assert.equal(consumerFarmTarget({ farmId: "f-1", shareUrl: "https://farmclub.kr/s/farms/f-1" }), "f-1");
  assert.equal(consumerFarmTarget({ farmId: "", shareUrl: "https://farmclub.kr/s/farms/x" }), null);
});
