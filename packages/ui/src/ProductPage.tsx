// 구매자 상품 상세 본문(SCR-04, FEAT-07). 소비자 앱 상품 상세와 생산자 앱 판매 시작 전 미리보기(DEV-184)가 함께 쓴다.
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";

import { IconButton } from "./bars";
import { BrixReading } from "./BrixReading";
import { DetailStory } from "./DetailStory";
import { Icon } from "./Icon";
import { ModuleStory } from "./ModuleStory";
import { Photo } from "./content";
import { Price } from "./Storefront";
import { T } from "./Text";
import {
  closesText,
  DELIVERY_PENDING_NOTE,
  deliveryText,
  joinMeta,
  md,
  optionLeft,
  shippingText,
  unavailableLabel,
  won,
} from "./format";
import { tokens } from "./tokens";

/** 상품 사진 높이(DEV-293: 244 → 300) */
export const PRODUCT_PHOTO_HEIGHT = 300;

type StageOption = { price: number; quantity: number; reservedCount: number };

/** 화면에 필요한 상품 값만. @farmclub/api의 ProductDetail이 그대로 들어맞는다. */
export type ProductPageData = {
  photo: string | null;
  /** 사진이 여러 장이면 넘겨 보기(1/N). 없으면 photo 한 장 */
  photos?: string[];
  name: string;
  farmName: string;
  /** 판매자 줄(아바타·지역). 생산자 미리보기에는 없을 수 있다 */
  farmPhoto?: string | null;
  farmRegion?: string;
  /** 생산자 미리보기에서는 아직 비어 있을 수 있다(DEV-227: 오늘 날짜로 채우지 않는다). */
  deliveryWindow: { start: string; end: string } | null;
  maxDelayUntil: string | null;
  soldOut: boolean;
  nextStageStartsAt: string | null;
  availability: string;
  options: { optionId: string; label: string; weightKg: number }[];
  stages: {
    stageId: string;
    endsAt?: string;
    options: Record<string, StageOption>;
  }[];
  currentStageId: string | null;
  remainingGrams: number;
  dDay: number | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number;
  remoteAreaFee: number;
  moduleDetail?: ComponentProps<typeof ModuleStory>["content"];
  detailContent?: ComponentProps<typeof DetailStory>["content"];
  description: string;
  measuredBrix: number | null;
  measuredBrixAt: string | null;
  expectedBrix: number | null;
  farmerNote: string;
  info: {
    origin: string;
    producer: string;
    size: string;
    packedAt: string;
    storage: string;
    contact: string;
  };
};

/**
 * 새 상품 채우기(DEV-184): 미리보기와 같은 화면에서 자리만 편집 칸으로 바꾼다.
 * 넘기지 않은 자리는 구매자 화면 그대로 그린다.
 */
export type ProductPageSlots = {
  photo?: ReactNode;
  name?: ReactNode;
  /** Producer editor control for the origin directly below the name. */
  origin?: ReactNode;
  /** 상품명 바로 아래(품종 등) */
  subName?: ReactNode;
  /** 받는 시기·옵션 줄(가격·남은 박스)·배송비 줄 전체 */
  sale?: ReactNode;
  story?: ReactNode;
  brix?: ReactNode;
  info?: Partial<Record<"origin" | "size" | "storage", ReactNode>>;
  /** 상품정보를 펼친 채로 둔다 */
  infoOpen?: boolean;
};

