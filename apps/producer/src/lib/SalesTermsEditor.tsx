// 판매 조건 편집부(DEV-361 PR C): 중량 옵션·받는 시기·전액 환불 날짜·예약 기간·가격·박스·배송비.
// 판매 전 상품의 판매·가격(SCR-24b, `mode="new"`)과 구매자에게 보이는 상품의 composer 판매 조건 시트(`mode="live"`)가 같이 쓴다.
// 판매할 총 물량·한 주문 최대는 여기 없다(판매·가격 화면에만, 승인 뒤 한 주문 최대는 물량·판매 설정, 결정 9).
import {
  newIdempotencyKey,
  type MyProduct,
  type ProductOption,
  type StageInput,
} from "@farmclub/api";
import { Button, Checkbox, Segmented, T, md, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";

import { FieldFeedback, FieldFeedbackContext } from "./FieldFeedback";
import { DateInput, DateSheet, NumField, addDays } from "./fields";
import { seoulToday } from "./HarvestStart";
import { FieldButton } from "./views";

const WEIGHTS = [3, 5, 10];
export type Cell = { price: number | null; quantity: number | null };
export type TermsRow = {
  key: string;
  stageId?: string;
  startsAt: string;
  endsAt: string;
  options: Record<string, Cell>;
};
export type Terms = {
  options: ProductOption[];
  deliveryWindow: { start: string; end: string } | null;
  maxDelayUntil: string | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number | null;
  remoteAreaFee: number | null;
  rows: TermsRow[];
};
/** 칸 묶음 이름(FieldFeedback). 서버 오류 칸은 `SELL_FIELD_GROUPS`로 같은 이름이 된다 */
export type TermsField = "options" | "delivery" | "prices" | "shipping";

/** 중량 옵션 하나. ID는 서버가 라벨에서 만드는 것과 같은 꼴(`opt-5`, 소수점은 `opt-2_5`) */
export const weightOption = (w: number): ProductOption => ({
  optionId: `opt-${String(w).replace(".", "_")}`,
  label: `${w}kg`,
  weightKg: w,
});
/** 직접 입력한 중량(PM 11/18): 0.1kg~100kg, 소수점 한 자리, 이미 있는 중량은 안 됨. 문제가 없으면 null */
export function customWeightError(w: number | null, options: ProductOption[]): string | null {
  if (w == null) return "중량을 적어 주세요.";
  if (w <= 0) return "0보다 큰 중량을 적어 주세요.";
  if (w < 0.1 || w > 100) return "0.1kg에서 100kg 사이로 적어 주세요.";
  if (Math.round(w * 10) !== w * 10) return "소수점 한 자리까지 적어 주세요.";
  if (options.some((o) => o.weightKg === w)) return "이미 있는 중량이에요.";
  return null;
}
const lastStageDay = (deliveryStart: string | undefined, from: string) =>
  deliveryStart ? addDays(deliveryStart, -1) : addDays(from, 7);

/**
 * 아직 서버에 없는 기간(상품 초안에 담긴 새 기간)을 화면 값에서 가리키는 표시용 ID 앞머리. 저장·반영 본문에는
 * 보내지 않는다(서버는 모르는 기간 ID를 400으로 거절한다, DEV-361 scan-before-merge)
 */
export const NEW_STAGE_PREFIX = "draft-new:";
/** 상품 값 → 편집 값. 기간이 없으면 오늘부터 받는 시기 전날까지 한 기간 */
export function termsFrom(p: Pick<MyProduct, "options" | "deliveryWindow" | "maxDelayUntil" | "shippingFeeType" | "shippingFee" | "remoteAreaFee" | "stages">): Terms {
  return {
    options: p.options,
    deliveryWindow: p.deliveryWindow,
    maxDelayUntil: p.maxDelayUntil,
    shippingFeeType: p.shippingFeeType,
    shippingFee: p.shippingFeeType === "SEPARATE" ? p.shippingFee : null,
    remoteAreaFee: p.remoteAreaFee,
    rows: p.stages.length
      ? [...p.stages]
          .sort((a, b) => a.seq - b.seq)
          .map((s) => ({
            key: s.stageId,
            ...(s.stageId.startsWith(NEW_STAGE_PREFIX) ? {} : { stageId: s.stageId }),
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            options: Object.fromEntries(
              Object.entries(s.options).map(([k, v]) => [
                k,
                { price: v.price, quantity: v.quantity },
              ]),
            ),
          }))
      : [
          {
            key: newIdempotencyKey(),
            startsAt: seoulToday(),
            endsAt: lastStageDay(p.deliveryWindow?.start, seoulToday()),
            options: {},
          },
        ],
  };
}

/** 비교용 문자열(행 key·적었다 지운 빈 칸·지운 옵션의 칸은 뺌) */
export function termsKey(t: Terms): string {
  const ids = new Set(t.options.map((o) => o.optionId));
  return JSON.stringify([
    t.options,
    t.deliveryWindow,
    t.maxDelayUntil,
    t.shippingFeeType,
    t.shippingFeeType === "SEPARATE" ? t.shippingFee : null,
    t.remoteAreaFee ?? 0,
    t.rows.map((r) => [
      r.stageId ?? null,
      r.startsAt,
      r.endsAt,
      Object.entries(r.options)
        .filter(([k, c]) => ids.has(k) && (c.price != null || c.quantity != null))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, c]) => [k, c.price, c.quantity]),
    ]),
  ]);
}

