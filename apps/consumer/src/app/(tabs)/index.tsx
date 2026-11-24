// SCR-01 / AC-06-4: independent horizontal news and product feeds.
import { farms, messaging, productPrices } from "@farmclub/api";
import {
  BrandHeader,
  Button,
  FeedCarousel,
  IconButton,
  LegalFooter,
  NewsCard,
  Photo,
  Price,
  Screen,
  Scroll,
  Skeleton,
  SoldOutOverlay,
  StairMark,
  T,
  tokens,
  useAsync,
  closesText,
  md,
  reservedText,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSession } from "../../lib/session";
import { useFocusedAsync } from "../../lib/useFocusedAsync";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const home = useFocusedAsync(() => farms.home(), []);
  const news = useAsync(async () => {
    if (!home.data) return [];
    const pages = await Promise.all(
      home.data.farms.map((f) => messaging.farmNews(f.farmId, { limit: 3 })),
    );
    return pages
      .flatMap((p) => p.items)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [home.data, user?.userId]);
  const products = useAsync(
    () => productPrices(home.data?.recommended ?? []),
    [home.data],
  );
  const { width: windowWidth } = useWindowDimensions();
  // 2열 그리드: 좌우 여백 16, 사이 12(DEV-293)
  const cardWidth = Math.floor(
    (Math.min(windowWidth, tokens.maxWidth) - tokens.space.gutter * 2 - 12) / 2,
  );
  const gutter = tokens.space.gutter;
  return (
    <Screen>
      <BrandHeader
        title="farmclub"
        logo="wordmark"
        right={
          <IconButton
            icon="search"
            label="농가·상품 검색"
            onPress={() => router.push("/farms?focus=search")}
          />
        }
      />
      <Scroll bottom={tokens.height.tabBarClearance} footer={<LegalFooter onOpen={(path) => router.push(path)} />}>
        <SectionHead
          title="농가 소식"
          link="전체"
          onLink={() => router.push("/chats?view=news")}
        />
        {home.error || news.error ? (
          <View style={{ paddingHorizontal: gutter, gap: 8 }}>
            <T muted>소식을 불러오지 못했어요</T>
            <Button
              label="다시 시도"
              variant="outline"
              onPress={() => {
                void home.reload();
                void news.reload();
              }}
            />
          </View>
        ) : null}
        {home.loading || news.loading ? (
          <Skeleton
            width={260}
            height={230}
            radius={tokens.radius.md}
            style={{ marginHorizontal: gutter }}
          />
        ) : (
          <FeedCarousel label="농가 소식 가로 목록">
            {news.data?.length ? (
              news.data.map((n) => (
                <NewsCard
                  key={n.broadcastId}
                  news={n}
                  onPress={() => router.push(`/farms/${n.farmId}`)}
                />
              ))
            ) : (
              <T muted>농가의 첫 소식을 기다려요</T>
            )}
          </FeedCarousel>
        )}
        <SectionHead title="제철 상품" />
        {/* 단계 가격 개념 상자: 홈에 하나, 상품이 없으면 숨김(AC-06-9, DEV-348 UX ②) */}
        {home.data?.recommended.length ? <StagePriceNote /> : null}
        <View
          accessibilityLabel="제철 상품 목록"
          style={{
            paddingHorizontal: gutter,
            flexDirection: "row",
            flexWrap: "wrap",
            columnGap: 12,
            rowGap: 24,
          }}
        >
          {home.loading
            ? [0, 1].map((i) => (
                <Skeleton
                  key={i}
                  width={cardWidth}
                  height={cardWidth + 96}
                  radius={tokens.radius.md}
                />
              ))
            : (products.data ?? home.data?.recommended ?? []).map((p) => (
                <ProductCard
                  key={p.productId}
                  width={cardWidth}
                  product={p}
                  onPress={() => router.push(`/products/${p.productId}`)}
                />
              ))}
        </View>
        {home.data?.recommended.length === 0 ? (
          <T muted style={{ paddingHorizontal: gutter }}>
            현재 예약 가능한 상품이 없어요
          </T>
        ) : null}
      </Scroll>
    </Screen>
  );
}