export function ProductPageBody({
  p,
  reference,
  mediaUrl,
  onFarmPress,
  onBack,
  onShare,
  slots,
}: {
  p: ProductPageData;
  slots?: ProductPageSlots;
  /** 이전 기간 가격(취소선). 소비자 앱은 api의 referencePrice를 넘긴다. */
  reference: (optionId: string) => number | null;
  mediaUrl?: (uri: string) => string;
  onFarmPress?: () => void;
  /** 사진 위 뒤로(소비자 상세, 결정 26). 생산자 미리보기는 넘기지 않는다 */
  onBack?: () => void;
  /** 사진 위 공유(결정 26) */
  onShare?: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const toggle = (k: NonNullable<typeof open>) =>
    setOpen((o) => (o === k ? null : k));
  const cur = p.stages.find((s) => s.stageId === p.currentStageId) ?? null;
  const infoOpen = slots?.infoOpen || open === "info";
  const photos = p.photos?.length ? p.photos : [p.photo];
  return (
    <>
      <View>
        {slots?.photo ?? <Gallery photos={photos} alt={p.name} />}
        {onBack || onShare ? (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              top: 4,
              left: 4,
              right: 4,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            {onBack ? (
              <IconButton icon="back" label="뒤로" onPhoto onPress={onBack} />
            ) : (
              <View />
            )}
            {onShare ? (
              <IconButton icon="share" label="공유" onPhoto onPress={onShare} />
            ) : null}
          </View>
        ) : null}
      </View>

      {p.farmName ? (
        <SellerRow
          name={p.farmName}
          photo={p.farmPhoto ?? null}
          region={p.farmRegion}
          onPress={onFarmPress}
        />
      ) : null}

      <View style={{ padding: tokens.space.gutter, gap: 16 }}>
        {/* 원산지는 상품명 바로 아래, 상품명과 같은 크기·색(원산지표시법 시행규칙 별표 3 2호가목1), DEV-258).
            둘 다 22(DEV-293). 품절·판매 중지에도 같은 자리. 값은 농가가 쓴 그대로, 비어 있으면 줄을 숨긴다(게시 요청에서 막음) */}
        <View style={{ gap: 2 }}>
          {slots?.name ?? (
            <T variant="title" accessibilityRole="header">
              {p.name}
            </T>
          )}
          {slots?.origin ?? (p.info.origin.trim() ? (
            <View testID="product-origin">
              <T variant="title" weight="regular">
                원산지 {p.info.origin.trim()}
              </T>
            </View>
          ) : null)}
        </View>
        {slots?.subName ?? null}
        {slots?.sale ?? (
          <SaleRows
            p={p}
            cur={cur}
            open={open}
            toggle={toggle}
            reference={reference}
          />
        )}
      </View>

      {slots?.story ??
        (p.moduleDetail ? (
          <ModuleStory content={p.moduleDetail} mediaUrl={mediaUrl} />
        ) : (
          <DetailStory
            content={p.detailContent}
            fallback={p.description}
            title="농가 이야기"
          />
        ))}

      {slots?.brix ?? (
        <BrixReading
          measured={p.measuredBrix}
          measuredAt={p.measuredBrixAt}
          expected={p.expectedBrix}
        />
      )}

      {p.farmerNote ? (
        <View
          style={{
            paddingHorizontal: tokens.space.gutter,
            paddingTop: tokens.space.section,
            gap: 8,
          }}
        >
          <T variant="sub" muted>
            {p.farmName}의 한마디
          </T>
          <T variant="body">{p.farmerNote}</T>
        </View>
      ) : null}

      <View
        style={{
          marginHorizontal: tokens.space.gutter,
          marginTop: tokens.space.section,
        }}
      >
        <Fold
          label="상품정보"
          open={infoOpen}
          last
          // 펼친 채로 두는 편집 화면에서는 접히지 않으니 누름도 받지 않는다.
          onPress={() => (slots?.infoOpen ? undefined : toggle("info"))}
        >
          {(
            [
              ["원산지", p.info.origin, slots?.info?.origin],
              ["생산자", p.info.producer],
              ["중량·수량", p.info.size, slots?.info?.size],
              ["포장일", p.info.packedAt],
              ["보관 방법", p.info.storage, slots?.info?.storage],
              ["상담", p.info.contact],
            ] as [string, string, ReactNode?][]
          ).map(([k, v, slot]) => (
            <View
              key={k}
              style={{
                flexDirection: "row",
                gap: 12,
                ...(slot ? { alignItems: "center" as const } : {}),
              }}
            >
              <T variant="sub" muted style={{ width: INFO_LABEL_WIDTH }}>
                {k}
              </T>
              {slot ?? (
                <T variant="sub" style={{ flex: 1 }}>
                  {v}
                </T>
              )}
            </View>
          ))}
        </Fold>
      </View>
    </>
  );
}

/** 정보 표 라벨 폭: 상품정보·농가 정보가 같은 72(DEV-293) */
const INFO_LABEL_WIDTH = 72;

/** 상품 사진: 300 높이, 여러 장이면 옆으로 넘기고 오른쪽 아래에 1/N */
function Gallery({ photos, alt }: { photos: (string | null)[]; alt: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(windowWidth, tokens.maxWidth);
  const [index, setIndex] = useState(0);
  if (photos.length <= 1)
    return (
      <Photo
        uri={photos[0]}
        width="100%"
        height={PRODUCT_PHOTO_HEIGHT}
        radius={0}
        alt={alt}
        kind="product"
      />
    );
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        accessibilityLabel={`${alt} 사진 ${photos.length}장`}
        onScroll={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        scrollEventThrottle={32}
      >
        {photos.map((uri, i) => (
          <Photo
            key={`${uri}-${i}`}
            uri={uri}
            width={width}
            height={PRODUCT_PHOTO_HEIGHT}
            radius={0}
            alt={`${alt} ${i + 1}`}
            kind="product"
          />
        ))}
      </ScrollView>
      <View
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          paddingHorizontal: 8,
          height: 24,
          borderRadius: tokens.radius.full,
          backgroundColor: tokens.color.photoOverlay,
          justifyContent: "center",
        }}
      >
        <T variant="caption" color={tokens.color.onAccent}>
          {index + 1} / {photos.length}
        </T>
      </View>
    </View>
  );
}

