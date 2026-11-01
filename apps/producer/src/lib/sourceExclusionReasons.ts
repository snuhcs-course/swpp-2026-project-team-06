import type { SourceExclusion } from "@farmclub/api";

export const sourceExclusionReasons: Record<
  SourceExclusion["reason"],
  { label: string; explanation: string; detail?: string; accent: boolean }
> = {
  price: {
    label: "💰 금액",
    explanation: "가격·배송비는 다음 단계(판매·가격)에서 직접 정해 주세요.",
    accent: true,
  },
  period: {
    label: "📅 기간",
    explanation: "판매 기간이나 받는 날은 다음 단계(판매·가격)에서 정해요.",
    accent: true,
  },
  platform: {
    label: "🛡️ 팜클럽 정책",
    explanation: "교환·환불·문의는 팜클럽이 같은 기준으로 안내해 드려요.",
    detail: "출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불이에요.",
    accent: true,
  },
  health: {
    label: "🚫 건강 효능",
    explanation: "건강 효능은 상세 페이지에 넣을 수 없어요.",
    accent: true,
  },
  pii: {
    label: "🔒 개인정보",
    explanation: "개인정보가 있어 상세에 넣지 않았어요",
    accent: false,
  },
  other_product: {
    label: "📦 다른 상품",
    explanation: "다른 상품의 내용이라 넣지 않았어요",
    accent: false,
  },
  unsupported: {
    label: "❔ 근거 없음",
    explanation: "자료에서 근거를 확인하지 못해 넣지 않았어요",
    accent: false,
  },
  duplicate: {
    label: "🔁 중복",
    explanation: "같은 내용이 있어 한 번만 넣었어요",
    accent: false,
  },
  unused: {
    label: "💤 미사용",
    explanation: "이번 상세에 사용하지 않은 문구예요",
    accent: false,
  },
};

export function groupSourceExclusions(items: SourceExclusion[]) {
  const groups = new Map<SourceExclusion["reason"], SourceExclusion[]>();
  for (const item of items) {
    groups.set(item.reason, [...(groups.get(item.reason) ?? []), item]);
  }
  return groups;
}
