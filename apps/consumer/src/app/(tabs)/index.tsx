// SCR-01 / AC-06-4: independent horizontal news and product feeds.
import { farms, messaging, productPrices } from "@farmclub/api";
import {
  BrandHeader,
  Button,
  FeedCarousel,
  IconButton,
  NewsCard,
  Photo,
  Price,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
  useAsync,
  useFeedCardWidth,
  period,
  dday,
} from "@farmclub/ui";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
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
  const width = useFeedCardWidth();
  return (
    <Screen>
      <BrandHeader
        title="farmclub"
        right={
          <IconButton
            icon="search"
            label="농가·상품 검색"
            onPress={() => router.push("/farms?focus=search")}
          />
        }
      />
      <Scroll bottom={tokens.height.tabBarClearance}>
        <View style={{ padding: 20, gap: 20 }}>
          <T variant="title">오늘, 농가에서</T>
          <T muted>농가의 일상과 제철을 함께 만나보세요.</T>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <T variant="heading">농가에서 온 소식</T>
            <Button
              label="모두 보기"
              variant="text"
              onPress={() => router.push("/chats?view=news")}
            />
          </View>
        </View>
        {home.error || news.error ? (
          <View style={{ padding: 20, gap: 8 }}>
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
          <Skeleton width={320} height={390} style={{ marginHorizontal: 20 }} />
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
        <View
          style={{
            marginTop: 24,
            padding: 20,
            borderTopWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <T variant="heading">농가의 제철 상품</T>
        </View>
        <FeedCarousel label="상품 가로 목록">
          {(products.data ?? home.data?.recommended ?? []).map((p) => (
            <View key={p.productId} style={{ width, gap: 12 }}>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${p.name} 상품 상세`}
                onPress={() => router.push(`/products/${p.productId}`)}
              >
                <Photo
                  uri={p.photo}
                  width={width}
                  height={200}
                  alt={p.name}
                  kind="product"
                />
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/farms/${p.farmId}`)}
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <T variant="sub" weight="semibold" muted numberOfLines={1}>
                  {p.farmName} ›
                </T>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push(`/products/${p.productId}`)}
                style={{ gap: 12 }}
              >
                <T variant="heading" numberOfLines={2}>
                  {p.name}
                </T>
                <T variant="sub" muted>
                  {period(p.deliveryWindow.start, p.deliveryWindow.end)} 도착
                </T>
                <Price
                  current={p.currentPrice}
                  reference={
                    "referencePrice" in p &&
                    typeof p.referencePrice === "number"
                      ? p.referencePrice
                      : undefined
                  }
                  soldOut={p.soldOut}
                />
                <T variant="caption" muted numberOfLines={1}>
                  {p.reservedCount}명 예약 · 마감 {dday(p.dDay)}
                </T>
              </Pressable>
            </View>
          ))}
          {home.data?.recommended.length === 0 ? (
            <T muted>현재 예약 가능한 상품이 없어요</T>
          ) : null}
        </FeedCarousel>
      </Scroll>
    </Screen>
  );
}
