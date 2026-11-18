import type { MyProduct } from "@farmclub/api";

const kg = (g: number) =>
  `${(g / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;

export type SoldOutGuide = {
  title: string;
  body: string;
  /** 보조 글자(없으면 null) */
  hint: string | null;
  /** ‘기간·가격에서 박스 늘리기’ 버튼을 보일지 */
  toStages: boolean;
};

/**
 * DEV-345: 물량·판매 설정(`products/[id]/sales.tsx`) 맨 위 안내. 판매 중(PUBLISHED) 품절 상품의 다음 행동 안내. 전체 물량 품절은 판매 한도·승인 물량 중 무엇을 늘려야 하는지,
 * 이번 기간 품절은 박스 수를 늘리면 된다고 알린다. 그 밖의 상태는 안내하지 않는다(null).
 * 승인 전 상품은 한도가 0이라 서버가 TOTAL_SOLD_OUT을 주지만 안내하지 않는다(심사 중은 상태만 보이고, 작성 중·반려는 판매·가격으로 옮긴다, DEV-361).
 */
export function soldOutGuide(
  p: Pick<
    MyProduct,
    | "status"
    | "availability"
    | "approvedSupplyGrams"
    | "salesLimitGrams"
    | "pendingCapacityRequest"
    | "currentStageId"
    | "options"
    | "stages"
  >,
): SoldOutGuide | null {
  if (p.status !== "PUBLISHED") return null;
  const current = p.stages.find((s) => s.stageId === p.currentStageId);
  // 옵션을 바꿔 지금 기간에 박스가 정해진 옵션이 하나도 없어도 서버는 TOTAL_SOLD_OUT을 준다(kg은 남음).
  // 이때는 kg 한도가 아니라 박스를 정해야 하므로 이번 기간 안내를 쓴다
  const noBoxes =
    !!current && p.options.every((o) => !current.options[o.optionId]);
  const boxesOut =
    !!current &&
    p.options.every((o) => {
      const v = current.options[o.optionId];
      return !v || v.quantity <= v.reservedCount;
    });
  if (p.availability === "TOTAL_SOLD_OUT" && !noBoxes) {
    if (p.approvedSupplyGrams > p.salesLimitGrams)
      return {
        title: "전체 물량 품절",
        body: `판매 한도 ${kg(p.salesLimitGrams)}를 모두 채웠어요. 승인 ${kg(p.approvedSupplyGrams)}까지 늘릴 수 있어요.`,
        hint: boxesOut
          ? "이번 기간에 남은 박스도 없어요. 기간·가격에서 박스 수도 늘려 주세요."
          : "한도를 늘린 뒤 박스가 모자라면 기간·가격에서 박스 수도 늘려 주세요.",
        toStages: boxesOut,
      };
    return {
      title: "전체 물량 품절",
      body: p.pendingCapacityRequest
        ? "승인 물량을 모두 썼어요. 물량 추가 신청을 심사 중이에요. 승인되면 늘릴 수 있어요."
        : "승인 물량을 모두 썼어요. 아래 ‘물량 추가 신청’ 후 운영자가 승인하면 늘릴 수 있어요.",
      hint: null,
      toStages: false,
    };
  }
  if (p.availability === "PERIOD_SOLD_OUT" || p.availability === "TOTAL_SOLD_OUT")
    return {
      title: "이번 기간 품절",
      body: "이번 기간에 남은 박스가 없어요. 기간·가격에서 박스 수를 늘리면 바로 다시 예약받아요.",
      hint: null,
      toStages: true,
    };
  return null;
}