export const cellOf = (r: TermsRow, optionId: string): Cell =>
  r.options[optionId] ?? { price: null, quantity: null };

/** 기간 저장 본문(PUT stages·상품 초안). 칸이 모두 찼을 때만 부른다(checkTerms 뒤) */
export function termsStages(t: Terms): StageInput[] {
  return t.rows.map((r) => ({
    ...(r.stageId ? { stageId: r.stageId } : {}),
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    options: Object.fromEntries(
      t.options.map((o) => {
        const c = cellOf(r, o.optionId);
        return [o.optionId, { price: c.price!, quantity: c.quantity! }];
      }),
    ),
  }));
}

/** 화면 검사. 서버도 같은 규칙(R-18 기간·가격, AC-04-1 필수 칸)을 다시 본다. 첫 문제만 돌려준다 */
export function checkTerms(t: Terms): { field: TermsField; message: string } | null {
  const bad = (field: TermsField, message: string) => ({ field, message });
  if (!t.options.length) return bad("options", "중량 옵션을 하나 이상 골라 주세요.");
  if (!t.deliveryWindow) return bad("delivery", "받는 시기를 정해 주세요.");
  if (!t.maxDelayUntil) return bad("delivery", "전액 환불 날짜를 정해 주세요.");
  if (t.maxDelayUntil <= t.deliveryWindow.end)
    return bad("delivery", "전액 환불 날짜는 받는 시기가 끝난 다음 날 이후여야 해요.");
  if (!t.rows.length) return bad("prices", "예약 기간을 하나 이상 두어 주세요.");
  for (const r of t.rows)
    for (const o of t.options) {
      const c = cellOf(r, o.optionId);
      if (!c.price || c.quantity == null)
        return bad("prices", `${o.label}의 가격과 박스 수를 모두 적어 주세요.`);
    }
  for (const o of t.options)
    for (let i = 1; i < t.rows.length; i++)
      if (cellOf(t.rows[i], o.optionId).price! <= cellOf(t.rows[i - 1], o.optionId).price!)
        return bad("prices", `${o.label}: 뒤 기간 가격이 앞 기간보다 비싸야 해요(얼리버드).`);
  if (t.rows.some((r) => r.startsAt > r.endsAt))
    return bad("delivery", "예약 기간의 시작일이 끝일보다 늦어요. 기간을 지우거나 받는 시기를 늦춰 주세요.");
  if (t.rows.at(-1)!.endsAt >= t.deliveryWindow.start)
    return bad("delivery", "예약 기간은 받는 시기 전날까지 끝나야 해요.");
  if (t.shippingFeeType === "SEPARATE" && !t.shippingFee)
    return bad("shipping", "배송비를 따로 받으면 금액을 적어 주세요.");
  return null;
}

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

/**
 * 판매 조건 칸. `value`를 고치면 `onChange`로 새 값을 준다(저장은 부르는 쪽).
 * `mode="new"`: 판매 전(얼리버드 기간을 앞에 더함, 기간이 하나면 받는 시기에 끝을 맞춤).
 * `mode="live"`: 판매 중·승인 대기(기간마다 날짜를 고치고 뒤에 기간을 더함, 예약이 있는 기간은 날짜 고정·삭제 불가, 예전 SCR-26).
 */
