/** 말풍선 묶음 한 칸: 보낸 사람, 한국 날짜("2026-10-07"), 분 단위 시각("오후 3:15") */
export type GroupKey = { sender: string; day: string; minute: string; solo?: boolean };

/**
 * 메신저처럼 같은 사람이 같은 날 같은 분에 연달아 보낸 말풍선을 한 묶음으로 본다(DEV-295, Figma 1:38).
 * 묶음 첫 말풍선에만 아바타·이름, 마지막 말풍선 옆에만 시각을 둔다. solo는 앞뒤와 묶지 않는다(예: 시스템 줄).
 * 의존성이 없는 순수 함수라 node 테스트에서 바로 읽는다.
 */
export function chatGroups(keys: GroupKey[]): { first: boolean; last: boolean }[] {
  const same = (a?: GroupKey, b?: GroupKey) =>
    !!a && !!b && !a.solo && !b.solo &&
    a.sender === b.sender && a.day === b.day && a.minute === b.minute;
  return keys.map((k, i) => ({
    first: !same(keys[i - 1], k),
    last: !same(k, keys[i + 1]),
  }));
}

/**
 * 상대가 마지막으로 읽은 메시지(readId)까지의 내 마지막 말풍선 위치. '읽음'은 이 하나에만 붙인다(DEV-295).
 * readId가 불러온 범위에 없으면(더 오래된 메시지거나 아직 안 읽음) -1.
 */
export function lastReadMine(
  messages: { messageId: string; senderType: string }[],
  readId: string | null | undefined,
  mineType: string,
): number {
  if (!readId) return -1;
  for (let i = messages.findIndex((m) => m.messageId === readId); i >= 0; i--)
    if (messages[i].senderType === mineType) return i;
  return -1;
}
