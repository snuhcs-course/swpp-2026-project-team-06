// DEV-300 (FEAT-14 AC-14-3, SCR-22·23·물량·판매 설정): 중량 옵션마다 '5kg  32,000원   24박스 / 72박스'.
// 11/10 생산자 인터뷰: 옵션별 박스당 가격과 박스 수가 주이고 kg 총량은 보조다.
// 옵션끼리는 더하지 않는다(박스 무게가 달라 합치면 공유 물량을 두 번 센다, DEV-292). 박스는 기간을 모두 더한다.
// 박스 수는 기간·옵션별 `reservedCount`(예약+출하, 출하해도 줄지 않음)라 예약 중/출하 완료로 나누지 않는다.
// 가격은 지금 판매 기간의 박스당 가격이고, 판매 기간이 없거나 그 기간에 옵션 값이 없으면 null이다.

export type OptionBoxes = {
  optionId: string;
  label: string;
  /** 지금 판매 기간의 박스당 가격. 없으면 null */
  price: number | null;
  /** 모든 기간의 예약+출하 박스 */
  sold: number;
  /** 모든 기간의 판매 박스(기간 물량 합) */
  quantity: number;
};

const count = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;

/**
 * 상품 화면(`MyProduct`): 옵션 순서대로, 어느 기간에도 값이 없는 옵션은 0박스.
 * 가격은 서버가 고른 지금 판매 기간(`MyProduct.currentStageId`, 목록 카드·현황과 같은 기준)의 것
 */
export function optionBoxesFromProduct(
  options: readonly { optionId: string; label: string }[],
  stages: readonly {
    stageId: string;
    options: Readonly<
      Record<
        string,
        { price: number; quantity: number; reservedCount: number } | undefined
      >
    >;
  }[],
  currentStageId: string | null,
): OptionBoxes[] {
  const current = stages.find((s) => s.stageId === currentStageId);
  return options.map(({ optionId, label }) => {
    let sold = 0,
      quantity = 0;
    for (const stage of stages) {
      const value = stage.options[optionId];
      sold += count(value?.reservedCount);
      quantity += count(value?.quantity);
    }
    return {
      optionId,
      label,
      price: money(current?.options[optionId]?.price),
      sold,
      quantity,
    };
  });
}

/** 상품 목록 카드(`MyProductCard.options`): 서버가 이미 모든 기간을 더하고 지금 기간 가격을 넣어 준다 */
export function optionBoxesFromCard(
  options: readonly {
    optionId: string;
    label: string;
    reserved: number;
    quantity: number;
    price: number | null;
  }[],
): OptionBoxes[] {
  return options.map((o) => ({
    optionId: o.optionId,
    label: o.label,
    price: money(o.price),
    sold: count(o.reserved),
    quantity: count(o.quantity),
  }));
}

/**
 * 현황(`Dashboard.stages`): 기간을 앞에서부터 읽으며 처음 나온 옵션 순서. 서버는 한 기간 안에서는 상품 옵션 순서로 주지만
 * 값이 없는 옵션은 빼므로, 앞 기간에 없던 옵션은 뒤로 갈 수 있다(대시보드에 옵션 목록이 없어 맞출 수 없음, 후속).
 * 가격은 `current` 기간의 옵션 가격(그 기간에 옵션이 없으면 null)
 */
export function optionBoxesFromDashboard(
  stages: readonly {
    current: boolean;
    options: readonly {
      optionId: string;
      label: string;
      price: number;
      reserved: number;
      quantity: number;
    }[];
  }[],
): OptionBoxes[] {
  const rows = new Map<string, OptionBoxes>();
  for (const stage of stages)
    for (const o of stage.options) {
      const row = rows.get(o.optionId) ?? {
        optionId: o.optionId,
        label: o.label,
        price: null,
        sold: 0,
        quantity: 0,
      };
      row.sold += count(o.reserved);
      row.quantity += count(o.quantity);
      if (stage.current) row.price = money(o.price);
      rows.set(o.optionId, row);
    }
  return [...rows.values()];
}

const n = (v: number) => v.toLocaleString("ko-KR");

/** '32,000원'. 가격이 없으면 빈 글자 */
export function optionPriceText(row: Pick<OptionBoxes, "price">): string {
  return row.price === null ? "" : `${n(row.price)}원`;
}

/** '24박스 / 72박스' */
export function optionBoxesText(row: OptionBoxes): string {
  return `${n(row.sold)}박스 / ${n(row.quantity)}박스`;
}

/** 판매 박스 대비 예약+출하 비율 0~1(막대용). 판매 박스가 0이면 0 */
export function optionBoxesRatio(row: OptionBoxes): number {
  return row.quantity > 0 ? Math.min(1, row.sold / row.quantity) : 0;
}

/** 화면 읽기: '5kg 32,000원, 예약·출하 24박스, 판매 72박스'(가격이 없으면 가격을 뺀다) */
export function optionBoxesLabel(row: OptionBoxes): string {
  const price = optionPriceText(row);
  return `${row.label}${price ? ` ${price},` : ""} 예약·출하 ${n(row.sold)}박스, 판매 ${n(row.quantity)}박스`;
}
