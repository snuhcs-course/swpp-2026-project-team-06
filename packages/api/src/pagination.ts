import type { Paged } from "./types";

/** Read a complete cursor list; cancellation prevents stale polling from fetching more pages. */
export async function allPages<T>(
  load: (cursor?: string) => Promise<Paged<T>>,
  cancelled = () => false,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    if (cancelled()) return items;
    const page = await load(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor))
      throw new Error("목록을 불러오지 못했어요. 다시 시도해 주세요.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return items;
}
