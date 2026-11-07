import type { ChatViewScope } from "@farmclub/ui";

type ScopeStore = {
  scope(): ChatViewScope | null;
  isCurrent(scope: ChatViewScope): boolean;
  advanceGeneration(userId: string | null): ChatViewScope | null;
};
/** Ephemeral authorization ticket, never copied into view metadata or storage. */
type RefreshTicket = Readonly<{
  eventSerial: number;
  requestSerial: number;
  token: string | null;
}>;

/** Check a freshly authorized server result before using its private view identity. */
export function matchesChatIdentity(
  thread: { threadId?: unknown; farmId?: unknown; consumerId?: unknown } | null | undefined,
  userId: string, farmId: string,
): boolean {
  return typeof thread?.threadId === "string" && thread.threadId.length > 0 &&
    thread.consumerId === userId && thread.farmId === farmId;
}

/**
 * Session events, rather than token equality, define private view boundaries.
 * Equal JWT bytes can represent a new login when the clock is fixed or two logins
 * happen in the same second. Only the latest auth.me request may establish scope.
 */
export class ChatSessionController {
  private eventSerial = 0;
  private requestSerial = 0;
  private store: ScopeStore;

  constructor(store: ScopeStore) {
    this.store = store;
    // A recreated provider must not inherit another provider's active leases.
    this.invalidate();
  }

  invalidate(): void {
    this.eventSerial++;
    this.requestSerial++;
    this.store.advanceGeneration(null);
  }

  beginRefresh(token: string | null): RefreshTicket {
    if (!token) this.invalidate();
    return Object.freeze({
      eventSerial: this.eventSerial,
      requestSerial: ++this.requestSerial,
      token,
    });
  }

  isCurrent(ticket: RefreshTicket, currentToken: string | null): boolean {
    return ticket.eventSerial === this.eventSerial &&
      ticket.requestSerial === this.requestSerial && ticket.token === currentToken;
  }

  authorize(
    ticket: RefreshTicket, currentToken: string | null, userId: string,
  ): ChatViewScope | null {
    if (!ticket.token || !this.isCurrent(ticket, currentToken)) return null;
    const current = this.store.scope();
    if (current?.userId === userId && this.store.isCurrent(current)) return current;
    return this.store.advanceGeneration(userId);
  }
}
