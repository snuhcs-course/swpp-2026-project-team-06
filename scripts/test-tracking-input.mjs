// Incremental tracking number formatting and editing acceptance tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { editTrackingNumber, formatTrackingNumber, trackingUrl } from "../packages/api/src/carriers.ts";

for (const carrier of ["CJ", "HANJIN", "LOTTE", "LOGEN"]) {
  test(`AC17 invoice: ${carrier} formats recognized 12-digit numbers and is idempotent`, () => {
    for (const input of ["123456789012", "1234 5678 9012", "1234-5678-9012", " 1234-5678 9012 "]) {
      const formatted = formatTrackingNumber(carrier, input);
      assert.equal(formatted, "1234-5678-9012");
      assert.equal(formatTrackingNumber(carrier, formatted), formatted);
      const url = trackingUrl(carrier, formatted);
      assert.ok(url, "recognized carrier has a tracking URL");
      assert.ok(decodeURIComponent(url).includes("123456789012"));
      assert.ok(!decodeURIComponent(url).includes(formatted), "lookup strips display separators");
    }
  });
}

test("AC17 invoice: EPOST 13 digits and LOGEN 11 digits use their own grouping", () => {
  assert.equal(formatTrackingNumber("EPOST", "1234567890123"), "123456-7890123");
  assert.equal(formatTrackingNumber("EPOST", "123456 7890123"), "123456-7890123");
  assert.equal(formatTrackingNumber("LOGEN", "12345678901"), "123-4567-8901");
  assert.equal(formatTrackingNumber("LOGEN", "123-4567 8901"), "123-4567-8901");
});

test("AC17 invoice: partial numeric values group immediately, without trailing separators or truncation", () => {
  for (const carrier of ["CJ", "HANJIN", "LOTTE"])
    for (const [raw, expected] of [["", ""], ["1234", "1234"], ["12345", "1234-5"],
      ["12345678", "1234-5678"], ["123456789", "1234-5678-9"],
      ["12345678901234", "1234-5678-901234"], [" 123-45 ", "1234-5"]]) {
      assert.equal(formatTrackingNumber(carrier, raw), expected, `${carrier}: ${raw}`);
      assert.equal(formatTrackingNumber(carrier, expected), expected);
    }
  for (const [raw, expected] of [["123456", "123456"], ["1234567", "123456-7"],
    ["123456789012345", "123456-789012345"]])
    assert.equal(formatTrackingNumber("EPOST", raw), expected);
  for (const [raw, expected] of [["123", "123"], ["1234", "123-4"], ["1234567", "123-4567"],
    ["12345678", "123-4567-8"], ["12345678901", "123-4567-8901"],
    ["123456789012", "1234-5678-9012"], ["1234567890123", "1234-5678-90123"]])
    assert.equal(formatTrackingNumber("LOGEN", raw), expected);
});

test("AC17 invoice: alphanumeric and other carriers preserve the exact input", () => {
  for (const carrier of ["CJ", "HANJIN", "LOTTE", "LOGEN", "EPOST"])
    for (const input of ["ABCD12345678", "DEV25-1234", " 123A-456 "])
      assert.equal(formatTrackingNumber(carrier, input), input, `${carrier}: ${JSON.stringify(input)}`);
  for (const carrier of ["ETC", "UNKNOWN", null])
    for (const input of ["123456789012", " 1234 5678-9012 ", "내 송장 ABC"])
      assert.equal(formatTrackingNumber(carrier, input), input);
});

test("AC17 invoice: 49 and 50 digits remain within the server's 50-character save limit", () => {
  for (const carrier of ["CJ", "HANJIN", "LOTTE", "LOGEN", "EPOST"])
    for (const count of [49, 50]) {
      const raw = "1234567890".repeat(5).slice(0, count);
      const expected = carrier === "EPOST" && count === 49 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
      const formatted = formatTrackingNumber(carrier, raw);
      assert.equal(formatted.replace(/\D/g, ""), raw, `${carrier}: ${count} digits retained`);
      assert.ok(formatted.length <= 50, `${carrier}: ${count} digits remain saveable`);
      assert.equal(formatted, expected);
      const edited = editTrackingNumber(carrier, "", raw, { start: count, end: count }, { start: 0, end: 0 });
      assert.deepEqual(edited, { text: expected, selection: { start: expected.length, end: expected.length } });
    }
});

const caret = (position) => ({ start: position, end: position });
const digitsBeforeCaret = (result) => result.text.slice(0, result.selection.start).replace(/\D/g, "").length;

test("AC17 invoice editing: crossing a group boundary immediately formats and advances the caret", () => {
  assert.deepEqual(editTrackingNumber("CJ", "1234", "12345", caret(5), caret(4)),
    { text: "1234-5", selection: caret(6) });
  assert.deepEqual(editTrackingNumber("EPOST", "123456", "1234567", caret(7), caret(6)),
    { text: "123456-7", selection: caret(8) });
});

test("AC17 invoice editing: middle insertion and ordinary backspace preserve the digit-relative caret", () => {
  const inserted = editTrackingNumber("CJ", "1234-5678-9012", "1234-50678-9012", caret(7), caret(6));
  assert.deepEqual(inserted, { text: "1234-5067-89012", selection: caret(7) });
  const removed = editTrackingNumber("CJ", inserted.text, "1234-567-89012", caret(6), caret(7));
  assert.deepEqual(removed, { text: "1234-5678-9012", selection: caret(6) });
});

test("AC17 invoice editing: Backspace just after a separator removes the preceding digit", () => {
  const result = editTrackingNumber("CJ", "1234-5678-9012", "12345678-9012", caret(4), caret(5));
  assert.equal(result.text, "1235-6789-012");
  assert.deepEqual(result.selection, caret(3));
});

test("AC17 invoice editing: Delete just before a separator removes the following digit", () => {
  const result = editTrackingNumber("CJ", "1234-5678-9012", "12345678-9012", caret(4), caret(4));
  assert.equal(result.text, "1234-6789-012");
  assert.equal(result.selection.start, result.selection.end);
  assert.equal(digitsBeforeCaret(result), 4);
});

test("AC17 invoice editing: replacing a selected range preserves every untouched digit", () => {
  const result = editTrackingNumber("CJ", "1234-5678-9012", "123559012", caret(5), { start: 3, end: 10 });
  assert.deepEqual(result, { text: "1235-5901-2", selection: caret(6) });
});

test("AC17 invoice editing: a long paste and a regrouped LOGEN number retain all digits and caret offset", () => {
  const pasted = editTrackingNumber("CJ", "", "12345678901234567890", caret(20), caret(0));
  assert.deepEqual(pasted, { text: "1234-5678-901234567890", selection: caret(22) });
  const logen = editTrackingNumber("LOGEN", "123-4567-8901", "123-4567-89012", caret(14), caret(13));
  assert.deepEqual(logen, { text: "1234-5678-9012", selection: caret(14) });
});

test("AC17 invoice editing: unknown carrier and alphanumeric edits retain raw text and selection", () => {
  for (const [carrier, raw] of [["ETC", " 1234 5678-9012 "], ["UNKNOWN", "123456789012"], [null, "123456789012"],
    ["CJ", "DEV25-1234"], ["EPOST", " 123A-45 "]])
    assert.deepEqual(editTrackingNumber(carrier, "", raw, { start: 2, end: 5 }, caret(0)),
      { text: raw, selection: { start: 2, end: 5 } });
});