/** 판매자 줄: 아바타 40 · 농가 이름 · 지역, 누르면 농가 페이지(DEV-293, 당근식 신뢰 신호) */
function SellerRow({
  name,
  photo,
  region,
  onPress,
}: {
  name: string;
  photo: string | null;
  region?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={region ? `${name}, ${region}` : name}
      disabled={!onPress}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: tokens.height.row,
        paddingVertical: 12,
        paddingHorizontal: tokens.space.gutter,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <Photo
        uri={photo}
        width={tokens.thumb.avatar}
        height={tokens.thumb.avatar}
        radius={tokens.radius.full}
        kind="farm"
        alt={name}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="semibold" numberOfLines={1}>
          {name}
        </T>
        {region ? (
          <T variant="caption" muted numberOfLines={1}>
            {region}
          </T>
        ) : null}
      </View>
      {onPress ? (
        <Icon name="chevron" size={20} color={tokens.color.textMuted} />
      ) : null}
    </Pressable>
  );
}

function Fold({
  label,
  sub,
  open,
  onPress,
  children,
  last,
}: {
  label: string;
  /** 제목 아래 보조 한 줄(배송비·마감) */
  sub?: string;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: tokens.color.border,
        borderBottomWidth: last ? 1 : 0,
        borderBottomColor: tokens.color.border,
      }}
    >
      <Pressable
        accessibilityRole="button"
        aria-expanded={open}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          minHeight: tokens.height.row,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, paddingVertical: sub ? 12 : 0 }}>
          <T variant="body" weight={sub ? "semibold" : "regular"}>
            {label}
          </T>
          {sub ? (
            <T variant="sub" muted numberOfLines={1}>
              {sub}
            </T>
          ) : null}
        </View>
        <Icon
          name={open ? "chevronDown" : "chevron"}
          color={tokens.color.textMuted}
        />
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 16, gap: 8 }}>{children}</View>
      ) : null}
    </View>
  );
}

type Open = null | "window" | "info" | "cancel";
/** 마지막 예약 기간 끝날(받는 시기 '예상'의 근거, FEAT-05) */
function lastReservationEnd(p: ProductPageData) {
  const ends = p.stages.map((s) => s.endsAt).filter((e): e is string => !!e);
  return ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : null;
}
const joinSentences = (...parts: (string | null)[]) =>
  parts.filter(Boolean).join(" ");
