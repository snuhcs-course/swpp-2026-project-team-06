import {
  allPages,
  ApiError,
  catalog,
  newIdempotencyKey,
  type MyProduct,
  type CapacityRequest,
} from "@farmclub/api";
import {
  Button,
  HeaderBar,
  Input,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useHideTabBar } from "../../../../lib/session";
const kg = (g: number) =>
  `${(g / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;
function grams(text: string) {
  if (!/^\d+(?:\.\d{1,3})?$/.test(text.trim()))
    throw new Error("kg은 0 이상, 소수 셋째 자리까지 입력해 주세요.");
  const n = Math.round(Number(text) * 1000);
  if (!Number.isSafeInteger(n)) throw new Error("중량이 너무 커요.");
  return n;
}
const statusText = {
  PENDING: "심사 중",
  APPROVED: "승인",
  REJECTED: "반려",
  WITHDRAWN: "철회",
};
export default function Sales() {
  useHideTabBar();
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter();
  const [p, setP] = useState<MyProduct | null>(null),
    [history, setHistory] = useState<CapacityRequest[]>([]);
  const [total, setTotal] = useState(""),
    [perOrder, setPerOrder] = useState(""),
    [requested, setRequested] = useState("");
  const [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    "request" | "pause" | "withdraw" | null
  >(null);
  const pending = useRef<{ body: string; key: string } | null>(null);
  async function load() {
    const [product, requests] = await Promise.all([
      catalog.myProduct(id),
      allPages((cursor) => catalog.capacityRequests(id, { cursor, limit: 50 })),
    ]);
    setP(product);
    setHistory(requests);
    setTotal(String(product.salesLimitGrams / 1000));
    setPerOrder(String(product.maxQuantityPerOrder));
  }
  function failure(e: unknown) {
    setError(
      e instanceof ApiError && e.details.fields
        ? Object.values(e.details.fields).join("\n")
        : e instanceof Error
          ? e.message
          : "처리하지 못했어요",
    );
  }
  useEffect(() => {
    void load().catch(failure);
  }, [id]);
  async function mutate(action: "save" | "pause" | "request" | "withdraw") {
    if (!p || busy) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const input =
        action === "request"
          ? { requestedTotalGrams: grams(requested), version: p.version }
          : action === "withdraw"
            ? {
                requestId: p.pendingCapacityRequest!.requestId,
                version: p.pendingCapacityRequest!.version,
              }
            : {
                salesLimitGrams:
                  action === "pause" ? p.salesLimitGrams : grams(total),
                maxQuantityPerOrder:
                  action === "pause" ? p.maxQuantityPerOrder : Number(perOrder),
                salesPaused:
                  action === "pause" ? !p.salesPaused : p.salesPaused,
                version: p.version,
              };
      if (
        action === "save" &&
        (!/^\d+$/.test(perOrder) || Number(perOrder) < 1)
      )
        throw new Error(
          "한 주문 최대 박스 수는 1 이상의 정수로 입력해 주세요.",
        );
      const body = JSON.stringify({ action, input });
      if (pending.current?.body !== body)
        pending.current = { body, key: newIdempotencyKey() };
      if (action === "request")
        await catalog.requestCapacity(
          id,
          grams(requested),
          p.version,
          pending.current.key,
        );
      else if (action === "withdraw")
        await catalog.withdrawCapacity(
          id,
          p.pendingCapacityRequest!.requestId,
          p.pendingCapacityRequest!.version,
          pending.current.key,
        );
      else
        await catalog.salesSettings(
          id,
          input as {
            salesLimitGrams: number;
            maxQuantityPerOrder: number;
            salesPaused: boolean;
            version: number;
          },
          pending.current.key,
        );
      pending.current = null;
      setConfirm(null);
      setRequested("");
      await load();
      setNote(
        action === "request"
          ? "공급 물량을 신청했어요. 기존 승인 물량은 계속 판매할 수 있어요."
          : action === "withdraw"
            ? "신청을 철회했어요."
            : action === "pause"
              ? p.salesPaused
                ? "판매를 재개했어요."
                : "판매를 중지했어요. 기존 예약은 유지돼요."
              : "판매 설정을 저장했어요.",
      );
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }
  function requestConfirmation() {
    try {
      if (!p || grams(requested) <= p.approvedSupplyGrams)
        throw new Error("현재 승인 물량보다 큰 총중량을 입력해 주세요.");
      setError("");
      setConfirm("request");
    } catch (e) {
      failure(e);
    }
  }
  const editable =
    !!p && p.status !== "PENDING_APPROVAL" && p.status !== "CLOSED";
  return (
    <Screen>
      <HeaderBar
        title="물량·판매 설정"
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/products")
        }
      />
      <Scroll>
        <View style={{ padding: 20, gap: 24 }}>
          {!p && !error ? <Skeleton height={220} width="100%" /> : null}
          {p ? (
            <>
              <View
                style={{
                  padding: 20,
                  gap: 16,
                  borderRadius: 24,
                  backgroundColor: "#F3F0E8",
                }}
              >
                <T variant="heading">{p.name || "새 상품"}</T>
                <T muted>
                  {p.salesPaused
                    ? "판매 중지 중"
                    : p.status === "PUBLISHED"
                      ? "승인된 물량 안에서 자유롭게 판매해요"
                      : "공급 물량을 확인한 뒤 예약을 시작해요"}
                </T>
                <View style={{ gap: 12 }}>
                  {[
                    ["승인 물량", p.approvedSupplyGrams],
                    ["현재 판매 한도", p.salesLimitGrams],
                    ["예약 중", p.reservedGrams],
                    ["출하 완료", p.shippedGrams],
                    ["추가 예약 가능", p.remainingGrams],
                  ].map(([label, value]) => (
                    <View
                      key={String(label)}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <T variant="sub" muted>
                        {label}
                      </T>
                      <T weight="semibold">{kg(Number(value))}</T>
                    </View>
                  ))}
                </View>
                <T variant="caption" muted>
                  예약·출하량을 제외한 판매 가능 물량이에요. 실제 창고 재고와는
                  달라요.
                </T>
              </View>
              <View style={{ gap: 16 }}>
                <T variant="heading">판매 설정</T>
                {p.approvedSupplyGrams > 0 ? (
                  <Input
                    label="현재 판매 한도 (kg)"
                    value={total}
                    onChangeText={setTotal}
                    keyboardType="decimal-pad"
                    editable={editable && !busy}
                    hint={`승인 ${kg(p.approvedSupplyGrams)} 이내 · 사용 중 ${kg(p.reservedGrams + p.shippedGrams)} 이상`}
                  />
                ) : (
                  <T muted>최초 승인 후 판매 한도가 설정돼요.</T>
                )}
                <Input
                  label="한 주문 최대 박스 수"
                  value={perOrder}
                  onChangeText={setPerOrder}
                  keyboardType="number-pad"
                  editable={editable && !busy}
                />
                <Button
                  label="판매 설정 저장"
                  onPress={() => void mutate("save")}
                  loading={busy}
                  disabled={!editable}
                />
                {p.status === "PUBLISHED" ? (
                  <Button
                    label={p.salesPaused ? "판매 재개" : "판매 중지"}
                    variant="outline"
                    disabled={busy}
                    onPress={() => setConfirm("pause")}
                  />
                ) : null}
              </View>
              <View
                style={{
                  gap: 16,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  paddingTop: 24,
                }}
              >
                <T variant="heading">
                  {p.approvedSupplyGrams > 0
                    ? "물량 추가 신청"
                    : "공급 물량 승인 요청"}
                </T>
                {p.pendingCapacityRequest ? (
                  <View
                    style={{
                      gap: 12,
                      padding: 16,
                      backgroundColor: tokens.color.surface,
                      borderRadius: 16,
                    }}
                  >
                    <T weight="semibold">
                      {kg(p.pendingCapacityRequest.requestedTotalGrams)} 공급
                      물량 심사 중
                    </T>
                    <T muted>
                      {p.pendingCapacityRequest.kind === "INCREASE"
                        ? "승인 전까지 기존 한도로 판매할 수 있어요."
                        : "수정하려면 신청을 먼저 철회해 주세요."}
                    </T>
                    <Button
                      label="신청 철회"
                      variant="outline"
                      disabled={busy}
                      onPress={() => setConfirm("withdraw")}
                    />
                  </View>
                ) : p.status !== "CLOSED" ? (
                  <>
                    <T variant="sub" muted>
                      {p.approvedSupplyGrams > 0
                        ? "추가분을 포함한 총중량을 적어 주세요. 승인 후 판매 한도를 직접 늘릴 수 있어요."
                        : "이 상품으로 공급할 수 있는 총중량을 알려 주세요."}
                    </T>
                    <Input
                      label="신청 후 총 공급 물량 (kg)"
                      value={requested}
                      onChangeText={setRequested}
                      keyboardType="decimal-pad"
                      editable={!busy}
                      placeholder="예: 1500"
                    />
                    {p.missingFields.length && p.approvedSupplyGrams === 0 ? (
                      <T color={tokens.color.error}>
                        먼저 입력해 주세요: {p.missingFields.join(", ")}
                      </T>
                    ) : null}
                    <Button
                      label={
                        p.approvedSupplyGrams > 0
                          ? "물량 추가 신청"
                          : "공급 물량 승인 요청"
                      }
                      variant="secondary"
                      disabled={
                        busy ||
                        (p.approvedSupplyGrams === 0 &&
                          p.missingFields.length > 0)
                      }
                      onPress={requestConfirmation}
                    />
                  </>
                ) : (
                  <T muted>
                    종료된 상품이에요. 다음 수확은 새 상품으로 등록해 주세요.
                  </T>
                )}
              </View>
              {history.length ? (
                <View style={{ gap: 16 }}>
                  <T variant="heading">신청 이력</T>
                  {history.map((r) => (
                    <View
                      key={r.requestId}
                      style={{
                        gap: 6,
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderBottomColor: tokens.color.border,
                      }}
                    >
                      <T weight="semibold">
                        {r.kind === "INITIAL" ? "최초" : "증액"} ·{" "}
                        {kg(r.requestedTotalGrams)} · {statusText[r.status]}
                      </T>
                      <T variant="caption" muted>
                        {new Date(r.createdAt).toLocaleString("ko-KR")}
                      </T>
                      {r.reason ? (
                        <T color={tokens.color.error}>{r.reason}</T>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
          {error ? <T color={tokens.color.error}>{error}</T> : null}
          {note ? <T>{note}</T> : null}
          <Button
            label="최신 상태 확인"
            variant="text"
            disabled={busy}
            onPress={() => {
              setError("");
              void load().catch(failure);
            }}
          />
        </View>
      </Scroll>
      <Sheet
        visible={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
      >
        <T variant="heading">
          {confirm === "request"
            ? "이 물량으로 신청할까요?"
            : confirm === "withdraw"
              ? "물량 신청을 철회할까요?"
              : p?.salesPaused
                ? "판매를 재개할까요?"
                : "판매를 중지할까요?"}
        </T>
        {confirm === "request" && p ? (
          <>
            <T>
              현재 승인 {kg(p.approvedSupplyGrams)} → 신청 후 총 {requested}kg
            </T>
            <T>
              추가 신청{" "}
              {kg(Math.round(Number(requested) * 1000) - p.approvedSupplyGrams)}
            </T>
          </>
        ) : (
          <T>이미 결제된 주문은 그대로 유지돼요.</T>
        )}
        {error ? <T color={tokens.color.error}>{error}</T> : null}
        <Button
          label="취소"
          variant="secondary"
          disabled={busy}
          onPress={() => setConfirm(null)}
        />
        <Button
          label="확인"
          loading={busy}
          onPress={() => {
            if (confirm) void mutate(confirm);
          }}
        />
      </Sheet>
    </Screen>
  );
}
