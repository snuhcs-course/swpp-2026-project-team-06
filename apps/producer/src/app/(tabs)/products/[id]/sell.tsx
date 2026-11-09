import { FieldFeedback, FieldFeedbackContext } from "../../../../lib/FieldFeedback";
import { EditorActions } from "../../../../lib/EditorActions";
// 새 상품 둘째 장: 판매·가격 → 미리보기 → 판매 시작 요청(DEV-184, FEAT-04/05, R-18·21·25).
// 기존 상품 관리는 SCR-25 edit / SCR-26 stages / sales 화면을 그대로 쓴다.
import {
  ApiError,
  catalog,
  farms,
  newIdempotencyKey,
  type MyFarm,
  type MyProduct,
  type ProductOption,
  type StageInput,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Notice,
  Screen,
  Scroll,
  Segmented,
  Skeleton,
  T,
  md,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";

import { BuyerPreview } from "../../../../lib/BuyerPreview";
import { DateSheet, NumField, addDays } from "../../../../lib/fields";
import { useHideTabBar, useSession } from "../../../../lib/session";
import { seoulToday } from "../../../../lib/HarvestStart";
import { FieldButton, LoadError } from "../../../../lib/views";
import { goBackOr } from "../../../../lib/nav";

const WEIGHTS = [3, 5, 10];
type Cell = { price: number | null; quantity: number | null };
type Row = {
  key: string;
  stageId?: string;
  startsAt: string;
  endsAt: string;
  options: Record<string, Cell>;
};
type Form = {
  options: ProductOption[];
  deliveryWindow: { start: string; end: string } | null;
  maxDelayUntil: string | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number | null;
  remoteAreaFee: number | null;
  maxQuantityPerOrder: number | null;
  requestedKg: number | null;
};
const option = (w: number): ProductOption => ({
  optionId: `opt-${w}`,
  label: `${w}kg`,
  weightKg: w,
});
const lastStageDay = (deliveryStart: string | undefined, from: string) =>
  deliveryStart ? addDays(deliveryStart, -1) : addDays(from, 7);

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

export default function Sell() {
  useHideTabBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useSession();
  const [p, setP] = useState<MyProduct | null>(null),
    [farm, setFarm] = useState<MyFarm | null>(null),
    [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState<Form | null>(null),
    [rows, setRows] = useState<Row[]>([]);
  const [sheet, setSheet] = useState<null | "delivery" | "maxDelay">(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Record<string, string>>({});
  const actionLock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const keyFor = (scope: string, body: unknown) => {
    const k = scope + JSON.stringify(body);
    if (!keys.current.has(k)) keys.current.set(k, newIdempotencyKey());
    return keys.current.get(k)!;
  };

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [r, f] = await Promise.all([catalog.myProduct(id), farms.mine()]);
      setP(r);
      setFarm(f);
      setForm({
        options: r.options,
        deliveryWindow: r.deliveryWindow,
        maxDelayUntil: r.maxDelayUntil,
        shippingFeeType: r.shippingFeeType,
        shippingFee: r.shippingFeeType === "SEPARATE" ? r.shippingFee : null,
        remoteAreaFee: r.remoteAreaFee,
        maxQuantityPerOrder: r.maxQuantityPerOrder,
        requestedKg: r.pendingCapacityRequest
          ? r.pendingCapacityRequest.requestedTotalGrams / 1000
          : null,
      });
      setRows(
        r.stages.length
          ? [...r.stages]
              .sort((a, b) => a.seq - b.seq)
              .map((s) => ({
                key: s.stageId,
                stageId: s.stageId,
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
                endsAt: lastStageDay(r.deliveryWindow?.start, seoulToday()),
                options: {},
              },
            ],
      );
    } catch (e) {
      setLoadError(e);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  // 입금 계좌를 등록하고 돌아오면 안내를 다시 판단한다(입력값은 그대로).
  useFocusEffect(
    useCallback(() => {
      void farms
        .mine()
        .then(setFarm)
        .catch(() => {});
    }, []),
  );

  if (!p || !form || !farm)
    return (
      <Screen>
        <HeaderBar title="판매·가격" onBack={() => goBackOr(router, "/products")} right={<EditorActions preview={false} onPreview={() => setPreview(true)} />} />
        {loadError ? (
          <LoadError error={loadError} onRetry={load} />
        ) : (
          <Skeleton width="90%" height={300} style={{ margin: 20 }} />
        )}
      </Screen>
    );

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setInvalidFields({}); setError(""); setForm((f) => (f ? { ...f, [k]: v } : f)); };
  const toggleWeight = (w: number) =>
    set(
      "options",
      form.options.some((o) => o.weightKg === w)
        ? form.options.filter((o) => o.weightKg !== w)
        : [...form.options, option(w)].sort((a, b) => a.weightKg - b.weightKg),
    );
  const cell = (r: Row, optionId: string): Cell =>
    r.options[optionId] ?? { price: null, quantity: null };
  const setCell = (i: number, optionId: string, patch: Partial<Cell>) =>
    {
    setInvalidFields({});
    setError("");
    setRows((rs) =>
      rs.map((r, j) =>
        j === i
          ? {
              ...r,
              options: {
                ...r.options,
                [optionId]: { ...cell(r, optionId), ...patch },
              },
            }
          : r,
      ),
    );
  };
  const editable = p.status === "DRAFT" || p.status === "REJECTED";
  // 서버 has_deposit_account와 같이 세 칸이 모두 있어야 한다.
  const hasAccount = !!(
    farm.bankName &&
    farm.accountNumber &&
    farm.accountHolder
  );

  /** 화면 값 검사. 서버도 같은 규칙(R-18 기간·가격, AC-04-1 필수 칸)을 다시 검사한다. */
  function check() {
    const bad = (key: string, message: string) => { setPreview(false); setInvalidFields({ [key]: message }); return message; };
    if (!form!.options.length) return bad("options", "중량 옵션을 하나 이상 골라 주세요.");
    if (!form!.deliveryWindow) return bad("delivery", "받는 시기를 정해 주세요.");
    if (!form!.maxDelayUntil) return bad("delivery", "전액 환불 날짜를 정해 주세요.");
    if (form!.maxDelayUntil <= form!.deliveryWindow.end)
      return bad("delivery", "전액 환불 날짜는 받는 시기가 끝난 다음 날 이후여야 해요.");
    for (const r of rows)
      for (const o of form!.options) {
        const c = cell(r, o.optionId);
        if (!c.price || c.quantity == null)
          return bad("prices", `${o.label}의 가격과 박스 수를 모두 적어 주세요.`);
      }
    for (const o of form!.options)
      for (let i = 1; i < rows.length; i++)
        if (
          cell(rows[i], o.optionId).price! <=
          cell(rows[i - 1], o.optionId).price!
        )
          return bad("prices", `${o.label}: 뒤 기간 가격이 앞 기간보다 비싸야 해요(얼리버드).`);
    if (rows.some((r) => r.startsAt > r.endsAt))
      return bad("delivery", "예약 기간의 시작일이 끝일보다 늦어요. 기간을 지우거나 받는 시기를 늦춰 주세요.");
    if (rows.at(-1)!.endsAt >= form!.deliveryWindow.start)
      return bad("delivery", "예약 기간은 받는 시기 전날까지 끝나야 해요.");
    if (form!.shippingFeeType === "SEPARATE" && !form!.shippingFee)
      return bad("shipping", "배송비를 따로 받으면 금액을 적어 주세요.");
    if (!form!.maxQuantityPerOrder || form!.maxQuantityPerOrder < 1)
      return bad("quantity", "한 주문 최대 박스 수를 적어 주세요.");
    if (!form!.requestedKg || form!.requestedKg <= 0)
      return bad("quantity", "판매할 총 물량(kg)을 적어 주세요.");
    return "";
  }

  function failure(e: unknown) {
    if (e instanceof ApiError && e.details.reason === "NO_FARM_ACCOUNT")
      return setError(
        "입금 계좌가 있어야 판매를 시작할 수 있어요. 환경설정 › 농가 프로필 › 입금 계좌에서 등록해 주세요. 입력한 내용은 저장돼 있어요.",
      );
    // 서버 메시지(예: '빠진 칸이 있어요: 품종, …')를 먼저, 칸별 사유는 이름과 함께 붙인다.
    if (e instanceof ApiError) {
      const aliases: Record<string, string> = { options: "options", deliveryWindow: "delivery", maxDelayUntil: "delivery", shippingFee: "shipping", remoteAreaFee: "shipping", maxQuantityPerOrder: "quantity", requestedTotalGrams: "quantity", stages: "prices" };
      const invalid = Object.entries(e.details.fields ?? {}).find(([key]) => aliases[key]);
      if (invalid) { setPreview(false); setInvalidFields({ [aliases[invalid[0]]]: invalid[1] }); }
      const fields = Object.entries(e.details.fields ?? {}).map(
        ([k, v]) => `${k}: ${v}`,
      );
      // 서버 메시지에 칸 이름이 이미 있으면(예: 빠진 칸이 있어요: 품종) 칸별 사유를 다시 붙이지 않는다.
      const named = Object.keys(e.details.fields ?? {}).some((k) =>
        e.message.includes(k),
      );
      return setError(
        [e.message, ...(named ? [] : fields)].filter(Boolean).join("\n"),
      );
    }
    setError(
      e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.",
    );
  }

  /** 상품 PATCH → 기간·가격 PUT. 버전은 앞 응답을 이어받는다. */
  async function save(): Promise<MyProduct | null> {
    const problem = check();
    if (problem) {
      setError(problem);
      return null;
    }
    const f = form!;
    const body = {
      version: p!.version,
      options: f.options,
      deliveryWindow: f.deliveryWindow!,
      maxDelayUntil: f.maxDelayUntil!,
      shippingFeeType: f.shippingFeeType,
      shippingFee: f.shippingFeeType === "SEPARATE" ? f.shippingFee! : 0,
      remoteAreaFee: f.remoteAreaFee ?? 0,
      maxQuantityPerOrder: f.maxQuantityPerOrder!,
    };
    const patched = await catalog.update(id, body, keyFor("patch", body));
    // 기간 저장이 실패해도 다음 저장이 최신 버전으로 가도록 바로 반영한다.
    setP(patched);
    const stages: StageInput[] = rows.map((r) => ({
      ...(r.stageId ? { stageId: r.stageId } : {}),
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      options: Object.fromEntries(
        f.options.map((o) => {
          const c = cell(r, o.optionId);
          return [o.optionId, { price: c.price!, quantity: c.quantity! }];
        }),
      ),
    }));
    await catalog.putStages(
      id,
      stages,
      patched.version,
      keyFor("stages", [stages, patched.version]),
    );
    const fresh = await catalog.myProduct(id);
    setP(fresh);
    return fresh;
  }

  const run = (fn: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    void fn()
      .catch(failure)
      .finally(() => { actionLock.current = false; setBusy(false); });
  };

  const requestedGrams = Math.round((form.requestedKg ?? 0) * 1000);

  // 기간이 하나면 받는 시기에 맞춰 끝을 당기므로 첫날 다음 날부터 고를 수 있다. 여럿이면 마지막 기간 뒤부터.
  const deliveryMin = [
    addDays(seoulToday(), 1),
    addDays(rows.length === 1 ? rows[0].startsAt : rows.at(-1)!.endsAt, 1),
  ]
    .sort()
    .pop()!;
  const salesEditor = (
        <View style={{ gap: 24 }}>
          {!editable ? (
            <Notice
              title={
                p.status === "PENDING_APPROVAL"
                  ? "판매 시작을 요청했어요. 운영자 확인을 기다리는 중이에요."
                  : "판매 중인 상품은 상품 편집에서 고쳐 주세요."
              }
            />
          ) : null}
          {!hasAccount ? (
            <View style={{ gap: 8 }}>
              <Notice
                title="입금 계좌가 없어요"
                body="판매를 시작하려면 입금 계좌를 먼저 등록해 주세요. 지금 입력한 내용은 저장할 수 있어요."
                tone="error"
              />
              <Button
                label="입금 계좌 등록"
                variant="outline"
                onPress={() => router.push("/farm/account")}
              />
            </View>
          ) : null}


          <FieldFeedback field="options"><Sec title="중량 옵션">
            <View style={{ flexDirection: "row", gap: 12 }}>
              {WEIGHTS.map((w) => (
                <Checkbox
                  key={w}
                  label={`${w}kg`}
                  checked={form.options.some((o) => o.weightKg === w)}
                  onPress={() => editable && !busy && toggleWeight(w)}
                />
              ))}
            </View>
          </Sec></FieldFeedback>

          <FieldFeedback field="delivery"><Sec title="받는 시기">
            <FieldButton highlight={editable} disabled={!editable || busy}
              label="받는 시기"
              value={
                form.deliveryWindow
                  ? `${md(form.deliveryWindow.start)} ~ ${md(form.deliveryWindow.end)}`
                  : ""
              }
              placeholder="날짜를 골라 주세요"
              onPress={() => editable && setSheet("delivery")}
            />
            <FieldButton highlight={editable} disabled={!editable || busy}
              label="이 날까지 못 보내면 전액 환불"
              value={md(form.maxDelayUntil)}
              placeholder="날짜를 골라 주세요"
              onPress={() => editable && setSheet("maxDelay")}
            />
          </Sec></FieldFeedback>

          <FieldFeedback field="prices"><Sec title="가격">
            <T variant="sub" muted>
              옵션마다 가격과 이번 기간에 팔 박스 수를 적어 주세요. 얼리버드
              기간을 더하면 앞 기간을 더 싸게 받을 수 있어요.
            </T>
            {rows.map((r, i) => (
              <View
                key={r.key}
                testID="price-period"
                style={{
                  padding: 16,
                  gap: 14,
                  borderWidth: 1,
                  borderColor: tokens.color.border,
                  borderRadius: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <T weight="semibold">
                    {rows.length > 1 ? `${i + 1}기간 · ` : ""}
                    {md(r.startsAt)} ~ {md(r.endsAt)} 예약
                  </T>
                  {rows.length > 1 && editable ? (
                    <Button
                      label="기간 삭제"
                      variant="text"
                      compact
                      disabled={busy}
                      onPress={() =>
                        setRows((rs) => rs.filter((_, j) => j !== i))
                      }
                    />
                  ) : null}
                </View>
                {form.options.length ? (
                  form.options.map((o) => (
                    <View
                      key={o.optionId}
                      style={{ flexDirection: "row", gap: 12 }}
                    >
                      <NumField highlight={editable} disabled={!editable || busy}
                        label={`${o.label} 가격`}
                        value={cell(r, o.optionId).price}
                        unit="원"
                        onChange={(price) =>
                          editable && setCell(i, o.optionId, { price })
                        }
                      />
                      <NumField highlight={editable} disabled={!editable || busy}
                        label={`${o.label} 박스 수`}
                        value={cell(r, o.optionId).quantity}
                        unit="박스"
                        onChange={(quantity) =>
                          editable && setCell(i, o.optionId, { quantity })
                        }
                      />
                    </View>
                  ))
                ) : (
                  <T variant="sub" muted>
                    위에서 중량 옵션을 먼저 골라 주세요.
                  </T>
                )}
              </View>
            ))}
            {editable ? (
              <Button
                label="＋ 얼리버드 기간 추가"
                variant="outline"
                disabled={busy}
                onPress={() =>
                  // 새 기간을 맨 앞에 넣고(더 이른 예약), 기존 첫 기간은 그다음 날부터.
                  setRows((rs) => {
                    const first = rs[0];
                    const split = addDays(first.startsAt, 6);
                    const early: Row = {
                      key: newIdempotencyKey(),
                      startsAt: first.startsAt,
                      endsAt: split < first.endsAt ? split : first.startsAt,
                      options: {},
                    };
                    return [
                      early,
                      { ...first, startsAt: addDays(early.endsAt, 1) },
                      ...rs.slice(1),
                    ];
                  })
                }
              />
            ) : null}
          </Sec></FieldFeedback>

          <FieldFeedback field="shipping"><Sec title="배송비">
            <Segmented
              options={[
                { value: "FREE", label: "무료" },
                { value: "SEPARATE", label: "따로 받기" },
              ]}
              value={form.shippingFeeType}
              onChange={(v) => editable && set("shippingFeeType", v)}
            />
            {form.shippingFeeType === "SEPARATE" ? (
              <NumField highlight={editable} disabled={!editable || busy}
                label="배송비"
                value={form.shippingFee}
                onChange={(v) => editable && set("shippingFee", v)}
                unit="원"
              />
            ) : null}
            <NumField highlight={editable} disabled={!editable || busy}
              label="도서산간 추가 운임"
              value={form.remoteAreaFee}
              onChange={(v) => editable && set("remoteAreaFee", v)}
              unit="원"
            />
          </Sec></FieldFeedback>

          <FieldFeedback field="quantity"><Sec title="물량">
            <View style={{ flexDirection: "row", gap: 12 }}>
              <NumField highlight={editable} disabled={!editable || busy}
                label="판매할 총 물량"
                value={form.requestedKg}
                onChange={(v) => editable && set("requestedKg", v)}
                unit="kg"
              />
              <NumField highlight={editable} disabled={!editable || busy}
                label="한 주문 최대"
                value={form.maxQuantityPerOrder}
                onChange={(v) => editable && set("maxQuantityPerOrder", v)}
                unit="박스"
              />
            </View>
            <T variant="caption" muted>
              총 물량은 &apos;판매 시작 요청&apos; 때 함께 보내요(저장만 하면
              남지 않아요). 운영자가 확인한 물량만큼 판매돼요.
            </T>
          </Sec></FieldFeedback>
        </View>
  );
  const salesReadOnly = (<View style={{ gap: 12 }}>
                <T>{form.deliveryWindow ? `${form.deliveryWindow.start} ~ ${form.deliveryWindow.end} 도착 예정` : "받는 시기 미입력"}</T>
                {!form.options.length ? <T>중량 옵션 미입력</T> : null}
                {rows.map((r, index) => <View key={r.key} style={{ gap: 8 }}>
                  <T weight="semibold">{rows.length > 1 ? `${index + 1}번째 예약 기간 · ` : ""}{r.startsAt} ~ {r.endsAt}</T>
                  {form.options.map(o => {
                    const c = cell(r, o.optionId);
                    return <View key={o.optionId} style={{ gap: 4 }}><T>{o.label}</T>
                      <T variant="title">{c.price == null ? "가격 미입력" : `${c.price.toLocaleString("ko-KR")}원`}</T>
                      <T variant="caption" muted>{c.quantity == null ? "박스 수 미입력" : `${c.quantity}박스`}</T></View>;
                  })}
                </View>)}
                <T>{form.shippingFeeType === "FREE" ? "무료배송" : form.shippingFee == null ? "배송비 미입력" : `배송비 ${form.shippingFee.toLocaleString("ko-KR")}원`}</T>
                <T>{form.remoteAreaFee == null ? "도서산간 추가 운임 미입력" : `도서산간 추가 운임 ${form.remoteAreaFee.toLocaleString("ko-KR")}원`}</T>
                <T>{form.maxDelayUntil ? `${form.maxDelayUntil}까지 출하하지 못하면 전액 환불` : "전액 환불 날짜 미입력"}</T>
                <T variant="caption" muted>{form.requestedKg == null ? "판매할 총 물량 미입력" : `판매할 총 물량 ${form.requestedKg}kg`}</T>
              </View>);
  return (
    <FieldFeedbackContext.Provider value={{ fields: invalidFields, clear: () => {} }}><Screen>
      <HeaderBar title="판매·가격" onBack={() => goBackOr(router, "/products")} right={<EditorActions preview={preview} onPreview={() => setPreview(!preview)} />} />
      <Scroll bottom={160}>
        <View testID={preview ? "buyer-preview" : "sales-editor"}>
          <BuyerPreview product={p} farm={farm} requestedGrams={requestedGrams} salesPreview={preview ? salesReadOnly : salesEditor} />
        </View>
      </Scroll>
      <BottomBar summary={error ? <View accessibilityRole="alert"><T variant="caption" color={tokens.color.error}>{error}</T></View> : undefined}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="저장" variant="secondary" size="producer" disabled={busy || !editable} style={{ flex: 1 }} onPress={() => run(async () => { if (await save()) toast("저장했어요"); })} />
          <Button label="판매 시작 요청" size="producer" disabled={busy || !editable} loading={busy} style={{ flex: 2 }} onPress={() => run(async () => {
            const fresh = await save();
            if (!fresh) return;
            await catalog.requestCapacity(id, requestedGrams, fresh.version, keyFor("request", [requestedGrams, fresh.version]));
            toast("판매 시작을 요청했어요. 운영자가 확인하면 공개돼요.");
            router.dismissTo("/products");
          })} />
        </View>
      </BottomBar>

      <DateSheet
        visible={sheet === "delivery"}
        title="받는 시기"
        range
        start={form.deliveryWindow?.start ?? null}
        end={form.deliveryWindow?.end ?? null}
        min={deliveryMin}
        note="예약 기간이 끝난 다음 날부터 고를 수 있어요."
        onClose={() => setSheet(null)}
        onSave={(start, end) => {
          set("deliveryWindow", { start, end });
          // 기간이 하나뿐이면 받는 시기 전날까지 예약을 받도록 끝을 맞춘다.
          setRows((rs) =>
            rs.length === 1 ? [{ ...rs[0], endsAt: addDays(start, -1) }] : rs,
          );
          setSheet(null);
        }}
      />
      <DateSheet
        visible={sheet === "maxDelay"}
        title="이 날까지 못 보내면 전액 환불"
        range={false}
        start={form.maxDelayUntil}
        min={
          form.deliveryWindow?.end
            ? addDays(form.deliveryWindow.end, 1)
            : addDays(seoulToday(), 1)
        }
        onClose={() => setSheet(null)}
        onSave={(d) => {
          set("maxDelayUntil", d);
          setSheet(null);
        }}
      />
    </Screen></FieldFeedbackContext.Provider>
  );
}