export function SalesTermsEditor({
  value,
  onChange,
  mode,
  editable,
  busy = false,
  product,
  children,
}: {
  value: Terms;
  onChange: (next: Terms) => void;
  mode: "new" | "live";
  editable: boolean;
  busy?: boolean;
  /** 예약 수(확보 박스·잠긴 기간·R-21 안내)를 읽는다 */
  product: Pick<MyProduct, "stages" | "deliveryWindow" | "reservedCount">;
  /** 배송비 뒤에 붙는 칸(판매·가격의 물량) */
  children?: ReactNode;
}) {
  const [sheet, setSheet] = useState<null | "delivery" | "maxDelay">(null);
  const t = value;
  // 이 편집부가 마지막으로 넘긴 값. 다른 값이 들어오면(부르는 쪽이 다시 불러와 채움) 밖에서 바꾼 것이다
  const emitted = useRef<Terms | null>(null);
  const set = <K extends keyof Terms>(k: K, v: Terms[K]) => {
    const next = { ...t, [k]: v };
    emitted.current = next;
    onChange(next);
  };
  const off = !editable || busy;
  // 직접 입력(PM 11/18): '직접 입력'을 누르면 kg 칸이 열리고 '추가'를 누를 때 검사한다(누르면 강조, 11/18 규칙)
  const [custom, setCustom] = useState<{ open: boolean; value: number | null; error: string | null; attempt: number }>({
    open: false,
    value: null,
    error: null,
    attempt: 0,
  });
  // 이 편집에서 끈 옵션(원래 ID·라벨·메모). 다시 켜면 새로 만들지 않고 이것을 되살린다(4차 scan):
  // 새 ID로 만들면 서버가 예전 옵션을 지우려 하고, 주문이 있으면 409다. 끈 3·5·10kg 밖 옵션은 꺼진 체크 상자로 남는다
  const [shelf, setShelf] = useState<ProductOption[]>([]);
  // 값을 밖에서 통째로 바꾸면(다시 불러오기·돌아와 채우기) 끈 옵션 기억도 버린다(5차 scan)
  useEffect(() => {
    if (value !== emitted.current) setShelf([]);
  }, [value]);
  const byKg = (a: { weightKg: number }, b: { weightKg: number }) => a.weightKg - b.weightKg;
  const turnOn = (w: number) => {
    // 같은 중량 옵션이 여럿이었으면(서버가 opt-5-2를 만들 수 있음) 모두 되살린다
    const kept = shelf.filter((o) => o.weightKg === w);
    if (kept.length) setShelf(shelf.filter((o) => o.weightKg !== w));
    set("options", [...t.options, ...(kept.length ? kept : [weightOption(w)])].sort(byKg));
  };
  const addCustom = () => {
    // 꺼 둔 옵션과 같은 중량이면 그 옵션을 다시 켠다
    const error = shelf.some((o) => o.weightKg === custom.value) ? null : customWeightError(custom.value, t.options);
    if (error) return setCustom((c) => ({ ...c, error, attempt: c.attempt + 1 }));
    turnOn(custom.value!);
    setCustom({ open: false, value: null, error: null, attempt: 0 });
  };
  // 3·5·10kg와 그 밖의 중량(직접 입력, 예전 옵션, 이 편집에서 끈 옵션)을 가벼운 순서로 한 줄에(PM 11/18)
  // 중량마다 체크 상자 하나(켜진 옵션이 먼저, 꺼 둔 옵션은 그 중량이 켜져 있지 않을 때만)
  const others = new Map<number, ProductOption>();
  for (const o of [...t.options, ...shelf]) if (!WEIGHTS.includes(o.weightKg) && !others.has(o.weightKg)) others.set(o.weightKg, o);
  const weightChoices = [
    ...WEIGHTS.map((w) => ({ key: `w-${w}`, weightKg: w, label: `${w}kg` })),
    ...[...others.values()].map((o) => ({ key: `o-${o.weightKg}`, weightKg: o.weightKg, label: o.label })),
  ].sort(byKg);
  // 기간 가격·박스 줄도 가벼운 순서
  const byWeight = [...t.options].sort(byKg);
  const toggleWeight = (w: number) => {
    const on = t.options.filter((o) => o.weightKg === w);
    if (!on.length) return turnOn(w);
    // 그 중량 옵션을 모두 끈다(5차 scan: 하나만 끄면 체크 상자가 켜진 채로 남음)
    setShelf([...shelf.filter((o) => o.weightKg !== w), ...on]);
    set("options", t.options.filter((o) => o.weightKg !== w));
  };
  const setRow = (i: number, patch: Partial<TermsRow>) =>
    set("rows", t.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setCell = (i: number, optionId: string, patch: Partial<Cell>) =>
    setRow(i, {
      options: { ...t.rows[i].options, [optionId]: { ...cellOf(t.rows[i], optionId), ...patch } },
    });
  const reserved = (r: TermsRow, optionId: string) =>
    product.stages.find((s) => s.stageId === r.stageId)?.options[optionId]?.reservedCount ?? 0;
  const locked = (r: TermsRow) =>
    mode === "live" &&
    !!product.stages.find((s) => s.stageId === r.stageId && Object.values(s.options).some((v) => v.reservedCount > 0));
  const deliveryChanged =
    !!product.deliveryWindow &&
    !!t.deliveryWindow &&
    (t.deliveryWindow.start !== product.deliveryWindow.start || t.deliveryWindow.end !== product.deliveryWindow.end);
  // 기간이 하나면(판매 전) 받는 시기에 맞춰 끝을 당기므로 첫날 다음 날부터 고를 수 있다. 여럿이면 마지막 기간 뒤부터.
  const last = t.rows.at(-1);
  const deliveryMin = [
    addDays(seoulToday(), 1),
    ...(last ? [addDays(mode === "new" && t.rows.length === 1 ? t.rows[0].startsAt : last.endsAt, 1)] : []),
  ]
    .sort()
    .pop()!;
  return (
    <View style={{ gap: 24 }} testID="sales-terms-editor">
      <FieldFeedback field="options">
        <Sec title="중량 옵션">
          <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 8 }}>
            {weightChoices.map((c) => (
              <Checkbox
                key={c.key}
                label={c.label}
                checked={t.options.some((o) => o.weightKg === c.weightKg)}
                onPress={() => !off && toggleWeight(c.weightKg)}
              />
            ))}
          </View>
          {!editable ? null : custom.open ? (
            <View style={{ gap: 6 }} testID="custom-weight">
              <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                <View style={{ flex: 1 }}>
                  {/* 이 칸만의 강조(판매 조건 칸 묶음 강조와 따로) */}
                  <FieldFeedbackContext.Provider
                    value={{
                      fields: custom.error ? { customWeight: custom.error } : {},
                      clear: () => setCustom((c) => ({ ...c, error: null })),
                      attempt: custom.attempt,
                    }}
                  >
                    <FieldFeedback field="customWeight" outline={false}>
                      <NumField
                        label="직접 입력 중량"
                        decimal
                        unit="kg"
                        placeholder="예: 2.5"
                        value={custom.value}
                        error={!!custom.error}
                        disabled={busy}
                        onChange={(value) => setCustom((c) => ({ ...c, value, error: null }))}
                      />
                    </FieldFeedback>
                  </FieldFeedbackContext.Provider>
                </View>
                <Button label="추가" variant="outline" disabled={busy} onPress={addCustom} />
              </View>
              {custom.error ? (
                <T variant="caption" color={tokens.color.error}>
                  {custom.error}
                </T>
              ) : (
                <T variant="caption" muted>
                  0.1kg~100kg, 소수점 한 자리까지
                </T>
              )}
            </View>
          ) : (
            <Button
              label="직접 입력"
              variant="text"
              icon="plus"
              compact
              disabled={busy}
              style={{ alignSelf: "flex-start" }}
              onPress={() => setCustom((c) => ({ ...c, open: true }))}
            />
          )}
        </Sec>
      </FieldFeedback>

      <FieldFeedback field="delivery">
        <Sec title="받는 시기">
          <FieldButton
            highlight={editable}
            disabled={off}
            label="받는 시기"
            value={t.deliveryWindow ? `${md(t.deliveryWindow.start)} ~ ${md(t.deliveryWindow.end)}` : ""}
            placeholder="날짜를 골라 주세요"
            onPress={() => !off && setSheet("delivery")}
          />
          {mode === "live" && deliveryChanged && product.reservedCount > 0 ? (
            <T variant="caption" color={tokens.color.error}>
              예약한 {product.reservedCount}명에게 새 기간 동의를 받아요. 동의하지 않으면 전액 환불돼요.
            </T>
          ) : null}
          <FieldButton
            highlight={editable}
            disabled={off}
            label="이 날까지 못 보내면 전액 환불"
            value={md(t.maxDelayUntil)}
            placeholder="날짜를 골라 주세요"
            onPress={() => !off && setSheet("maxDelay")}
          />
        </Sec>
      </FieldFeedback>

      <FieldFeedback field="prices">
        <Sec title={mode === "new" ? "가격" : "예약 기간·가격·박스"}>
          <T variant="sub" muted>
            {mode === "new"
              ? "옵션마다 가격과 이번 기간에 팔 박스 수를 적어 주세요. 얼리버드 기간을 더하면 앞 기간을 더 싸게 받을 수 있어요."
              : "바꾼 가격·박스는 새 예약부터 적용돼요. 이미 결제한 주문의 가격은 그대로예요."}
          </T>
          {t.rows.map((r, i) => {
            const fixed = locked(r);
            return (
              <View
                key={r.key}
                testID="price-period"
                style={{ padding: 16, gap: 14, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 16 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T weight="semibold" style={{ flex: 1 }}>
                    {t.rows.length > 1 ? `${i + 1}기간 · ` : ""}
                    {md(r.startsAt)} ~ {md(r.endsAt)} 예약
                  </T>
                  {t.rows.length > 1 && editable && !fixed ? (
                    <Button
                      label="기간 삭제"
                      variant="text"
                      compact
                      disabled={busy}
                      onPress={() => set("rows", t.rows.filter((_, j) => j !== i))}
                    />
                  ) : null}
                </View>
                {mode === "live" ? (
                  fixed ? (
                    <T variant="caption" muted>
                      예약 이력이 있어 날짜는 유지해요. 가격은 새 주문부터 적용돼요.
                    </T>
                  ) : editable ? (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <DateInput label="예약 시작일" value={r.startsAt} onChange={(startsAt) => setRow(i, { startsAt })} />
                      <DateInput label="예약 종료일" value={r.endsAt} onChange={(endsAt) => setRow(i, { endsAt })} />
                    </View>
                  ) : null
                ) : null}
                {byWeight.length ? (
                  byWeight.map((o) => (
                    <View key={o.optionId} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        <NumField
                          highlight={editable}
                          disabled={off}
                          label={`${o.label} 가격`}
                          value={cellOf(r, o.optionId).price}
                          unit="원"
                          onChange={(price) => !off && setCell(i, o.optionId, { price })}
                        />
                        <NumField
                          highlight={editable}
                          disabled={off}
                          label={`${o.label} 박스 수`}
                          value={cellOf(r, o.optionId).quantity}
                          unit="박스"
                          onChange={(quantity) => !off && setCell(i, o.optionId, { quantity })}
                        />
                      </View>
                      {reserved(r, o.optionId) ? (
                        <T variant="caption" muted>
                          {reserved(r, o.optionId)}박스 확보됨
                        </T>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <T variant="sub" muted>
                    위에서 중량 옵션을 먼저 골라 주세요.
                  </T>
                )}
              </View>
            );
          })}
          {editable ? (
            <Button
              label={mode === "new" ? "＋ 얼리버드 기간 추가" : "＋ 예약 기간 추가"}
              variant="outline"
              disabled={busy}
              onPress={() => {
                if (mode === "live" || !t.rows.length) {
                  const start = addDays(t.rows.at(-1)?.endsAt ?? seoulToday(), 1);
                  set("rows", [
                    ...t.rows,
                    { key: newIdempotencyKey(), startsAt: start, endsAt: lastStageDay(t.deliveryWindow?.start, start), options: {} },
                  ]);
                  return;
                }
                // 새 기간을 맨 앞에 넣고(더 이른 예약), 기존 첫 기간은 그다음 날부터.
                const first = t.rows[0];
                const split = addDays(first.startsAt, 6);
                const early: TermsRow = {
                  key: newIdempotencyKey(),
                  startsAt: first.startsAt,
                  endsAt: split < first.endsAt ? split : first.startsAt,
                  options: {},
                };
                set("rows", [early, { ...first, startsAt: addDays(early.endsAt, 1) }, ...t.rows.slice(1)]);
              }}
            />
          ) : null}
          {mode === "live" ? (
            <T variant="caption" muted>
              기간 사이를 비워 두면 그동안 예약을 받지 않아요. 모든 예약 기간은 받는 시기 전에 끝나야 해요.
            </T>
          ) : null}
        </Sec>
      </FieldFeedback>

      <FieldFeedback field="shipping">
        <Sec title="배송비">
          <Segmented
            options={[
              { value: "FREE", label: "무료" },
              { value: "SEPARATE", label: "따로 받기" },
            ]}
            value={t.shippingFeeType}
            onChange={(v) => !off && set("shippingFeeType", v)}
          />
          {t.shippingFeeType === "SEPARATE" ? (
            <NumField
              highlight={editable}
              disabled={off}
              label="배송비"
              value={t.shippingFee}
              onChange={(v) => !off && set("shippingFee", v)}
              unit="원"
            />
          ) : null}
          <NumField
            highlight={editable}
            disabled={off}
            label="도서산간 추가 운임"
            value={t.remoteAreaFee}
            onChange={(v) => !off && set("remoteAreaFee", v)}
            unit="원"
          />
        </Sec>
      </FieldFeedback>
      {children}

      <DateSheet
        visible={sheet === "delivery"}
        title="받는 시기"
        range
        start={t.deliveryWindow?.start ?? null}
        end={t.deliveryWindow?.end ?? null}
        min={deliveryMin}
        note="예약 기간이 끝난 다음 날부터 고를 수 있어요."
        onClose={() => setSheet(null)}
        onSave={(start, end) => {
          // 판매 전 기간이 하나뿐이면 받는 시기 전날까지 예약을 받도록 끝을 맞춘다.
          onChange({
            ...t,
            deliveryWindow: { start, end },
            rows: mode === "new" && t.rows.length === 1 ? [{ ...t.rows[0], endsAt: addDays(start, -1) }] : t.rows,
          });
          setSheet(null);
        }}
      />
      <DateSheet
        visible={sheet === "maxDelay"}
        title="이 날까지 못 보내면 전액 환불"
        range={false}
        start={t.maxDelayUntil}
        min={t.deliveryWindow?.end ? addDays(t.deliveryWindow.end, 1) : addDays(seoulToday(), 1)}
        onClose={() => setSheet(null)}
        onSave={(d) => {
          set("maxDelayUntil", d);
          setSheet(null);
        }}
      />
    </View>
  );
}

/** 읽기 전용 요약(미리보기·판매 종료 상품 시트) */
export function TermsSummary({ value, children }: { value: Terms; children?: ReactNode }) {
  const t = value;
  return (
    <View style={{ gap: 12 }}>
      <T>{t.deliveryWindow ? `${t.deliveryWindow.start} ~ ${t.deliveryWindow.end} 도착 예정` : "받는 시기 미입력"}</T>
      {!t.options.length ? <T>중량 옵션 미입력</T> : null}
      {t.rows.map((r, index) => (
        <View key={r.key} style={{ gap: 8 }}>
          <T weight="semibold">
            {t.rows.length > 1 ? `${index + 1}번째 예약 기간 · ` : ""}
            {r.startsAt} ~ {r.endsAt}
          </T>
          {[...t.options].sort((a, b) => a.weightKg - b.weightKg).map((o) => {
            const c = cellOf(r, o.optionId);
            return (
              <View key={o.optionId} style={{ gap: 4 }}>
                <T>{o.label}</T>
                <T variant="heading">{c.price == null ? "가격 미입력" : `${c.price.toLocaleString("ko-KR")}원`}</T>
                <T variant="caption" muted>
                  {c.quantity == null ? "박스 수 미입력" : `${c.quantity}박스`}
                </T>
              </View>
            );
          })}
        </View>
      ))}
      <T>
        {t.shippingFeeType === "FREE"
          ? "무료배송"
          : t.shippingFee == null
            ? "배송비 미입력"
            : `배송비 ${t.shippingFee.toLocaleString("ko-KR")}원`}
      </T>
      <T>
        {t.remoteAreaFee == null
          ? "도서산간 추가 운임 미입력"
          : `도서산간 추가 운임 ${t.remoteAreaFee.toLocaleString("ko-KR")}원`}
      </T>
      <T>{t.maxDelayUntil ? `${t.maxDelayUntil}까지 출하하지 못하면 전액 환불` : "전액 환불 날짜 미입력"}</T>
      {children}
    </View>
  );
}

/** 단계 표시 '① 판매페이지 ② 판매·가격'(판매 전 상품, DEV-361 PR C) */
export function PreSaleSteps({ step }: { step: 1 | 2 }) {
  return (
    <View
      testID="presale-steps"
      accessibilityLabel={`${step}단계 · ${step === 1 ? "판매페이지" : "판매·가격"}`}
      style={{ flexDirection: "row", gap: 6, paddingHorizontal: tokens.space.gutter, paddingTop: 10 }}
    >
      {(["① 판매페이지", "② 판매·가격"] as const).map((label, i) => {
        const on = i + 1 === step;
        return (
          <View
            key={label}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: on ? tokens.color.text : tokens.color.surface,
            }}
          >
            <T variant="caption" weight="semibold" color={on ? "#FFFFFF" : tokens.color.textMuted}>
              {label}
            </T>
          </View>
        );
      })}
    </View>
  );
}
