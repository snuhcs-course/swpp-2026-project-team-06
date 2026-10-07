import {
  ApiError,
  catalog,
  newIdempotencyKey,
  type MyProduct,
  type StageInput,
} from "@farmclub/api";
import { Button, HeaderBar, Screen, Scroll, T, tokens } from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { DateInput, NumField, addDays } from "../../../../lib/fields";
import { useHideTabBar } from "../../../../lib/session";
import { TODAY } from "../../../../lib/views";
type Row = Omit<StageInput, "options"> & {
  key: string;
  options: Record<string, { price: number | null; quantity: number | null }>;
};
export default function Periods() {
  useHideTabBar();
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter(),
    [p, setP] = useState<MyProduct | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    pending = useRef<{ body: string; key: string } | null>(null);
  function blank(p: MyProduct, start = TODAY): Row {
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
  const load = async () => {
    try {
      const r = await catalog.myProduct(id);
      setP(r);
      setRows(
        r.stages.length
          ? r.stages.map((s) => ({ ...s, key: s.stageId }))
          : [blank(r)],
      );
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }
  async function save() {
    if (!p || busy) return;
    setBusy(true);
    setError("");
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
      router.back();
    } catch (e) {
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
      <HeaderBar title="예약 기간·가격" onBack={() => router.back()} />
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
          {error ? (
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
              onPress={() => router.back()}
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
                        onPress={() =>
                          setRows((rs) => rs.filter((_, j) => j !== i))
                        }
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
                onPress={() =>
                  setRows((rs) => [
                    ...rs,
                    blank(p, addDays(rs.at(-1)?.endsAt ?? TODAY, 1)),
                  ])
                }
              />
              <T variant="caption" muted>
                기간 사이를 비워 두면 그동안 예약을 받지 않아요. 모든 예약
                기간은 배송 시작 전에 끝나야 해요.
              </T>
              <Button
                label={
                  p.status === "PUBLISHED"
                    ? "승인 대기 편집안 저장"
                    : "예약 기간 저장"
                }
                loading={busy}
                onPress={save}
              />
            </>
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
