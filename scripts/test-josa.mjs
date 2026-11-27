// DEV-452 QA 11/28: Korean particles after quoted words in check questions and the name note.
import { test } from "node:test";
import assert from "node:assert/strict";
import { josa } from "../apps/producer/src/lib/josa.ts";

test("DEV-452 josa picks the particle by the last sound", () => {
  assert.equal(josa("‘천혜향’", "으로"), "‘천혜향’으로");
  assert.equal(josa("‘카라향’", "으로"), "‘카라향’으로");
  assert.equal(josa("‘한라봉 세트’", "으로"), "‘한라봉 세트’로");
  assert.equal(josa("‘서울’", "으로"), "‘서울’로");
  assert.equal(josa("‘조만간’", "은는"), "‘조만간’은");
  assert.equal(josa("‘올해’", "은는"), "‘올해’는");
  assert.equal(josa("‘10년’", "이가"), "‘10년’이");
  assert.equal(josa("‘2025’", "이가"), "‘2025’가");
  assert.equal(josa("‘친혜향’", "이가"), "‘친혜향’이");
});
