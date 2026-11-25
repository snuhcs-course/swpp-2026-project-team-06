import {
  allPages,
  catalog,
  newIdempotencyKey,
  serverNow,
  type MyProductCard,
} from "@farmclub/api";
import {
  Button,
  EmptyState,
  Fab,
  LargeTitle,
  Photo,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  md,
  time,
  tokens,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { NumField } from "../../../lib/fields";
import { OptionBoxRow } from "../../../lib/OptionBoxRow";
import { optionBoxesFromCard } from "../../../lib/optionBoxes";
import { HelpButton } from "../../../lib/Tour";
import { useSession } from "../../../lib/session";
import { productPhotoUrl } from "../../../lib/sourcePhoto";
import {
  productGroup,
  isPreSale,
  productGroups,
  productStatus,
  draftSaved,
} from "../../../lib/productGroups";
/**
 * DEV-300: 카드 물량 = 옵션마다 '5kg  32,000원   24박스 예약'(가격은 지금 판매 기간, 박스는 모든 기간 합. DEV-487부터 판매 박스는 안 보임).
 * 목록 카드(`GET /api/products/mine`)의 `options`를 바로 쓴다(카드마다 상세를 읽지 않는다). 옵션이 없으면 예전 kg 줄.
 */
function SalesLine({ product }: { product: MyProductCard }) {
  // 앱이 서버보다 먼저 배포되면 옛 카드에는 options가 없다 → kg 줄
  const rows = optionBoxesFromCard(product.options ?? []);
  return rows.length ? (
    <View style={{ gap: tokens.space.xs }}>
      {rows.map((row) => (
        <OptionBoxRow key={row.optionId} row={row} />
      ))}
    </View>
  ) : (
    <T variant="sub">
      예약 중 {product.reservedGrams / 1000}kg · 출하{" "}
      {product.shippedGrams / 1000}kg
    </T>
  );
}

const kgText = (grams: number) =>
  `${(grams / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg`;

/**
 * DEV-487 (2/2): '물량·판매 설정' 화면 대신 카드의 '판매 관리' 시트.
 * 판매 중(PUBLISHED)은 총 물량 바꾸기(줄이기는 바로, 승인 물량보다 늘리기는 운영팀 승인 요청)와 판매 중지·재개,
 * 첫 판매 요청 심사 중은 신청 철회. 총 물량 = 판매 한도(승인되면 승인 물량과 같아짐, 진우 11/25)
 */
function canManage(product: Pick<MyProductCard, "status" | "pendingCapacityRequest">): boolean {
  return (
    product.status === "PUBLISHED" ||
    (product.status === "PENDING_APPROVAL" && product.pendingCapacityRequest?.kind === "INITIAL")
  );
}

/**
 * 심사 중 칩(DEV-487). 주문 카드 상태 칩(OrderCard)과 같은 모양: 높이 28, radius sm, 연한 accent 바탕.
 * action이 있으면 칩 안 오른쪽에 회색 작은 글자 버튼(철회)을 가는 세로 줄로 나눠 둔다
 */
function PendingChip({ label, action }: { label: string; action?: { label: string; a11y: string; disabled?: boolean; onPress: () => void } }) {
  return (
    <View
      testID="pending-chip"
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        minHeight: 28,
        paddingLeft: 10,
        paddingRight: action ? 0 : 10,
        borderRadius: tokens.radius.sm,
        backgroundColor: tokens.color.accentSoft,
      }}
    >
      <T variant="caption" weight="semibold" color={tokens.color.accent}>
        {label}
      </T>
      {action ? (
        <>
          <View style={{ width: 1, height: 12, marginLeft: 8, backgroundColor: tokens.color.border }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={action.a11y}
            disabled={action.disabled}
            onPress={action.onPress}
            hitSlop={8}
            style={({ pressed }) => ({ minHeight: 28, paddingHorizontal: 10, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
          >
            <T variant="caption" weight="semibold" muted>
              {action.label}
            </T>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

/**
 * 시트 맨 위 대상 상자. 주문 관리 시트의 OrderIdentity와 같은 모양(면색 상자, 이름·상태, 아래 한 줄).
 * corner: 이름 맞은편 오른쪽 위 작은 동작(판매 중지), change: 총 물량 바로 옆 '바꾸기', children: 그 아래(심사 중 칩)
 */
function ProductIdentity({
  product,
  corner,
  change,
  children,
}: {
  product: MyProductCard;
  corner?: ReactNode;
  change?: ReactNode;
  children?: ReactNode;
}) {
  const pending = product.status === "PENDING_APPROVAL";
  return (
    <View style={{ padding: tokens.space.md, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.surface }}>
      {/* 오른쪽 열: 위 '판매 중지', 아래 '바꾸기' — 같은 크기 글자 버튼을 같은 오른쪽 끝에 맞춘다 */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, minHeight: 28 }}>
        <T variant="heading" weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
          {product.name || "이름 없는 초안"}
        </T>
        {corner}
      </View>
      <T variant="caption" muted style={{ marginTop: 2 }}>
        {productStatus(product)}
      </T>
      {pending ? null : (
        // 두 열(현황 숫자 상자처럼 위 작은 이름·아래 굵은 숫자): 왼쪽 총 물량 + 바로 옆 '바꾸기' 칩, 오른쪽 예약·출하
        <View
          style={{
            flexDirection: "row",
            marginTop: tokens.space.md,
            paddingTop: tokens.space.md,
            borderTopWidth: 1,
            borderTopColor: tokens.color.border,
          }}
        >
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T variant="sub" muted>
              총 물량
            </T>
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
              <T variant="heading" weight="bold" numberOfLines={1}>
                {kgText(product.salesLimitGrams)}
              </T>
              {change}
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <T variant="sub" muted>
              예약·출하
            </T>
            <View style={{ minHeight: 28, justifyContent: "center" }}>
              <T variant="heading" weight="bold" numberOfLines={1}>
                {kgText(product.reservedGrams + product.shippedGrams)}
              </T>
            </View>
          </View>
        </View>
      )}
      {Children.toArray(children).length ? <View style={{ marginTop: tokens.space.sm, gap: tokens.space.xs }}>{children}</View> : null}
    </View>
  );
}

type ManageStep = "menu" | "total" | "pause" | "withdraw";

function SalesManageSheet({
  product,
  onClose,
  onDone,
  onFail,
}: {
  product: MyProductCard;
  onClose: () => void;
  onDone: () => void;
  /** 실패하면 목록을 다시 읽는다(버전이 바뀐 경우 새 카드로 바로 다시 시도할 수 있게) */
  onFail?: () => void;
}) {
  const { toast } = useSession();
  const [step, setStep] = useState<ManageStep>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [totalKg, setTotalKg] = useState<number | null>(product.salesLimitGrams / 1000);
  // 같은 동작·같은 본문(version 포함)의 재시도만 같은 멱등 키. 버전 충돌 뒤 새 버전으로 다시 보내면 새 키(스캔 2차)
  const pending = useRef<{ body: string; key: string } | null>(null);
  const keyFor = (body: unknown) => {
    const text = JSON.stringify(body);
    if (pending.current?.body !== text) pending.current = { body: text, key: newIdempotencyKey() };
    return pending.current.key;
  };
  const request = product.pendingCapacityRequest;
  const committed = product.reservedGrams + product.shippedGrams;
  const raising = Math.round((totalKg ?? 0) * 1000) > product.approvedSupplyGrams;
  // 철회 확인 중에 신청이 처리돼 사라지면(목록 8초마다 다시 읽음) 처음 화면으로
  useEffect(() => {
    if (step === "withdraw" && !request && !busy) setStep("menu");
  }, [step, request, busy]);
  const go = (next: ManageStep) => {
    setError("");
    setStep(next);
  };
  const close = () => {
    if (!busy) onClose();
  };
  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      const done = await work();
      pending.current = null;
      toast(done);
      onDone();
    } catch (e) {
      // 시트 안에서 보인다(앱 토스트는 시트 뒤에 그려짐). 서버 문구를 그대로
      setError(e instanceof Error && e.message ? e.message : "처리하지 못했어요. 다시 시도해 주세요.");
      onFail?.();
    } finally {
      setBusy(false);
    }
  };
  const withdraw = () =>
    run(async () => {
      // 그사이 운영자가 처리했으면(목록 새로 읽음) 신청이 없다
      if (!request) throw new Error("이미 처리된 신청이에요.");
      await catalog.withdrawCapacity(product.productId, request.requestId, request.version, keyFor(["withdraw", request.requestId, request.version]));
      return product.status === "PENDING_APPROVAL"
        ? "신청을 철회했어요. 판매·가격에서 고친 뒤 다시 요청해 주세요."
        : "늘리기 요청을 철회했어요.";
    });
  const saveTotal = () => {
    const grams = Math.round((totalKg ?? 0) * 1000);
    if (!totalKg || grams <= 0) return setError("총 물량을 적어 주세요.");
    if (grams === product.salesLimitGrams) return setError("지금과 같은 총 물량이에요.");
    if (grams < committed) return setError(`이미 예약·출하된 ${kgText(committed)}보다 적게 할 수 없어요.`);
    if (grams > product.approvedSupplyGrams) {
      if (request) return setError("늘리기 요청이 심사 중이에요. 철회한 뒤 다시 요청해 주세요.");
      return run(async () => {
        await catalog.requestCapacity(product.productId, grams, product.version, keyFor(["increase", grams, product.version]));
        return `${kgText(grams)}으로 늘리기를 요청했어요. 운영팀이 확인하면 늘어나요.`;
      });
    }
    return run(async () => {
      await catalog.salesSettings(
        product.productId,
        { salesLimitGrams: grams, salesPaused: product.salesPaused, version: product.version },
        keyFor(["limit", grams, product.salesPaused, product.version]),
      );
      return `총 물량을 ${kgText(grams)}으로 바꿨어요.`;
    });
  };
  const togglePause = () =>
    run(async () => {
      await catalog.salesSettings(
        product.productId,
        { salesLimitGrams: product.salesLimitGrams, salesPaused: !product.salesPaused, version: product.version },
        keyFor(["pause", product.salesLimitGrams, !product.salesPaused, product.version]),
      );
      return product.salesPaused ? "판매를 재개했어요." : "판매를 중지했어요. 기존 예약은 유지돼요.";
    });
  const errorLine = error ? (
    <View accessibilityRole="alert">
      <T variant="sub" color={tokens.color.error}>
        {error}
      </T>
    </View>
  ) : null;
  /** 아래 두 버튼: 닫기(또는 이전) + 확인. 주문 관리 '되돌리기' 시트와 같은 1:2 */
  const footer = (label: string, onConfirm: () => void) => (
    <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
      <Button label="이전" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => go("menu")} />
      <Button label={label} style={{ flex: 2 }} disabled={busy} loading={busy} onPress={onConfirm} />
    </View>
  );
  return (
    <Sheet visible onClose={close}>
      <View style={{ gap: 12 }} testID="sales-manage-sheet">
        {step === "menu" ? (
          <>
            <T variant="heading">판매 관리</T>
            <ProductIdentity
              product={product}
              corner={
                product.status === "PUBLISHED" ? (
                  // 자주 쓰지 않는 동작: 상자 오른쪽 위 작은 글자. 멈추기는 빨강·확인 한 번 더, 재개는 accent(진우)
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={product.salesPaused ? "판매 재개" : "판매 중지"}
                    disabled={busy}
                    onPress={() => (product.salesPaused ? void togglePause() : go("pause"))}
                    hitSlop={8}
                    style={({ pressed }) => ({ minHeight: 28, justifyContent: "center", opacity: pressed ? 0.6 : 1 })}
                  >
                    <T variant="sub" weight="semibold" color={product.salesPaused ? tokens.color.accent : tokens.color.error}>
                      {product.salesPaused ? "판매 재개" : "판매 중지"}
                    </T>
                  </Pressable>
                ) : null
              }
              change={
                product.status === "PUBLISHED" ? (
                  // 회색 칩 버튼(주문 카드 칩과 같은 높이 28·radius sm), 무게 바로 옆
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="총 물량 바꾸기"
                    disabled={busy}
                    onPress={() => go("total")}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      minHeight: 28,
                      paddingHorizontal: 10,
                      justifyContent: "center",
                      borderRadius: tokens.radius.sm,
                      backgroundColor: tokens.color.background,
                      borderWidth: 1,
                      borderColor: tokens.color.border,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <T variant="caption" weight="semibold">
                      바꾸기
                    </T>
                  </Pressable>
                ) : null
              }
            >
              {product.status === "PUBLISHED" && product.rejectReason && !request ? (
                <T variant="caption" color={tokens.color.error}>
                  늘리기 반려: {product.rejectReason}
                </T>
              ) : null}
              {request ? (
                <PendingChip
                  label={
                    request.kind === "INITIAL"
                      ? `판매 시작 요청 ${kgText(request.requestedTotalGrams)} 심사 중`
                      : `${kgText(request.requestedTotalGrams)}으로 늘리기 심사 중`
                  }
                  action={{
                    label: "철회",
                    a11y: request.kind === "INITIAL" ? "신청 철회" : "늘리기 요청 철회",
                    disabled: busy,
                    onPress: () => go("withdraw"),
                  }}
                />
              ) : null}
            </ProductIdentity>
            {errorLine}
          </>
        ) : step === "total" ? (
          <>
            <T variant="heading">총 물량 바꾸기</T>
            <ProductIdentity product={product} />
            <NumField label="총 물량" decimal unit="kg" value={totalKg} disabled={busy} highlight
              onChange={(v) => {
                setError("");
                setTotalKg(v);
              }} />
            <T variant="sub" muted>
              {raising
                ? `승인 ${kgText(product.approvedSupplyGrams)}보다 많아서 운영팀이 확인한 뒤 늘어나요.`
                : `예약·출하된 ${kgText(committed)}보다 적게는 못 줄여요.`}
            </T>
            {errorLine}
            {footer(raising ? "늘리기 요청" : "저장", () => void saveTotal())}
          </>
        ) : step === "pause" ? (
          <>
            <T variant="heading">판매를 멈출까요?</T>
            <ProductIdentity product={product} />
            <T variant="sub" muted>
              새 예약을 받지 않아요. 이미 받은 예약은 그대로예요.{"\n"}판매 관리에서 언제든 다시 재개할 수 있어요.
            </T>
            {errorLine}
            {footer("판매 중지", () => void togglePause())}
          </>
        ) : (
          <>
            <T variant="heading">{product.status === "PENDING_APPROVAL" ? "판매 시작 요청을 철회할까요?" : "늘리기 요청을 철회할까요?"}</T>
            <ProductIdentity product={product} />
            <T variant="sub" muted>
              {product.status === "PENDING_APPROVAL"
                ? "작성 중으로 돌아가요. 판매·가격에서 고친 뒤 다시 요청할 수 있어요."
                : `${request ? kgText(request.requestedTotalGrams) : ""} 요청을 거둬요. 총 물량은 그대로예요.`}
            </T>
            {errorLine}
            {footer("철회", () => void withdraw())}
          </>
        )}
      </View>
    </Sheet>
  );
}

/**
 * 카드 썸네일. 반영한 사진(`/api/source-media/…`)은 판매 중일 때만 공개 주소로 열리므로,
 * 판매 중이 아닌 상품은 생산자 인증 주소로 받아 보인다(DEV-346, 전에는 404로 기본 사진이 나왔다).
 */
function CardPhoto({ product }: { product: MyProductCard }) {
  // 판매 중이면 공개 주소 그대로, 아니면 productPhotoUrl이 반영 사진을 인증 주소로 바꾼다.
  const privatePhoto = product.status !== "PUBLISHED" ? product.photo : null;
  const [blob, setBlob] = useState<string | null>(null);
  useEffect(() => {
    setBlob(null);
    if (!privatePhoto) return;
    let alive = true;
    let url = "";
    void productPhotoUrl(product.productId, privatePhoto)
      .then((u) => {
        url = u;
        if (alive) setBlob(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [product.productId, privatePhoto]);
  return (
    <Photo
      uri={privatePhoto ? blob : product.photo}
      width={64}
      height={64}
      kind="product"
      alt={product.name}
    />
  );
}

export default function Products() {
  const router = useRouter(),
    { filter } = useLocalSearchParams<{ filter?: string }>(),
    { user } = useSession();
  const selected =
    productGroups.find((group) => group.value === filter) ?? productGroups[0];
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages((cursor) => catalog.mine({ limit: 50, cursor }), cancelled).then(
        (items) => items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),
    [],
  );
  const list = useLiveList(load, user?.userId ?? "", active && !!user, 8000);
  // 연 카드의 id만 들고 최신 카드는 목록에서 찾는다(목록이 다시 읽히면 시트도 새 버전으로, 버전 충돌 뒤 회복)
  const [managingId, setManagingId] = useState<string | null>(null);
  const managing = managingId ? list.data?.find((item) => item.productId === managingId) ?? null : null;
  const items = list.data?.filter(
    (item) => productGroup(item) === selected.value,
  );
  return (
    <Screen>
      <LargeTitle
        title="상품"
        right={<HelpButton />}
      />
      <View style={{ paddingVertical: tokens.space.md }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {productGroups.map((group) => (
            <Pressable
              key={group.value}
              accessibilityRole="tab"
              aria-selected={group.value === selected.value}
              onPress={() => router.setParams({ filter: group.value })}
              style={{
                minHeight: 48,
                paddingHorizontal: 16,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor:
                  group.value === selected.value
                    ? tokens.color.text
                    : tokens.color.surface,
              }}
            >
              <T
                variant="sub"
                weight="semibold"
                color={
                  group.value === selected.value ? "white" : tokens.color.text
                }
              >
                {group.label}
              </T>
              <T
                variant="caption"
                color={
                  group.value === selected.value
                    ? "white"
                    : tokens.color.textMuted
                }
              >
                {list.data
                  ? list.data.filter(
                      (item) => productGroup(item) === group.value,
                    ).length
                  : "—"}
              </T>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <Scroll bottom={176}>
        {list.error ? (
          <View style={{ padding: 20 }}>
            <T color={tokens.color.error}>{list.error}</T>
            <Button label="다시 시도" variant="text" onPress={list.retry} />
          </View>
        ) : null}
        {list.loading ? (
          <Skeleton height={160} width="90%" style={{ margin: 20 }} />
        ) : null}
        {items?.length === 0 ? (
          <EmptyState
            icon="box"
            title={
              list.data?.length
                ? `${selected.label} 상품이 없어요`
                : "첫 상품을 등록해 보세요"
            }
            body={
              list.data?.length
                ? "다른 상태를 선택해 상품을 확인해요."
                : "쓰던 판매 문구로 간편하게 시작해요."
            }
          />
        ) : null}
        {items?.map((product) => (
          <View
            key={product.productId}
            style={{
              marginHorizontal: 20,
              marginBottom: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: tokens.radius.md,
              gap: 16,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${product.name || "이름 없는 초안"}${product.hasUnappliedChanges ? " (반영 안 한 수정 있음)" : ""} 상품 수정`}
              onPress={() => router.push(`/products/${product.productId}/detail`)}
              style={{ flexDirection: "row", gap: 16, minHeight: 64 }}
            >
              <CardPhoto product={product} />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                  <T
                    variant="caption"
                    weight="semibold"
                    color={
                      product.status === "REJECTED"
                        ? tokens.color.error
                        : tokens.color.textMuted
                    }
                  >
                    {productStatus(product)}
                  </T>
                  {/* DEV-361 PR C: 상품 수정에서 '상품에 반영'하지 않은 비공개 수정이 있다(구매자는 이전 내용을 봄) */}
                  {product.hasUnappliedChanges ? (
                    <View
                      testID="unapplied-chip"
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 999,
                        backgroundColor: tokens.color.surface,
                      }}
                    >
                      <T variant="caption" muted>
                        반영 안 한 수정 있음
                      </T>
                    </View>
                  ) : null}
                </View>
                <T weight="semibold" numberOfLines={2}>
                  {product.name || "이름 없는 초안"}
                </T>
                {/* 이름 없는 초안끼리 가르는 마지막 저장 시각(DEV-226, HE-X5) */}
                {product.status === "DRAFT" && draftSaved(product.updatedAt, { md, time }, serverNow()) ? (
                  <T variant="caption" muted numberOfLines={1}>
                    {draftSaved(product.updatedAt, { md, time }, serverNow())}
                  </T>
                ) : null}
                {/* 늘리기 반려 사유(DEV-487): 상품은 판매 중으로 남고 서버가 사유를 둔다. 다음 신청 때 지워진다 */}
                {product.status === "PUBLISHED" && product.rejectReason && !product.pendingCapacityRequest ? (
                  <T variant="caption" color={tokens.color.error} numberOfLines={2}>
                    늘리기 반려: {product.rejectReason}
                  </T>
                ) : null}
                {product.pendingCapacityRequest?.kind === "INCREASE" ? (
                  <PendingChip label={`${kgText(product.pendingCapacityRequest.requestedTotalGrams)}으로 늘리기 심사 중`} />
                ) : null}
              </View>
            </Pressable>
            {product.rejectReason && product.status === "REJECTED" ? (
              <T variant="sub" color={tokens.color.error}>
                {product.rejectReason}
              </T>
            ) : null}
            <View
              style={{
                backgroundColor: tokens.color.surface,
                borderRadius: 12,
                padding: 12,
                gap: tokens.space.sm,
              }}
            >
              <SalesLine product={product} />
              {/* 11/10 인터뷰: kg 총량은 보조(meta 12 회색). DEV-487: 총 물량(판매 한도) 기준. 판매 전이면 승인 전이라 0 */}
              <T variant="caption" muted>
                {product.status === "PENDING_APPROVAL" && product.pendingCapacityRequest
                  ? `판매 시작 요청 ${kgText(product.pendingCapacityRequest.requestedTotalGrams)}`
                  : `총 물량 ${kgText(product.salesLimitGrams)} · 예약·출하 ${kgText(product.reservedGrams + product.shippedGrams)}`}
              </T>
            </View>
            {/* DEV-361 PR C: 상품 수정은 composer 한 화면. 둘째 버튼은 판매 전 '판매·가격'(첫 판매 요청),
                DEV-487 (2/2)부터 판매 중·첫 요청 심사 중 '판매 관리'(총 물량·판매 중지·신청 철회, 물량·판매 설정 화면 없앰) */}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <Button
                label="상품 수정"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() => router.push(`/products/${product.productId}/detail`)}
              />
              {isPreSale(product) ? (
                <Button
                  label="판매·가격"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => router.push(`/products/${product.productId}/sell`)}
                />
              ) : canManage(product) ? (
                <Button
                  label="판매 관리"
                  variant="secondary"
                  style={{ flex: 1 }}
                  onPress={() => setManagingId(product.productId)}
                />
              ) : null}
            </View>
          </View>
        ))}
      </Scroll>
      {managing ? (
        <SalesManageSheet
          key={managing.productId}
          product={managing}
          onClose={() => setManagingId(null)}
          onFail={list.retry}
          onDone={() => {
            setManagingId(null);
            list.retry();
          }}
        />
      ) : null}
      <Fab
        label="새 상품"
        testID="new-product"
        onPress={() => router.push("/products/new")}
      />
    </Screen>
  );
}
