import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Icon } from "./Icon";
import { BrandLogo } from "./BrandLogo";
import { T } from "./Text";
import { Photo } from "./content";
import { ProfileAvatar, messageTime } from "./Messenger";
import { tokens } from "./tokens";
import { unavailableLabel, won } from "./format";

/** The comparison is a later selling-period price, never an invented retail price.
 *  가격은 검정 굵게(강조색은 화면당 하나인 CTA에만, DEV-293). inline = 가격 옆에 취소선, align="right" = 옵션 줄 오른쪽 정렬 */
export function Price({
  current,
  reference,
  soldOut = false,
  availability,
  compact = false,
  large = false,
  inline = false,
  align = "left",
}: {
  current: number | null;
  reference?: number | null;
  soldOut?: boolean;
  /** 예약할 수 없을 때 가격 자리에 이유 이름을 보인다(ia.md 4장, DEV-227). */
  availability?: string | null;
  compact?: boolean;
  large?: boolean;
  inline?: boolean;
  align?: "left" | "right";
}) {
  const right = align === "right";
  if (soldOut || current === null)
    return (
      <T
        muted
        weight="semibold"
        numberOfLines={1}
        style={right ? { textAlign: "right" } : undefined}
      >
        {unavailableLabel(availability)}
      </T>
    );
  const strike =
    reference != null && reference > current ? (
      <T
        variant={inline ? "sub" : "caption"}
        muted
        numberOfLines={1}
        style={{
          textDecorationLine: "line-through",
          textAlign: right ? "right" : undefined,
        }}
      >
        {won(reference)}
      </T>
    ) : null;
  const main = (
    <T
      variant={large ? "title" : compact ? "body" : "heading"}
      weight="bold"
      numberOfLines={1}
      style={right ? { textAlign: "right" } : undefined}
    >
      {won(current)}
    </T>
  );
  if (inline)
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {main}
        {strike}
      </View>
    );
  return (
    <View
      style={{
        gap: 2,
        flexShrink: 0,
        alignItems: right ? "flex-end" : undefined,
      }}
    >
      {strike}
      {main}
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
  availability?: string;
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
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={{
          height: 48,
          paddingHorizontal: tokens.space.gutter,
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
            paddingHorizontal: tokens.space.gutter,
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
                    availability={p.availability}
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
        paddingHorizontal: tokens.space.gutter,
        gap: 12,
        alignItems: "flex-start",
      }}
    >
      {children}
    </ScrollView>
  );
}
/** 홈 소식 카드 폭: 260(다음 카드가 보이게, DEV-293) */
export function useFeedCardWidth() {
  return Math.min(260, useWindowDimensions().width - tokens.space.gutter * 2);
}

/** 홈 소식 카드: 사진 150 → 농가 줄(아바타 28·이름·날짜) → 본문 2줄. 카드 전체를 누르면 농가 소식방(DEV-293) */
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
        borderRadius: tokens.radius.md,
        overflow: "hidden",
        backgroundColor: tokens.color.surface,
      }}
    >
      {news.photos[0] ? (
        <Photo
          uri={news.photos[0]}
          width={width}
          height={150}
          radius={0}
          alt={`${news.farmName} 소식 사진`}
        />
      ) : null}
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ProfileAvatar size={28} name={news.farmName} uri={news.farmPhoto} />
          <T variant="sub" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {news.farmName}
          </T>
          <T variant="caption" muted numberOfLines={1}>
            {messageTime(news.createdAt)}
          </T>
        </View>
        <T variant="sub" numberOfLines={2}>
          {news.body}
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
          aria-selected={value === v}
          onPress={() => onChange(v)}
          testID={`chat-choice-${v}`}
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

/** 워드마크 애셋(logo 기본 174×56) 안 왼쪽 투명 여백. 실측: 2172×724 원본의 글자 시작 x=68, contain 가운데 정렬 3px → 약 8px */
const WORDMARK_INSET = 8;

/** 탭 첫 화면 로고 머리: 높이 56, 왼쪽 시작선 16(로고는 기존 애셋 그대로). 제목은 탭 화면 제목 22 굵게(DEV-293) */
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
        height: tokens.height.header,
        paddingLeft: tokens.space.gutter,
        // 오른쪽 아이콘 버튼(48 칸 가운데 24)이 오른쪽 시작선 16에 오게 4
        paddingRight: right ? 4 : tokens.space.gutter,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        flexShrink: 0,
      }}
    >
      {logo === "wordmark" ? (
        // 워드마크 애셋은 왼쪽에 투명 여백이 있다(174×56 contain에서 약 8px). 애셋·크기는 그대로 두고
        // 보이는 글자가 섹션 제목과 같은 시작선 16에 오게 그만큼 당긴다(DEV-293)
        <View style={{ flex: 1, marginLeft: -WORDMARK_INSET }}>
          <BrandLogo variant="wordmark" />
        </View>
      ) : (
        <>
          <BrandLogo variant="icon" decorative />
          <T variant="title" accessibilityRole="header" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </T>
        </>
      )}
      {right}
    </View>
  );
}
