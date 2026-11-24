/** Fixed, versioned-by-ID Farmclub sticker catalogue. Labels also serve older clients. */
export const EMOTICONS = [
  { id: "farmclub-reserved", label: "예약했어요" },
  { id: "farmclub-paid", label: "입금했어요" },
  { id: "farmclub-packing", label: "포장 중이에요" },
  { id: "farmclub-shipping", label: "오늘 출하해요" },
  { id: "farmclub-arrived", label: "잘 도착했어요" },
  { id: "farmclub-delicious", label: "맛있어요" },
  { id: "farmclub-wait", label: "잠시만요" },
  { id: "farmclub-check", label: "확인 부탁해요" },
  { id: "farmclub-thanks", label: "고마워요" },
  { id: "farmclub-sorry", label: "미안해요" },
] as const;

export type EmoticonId = (typeof EMOTICONS)[number]["id"];
export const emoticonLabel = (id: string) => EMOTICONS.find(item => item.id === id)?.label;
export const isEmoticonId = (id: unknown): id is EmoticonId =>
  typeof id === "string" && EMOTICONS.some(item => item.id === id);
