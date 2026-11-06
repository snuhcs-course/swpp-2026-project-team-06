/** Private reading geometry only. No API, auth, storage, React, or message content. */
export type MessageAnchor = { messageId: string; relativeOffset: number };
export type ChatViewSnapshot = {
  version: 1;
  farmId: string;
  threadId: string;
  anchor: MessageAnchor | null;
  neighbors: MessageAnchor[];
  oldestLoadedMessageId: string | null;
  newestLoadedMessageId?: string | null;
  hasUnseenMessages?: boolean;
  nearBottom: boolean;
  scrollOffset: number;
  viewportHeight: number;
  contentHeight: number;
  capturedAt: number;
};
export type ChatViewScope = Readonly<{
  namespace: "consumer";
  userId: string;
  generation: number;
}>;
export type ChatViewLease = Readonly<{
  scope: ChatViewScope;
  farmId: string;
  threadId: string;
}>;
type Entry = { lease: ChatViewLease; snapshot: ChatViewSnapshot | null; usedAt: number };

export const CHAT_VIEW_LIMIT = 20;
export const CHAT_VIEW_IDLE_TTL = 30 * 60 * 1000;
const id = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 128;
const geometry = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 10_000_000;
const nonnegative = (value: unknown): value is number => geometry(value) && value >= 0;
function anchor(value: unknown): value is MessageAnchor {
  if (!value || typeof value !== "object") return false;
  const a = value as MessageAnchor;
  return id(a.messageId) && geometry(a.relativeOffset);
}

/** Whitelist copies prevent accidental retention of attached private fields. */
export function sanitizeChatView(value: unknown): ChatViewSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const s = value as ChatViewSnapshot;
  if (
    s.version !== 1 || !id(s.farmId) || !id(s.threadId) ||
    (s.anchor !== null && !anchor(s.anchor)) ||
    !Array.isArray(s.neighbors) || s.neighbors.length > 8 || !s.neighbors.every(anchor) ||
    (s.oldestLoadedMessageId !== null && !id(s.oldestLoadedMessageId)) ||
    (s.newestLoadedMessageId !== undefined && s.newestLoadedMessageId !== null && !id(s.newestLoadedMessageId)) ||
    (s.hasUnseenMessages !== undefined && typeof s.hasUnseenMessages !== "boolean") ||
    typeof s.nearBottom !== "boolean" || (!s.nearBottom && s.anchor === null) ||
    !nonnegative(s.scrollOffset) || !nonnegative(s.viewportHeight) ||
    !nonnegative(s.contentHeight) || !Number.isFinite(s.capturedAt) || s.capturedAt < 0
  ) return null;
  const copyAnchor = (a: MessageAnchor): MessageAnchor => ({
    messageId: a.messageId, relativeOffset: a.relativeOffset,
  });
  return {
    version: 1, farmId: s.farmId, threadId: s.threadId,
    anchor: s.anchor ? copyAnchor(s.anchor) : null,
    neighbors: s.neighbors.map(copyAnchor),
    oldestLoadedMessageId: s.oldestLoadedMessageId,
    newestLoadedMessageId: s.newestLoadedMessageId ?? null,
    hasUnseenMessages: s.hasUnseenMessages ?? false,
    nearBottom: s.nearBottom, scrollOffset: s.scrollOffset,
    viewportHeight: s.viewportHeight, contentHeight: s.contentHeight,
    capturedAt: s.capturedAt,
  };
}

export function anchorScrollTarget(
  messageTop: number, relativeOffset: number, contentHeight: number, viewportHeight: number,
): number {
  return Math.max(0, Math.min(messageTop - relativeOffset, Math.max(0, contentHeight - viewportHeight)));
}

export type ChatRowGeometry = { messageId: string; top: number; height: number };

/** Row y from ResizeObserver may be stale when only a preceding photo changes size.
 * Prefix sums depend on actual row heights, which do change in that case. */
export function chatRowGeometry(
  messageIds: readonly string[], heights: ReadonlyMap<string, number>,
  olderHeight: number | null, hasOlder: boolean,
): ChatRowGeometry[] {
  if (hasOlder && olderHeight === null) return [];
  let top = 20 + (hasOlder ? olderHeight! + 20 : 0);
  const rows: ChatRowGeometry[] = [];
  for (const messageId of messageIds) {
    const height = heights.get(messageId);
    // Nothing after an unmeasured row has a reliable prefix yet.
    if (height === undefined || !Number.isFinite(height) || height < 0) break;
    rows.push({ messageId, top, height });
    top += height + 20;
  }
  return rows;
}

export function visibleChatAnchors(
  rows: readonly ChatRowGeometry[], offset: number, viewportHeight: number,
): MessageAnchor[] {
  return rows.filter(row => row.top + row.height > offset && row.top < offset + viewportHeight)
    .slice(0, 9).map(row => ({ messageId: row.messageId, relativeOffset: row.top - offset }));
}

