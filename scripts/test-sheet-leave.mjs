// DEV-225 (screens.md 3장 시트, 결정 25): 시트 안 버튼으로 다른 화면으로 갈 때 시트를 애니메이션 없이 닫고 같은 틱에 이동한다.
// packages/ui/src/sheetLeave.ts는 import가 없어 node가 바로 읽는다. 화면에서의 확인은 scripts/e2e/sheet-close-navigation.spec.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { leaveSheet, sheetAnimation } from "../packages/ui/src/sheetLeave.ts";

test("DEV-225: a sheet slides normally and closes without animation only while leaving", () => {
  assert.equal(sheetAnimation(undefined), "slide");
  assert.equal(sheetAnimation(false), "slide");
  assert.equal(sheetAnimation(true), "none");
});

test("DEV-225: leaveSheet marks instant, closes, then navigates in the same tick", async () => {
  const calls = [];
  leaveSheet(
    () => calls.push("instant"),
    () => calls.push("close"),
    () => calls.push("go"),
  );
  // 기다리지 않는다: 닫힘 애니메이션 끝(onDismiss)에 이동을 걸면 애니메이션이 멈춘 창에서 이동도 멈춘다
  assert.deepEqual(calls, ["instant", "close", "go"]);
  await Promise.resolve();
  assert.deepEqual(calls, ["instant", "close", "go"]);
});
