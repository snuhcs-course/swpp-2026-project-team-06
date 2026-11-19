// 생산자 상품 탭 상태 문구(apps/producer/src/lib/productGroups.ts productStatus) — 그룹 라벨과 판매 중 보조 상태 (AC-04-7, navigation-1.3 상품 표시 그룹, DEV-118)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isPreSale,
  productGroups,
  productStatus,
} from "../apps/producer/src/lib/productGroups.ts";

const card = (status, availability = "AVAILABLE", salesPaused = false) => ({
  status,
  availability,
  salesPaused,
});

test("AC-04-7: rejected products show 수정 필요 instead of their group label", () => {
  assert.equal(productStatus(card("REJECTED")), "수정 필요");
  assert.equal(productStatus(card("DRAFT")), "작성 중");
});

test("AC-04-7: selling products separate pre-open and sold-out sub-states", () => {
  assert.equal(productStatus(card("PUBLISHED")), "판매 중");
  assert.equal(
    productStatus(card("PUBLISHED", "NOT_OPEN")),
    "예약 시작 전",
  );
  assert.equal(
    productStatus(card("PUBLISHED", "TOTAL_SOLD_OUT")),
    "전체 물량 품절",
  );
  assert.equal(
    productStatus(card("PUBLISHED", "PERIOD_SOLD_OUT")),
    "이번 기간 품절",
  );
});

test("AC-04-7: sub-states only apply while selling; other groups use the group label", () => {
  assert.equal(productStatus(card("PENDING_APPROVAL", "NOT_OPEN")), "심사 중");
  assert.equal(
    productStatus(card("PUBLISHED", "TOTAL_SOLD_OUT", true)),
    "판매 중지",
  );
  assert.equal(productStatus(card("PUBLISHED", "ENDED")), "판매 종료");
  assert.equal(productStatus(card("CLOSED", "NOT_OPEN")), "판매 종료");
});

test("AC-04-7: every group has exactly one label in filter order", () => {
  assert.deepEqual(
    productGroups.map((g) => g.label),
    ["판매 중", "심사 중", "작성 중", "판매 중지", "판매 종료"],
  );
});

test("AC-04-1 DEV-361: only draft or rejected products with no approved supply are pre-sale (first request on /sell)", () => {
  const p = (status, approvedSupplyGrams = 0) => ({ status, approvedSupplyGrams });
  assert.equal(isPreSale(p("DRAFT")), true);
  assert.equal(isPreSale(p("REJECTED")), true);
  // 첫 신청 심사 중은 물량·판매 설정에서 상태를 본다
  assert.equal(isPreSale(p("PENDING_APPROVAL")), false);
  assert.equal(isPreSale(p("PUBLISHED", 2_400_000)), false);
  assert.equal(isPreSale(p("CLOSED")), false);
  // 승인 물량이 있으면 상태와 상관없이 판매 전이 아니다
  assert.equal(isPreSale(p("REJECTED", 1_000_000)), false);
});
