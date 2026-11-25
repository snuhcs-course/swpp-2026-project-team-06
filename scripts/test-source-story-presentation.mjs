import assert from "node:assert/strict";
import { test } from "node:test";
import { sourceCountSupplement, sourceMediaPresentation, sourceOptionParts, sourceTextPresentation } from "../packages/ui/src/sourceStoryPresentation.ts";

const module = (id, values) => ({ id, texts: values.map(value => ({ fieldKey: id, value })), photos: [] });

test("DEV-464 AC-SRC-7: option parts preserve exact source substrings and qualifiers", () => {
  const raw = "01 Sample fruit 1.5kg\nSize : medium\nCount : 8~18 pieces\nPacking : sample box";
  const value = sourceOptionParts(raw);
  assert.ok(value);
  assert.equal([value.prefix + value.weight, ...value.rows].join("\n"), raw);
  assert.equal(value.weight, "1.5kg");
});

test("DEV-464 AC-SRC-7: ambiguous ranges, alternatives and narrative stay prose", () => {
  for (const text of ["Fruit 2~3kg", "Fruit 2kg/3kg", "Fruit 2kg or 3kg", "Next year", "Fruit\nNo weight", "Fruit 2kg\nA separate story without a source label"]) {
    assert.equal(sourceOptionParts(text), null, text);
  }
});

test("DEV-464 AC-SRC-7: every option and count remains even when equal", () => {
  const values = [module("composition", ["Option A 3kg", "Option B 3kg"]), module("pieceCount", ["12과 내외", "12과 내외"]), module("specification", ["3kg"])];
  const before = structuredClone(values), ledger = sourceTextPresentation(values);
  assert.equal([...ledger.values()].filter(p => p.duplicateOf).length, 0);
  assert.deepEqual(values, before);
});

test("DEV-464 AC-SRC-7: only exact full narrative duplicates share one display owner", () => {
  const paragraph = "A carefully preserved complete source paragraph with a unique qualification.";
  const values = [module("summary", [paragraph]), module("farmStory", [paragraph, paragraph + " Only in winter."])];
  const ledger = sourceTextPresentation(values);
  assert.equal(ledger.get("farmStory:0").duplicateOf, "summary:0");
  assert.equal(ledger.get("farmStory:1").duplicateOf, null);
  assert.equal(ledger.get("farmStory:0").value, paragraph);
  assert.equal(sourceTextPresentation([values[1]]).get("farmStory:0").duplicateOf, null);
});

test("DEV-464 AC-SRC-7: negation, number and source condition differences remain distinct", () => {
  const ledger = sourceTextPresentation([module("summary", ["Our source says the fruit is not waxed, packed carefully.", "Our source says the fruit is waxed, packed carefully.", "Our source says 12 pieces are packed carefully in a box.", "Our source says 15 pieces are packed carefully in a box."])]);
  assert.equal([...ledger.values()].filter(p => p.duplicateOf).length, 0);
});

test("DEV-464 AC-SRC-7: only a simple shared count may join a single composition card", () => {
  assert.equal(sourceCountSupplement("(12과내)"), true);
  assert.equal(sourceCountSupplement("12~22과"), true);
  for (const value of ["* 수량은 수확 상황에 따라 다를 수 있습니다.", "12과지만 상품 상태에 따라 다릅니다.", "3kg", "2026년"]) assert.equal(sourceCountSupplement(value), false);
});

test("DEV-464 AC-SRC-9: duplicate source region shown once while other sources stay distinct", () => {
  const media = { sourceId: "a", sourceSha256: "a".repeat(64), sourceRegionId: "region" };
  const result = sourceMediaPresentation({ sections: [{ mediaIds: ["hero"] }, { mediaIds: ["duplicate", "other"] }], media: { hero: media, duplicate: media, other: { ...media, sourceId: "b" } } });
  assert.equal(result.get("hero"), true);
  assert.equal(result.get("duplicate"), false);
  assert.equal(result.get("other"), true);
});
