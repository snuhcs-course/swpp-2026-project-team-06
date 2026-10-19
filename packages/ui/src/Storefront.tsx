import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Icon } from "./Icon";
import { BrandLogo } from "./BrandLogo";
import { T } from "./Text";
import { Photo } from "./content";
import { ProfileAvatar, messageTime } from "./Messenger";
import { tokens } from "./tokens";
import { won } from "./format";

/** The comparison is a later selling-period price, never an invented retail price. */
export function Price({
  current,
  reference,
  soldOut = false,
  compact = false,
  large = false,
}: {
  current: number | null;
  reference?: number | null;
  soldOut?: boolean;
  compact?: boolean;
  large?: boolean;
}) {
  if (soldOut || current === null)
    return (
      <T muted weight="semibold" numberOfLines={1}>
        현재 예약 불가
      </T>
    );
  return (
    <View style={{ gap: 4, flexShrink: 0 }}>
      {reference != null && reference > current ? (
        <T
          variant="caption"
          muted
          numberOfLines={1}
          style={{ textDecorationLine: "line-through" }}
        >
          {won(reference)}
        </T>
      ) : null}
      <T
        variant={large ? "title" : compact ? "body" : "heading"}
        weight="bold"
        color={tokens.color.accent}
        numberOfLines={1}
      >
        {won(current)}
      </T>
    </View>
  );
}

export type ShelfProduct = {
  productId: string;
  name: string;
  photo: string | null;
  currentPrice: number | null;
  referencePrice?: number | null;
  soldOut: boolean;
};
export function ProductShelf({
  products,
  defaultExpanded = true,
  onProduct,
}: {
  products: ShelfProduct[];
  defaultExpanded?: boolean;
  onProduct: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={{ backgroundColor: tokens.color.surface, flexShrink: 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="판매 품목"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={{
          height: 48,
          paddingHorizontal: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <T variant="sub" weight="semibold">
          판매 품목
        </T>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
          <Icon name="chevronDown" />
        </View>
      </Pressable>
      {expanded ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: 12,
            gap: 12,
          }}
        >
          {products.length ? (
            products.map((p) => (
              <Pressable
                key={p.productId}
                accessibilityRole="link"
                accessibilityLabel={`${p.name} 상품 상세`}
                onPress={() => onProduct(p.productId)}
                style={{
                  width: 270,
                  minHeight: 86,
                  padding: 12,
                  borderRadius: 16,
                  backgroundColor: tokens.color.background,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Photo
                  uri={p.photo}
                  width={52}
                  height={52}
                  alt={p.name}
                  kind="product"
                />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <T variant="sub" weight="semibold" numberOfLines={1}>
                    {p.name}
                  </T>
                  <Price
                    current={p.currentPrice}
                    reference={p.referencePrice}
                    soldOut={p.soldOut}
                    compact
                  />
                </View>
              </Pressable>
            ))
          ) : (
            <T muted style={{ padding: 12 }}>
              판매 중인 상품이 없어요
            </T>
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

export function FeedCarousel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const width = useFeedCardWidth();
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      snapToInterval={width + 12}
      decelerationRate="fast"
      contentContainerStyle={{
        paddingHorizontal: 20,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {children}
    </ScrollView>
  );
}
export function useFeedCardWidth() {
  return Math.min(320, useWindowDimensions().width - 40);
}

export function NewsCard({
  news,
  onPress,
}: {
  news: {
    farmName: string;
    farmPhoto: string | null;
    createdAt: string;
    photos: string[];
    body: string;
  };
  onPress: () => void;
}) {
  const width = useFeedCardWidth();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${news.farmName} 소식방에서 이어 보기`}
      onPress={onPress}
      style={{
        width,
        borderRadius: 24,
        overflow: "hidden",
        backgroundColor: tokens.color.surface,
      }}
    >
      <View
        style={{
          padding: 16,
          gap: 12,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <ProfileAvatar size={40} name={news.farmName} uri={news.farmPhoto} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T weight="semibold" numberOfLines={1}>
            {news.farmName}
          </T>
          <T variant="caption" muted numberOfLines={1}>
            {messageTime(news.createdAt)}
          </T>
        </View>
      </View>
      {news.photos[0] ? (
        <Photo
          uri={news.photos[0]}
          width={width}
          height={196}
          radius={0}
          alt={`${news.farmName} 소식 사진`}
        />
      ) : null}
      <View style={{ padding: 16, gap: 12 }}>
        <T numberOfLines={3}>{news.body}</T>
        <T variant="sub" weight="semibold" color={tokens.color.accent}>
          소식방에서 이어 보기 →
        </T>
      </View>
    </Pressable>
  );
}

export function ChatChoices({
  value,
  onChange,
}: {
  value: "news" | "private";
  onChange: (value: "news" | "private") => void;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: "row", padding: 16, gap: 8 }}
    >
      {(["news", "private"] as const).map((v) => (
        <Pressable
          key={v}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === v }}
          aria-selected={value === v}
          onPress={() => onChange(v)}
          style={{
            flex: 1,
            minWidth: 0,
            height: 52,
            borderRadius: 16,
            backgroundColor:
              value === v ? tokens.color.accent : tokens.color.surface,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <T
            weight="semibold"
            numberOfLines={1}
            color={value === v ? tokens.color.onAccent : tokens.color.text}
          >
            {v === "news" ? "소식방" : "1:1 채팅"}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

export function BrandHeader({
  title,
  right,
  logo,
}: {
  title: string;
  right?: ReactNode;
  logo?: "wordmark" | "icon";
}) {
  return (
    <View
      style={{
        height: 64,
        paddingHorizontal: 12,
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {logo === "wordmark" ? (
        <View style={{ flex: 1 }}>
          <BrandLogo variant="wordmark" />
        </View>
      ) : (
        <>
          {logo === "icon" ? (
            <BrandLogo variant="icon" decorative />
          ) : (
            <Icon name="citrus" color={tokens.color.accent} />
          )}
          <T weight="semibold" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </T>
        </>
      )}
      {right}
    </View>
  );
}
