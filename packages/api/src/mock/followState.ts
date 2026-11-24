import type { FollowState } from "../types";
import { nowIso, type DB } from "./db";

/** Shared by explicit follow and automatic chat follow; successful saved actions only. */
export function setFollow(d: DB, userId: string, farmId: string, on: boolean): FollowState {
  const f = d.farms[farmId];
  const has = d.follows.some(x => x.userId === userId && x.farmId === farmId);
  const receipts = d.followReceipts ??= [];
  let receipt = receipts.find(x => x.userId === userId && x.farmId === farmId);
  let firstFollow = false;
  if (on && !has) {
    const createdAt = nowIso();
    if (!receipt) {
      receipt = { userId, farmId, createdAt, fanNumber: 1 + receipts.reduce((n, x) => x.farmId === farmId ? Math.max(n, x.fanNumber) : n, 0) };
      receipts.push(receipt);
      firstFollow = true;
    }
    d.follows.push({ userId, farmId, createdAt });
    f.followerCount += 1;
  } else if (!on && has) {
    d.follows = d.follows.filter(x => x.userId !== userId || x.farmId !== farmId);
    f.followerCount = Math.max(0, f.followerCount - 1);
  }
  return { following: on, followerCount: f.followerCount, firstFollow, fanNumber: receipt?.fanNumber ?? null };
}