/** The primary ID wins, then the nearest saved visible row. Offsets stay signed. */
export function survivingChatAnchor(
  snapshot: Pick<ChatViewSnapshot, "anchor" | "neighbors">,
  messageIds: ReadonlySet<string>,
): MessageAnchor | null {
  return [snapshot.anchor, ...snapshot.neighbors]
    .find((a): a is MessageAnchor => a !== null && messageIds.has(a.messageId)) ?? null;
}

/** Guard every cursor walk (restore, catch-up and prepend) against broken APIs. */
export class ChatCursorTrail {
  private cursors = new Set<string>();
  private ids: Set<string>;
  constructor(initialIds: readonly string[] = []) { this.ids = new Set(initialIds); }
  accept(cursor: string, messageIds: readonly string[], nextCursor: string | null): void {
    if (this.cursors.has(cursor) || nextCursor === cursor ||
      (nextCursor !== null && this.cursors.has(nextCursor)))
      throw new Error("이전 대화를 불러오지 못했어요. 다시 시도해 주세요.");
    this.cursors.add(cursor);
    const progress = messageIds.some(messageId => !this.ids.has(messageId));
    if (!progress && nextCursor !== null)
      throw new Error("이전 대화를 불러오지 못했어요. 다시 시도해 주세요.");
    messageIds.forEach(messageId => this.ids.add(messageId));
  }
}

/** A lease also invalidates callbacks from a previous visit to the same room. */
export class ChatViewStateStore {
  private generation = 0;
  private current: ChatViewScope | null = null;
  private entries = new Map<string, Entry>();
  private clock: () => number;
  private limit: number;
  private ttl: number;

  constructor(options: { clock?: () => number; limit?: number; ttl?: number } = {}) {
    this.clock = options.clock ?? Date.now;
    this.limit = options.limit ?? CHAT_VIEW_LIMIT;
    this.ttl = options.ttl ?? CHAT_VIEW_IDLE_TTL;
    if (!Number.isInteger(this.limit) || this.limit < 1 || !(this.ttl > 0))
      throw new Error("Invalid chat view retention policy");
  }

  scope(): ChatViewScope | null { return this.current; }

  advanceGeneration(userId: string | null = null): ChatViewScope | null {
    this.entries.clear();
    this.generation++;
    this.current = userId === null ? null : Object.freeze({
      namespace: "consumer", userId, generation: this.generation,
    });
    return this.current;
  }

  clearAll(): void { this.advanceGeneration(this.current?.userId ?? null); }

  isCurrent(scope: ChatViewScope): boolean {
    return scope.namespace === "consumer" && scope.userId === this.current?.userId &&
      scope.generation === this.current?.generation;
  }

  isCurrentLease(lease: ChatViewLease): boolean {
    this.prune();
    return this.isCurrent(lease.scope) && this.entries.get(lease.threadId)?.lease === lease;
  }

  private prune(): void {
    for (const [key, entry] of this.entries)
      if (this.clock() - entry.usedAt >= this.ttl) this.entries.delete(key);
    while (this.entries.size > this.limit)
      this.entries.delete(this.entries.keys().next().value!);
  }

  open(scope: ChatViewScope, farmId: string, threadId: string):
    { lease: ChatViewLease; snapshot: ChatViewSnapshot | null } | null {
    if (!this.isCurrent(scope) || !id(farmId) || !id(threadId)) return null;
    this.prune();
    const old = this.entries.get(threadId);
    const snapshot = old?.lease.farmId === farmId ? sanitizeChatView(old.snapshot) : null;
    const lease = Object.freeze({ scope, farmId, threadId });
    this.entries.delete(threadId);
    this.entries.set(threadId, { lease, snapshot, usedAt: this.clock() });
    this.prune();
    return { lease, snapshot: snapshot ? sanitizeChatView(snapshot) : null };
  }

  save(lease: ChatViewLease, value: ChatViewSnapshot): boolean {
    this.prune();
    const entry = this.entries.get(lease.threadId);
    if (!this.isCurrent(lease.scope) || entry?.lease !== lease) return false;
    const snapshot = sanitizeChatView(value);
    if (!snapshot || snapshot.farmId !== lease.farmId || snapshot.threadId !== lease.threadId ||
      this.clock() - snapshot.capturedAt >= this.ttl) return false;
    this.entries.delete(lease.threadId);
    this.entries.set(lease.threadId, { lease, snapshot, usedAt: this.clock() });
    return true;
  }

  clearConversation(scope: ChatViewScope, threadId: string): void {
    if (this.isCurrent(scope)) this.entries.delete(threadId);
  }

  clearFarm(scope: ChatViewScope, farmId: string): void {
    if (!this.isCurrent(scope)) return;
    for (const [threadId, entry] of this.entries)
      if (entry.lease.farmId === farmId) this.entries.delete(threadId);
  }
}
