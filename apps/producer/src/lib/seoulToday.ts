import { serverNow } from "@farmclub/api";

export function seoulToday(): string {
  return new Date(serverNow() + 9 * 3600_000).toISOString().slice(0, 10);
}
