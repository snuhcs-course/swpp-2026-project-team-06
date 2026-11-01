import type { SourceExclusion } from "@farmclub/api";

const labels: Record<SourceExclusion["reason"], string> = {
  price: "금액은 다음 단계(판매·가격)에서 직접 채워 주세요. 배송비도 거기서 정해요.",
  period: "판매 기간과 받는 시기는 다음 단계(판매·가격)에서 직접 정해 주세요.",
  platform: "교환·환불·문의는 팜클럽 공통 정책에 따라 구매자에게 안내돼요. (출하 전 취소는 전액 환불, 배송 후 하자는 교환·환불)",
  health: "건강 효능 문구는 넣을 수 없어요",
  pii: "개인정보가 있어 상세에 넣지 않았어요",
  other_product: "다른 상품의 내용이라 넣지 않았어요",
  unsupported: "자료에서 근거를 확인하지 못해 넣지 않았어요",
  duplicate: "같은 내용이 있어 한 번만 넣었어요",
  unused: "이번 상세에 사용하지 않은 문구예요",
};

export function groupSourceExclusions(items: SourceExclusion[]) {
  const groups = new Map<string, SourceExclusion[]>();
  for (const item of items) {
    const label = labels[item.reason];
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return groups;
}
