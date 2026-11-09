// DEV-300 (FEAT-14 AC-14-3, SCR-22·23·물량·판매 설정): 중량 옵션마다 '예약+출하 N박스 / 판매 M박스'.
// 옵션끼리는 더하지 않는다(박스 무게가 달라 합치면 공유 물량을 두 번 센다, DEV-292). 기간은 모두 더한다.
// 박스 수는 기간·옵션별 `reservedCount`(예약+출하, 출하해도 줄지 않음)라 예약 중/출하 완료로 나누지 않는다.

export type OptionBoxes = {
  optionId: string;
  label: string;
  /** 모든 기간의 예약+출하 박스 */
  sold: number;
  /** 모든 기간의 판매 박스(기간 물량 합) */
  quantity: number;
};

const count = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

/** 상품 화면(`MyProduct`): 옵션 순서대로, 어느 기간에도 값이 없는 옵션은 0박스 */
export function optionBoxesFromProduct(
  options: readonly { optionId: string; label: string }[],
  stages: readonly {
    options: Readonly<
      Record<string, { quantity: number; reservedCount: number } | undefined>
    >;
  }[],
): OptionBoxes[] {
  return options.map(({ optionId, label }) => {
    let sold = 0,
      quantity = 0;
    for (const stage of stages) {
      const value = stage.options[optionId];
      sold += count(value?.reservedCount);
      quantity += count(value?.quantity);
    }
    return { optionId, label, sold, quantity };
  });
}

/** 현황(`Dashboard.stages`): 기간을 앞에서부터 읽으며 처음 나온 옵션 순서(서버가 상품 옵션 순서로 준다) */
export function optionBoxesFromDashboard(
  stages: readonly {
    options: readonly {
      optionId: string;
      label: string;
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
        sold: 0,
        quantity: 0,
      };
      row.sold += count(o.reserved);
      row.quantity += count(o.quantity);
      rows.set(o.optionId, row);
    }
  return [...rows.values()];
}

const n = (v: number) => v.toLocaleString("ko-KR");

/** '24박스 / 72박스' */
export function optionBoxesText(row: OptionBoxes): string {
  return `${n(row.sold)}박스 / ${n(row.quantity)}박스`;
}

/** 상품 카드 한 줄: '5kg 24박스 · 10kg 18박스'(예약+출하) */
export function optionBoxesLine(rows: readonly OptionBoxes[]): string {
  return rows.map((r) => `${r.label} ${n(r.sold)}박스`).join(" · ");
}

/** 판매 박스 대비 예약+출하 비율 0~1(막대용). 판매 박스가 0이면 0 */
export function optionBoxesRatio(row: OptionBoxes): number {
  return row.quantity > 0 ? Math.min(1, row.sold / row.quantity) : 0;
}

/** 화면 읽기: '5kg 예약·출하 24박스, 판매 72박스' */
export function optionBoxesLabel(row: OptionBoxes): string {
  return `${row.label} 예약·출하 ${n(row.sold)}박스, 판매 ${n(row.quantity)}박스`;
}
