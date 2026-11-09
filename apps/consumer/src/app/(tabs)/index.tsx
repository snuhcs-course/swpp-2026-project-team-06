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
  T,
  tokens,
  useAsync,
  closesText,
  reservedText,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { Pressable, View, useWindowDimensions } from "react-native";
import { useSession } from "../../lib/session";

export default function Home() {
  const router = useRouter();
  const { user } = useSession();
  const home = useAsync(() => farms.home(), []);
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
  soldOut: boolean;
  availability?: string;
  reservedCount: number;
  dDay: number | null;
};

/** 2열 상품 카드: 사진 정사각 → 농가(14 보조) → 상품명 16 semibold → 가격 16 굵게 + 취소선 → 마감 D-day(DEV-293) */
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
      <Photo
        uri={p.photo}
        width={width}
        height={width}
        alt={p.name}
        kind="product"
        style={{ marginBottom: 8 }}
      />
      <T variant="sub" muted numberOfLines={1}>
        {p.farmName}
      </T>
      <T weight="semibold" numberOfLines={2}>
        {p.name}
      </T>
      <Price
        compact
        inline
        current={p.currentPrice}
        reference={
          typeof p.referencePrice === "number" ? p.referencePrice : undefined
        }
        soldOut={p.soldOut}
        availability={p.availability}
      />
      <CardMeta reserved={p.reservedCount} dDay={p.dDay} />
    </Pressable>
  );
}

/** 카드 메타 줄: 있는 조각만 잇고, 다 비면 줄도 없다(DEV-227, M-24). 마감은 강조색 12, 예약 수는 보조색 */
function CardMeta({ reserved, dDay }: { reserved: number; dDay: number | null }) {
  const closes = closesText(dDay);
  const count = reservedText(reserved);
  if (!closes && !count) return null;
  return (
    <T variant="caption" muted numberOfLines={1}>
      {closes ? (
        <T variant="caption" weight="semibold" color={tokens.color.accent}>
          {closes}
        </T>
      ) : null}
      {closes && count ? " · " : ""}
      {count}
    </T>
  );
}
