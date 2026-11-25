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
  Notice,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { useHideTabBar, useSession } from "../../../../lib/session";
import { isPreSale } from "../../../../lib/productGroups";
import { goBackOr } from "../../../../lib/nav";
import { isServerTrouble, serverErrorCode } from "../../../../lib/producerEvents";
import { track } from "@farmclub/analytics";
import { OptionBoxRow } from "../../../../lib/OptionBoxRow";
import { optionBoxesFromProduct } from "../../../../lib/optionBoxes";
import { soldOutGuide } from "../../../../lib/soldOutGuide";
const kg = (g: number) =>
  `${(g / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;
function grams(text: string) {
  if (!/^\d+(?:\.\d{1,3})?$/.test(text.trim()))
    throw new Error("kg은 0 이상, 소수 셋째 자리까지 입력해 주세요.");
  const n = Math.round(Number(text) * 1000);
  if (!Number.isSafeInteger(n)) throw new Error("중량이 너무 커요.");
  return n;
}
/** 판매 전 상품이 들어오면 판매·가격으로 보내며 띄우는 안내(DEV-361) */
const PRE_SALE_TOAST = "판매를 시작하려면 판매·가격을 먼저 채워 주세요";
const statusText = {
  PENDING: "심사 중",
  APPROVED: "승인",
  REJECTED: "반려",
  WITHDRAWN: "철회",
};
/** 웹에서 그 자리로 스크롤한다(네이티브 View에는 scrollIntoView가 없어 아무 일도 안 한다) */
function reveal(node: unknown, block: "center" | "nearest" = "nearest") {
  (node as { scrollIntoView?: (options: object) => void } | null)?.scrollIntoView?.({
    block,
  });
}
/** 저장·신청 결과(오류·성공 안내)를 보일 자리: 누른 버튼 바로 아래. page = 맨 아래(불러오기 실패) */
type Where = "save" | "pause" | "request" | "page";
export default function Sales() {
  useHideTabBar();
  const { id } = useLocalSearchParams<{ id: string }>(),
    router = useRouter(),
    { toast } = useSession();
  const [p, setP] = useState<MyProduct | null>(null),
    [history, setHistory] = useState<CapacityRequest[]>([]);
  const [total, setTotal] = useState(""),
    [requested, setRequested] = useState("");
  const [error, setError] = useState(""),
    // DEV-345: 오류·성공 안내는 누른 버튼 바로 아래에 보인다(PM 11/16)
    [at, setAt] = useState<Where>("page"),
    [capExceeded, setCapExceeded] = useState(false),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false);
  const feedbackBox = useRef<View>(null),
    requestSection = useRef<View>(null),
    requestInput = useRef<TextInput>(null);
  const [confirm, setConfirm] = useState<
    "request" | "pause" | "withdraw" | null
  >(null);
  const pending = useRef<{ body: string; key: string } | null>(null);
  // 마지막으로 불러와 칸에 넣은 값. 다시 들어와 읽을 때 이 값과 다르면 생산자가 고친 것이라 덮지 않는다(DEV-345)
  const loaded = useRef("");
  // 이 화면이 보이는 동안만 판매·가격으로 옮긴다(응답 전에 떠난 뒤 늦게 온 응답이 다른 화면을 바꾸지 않게)
  const focused = useRef(false);
  /**
   * 상품과 신청 이력을 읽는다. 판매 전 상품(작성 중·반려, 승인 물량 0)이면 이 화면을 보이지 않고
   * 판매·가격으로 바꿔 열고 true를 돌려준다(DEV-361: 첫 판매 요청은 판매·가격에서만).
   */
  async function load(keepEdits = false, preSaleToast = PRE_SALE_TOAST) {
    // 판매 전인지 먼저 보고, 옮길 때는 신청 이력을 읽지 않는다
    const product = await catalog.myProduct(id);
    if (isPreSale(product)) {
      if (focused.current) {
        toast(preSaleToast);
        router.replace(`/products/${id}/sell`);
      }
      return true;
    }
    const requests = await allPages((cursor) =>
      catalog.capacityRequests(id, { cursor, limit: 50 }),
    );
    setP(product);
    setHistory(requests);
    const previous = loaded.current;
    const next = String(product.salesLimitGrams / 1000);
    loaded.current = next;
    setTotal((current) => (keepEdits && current !== previous ? current : next));
    return false;
  }
  /**
   * 저장·신청에서 생산자에게 보인 오류 안내. 위치·종류만 보낸다(글자 없음, DEV-312).
   * 화면 검사(kg·박스 수, ApiError가 아닌 Error)는 quantity_invalid, 연결·서버·충돌 실패는 세지 않는다
   * (생산자가 고칠 409 — 판매 한도 거절은 quantity_invalid — 는 센다. 입금 계좌 검사는 첫 신청뿐이라 판매·가격에서, DEV-361).
   */
  function shownFailure(e: unknown, where: Where = "page") {
    if (e instanceof Error && !(e instanceof ApiError) && !(e instanceof TypeError))
      track("form_error_shown", { screen: "product_sales", code: "quantity_invalid" });
    else if (!isServerTrouble(e))
      track("form_error_shown", { screen: "product_sales", code: serverErrorCode(e) });
    failure(e, where);
  }
  function failure(e: unknown, where: Where = "page") {
    setAt(where);
    setCapExceeded(
      e instanceof ApiError && e.details.reason === "APPROVED_CAP_EXCEEDED",
    );
    setError(
      e instanceof ApiError && e.details.fields
        ? Object.values(e.details.fields).join("\n")
        : e instanceof Error
          ? e.message
          : "처리하지 못했어요",
    );
  }
  // 상품 수정(판매 조건)에서 박스를 고치고 돌아오면(DEV-345, DEV-361) 최신 상태로 다시 읽는다. 처음 열 때도 여기서 읽는다.
  // 지난 결과 안내는 지우고, 생산자가 고친 입력칸은 그대로 둔다
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setError("");
      setNote("");
      setAt("page");
      setCapExceeded(false);
      void load(true).catch((e) => failure(e));
      return () => {
        focused.current = false;
      };
    }, [id]),
  );
  // 버튼 아래 안내가 화면 밖이면 보이는 곳까지 스크롤(웹)
  useEffect(() => {
    if ((error || note) && at !== "page") reveal(feedbackBox.current);
  }, [error, note, at]);
  /** APPROVED_CAP_EXCEEDED에서 ‘물량 추가 신청하기’: 신청 칸으로 옮겨 초점을 둔다 */
  function openCapacityRequest() {
    reveal(requestSection.current, "center");
    requestInput.current?.focus();
  }
  async function mutate(action: "save" | "pause" | "request" | "withdraw") {
    if (!p || busy) return;
    const where: Where =
      action === "save" ? "save" : action === "pause" ? "pause" : "request";
    setBusy(true);
    setAt(where);
    setError("");
    setCapExceeded(false);
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
                salesPaused:
                  action === "pause" ? !p.salesPaused : p.salesPaused,
                version: p.version,
              };
      const body = JSON.stringify({ action, input });
      if (pending.current?.body !== body)
        pending.current = { body, key: newIdempotencyKey() };
      if (action === "request") {
        await catalog.requestCapacity(
          id,
          grams(requested),
          p.version,
          pending.current.key,
        );
        // 첫 신청은 판매·가격에서만 하므로(DEV-361) 여기서는 늘 증액이다(서버 CapacityRequest.kind, DEV-312)
        track("sale_start_requested", { productId: id, screen: "product_sales", requestKind: "increase" });
      }
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
            salesPaused: boolean;
            version: number;
          },
          pending.current.key,
        );
      pending.current = null;
      setConfirm(null);
      setRequested("");
      // 첫 신청을 철회하면 작성 중으로 돌아가 판매·가격으로 옮긴다(DEV-361)
      if (
        await load(
          false,
          action === "withdraw"
            ? "신청을 철회했어요. 판매·가격에서 고친 뒤 다시 요청해 주세요."
            : undefined,
        )
      )
        return;
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
      shownFailure(e, where);
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
      shownFailure(e, "request");
    }
  }
  const editable =
    !!p && p.status !== "PENDING_APPROVAL" && p.status !== "CLOSED";
  const guide = p ? soldOutGuide(p) : null;
  /** 그 버튼 아래 오류·성공 안내. 한 번에 한 자리만 보인다 */
  const feedback = (where: Where) =>
    (error || note) && at === where ? (
      <View
        ref={feedbackBox}
        accessibilityRole={error ? "alert" : undefined}
        accessibilityLiveRegion="polite"
        style={{ gap: 4 }}
      >
        {error ? <T color={tokens.color.error}>{error}</T> : <T>{note}</T>}
        {/* 심사 중인 신청이 있으면 신청 칸이 없어 옮겨 갈 곳이 없다 */}
        {error && capExceeded && where === "save" && !p?.pendingCapacityRequest ? (
          <Button
            label="물량 추가 신청하기"
            variant="text"
            onPress={openCapacityRequest}
          />
        ) : null}
      </View>
    ) : null;
  return (
    <Screen>
      <HeaderBar
        title="물량·판매 설정"
        onBack={() =>
          goBackOr(router, "/products")
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
                {/* 품절이면 상태 줄 대신 아래 안내를 보인다(PM 11/16) */}
                {guide ? null : (
                  <T muted>
                    {p.salesPaused
                      ? "판매 중지 중"
                      : p.status === "PUBLISHED"
                        ? "승인된 물량 안에서 자유롭게 판매해요"
                        : "공급 물량을 확인한 뒤 예약을 시작해요"}
                  </T>
                )}
                {guide ? (
                  <Notice
                    title={guide.title}
                    body={guide.body}
                    style={{ backgroundColor: tokens.color.background }}
                    action={
                      guide.hint || guide.toStages ? (
                        <View style={{ gap: 8, paddingTop: 4 }}>
                          {guide.hint ? (
                            <T variant="caption" muted>
                              {guide.hint}
                            </T>
                          ) : null}
                          {guide.toStages ? (
                            <Button
                              label="판매 조건에서 박스 늘리기"
                              variant="outline"
                              compact
                              // DEV-361 PR C: 기간·가격은 상품 수정(composer)의 판매 조건 시트에서 고친다
                              onPress={() =>
                                router.push({ pathname: "/products/[id]/detail", params: { id, terms: "1", from: "sales" } })
                              }
                            />
                          ) : null}
                        </View>
                      ) : undefined
                    }
                  />
                ) : null}
                {/* DEV-300: 옵션마다 지금 기간 박스당 가격 · 예약+출하 / 판매 박스(모든 기간 합). 옵션끼리 더하지 않는다.
                    11/10 생산자 인터뷰: 옵션별 가격·박스가 주, 아래 kg 항목은 판매 한도 입력과 짝인 보조 */}
                {p.options.length ? (
                  <View
                    style={{
                      gap: 8,
                      paddingBottom: 16,
                      borderBottomWidth: 1,
                      borderBottomColor: tokens.color.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <T variant="caption" muted>
                        옵션 · 박스당 가격
                      </T>
                      <T variant="caption" muted>
                        예약+출하
                      </T>
                    </View>
                    {optionBoxesFromProduct(p.options, p.stages, p.currentStageId).map(
                      (row) => (
                        <OptionBoxRow
                          key={row.optionId}
                          row={row}
                          variant="body"
                          labelled
                        />
                      ),
                    )}
                  </View>
                ) : null}
                <View style={{ gap: 8 }}>
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
                      <T variant="sub">{kg(Number(value))}</T>
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
                <Button
                  label="판매 설정 저장"
                  onPress={() => void mutate("save")}
                  loading={busy}
                  disabled={!editable}
                />
                {feedback("save")}
                {p.status === "PUBLISHED" ? (
                  <Button
                    label={p.salesPaused ? "판매 재개" : "판매 중지"}
                    variant="outline"
                    disabled={busy}
                    onPress={() => setConfirm("pause")}
                  />
                ) : null}
                {feedback("pause")}
                {/* DEV-361 PR C: 이 화면은 바로 적용되는 운영 조작만. 나머지는 상품 수정 한 화면에서 고치고 한 번에 반영 */}
                <T variant="caption" muted>
                  가격·기간·받는 시기·사진은 &apos;상품 수정&apos;에서 바꾸고 &apos;상품에 반영&apos;해요.
                </T>
              </View>
              <View
                ref={requestSection}
                style={{
                  gap: 16,
                  borderTopWidth: 1,
                  borderTopColor: tokens.color.border,
                  paddingTop: 24,
                }}
              >
                {/* 첫 신청(판매 시작 요청)은 판매·가격에서만 한다(DEV-361). 여기서는 심사 중인 첫 신청의 상태만 보인다 */}
                <T variant="heading">
                  {p.approvedSupplyGrams > 0 ? "물량 추가 신청" : "판매 시작 요청"}
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
                ) : p.status !== "CLOSED" && p.approvedSupplyGrams > 0 ? (
                  <>
                    <T variant="sub" muted>
                      추가분을 포함한 총중량을 적어 주세요. 승인 후 판매 한도를
                      직접 늘릴 수 있어요.
                    </T>
                    <Input
                      label="신청 후 총 공급 물량 (kg)"
                      value={requested}
                      onChangeText={setRequested}
                      keyboardType="decimal-pad"
                      editable={!busy}
                      placeholder="예: 1500"
                      inputRef={requestInput}
                    />
                    <Button
                      label="물량 추가 신청"
                      variant="secondary"
                      disabled={busy}
                      onPress={requestConfirmation}
                    />
                  </>
                ) : p.status === "CLOSED" ? (
                  <T muted>
                    종료된 상품이에요. 다음 수확은 새 상품으로 등록해 주세요.
                  </T>
                ) : null}
                {feedback("request")}
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
          {feedback("page")}
          <Button
            label="최신 상태 확인"
            variant="text"
            disabled={busy}
            onPress={() => {
              setError("");
              setNote("");
              void load().catch((e) => failure(e));
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
