// 가격 계단 계산(DEV-348, DEV-311 통합안 11/17 최종). 화면 없이 테스트할 수 있게 부품(PriceStair.tsx)과 나눈다(대소문자만 다른 파일 이름은 macOS에서 겹쳐 이름을 달리함).
// 상품 상세 응답의 stages만 쓴다(새 API 필드 없음). 다음 기간 가격(nextPrice)은 쓰지 않는다.
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
  /** 칸 높이(px). 기간 순서로 오른다 */
  height: number;
  now: boolean;
  /** 칸 아래 날짜 줄: 지금 칸 ‘10월 12일까지’, 뒤 칸 ‘10월 13일부터’ */
  date: string;
};

export type Stair = {
  steps: StairStep[];
  /** 4칸 이상이면 ‘지금’을 지금 칸 위로 올리고 칸 아래에는 날짜만(DEV-311 11/16) */
  nowAbove: boolean;
  /** 지금 칸 아래 줄 전체(‘지금 · 10월 12일까지’ 또는 칸 위로 올렸으면 날짜만) */
  nowLabel: string;
  /** 마지막 칸 아래 둘째 줄 ‘5kg 36,000원’ */
  lastPrice: string;
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
 * 계단을 그릴 수 없으면 null:
 * 예약할 수 없음 · 지금 기간 없음 · 지금부터 남은 기간이 하나뿐 · 첫 옵션의 마지막 기간 가격이 지금보다 높지 않음.
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
  const n = ahead.length;
  if (n < 2) return null;
  const nowPrice = ahead[0].options[option.optionId]?.price;
  const lastPrice = ahead[n - 1].options[option.optionId]?.price;
  if (nowPrice == null || lastPrice == null || !(lastPrice > nowPrice)) return null;
  const nowAbove = n >= STAIR_SPLIT_AT;
  const steps = ahead.map((s, i) => {
    const start = startOf(sorted, at + i);
    return {
      height: Math.round(STAIR_MIN + ((STAIR_MAX - STAIR_MIN) * i) / (n - 1)),
      now: i === 0,
      date:
        i === 0
          ? s.endsAt
            ? `${md(s.endsAt)}까지`
            : ""
          : start
            ? `${md(start)}부터`
            : "",
    };
  });
  const nowDate = steps[0].date;
  return {
    steps,
    nowAbove,
    nowLabel: nowAbove ? nowDate : nowDate ? `지금 · ${nowDate}` : "지금",
    lastPrice: `${option.label} ${won(lastPrice)}`,
  };
}