/** 섹션 제목 18 굵게 + 오른쪽 '전체'(14 보조색), 베이스라인 맞춤 */
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
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: tokens.touchTarget.min,
        paddingLeft: tokens.space.gutter,
        paddingRight: link ? 4 : tokens.space.gutter,
        paddingTop: tokens.space.lg,
        paddingBottom: 4,
      }}
    >
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      {link && onLink ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${title} ${link}`}
          onPress={onLink}
          style={{
            minHeight: tokens.touchTarget.min,
            minWidth: tokens.touchTarget.min,
            paddingHorizontal: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T variant="sub" muted>
            {link}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

type HomeProduct = {
  productId: string;
  farmName: string;
  name: string;
  photo: string | null;
  currentPrice: number | null;
  referencePrice?: number | null;
  /** 옵션이 여럿이고 카드 가격이 가장 싸면 ‘~’(productPrices, DEV-348) */
  priceFrom?: boolean;
  /** 같은 가격이 이어지는 기간 끝까지 남은 날(productPrices, DEV-348). 없으면 dDay */
  priceDDay?: number | null;
  soldOut: boolean;
  availability?: string;
  reservedCount: number;
  dDay: number | null;
  /** 품절이면 다음 예약 시작일(ProductCard.nextStageStartsAt, DEV-327) */
  nextStageStartsAt?: string | null;
};

/** 2열 상품 카드: 사진 정사각 → 농가(14 보조) → 상품명 16 semibold → 가격 18 굵게(옵션이 여럿이면 ‘~’) + 취소선 14(DEV-293·DEV-348) → 이 가격 D-day → 예약 수(DEV-348).
 *  취소선은 마지막 기간 가격 앵커로 유지한다(DEV-348 11/17 PM 결정, UX ②의 제거안 취소) */
function ProductCard({
  width,
  product: p,
  onPress,
}: {
  width: number;
  product: HomeProduct;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${p.name} 상품 상세`}
      onPress={onPress}
      style={{ width, gap: 4 }}
    >
      {/* 품절이면 사진 위 '품절' 덮개(AC-07-3, DEV-327). 홈 추천에는 서버가 품절 두 가지만 남긴다 */}
      <SoldOutOverlay
        show={p.soldOut}
        height={width}
        style={{ marginBottom: 8 }}
      >
        <Photo
          uri={p.photo}
          width={width}
          height={width}
          alt={p.name}
          kind="product"
        />
      </SoldOutOverlay>
      <T variant="sub" muted numberOfLines={1}>
        {p.farmName}
      </T>
      <T weight="semibold" numberOfLines={2}>
        {p.name}
      </T>
      {/* 가격 18 굵게(옵션이 여럿이면 ‘~’) + 취소선 14 보조(DEV-348 디자인 값) */}
      <Price
        inline
        wrap
        current={p.currentPrice}
        from={!!p.priceFrom}
        reference={
          typeof p.referencePrice === "number" ? p.referencePrice : undefined
        }
        soldOut={p.soldOut}
        availability={p.availability}
      />
      <CardMeta
        reserved={p.reservedCount}
        dDay={p.soldOut ? null : (p.priceDDay ?? p.dDay)}
        next={p.soldOut ? p.nextStageStartsAt : null}
      />
    </Pressable>
  );
}

/** 카드 메타: 있는 줄만 두고, 다 비면 아무것도 없다(DEV-227, M-24). ‘이 가격 D-n’은 강조색 12 한 줄, 예약 수는 그 아래 보조색(DEV-348) */
function CardMeta({
  reserved,
  dDay,
  next,
}: {
  reserved: number;
  dDay: number | null;
  /** 품절 카드: 마감 대신 다음 예약 시작일(DEV-327, Figma '다음 예약 11월 20일부터') */
  next?: string | null;
}) {
  if (next)
    return (
      <T variant="caption" muted numberOfLines={1}>
        다음 예약 {md(next)}부터
      </T>
    );
  const closes = closesText(dDay);
  const count = reservedText(reserved);
  if (!closes && !count) return null;
  return (
    <View>
      {closes ? (
        <T
          variant="caption"
          weight="semibold"
          color={tokens.color.accent}
          numberOfLines={1}
        >
          {closes}
        </T>
      ) : null}
      {count ? (
        <T variant="caption" muted numberOfLines={1}>
          {count}
        </T>
      ) : null}
    </View>
  );
}

/** 제철 상품 위 개념 상자: 면색, 14/20 두 문장, 왼쪽 정적 계단 표식 28×20(DEV-268 UX ② · DEV-311 홈 통합안) */
function StagePriceNote() {
  return (
    <View
      testID="stage-price-note"
      style={{
        marginHorizontal: tokens.space.gutter,
        marginBottom: 16,
        padding: 16,
        borderRadius: tokens.radius.md,
        backgroundColor: tokens.color.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <StairMark width={28} />
      <T variant="sub" style={{ flex: 1, minWidth: 0 }}>
        <T variant="sub" weight="bold">
          일찍 예약할수록 싸요.
        </T>{" "}
        농가가 기간마다 가격을 정하고, 지금 예약하면 지금 가격으로 받아요.
      </T>
    </View>
  );
}
