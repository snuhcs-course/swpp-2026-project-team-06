/** Preserve persisted insertion order, including equal-time questions and AI replies. */
export function sortChatMessages<T extends { sequence?: number; createdAt: string }>(messages: readonly T[]): T[] {
  const sequenced = messages.every(m => m.sequence !== undefined);
  return [...messages].sort((a, b) => sequenced
    ? a.sequence! - b.sequence!
    : a.createdAt.localeCompare(b.createdAt));
}

/** Refresh pages follow cached history; an older page precedes it. */
export function mergeChatMessages<T extends { messageId: string; sequence?: number; createdAt: string }>(old: readonly T[], incoming: readonly T[], older = false): T[] {
  const ids = new Set(incoming.map(m => m.messageId));
  const retained = old.filter(m => !ids.has(m.messageId));
  const ordered = older ? [...incoming, ...retained] : [...retained, ...incoming];
  return sortChatMessages([...new Map(ordered.map(m => [m.messageId, m])).values()]);
}
