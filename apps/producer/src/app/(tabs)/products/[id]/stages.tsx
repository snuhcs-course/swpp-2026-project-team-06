// 예약 기간·가격(SCR-26). 수확 시작은 기간별이 아니라 주문·출하 예약 탭에서 한 번에 한다(DEV-361)
import {
  ApiError,
  catalog,
  newIdempotencyKey,
  type MyProduct,
  type StageInput,
} from "@farmclub/api";
import { Button, HeaderBar, Notice, Screen, Scroll, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { DateInput, NumField, addDays } from "../../../../lib/fields";
import { useHideTabBar } from "../../../../lib/session";
import { seoulToday } from "../../../../lib/HarvestStart";
import { goBackOr } from "../../../../lib/nav";
type Row = Omit<StageInput, "options"> & {
  key: string;
  options: Record<string, { price: number | null; quantity: number | null }>;
};
const kg = (g: number) =>
  `${(g / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;
/** 웹에서 그 자리로 스크롤한다(네이티브 View에는 scrollIntoView가 없어 아무 일도 안 한다) */
function reveal(node: unknown) {
  (node as { scrollIntoView?: (options: object) => void } | null)?.scrollIntoView?.({
    block: "nearest",
  });
}
export default function Periods() {
  useHideTabBar();
  const { id, from } = useLocalSearchParams<{
      id: string;
      from?: string;
    }>(),
    router = useRouter(),
    [p, setP] = useState<MyProduct | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    // DEV-345: 저장 실패는 저장 버튼 근처에, 불러오기 실패는 위에 보인다
    [errorAt, setErrorAt] = useState<"load" | "save">("load"),
    // 저장했지만 여전히 전체 물량 품절이면 그 판매 한도(g). 이때는 뒤로 가지 않고 머문다
    [stillSoldOut, setStillSoldOut] = useState<number | null>(null),
    [busy, setBusy] = useState(false),
    saveResult = useRef<View>(null),
    pending = useRef<{ body: string; key: string } | null>(null);
  function blank(p: MyProduct, start = seoulToday()): Row {
    return {
      key: newIdempotencyKey(),
      startsAt: start,
      endsAt: p.deliveryWindow
        ? addDays(p.deliveryWindow.start, -1)
        : addDays(start, 7),
      options: Object.fromEntries(
        p.options.map((o) => [o.optionId, { price: null, quantity: null }]),
      ),
    };
  }
  function apply(r: MyProduct) {
    setP(r);
    const next: Row[] = r.stages.length
      ? r.stages.map((s) => ({
          stageId: s.stageId,
          name: s.name,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          options: s.options,
          key: s.stageId,
        }))
      : [blank(r)];
    setRows(next);
  }
  const load = async () => {
    try {
      apply(await catalog.myProduct(id));
      setError("");
    } catch (e) {
      setErrorAt("load");
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    if ((error && errorAt === "save") || stillSoldOut !== null)
      reveal(saveResult.current);
  }, [error, errorAt, stillSoldOut]);
  function update(i: number, patch: Partial<Row>) {
    // 다시 고치기 시작하면 지난 저장 결과 안내는 지운다(DEV-345)
    setStillSoldOut(null);
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  async function save() {
    if (!p || busy) return;
    setBusy(true);
    setError("");
    setStillSoldOut(null);
    try {
      if (
        rows.some((r) =>
          Object.values(r.options).some(
            (v) => v.price === null || v.quantity === null,
          ),
        )
      )
        throw new Error("모든 옵션의 가격과 박스 수를 입력해 주세요.");
      const stages: StageInput[] = rows.map(({ key, ...r }) => ({
        ...r,
        options: Object.fromEntries(
          Object.entries(r.options).map(([k, v]) => [
            k,
            { price: v.price!, quantity: v.quantity! },
          ]),
        ),
      }));
      const body = JSON.stringify({ stages, version: p.version });
      if (pending.current?.body !== body)
        pending.current = { body, key: newIdempotencyKey() };
      await catalog.putStages(id, stages, p.version, pending.current.key);
      pending.current = null;
      // DEV-345: 판매 중 상품이 박스를 늘려도 판매 한도를 다 썼으면 여전히 예약을 못 받는다. 머물러 한도 늘리기로 안내한다.
      // 승인 전 상품은 한도가 0이라 서버가 TOTAL_SOLD_OUT을 주므로 PUBLISHED만 본다
      const after = await catalog.myProduct(id).catch(() => null);
      if (after?.status === "PUBLISHED" && after.availability === "TOTAL_SOLD_OUT") {
        apply(after);
        setStillSoldOut(after.salesLimitGrams);
        return;
      }
      goBackOr(router, "/products");
    } catch (e) {
      setErrorAt("save");
      setError(
        e instanceof ApiError && e.details.fields
          ? Object.values(e.details.fields).join("\n")
          : e instanceof Error
            ? e.message
            : "저장하지 못했어요",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <HeaderBar title="예약 기간·가격" onBack={() => goBackOr(router, "/products")} />
      <Scroll>
        <View style={{ padding: 20, gap: 20 }}>
          <View
            style={{
              padding: 20,
              backgroundColor: "#F3F0E8",
              borderRadius: 20,
              gap: 8,
            }}
          >
            <T variant="heading">언제, 얼마에 예약받을까요?</T>
            <T muted>
              원하는 기간을 추가하고 옵션별 가격과 판매 박스 수를 정해요. 이른
              예약일수록 더 저렴하게 구성해 주세요.
            </T>
          </View>
          {p?.status === "PUBLISHED" ? (
            <T variant="sub" muted>
              변경한 가격은 새 주문부터 바로 적용돼요. 이미 결제된 주문의 가격은
              그대로예요.
            </T>
          ) : null}
          {error && errorAt === "load" ? (
            <View accessibilityRole="alert" style={{ gap: 8 }}>
              <T color={tokens.color.error}>{error}</T>
              <Button
                label="최신 값 다시 불러오기"
                variant="text"
                onPress={load}
              />
            </View>
          ) : null}
          {p && !p.options.length ? (
            <Button
              label="상품 편집에서 중량 옵션 먼저 추가"
              onPress={() => goBackOr(router, "/products")}
            />
          ) : null}
          {p?.options.length
            ? rows.map((r, i) => {
                const old = p.stages.find((s) => s.stageId === r.stageId),
                  locked =
                    !!old &&
                    Object.values(old.options).some((v) => v.reservedCount > 0);
                return (
                  <View
                    key={r.key}
                    style={{
                      padding: 18,
                      gap: 18,
                      borderWidth: 1,
                      borderColor: tokens.color.border,
                      borderRadius: 22,
                      backgroundColor: "white",
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <T weight="bold">
                        {r.startsAt.slice(5).replace("-", ".")} —{" "}
                        {r.endsAt.slice(5).replace("-", ".")}
                      </T>
                      <Button
                        label="기간 삭제"
                        variant="text"
                        disabled={locked || rows.length === 1 || busy}
                        onPress={() => {
                          setStillSoldOut(null);
                          setRows((rs) => rs.filter((_, j) => j !== i));
                        }}
                      />
                    </View>
                    {locked ? (
                      <T variant="caption" muted>
                        예약 이력이 있어 날짜는 유지해요. 가격은 새 주문부터
                        적용돼요.
                      </T>
                    ) : (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        <DateInput
                          label="예약 시작일"
                          value={r.startsAt}
                          onChange={(startsAt) => update(i, { startsAt })}
                        />
                        <DateInput
                          label="예약 종료일"
                          value={r.endsAt}
                          onChange={(endsAt) => update(i, { endsAt })}
                        />
                      </View>
                    )}
                    {p.options.map((o) => (
                      <View
                        key={o.optionId}
                        style={{
                          gap: 10,
                          paddingTop: 8,
                          borderTopWidth: 1,
                          borderTopColor: tokens.color.border,
                        }}
                      >
                        <T weight="semibold">{o.label}</T>
                        <View style={{ flexDirection: "row", gap: 12 }}>
                          <NumField
                            label={`${o.label} 가격`}
                            value={r.options[o.optionId]?.price ?? null}
                            unit="원"
                            onChange={(price) =>
                              update(i, {
                                options: {
                                  ...r.options,
                                  [o.optionId]: {
                                    ...r.options[o.optionId],
                                    price,
                                  },
                                },
                              })
                            }
                          />

                          <NumField
                            label={`${o.label} 판매 물량`}
                            value={r.options[o.optionId]?.quantity ?? null}
                            unit="박스"
                            onChange={(quantity) =>
                              update(i, {
                                options: {
                                  ...r.options,
                                  [o.optionId]: {
                                    ...r.options[o.optionId],
                                    quantity,
                                  },
                                },
                              })
                            }
                          />
                        </View>
                        {old?.options[o.optionId]?.reservedCount ? (
                          <T variant="caption" muted>
                            {old.options[o.optionId].reservedCount}박스 확보됨
                          </T>
                        ) : null}
                      </View>
                    ))}
                  </View>
                );
              })
            : null}
          {p?.options.length ? (
            <>
              <Button
                label="＋ 예약 기간 추가"
                variant="outline"
                disabled={busy}
                onPress={() => {
                  setStillSoldOut(null);
                  setRows((rs) => [
                    ...rs,
                    blank(p, addDays(rs.at(-1)?.endsAt ?? seoulToday(), 1)),
                  ]);
                }}
              />
              <T variant="caption" muted>
                기간 사이를 비워 두면 그동안 예약을 받지 않아요. 모든 예약
                기간은 배송 시작 전에 끝나야 해요.
              </T>
              <Button label="예약 기간 저장" loading={busy} onPress={save} />
              <View ref={saveResult} style={{ gap: 8 }}>
                {error && errorAt === "save" ? (
                  <View accessibilityRole="alert" style={{ gap: 8 }}>
                    <T color={tokens.color.error}>{error}</T>
                    <Button
                      label="최신 값 다시 불러오기"
                      variant="text"
                      onPress={load}
                    />
                  </View>
                ) : null}
                {stillSoldOut !== null ? (
                  <Notice
                    title="기간·가격을 저장했어요."
                    body={`판매 한도(${kg(stillSoldOut)})를 모두 써서 아직 예약을 받을 수 없어요.`}
                    action={
                      <Button
                        label="판매 한도 늘리기"
                        compact
                        style={{ marginTop: 8 }}
                        onPress={() =>
                          // 판매 설정에서 왔으면 돌아가서 스택이 쌓이지 않게 한다
                          from === "sales" && router.canGoBack()
                            ? router.back()
                            : router.push(`/products/${id}/sales`)
                        }
                      />
                    }
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
