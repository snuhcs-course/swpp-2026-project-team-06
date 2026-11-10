// SCR-22 / FEAT-14: order and shipping management only.
// DEV-294: 머리 1단(현황 + 농가·날짜), 할 일 한 줄 목록, 주문 4칸 카드, 예약·출하 물량 줄(Figma 검토본 1:62)
// DEV-300: 물량은 중량 옵션마다 '5kg  32,000원   예약+출하 N박스 / 판매 M박스'(가격은 지금 기간, 박스는 모든 기간 합), 상품 kg 합계는 보조 글자
import { allPages, catalog, farms, orders } from "@farmclub/api";
import {
  BrandLogo,
  Button,
  Icon,
  Photo,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  useAsync,
  useLiveList,
} from "@farmclub/ui";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { OptionBoxRow } from "../../lib/OptionBoxRow";
import {
  optionBoxesFromDashboard,
  optionBoxesLabel,
  optionBoxesRatio,
} from "../../lib/optionBoxes";
import { HelpButton } from "../../lib/Tour";
import { useSession } from "../../lib/session";
import { LoadError } from "../../lib/views";

/** 할 일 한 줄: 왼쪽 이름, 오른쪽 건수(강조)나 태그, chevron. 높이 56 */
function TodoRow({
  label,
  count,
  tag,
  right,
  onPress,
}: {
  label: string;
  count?: number;
  tag?: string;
  right?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[label, count != null ? `${count}건` : tag]
        .filter(Boolean)
        .join(" ")}
      onPress={onPress}
      style={{
        minHeight: tokens.height.listRowProducer,
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <T numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </T>
      {count != null ? (
        <T weight="bold" color={tokens.color.accent}>
          {count.toLocaleString("ko-KR")}건
        </T>
      ) : null}
      {tag ? (
        <View
          style={{
            paddingHorizontal: tokens.space.sm,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: "#FDECE2",
          }}
        >
          <T variant="caption" weight="semibold" color={tokens.color.accent}>
            {tag}
          </T>
        </View>
      ) : null}
      {right}
      <Icon name="chevron" size={20} color={tokens.color.textMuted} />
    </Pressable>
  );
}

/** 진행 막대(accent). ratio 0~1 */
function Bar({ ratio, height }: { ratio: number; height: number }) {
  return (
    <View
      style={{
        height,
        borderRadius: tokens.radius.full,
        backgroundColor: tokens.color.border,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${ratio * 100}%`,
          height: "100%",
          backgroundColor: tokens.color.accent,
        }}
      />
    </View>
  );
}

/** 섹션 제목 + 오른쪽 링크(베이스라인 정렬) */
function SectionHead({
  title,
  link,
  onLink,
}: {
  title: string;
  link?: string;
  onLink?: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: tokens.space.sm,
      }}
    >
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      {link && onLink ? (
        <Pressable
          accessibilityRole="link"
          onPress={onLink}
          hitSlop={14}
        >
          <T variant="sub" muted>
            {link} ›
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const [active, setActive] = useState(false);
  const dash = useAsync(() => orders.dashboard(), [user?.userId]);
  const farm = useAsync(() => farms.mine(), [user?.userId]);
  const mine = useAsync(
    () => allPages((cursor) => catalog.mine({ limit: 50, cursor })),
    [user?.userId],
  );
  const load = useCallback(
    (cancelled: () => boolean) =>
      allPages(
        (cursor) => orders.producerOrders({ limit: 50, cursor }),
        cancelled,
      ),
    [],
  );
  const list = useLiveList(load, user?.userId ?? "", active && !!user);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      void dash.reload();
      void farm.reload();
      return () => setActive(false);
    }, [dash.reload, farm.reload]),
  );
  const data = list.data;
  const count = (status?: string) =>
    data ? data.filter((o) => !status || o.status === status).length : 0;
  const metrics = [
    { label: "전체", count: count(), tab: "all" },
    { label: "예약", count: count("RESERVED"), tab: "RESERVED" },
    // 지금 손이 가야 하는 칸만 강조한다
    { label: "출하 준비", count: count("PREPARING"), tab: "PREPARING", accent: true },
    { label: "출하", count: count("SHIPPED"), tab: "SHIPPED" },
  ];
  const todo = dash.data?.todo;
  const product = dash.data?.product;
  const photo = product
    ? mine.data?.find((p) => p.productId === product.productId)?.photo
    : null;
  const harvest = todo?.harvestTargets?.filter((t) => t.closed);
  // DEV-121: 원산지 표시제도 안내(원산지표시법 제6조 ⑥, 시행규칙 제4조의2 1호 = 초기 화면 상시 게시 + 확인 안내).
  // 지금 버전을 안 읽었으면 할 일 맨 위, 읽었으면 현황 맨 아래 상시 줄
  const noticeUnread = !!user && !user.originNoticeReadAt;
  const noticeReadAt = user?.originNoticeReadAt;
  const rows: ReactNode[] = [];
  if (noticeUnread)
    rows.push(
      <TodoRow
        key="origin"
        label="원산지 표시제도 안내 읽기"
        tag="필수"
        onPress={() => router.push("/origin-notice")}
      />,
    );
  if (todo?.hasAccount === false)
    rows.push(
      <TodoRow
        key="account"
        label="입금 계좌 등록"
        tag="필수"
        onPress={() => router.push("/farm/account")}
      />,
    );
  if (todo?.awaitingDeposit)
    rows.push(
      <TodoRow
        key="deposit"
        label="입금 확인할 주문"
        count={todo.awaitingDeposit}
        onPress={() => router.push("/ship?status=AWAITING_DEPOSIT")}
      />,
    );
  if (todo?.toHarvest && harvest?.length)
    // DEV-231: 예약 기간이 끝난 기간의 예약 완료 주문 → 그 기간 카드
    rows.push(
      <TodoRow
        key="harvest"
        label="수확을 시작할 예약"
        count={todo.toHarvest}
        onPress={() =>
          router.push(
            `/products/${harvest[0].productId}/stages?stage=${harvest[0].stageId}`,
          )
        }
      />,
    );
  if (todo?.refundsToSettle)
    rows.push(
      <TodoRow
        key="refund"
        label="환불 보낼 주문"
        count={todo.refundsToSettle}
        onPress={() => router.push("/ship?status=REFUNDED")}
      />,
    );
  // DEV-296: 소비자가 확인을 요청한 AI 답변. '답하지 않은 문의'와 따로 센다(Figma 1:62). 누르면 확인 요청 대화만
  if (todo?.aiCheckRequests)
    rows.push(
      <TodoRow
        key="ai-checks"
        label="AI 답변 확인 요청"
        count={todo.aiCheckRequests}
        onPress={() =>
          router.push({ pathname: "/chats", params: { view: "private", checks: "1" } })
        }
      />,
    );
  if (todo?.openQuestions)
    rows.push(
      <TodoRow
        key="questions"
        label="답하지 않은 문의"
        count={todo.openQuestions}
        onPress={() =>
          router.push({ pathname: "/chats", params: { view: "private" } })
        }
      />,
    );
  const usedGrams = product ? product.reservedGrams + product.shippedGrams : 0;
  const ratio =
    product && product.salesLimitGrams > 0
      ? Math.min(1, usedGrams / product.salesLimitGrams)
      : 0;
  const kg = (g: number) => (g / 1000).toLocaleString("ko-KR");
  // DEV-300: 옵션마다 따로(합치지 않음). 기간이 없으면 빈 목록 → 예전 kg 막대 줄
  const boxes = optionBoxesFromDashboard(dash.data?.stages ?? []);
  const totalKg = product
    ? `${kg(usedGrams)} / ${kg(product.salesLimitGrams)}kg`
    : "";
  return (
    <Screen>
      {/* 머리: 기존 아이콘형 로고(DEV-85) + 왼쪽 제목 '현황' + 가이드, 아래 농가명·날짜 한 줄(DEV-294, PM 11/09) */}
      <View
        style={{
          paddingHorizontal: tokens.space.gutter,
          paddingTop: tokens.space.md,
          gap: tokens.space.xs,
        }}
      >
        <View
          style={{
            minHeight: 56,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <BrandLogo variant="icon" decorative />
          <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>
            현황
          </T>
          <HelpButton />
        </View>
        <T variant="sub" muted>
          {farm.data?.name ?? "우리 농가"} ·{" "}
          {new Date().toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "short",
          })}
        </T>
      </View>
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View
          style={{
            paddingHorizontal: tokens.space.gutter,
            paddingTop: tokens.space.lg,
            gap: tokens.space.xl,
          }}
        >
          {rows.length ? (
            <View>
              <SectionHead title="할 일" />
              {rows}
            </View>
          ) : null}
          {dash.error ? (
            <LoadError error={dash.error} onRetry={dash.reload} />
          ) : null}
          <View style={{ gap: tokens.space.md }}>
            <SectionHead
              title="주문"
              link="배송 현황"
              onLink={() => router.push("/ship?status=PREPARING")}
            />
            {list.error ? (
              <View style={{ gap: tokens.space.sm }}>
                <T color={tokens.color.error}>{list.error}</T>
                <Button label="다시 시도" variant="secondary" onPress={list.retry} />
              </View>
            ) : list.loading && !data ? (
              <Skeleton width="100%" height={80} />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  paddingVertical: tokens.space.md,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.surface,
                }}
              >
                {metrics.map((m) => (
                  <Pressable
                    key={m.label}
                    accessibilityRole="link"
                    accessibilityLabel={`${m.label} 주문 ${m.count}건`}
                    onPress={() => router.push(`/ship?status=${m.tab}`)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      minHeight: tokens.touchTarget.min,
                      alignItems: "center",
                      gap: tokens.space.xs,
                    }}
                  >
                    <T variant="sub" muted numberOfLines={1}>
                      {m.label}
                    </T>
                    <T
                      variant="heading"
                      numberOfLines={1}
                      color={m.accent ? tokens.color.accent : undefined}
                    >
                      {m.count.toLocaleString("ko-KR")}
                    </T>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          {product ? (
            <View style={{ gap: tokens.space.md }}>
              <SectionHead
                title="예약·출하 물량"
                link="상품"
                onLink={() => router.push("/products")}
              />
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={
                  boxes.length
                    ? `${product.productName} ${boxes.map(optionBoxesLabel).join(", ")}. 총 ${kg(usedGrams)}kg, 판매 한도 ${kg(product.salesLimitGrams)}kg`
                    : `${product.productName} 예약·출하 ${kg(usedGrams)}kg, 판매 한도 ${kg(product.salesLimitGrams)}kg`
                }
                onPress={() => router.push(`/products/${product.productId}/sales`)}
                style={{
                  flexDirection: "row",
                  alignItems: boxes.length ? "flex-start" : "center",
                  gap: tokens.space.md,
                }}
              >
                <Photo
                  uri={photo}
                  width={48}
                  height={48}
                  radius={tokens.radius.sm}
                  kind="product"
                  alt={product.productName}
                />
                <View style={{ flex: 1, minWidth: 0, gap: tokens.space.sm }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: tokens.space.sm,
                    }}
                  >
                    <T weight="semibold" numberOfLines={1} style={{ flex: 1 }}>
                      {product.productName}
                    </T>
                    <T variant={boxes.length ? "caption" : "sub"} muted>
                      {boxes.length ? `총 ${totalKg}` : totalKg}
                    </T>
                  </View>
                  {boxes.length ? (
                    boxes.map((row) => (
                      <View
                        key={row.optionId}
                        style={{ gap: tokens.space.xs }}
                      >
                        <OptionBoxRow row={row} />
                        <View
                          accessibilityRole="progressbar"
                          accessibilityLabel={`${row.label} 판매 박스 대비 예약·출하`}
                          accessibilityValue={{
                            min: 0,
                            max: 100,
                            now: Math.round(optionBoxesRatio(row) * 100),
                          }}
                        >
                          <Bar ratio={optionBoxesRatio(row)} height={4} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <View
                      accessibilityRole="progressbar"
                      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
                    >
                      <Bar ratio={ratio} height={6} />
                    </View>
                  )}
                </View>
              </Pressable>
            </View>
          ) : !dash.loading && !dash.error ? (
            <T muted>판매 중인 상품이 없어요</T>
          ) : null}
          {noticeReadAt ? (
            <TodoRow
              label="원산지 표시제도 안내"
              right={
                <T variant="sub" muted>
                  {new Date(noticeReadAt).toLocaleDateString("ko-KR", {
                    month: "long",
                    day: "numeric",
                  })}{" "}
                  확인함
                </T>
              }
              onPress={() => router.push("/origin-notice")}
            />
          ) : null}
        </View>
      </Scroll>
    </Screen>
  );
}
