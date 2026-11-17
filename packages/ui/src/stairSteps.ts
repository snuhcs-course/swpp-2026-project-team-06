// 가격 계단 계산(DEV-348, DEV-311 통합안 11/17 최종). 화면 없이 테스트할 수 있게 부품(PriceStair.tsx)과 나눈다(대소문자만 다른 파일 이름은 macOS에서 겹쳐 이름을 달리함).
// 상품 상세 응답의 stages만 쓴다(새 API 필드 없음). 칸마다 그 기간 가격을 보이되(11/17 PM 결정) 차액·이득 문구는 만들지 않는다.
// 테스트(node, 확장자 없는 import 불가)에서 바로 불러오도록 import를 두지 않고 날짜·금액 표기 함수를 인자로 받는다.

/** format.ts의 md·won과 같은 모양 */
export type StairFormat = {
  md: (iso: string) => string;
  won: (n: number) => string;
};

type StairStageInput = {
  stageId: string;
  seq?: number;
  startsAt?: string;
  endsAt?: string;
  options: Record<string, { price: number }>;
};

export type StairInput = {
  stages: StairStageInput[];
  currentStageId: string | null;
  soldOut: boolean;
  options: { optionId: string; label: string }[];
};

export type StairStep = {
  /** 칸 높이(px). 칸 순서로 오른다(가격 비례 아님) */
  height: number;
  now: boolean;
  /** 칸 아래 날짜 줄: 지금 칸 ‘10월 12일까지’(합친 구간의 끝), 뒤 칸 ‘10월 13일부터’(합친 구간의 시작) */
  date: string;
  /** 칸 아래 가격 줄 ‘33,000원’(첫 옵션). 옵션 이름은 제목 줄 ‘· 5kg 기준’에 한 번 */
  price: string;
};

export type Stair = {
  steps: StairStep[];
  /** 4칸 이상이면 ‘지금’을 지금 칸 위로 올리고 칸 아래에는 날짜만(DEV-311 11/16) */
  nowAbove: boolean;
  /** 지금 칸 아래 날짜 줄(‘지금 · 10월 12일까지’ 또는 칸 위로 올렸으면 날짜만) */
  nowLabel: string;
  /** 가격의 기준 옵션 이름(‘5kg’). 제목 줄에 ‘일찍 예약할수록 싸요 · 5kg 기준’ */
  basis: string;
};

/** 가장 낮은 칸과 가장 높은 칸(3칸이면 20·32·44) */
export const STAIR_MIN = 20;
export const STAIR_MAX = 44;
/** 이 칸 수부터 ‘지금’을 칸 위로 올린다 */
export const STAIR_SPLIT_AT = 4;

const order = (a: StairStageInput, b: StairStageInput) =>
  a.seq != null && b.seq != null
    ? a.seq - b.seq
    : (a.startsAt ?? a.endsAt ?? "").localeCompare(b.startsAt ?? b.endsAt ?? "");

/** 기간 시작일. 응답에 없으면 앞 기간 끝날 다음 날 */
function startOf(stages: StairStageInput[], i: number) {
  const s = stages[i];
  if (s.startsAt) return s.startsAt;
  const prev = stages[i - 1]?.endsAt;
  if (!prev) return null;
  const d = new Date(`${prev.slice(0, 10)}T12:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * 칸은 첫 옵션 가격이 실제로 오르는 곳에서만 나눈다(DEV-348 11/17 PM 결정 ‘가 + 다’): 이어지는 기간의 가격이 같으면 한 칸.
 * 계단을 그릴 수 없으면 null:
 * 예약할 수 없음 · 지금 기간 없음 · 남은 기간에 첫 옵션 가격이 빈 곳이 있음 · 합친 뒤 칸이 하나뿐 ·
 * 어느 칸이라도 앞 칸보다 싸짐(‘일찍 예약할수록 싸요’가 사실이 아니게 되므로, 마지막 가격이 높지 않으면 안 그리던 규칙을 넓힘).
 * 지난 기간은 예약할 수 없으니 그리지 않고, 지금 칸이 언제나 맨 왼쪽이다.
 */
export function priceStair(p: StairInput, { md, won }: StairFormat): Stair | null {
  if (p.soldOut || !p.currentStageId) return null;
  const option = p.options[0];
  if (!option) return null;
  const sorted = [...p.stages].sort(order);
  const at = sorted.findIndex((s) => s.stageId === p.currentStageId);
  if (at < 0) return null;
  const ahead = sorted.slice(at);
  const prices = ahead.map((s) => s.options[option.optionId]?.price);
  if (prices.some((v) => v == null)) return null;
  // 같은 가격이 이어지는 기간을 한 칸으로: [첫 기간 index, 끝 기간 index, 가격]
  const groups: { first: number; last: number; price: number }[] = [];
  prices.forEach((price, i) => {
    const g = groups[groups.length - 1];
    if (g && g.price === price) g.last = i;
    else groups.push({ first: i, last: i, price: price as number });
  });
  const n = groups.length;
  if (n < 2) return null;
  if (groups.some((g, i) => i > 0 && g.price < groups[i - 1].price)) return null;
  const nowAbove = n >= STAIR_SPLIT_AT;
  const steps = groups.map((g, i) => {
    let date = "";
    if (i === 0) {
      const end = ahead[g.last].endsAt;
      date = end ? `${md(end)}까지` : "";
    } else {
      const start = startOf(sorted, at + g.first);
      date = start ? `${md(start)}부터` : "";
    }
    return {
      height: Math.round(STAIR_MIN + ((STAIR_MAX - STAIR_MIN) * i) / (n - 1)),
      now: i === 0,
      date,
      price: won(g.price),
    };
  });
  const nowDate = steps[0].date;
  return {
    steps,
    nowAbove,
    nowLabel: nowAbove ? nowDate : nowDate ? `지금 · ${nowDate}` : "지금",
    basis: option.label,
  };
}
