// DEV-452 AC-SRC-2/5/9/11: bounded UI behavior with no API/provider calls.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const filename = new URL("../apps/producer/src/lib/SourceCopyReview.tsx", import.meta.url);
const code = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const passage = (reasons = []) => ({ id: "passage", bindingHash: "binding", module: "delivery", value: "원문", originalValue: "원문", candidateIds: [], evidence: [], queueKinds: ["OWNER_CONFIRMATION"], reasonCodes: { OWNER_CONFIRMATION: reasons, COPY_EDIT: [], PLACEMENT: [], SAFETY: [] }, repairValue: null, status: "PENDING", decision: null });
function harness(p = passage(), saveSucceeds = true, flush = true) {
  const data = { enabled: true, reviewVersion: 3, plan: { planHash: "hash", passages: [p] } };
  let latestData = data;
  const slots = []; let cursor = 0;
  const events = [];
  const exports = {};
  const element = (type, props) => ({ type, props });
  const api = {
    sourceCopy: async () => { events.push("get"); return latestData; },
    saveSourceCopy: async () => { events.push("save"); if (!saveSucceeds) throw new Error("저장 실패"); return data; },
  };
  const fakeRequire = (id) => {
    if (id === "react/jsx-runtime") return { jsx: element, jsxs: element, Fragment: "Fragment" };
    if (id === "react") return {
      useState: (initial) => {
        const key = cursor++;
        if (!(key in slots)) slots[key] = key === 0 ? data : typeof initial === "function" ? initial() : initial;
        return [slots[key], (value) => { slots[key] = typeof value === "function" ? value(slots[key]) : value; }];
      },
      useRef: (initial) => { const key = cursor++; return slots[key] ??= { current: initial }; },
      useEffect: () => {},
    };
    if (id === "@farmclub/api") return { sourceAnalysis: api };
    if (id === "@farmclub/ui") return { Button: "Button", Input: "Input", T: "T", SOURCE_MODULES: [["delivery", "배송 안내"]], tokens: { space: { gutter: 16 }, color: { border: "gray", error: "red" }, radius: { sm: 4 } } };
    if (id === "react-native") return { View: "View" };
    throw new Error(id);
  };
  vm.runInNewContext(code, { exports, require: fakeRequire });
  const props = { batchId: "batch", targetId: "target", enabled: true, reviewVersion: 3, locked: false,
    beforeMutation: async () => { events.push("flush"); return flush; },
    onReload: async () => { events.push("reload"); }, onBusy: () => {},
  };
  const render = () => { cursor = 0; return exports.SourceCopyReview(props); };
  const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
  const all = () => nodes(render());
  const press = (label) => { const button = all().find((n) => n.type === "Button" && n.props.label === label); assert.ok(button, label); button.props.onPress(); };
  return { all, press, events, slots, setLatest: (next, poll = false) => { latestData = next; if (poll) slots[0] = next; }, data, settle: async () => { for (let n = 0; n < 10; n++) await new Promise(setImmediate); } };
}
test("DEV-452 AC-SRC-5: date and price queues do not offer inline KEEP", () => {
  for (const reasons of [["RELATIVE_TIME"], ["PRICE_OR_FEE"]]) {
    const h = harness(passage(reasons));
    assert.equal(h.all().some((n) => n.props?.label === "원문 그대로 사용"), false);
  }
});
test("DEV-452 AC-SRC-9/11: failed manual editor flush aborts review mutation", async () => {
  const h = harness(passage(), true, false);
  h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush"]);
  assert.ok(h.all().some((n) => n.props?.label === "선택됨 · 원문 그대로 사용"));
});
test("DEV-452 AC-SRC-9/11: failed review save preserves choices and never reloads", async () => {
  const h = harness(passage(), false);
  h.press("직접 수정");
  h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.onChangeText("직접 쓴 현재 문구");
  h.all().find((n) => n.type === "Input" && n.props.label === "수정한 이유와 확인한 내용").props.onChangeText("생산자가 현재 조건 확인");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save"]);
  assert.equal(h.all().find((n) => n.type === "Input").props.value, "직접 쓴 현재 문구");
});
test("DEV-452 AC-SRC-9: successful save flushes before mutation and reloads afterward", async () => {
  const h = harness(); h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
  assert.equal(h.all().find((n) => n.props?.label === "검토 선택 저장").props.disabled, true);
});
test("DEV-452 AC-SRC-5: owner confirmation requires an entered note", async () => {
  const h = harness(passage(["DISPATCH_OR_DELIVERY"]));
  h.press("원문 그대로 사용"); h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, []);
  h.all().find((n) => n.type === "Input" && n.props.label === "현재도 맞는지 확인한 내용").props.onChangeText("2026-11-25에 배송 조건 확인");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "save", "reload"]);
});
test("DEV-452 AC-SRC-5: safety queue offers safe editing without a KEEP bypass", () => {
  const p = passage(); p.queueKinds = ["SAFETY"]; p.reasonCodes.SAFETY = ["HEALTH_CLAIM"]; p.status = "BLOCKED";
  const h = harness(p); h.press("배치·사용 제한 확인");
  assert.equal(h.all().some((n) => n.props?.label === "원문 그대로 사용"), false);
  assert.ok(h.all().some((n) => n.props?.label === "직접 수정"));
  assert.ok(h.all().some((n) => n.props?.label === "본문에서 제외"));
});
test("DEV-452 AC-SRC-9/11: another session's decision change conflicts against first-choice baseline despite polling", async () => {
  const h = harness();
  h.press("직접 수정");
  h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.onChangeText("내가 작성 중인 문구");
  h.all().find((n) => n.type === "Input" && n.props.label === "수정한 이유와 확인한 내용").props.onChangeText("내 확인 내용");
  const changed = structuredClone(h.data);
  changed.reviewVersion = 4;
  changed.plan.passages[0].decision = { bindingHash: "binding", action: "EDIT", value: "다른 화면의 문구", note: "다른 화면의 확인 내용", module: "delivery" };
  changed.plan.passages[0].value = "다른 화면의 문구";
  h.setLatest(changed, true);
  // Choosing another action must not refresh the original baseline.
  h.press("본문에서 제외");
  h.press("직접 수정");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get"]);
  assert.equal(h.all().find((n) => n.type === "Input" && n.props.label === "사용할 문구").props.value, "내가 작성 중인 문구");
  assert.ok(h.all().some((n) => n.type === "T" && n.props.children === "다른 화면의 문구"));
  h.press("저장 전 선택 취소");
  h.press("원문 그대로 사용");
  h.press("검토 선택 저장"); await h.settle();
  assert.deepEqual(h.events, ["flush", "get", "flush", "get", "save", "reload"]);
});