function SaleRows({
  p,
  cur,
  open,
  toggle,
  reference,
}: {
  p: ProductPageData;
  cur: ProductPageData["stages"][number] | null;
  open: Open;
  toggle: (k: NonNullable<Open>) => void;
  reference: (optionId: string) => number | null;
}) {
  const fee = shippingText(p.shippingFeeType, p.shippingFee);
  return (
    <>
      {/* 받는 시기 + 배송비·마감 한 줄. 펼치면 기간 변경·지연 환불·도서산간 안내 */}
      <Fold
        label={deliveryText(p.deliveryWindow, lastReservationEnd(p))}
        sub={joinMeta(fee, p.soldOut ? "" : closesText(p.dDay))}
        open={open === "window"}
        onPress={() => toggle("window")}
      >
        <T variant="sub">
          {joinSentences(
            p.deliveryWindow ? null : DELIVERY_PENDING_NOTE,
            "농가 사정으로 바뀌면 새 기간으로 받거나 전액 환불받을 수 있어요.",
            p.maxDelayUntil
              ? `${md(p.maxDelayUntil)}까지 보내지 못하면 자동으로 전액 환불해 드려요.`
              : null,
          )}
        </T>
        <T variant="sub">
          {joinSentences(
            p.shippingFeeType !== "FREE" && !(p.shippingFee > 0)
              ? "배송비는 확정 전이에요."
              : null,
            `도서산간 주소는 추가 운임 ${won(p.remoteAreaFee)}이 붙어요.`,
          )}
        </T>
      </Fold>
      {p.soldOut ? (
        <>
          <T variant="heading">{unavailableLabel(p.availability)}</T>
          <T variant="sub" muted>
            {p.nextStageStartsAt
              ? `다음 예약은 ${md(p.nextStageStartsAt)}에 열려요.`
              : "지금은 새 예약을 받지 않아요."}
          </T>
        </>
      ) : (
        <View
          testID="product-options"
          style={{
            borderWidth: 1,
            borderColor: tokens.color.border,
            borderRadius: tokens.radius.md,
          }}
        >
          {p.options.map((o, i) => {
            const value = cur?.options[o.optionId];
            // 옵션 줄마다 따로(PM 11/09 결정). 옵션끼리 남은 물량을 나눠 써서 더하지 않는다(DEV-293).
            // 지금 기간이 없으면(생산자 미리보기·기간 사이) 첫 기간 물량으로 보인다. 소비자 화면은 이때 soldOut이라 이 줄이 없다
            const left = cur
              ? optionLeft(p, o.optionId)
              : p.stages[0]
                ? optionLeft({ ...p, currentStageId: p.stages[0].stageId }, o.optionId)
                : 0;
            return (
              <View
                key={o.optionId}
                testID="product-option-row"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  minHeight: tokens.height.rowTwoLine,
                  paddingHorizontal: tokens.space.gutter,
                  paddingVertical: 12,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: tokens.color.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T weight="semibold" numberOfLines={1}>
                    {o.label}
                  </T>
                  {/* 다 팔린 옵션은 오른쪽 가격 자리에 이유(‘이번 기간 품절’ 등)가 나오므로 남은 박스 줄은 뺀다 */}
                  {left > 0 ? (
                    <T variant="sub" muted numberOfLines={1}>
                      {left}박스 남음
                    </T>
                  ) : null}
                </View>
                <Price
                  align="right"
                  current={value?.price ?? null}
                  reference={reference(o.optionId)}
                  soldOut={left <= 0}
                  availability={p.availability}
                />
              </View>
            );
          })}
        </View>
      )}
      {/* 취소·환불 규정 한 줄 + 펼치기(DEV-293) */}
      <Pressable
        accessibilityRole="button"
        aria-expanded={open === "cancel"}
        onPress={() => toggle("cancel")}
        style={{
          minHeight: tokens.touchTarget.min,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
        }}
      >
        <T variant="sub" muted style={{ flexShrink: 1 }}>
          출하 전 전액 환불 · 출하 후 단순 변심 반품 불가
        </T>
        <Icon
          name={open === "cancel" ? "chevronDown" : "chevron"}
          size={16}
          color={tokens.color.textMuted}
        />
      </Pressable>
      {open === "cancel" ? (
        <View style={{ gap: 8, marginTop: -8 }}>
          <T variant="sub">예약할 때 전액을 한 번에 입금해요.</T>
          <T variant="sub">
            보내기 전에는 언제든 취소할 수 있고 전액 환불돼요. 수수료는 없어요.
          </T>
          <T variant="sub">
            신선식품이라 보낸 뒤에는 단순 변심으로 취소·반품할 수 없어요.
          </T>
          <T variant="sub">
            받은 상품에 문제가 있으면 받은 뒤 24시간 안에 사진과 함께 알려 주세요.
          </T>
        </View>
      ) : null}
    </>
  );
}
