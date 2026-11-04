// 구매자 상품 상세 본문(SCR-04, FEAT-07). 소비자 앱 상품 상세와 생산자 앱 판매 시작 전 미리보기(DEV-184)가 함께 쓴다.
import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, View } from "react-native";

import { BrixReading } from "./BrixReading";
import { DetailStory } from "./DetailStory";
import { Icon } from "./Icon";
import { ModuleStory } from "./ModuleStory";
import { Photo } from "./content";
import { Price } from "./Storefront";
import { T } from "./Text";
import {
  AVAILABILITY_LABEL,
  closesText,
  DELIVERY_PENDING_NOTE,
  deliveryText,
  joinMeta,
  md,
  shippingText,
  unavailableLabel,
  won,
} from "./format";
import { tokens } from "./tokens";

type StageOption = { price: number; quantity: number; reservedCount: number };

/** 화면에 필요한 상품 값만. @farmclub/api의 ProductDetail이 그대로 들어맞는다. */
export type ProductPageData = {
  photo: string | null;
  name: string;
  farmName: string;
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
  /** 상품명 바로 아래(품종 등) */
  subName?: ReactNode;
  /** 받는 시기·가격·남은 박스·배송비 줄 전체 */
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
  slots,
}: {
  p: ProductPageData;
  slots?: ProductPageSlots;
  /** 이전 기간 가격(취소선). 소비자 앱은 api의 referencePrice를 넘긴다. */
  reference: (optionId: string) => number | null;
  mediaUrl?: (uri: string) => string;
  onFarmPress?: () => void;
}) {
  const [open, setOpen] = useState<Open>(null);
  const toggle = (k: NonNullable<typeof open>) =>
    setOpen((o) => (o === k ? null : k));
  const cur = p.stages.find((s) => s.stageId === p.currentStageId) ?? null;
  const firstOpt = p.options[0]?.optionId;
  const left =
    cur && firstOpt
      ? Math.min(
          Math.floor(
            p.remainingGrams / Math.round(p.options[0].weightKg * 1000),
          ),
          (cur.options[firstOpt]?.quantity ?? 0) -
            (cur.options[firstOpt]?.reservedCount ?? 0),
        )
      : 0;
  const fee = shippingText(p.shippingFeeType, p.shippingFee);
  const infoOpen = slots?.infoOpen || open === "info";
  return (
    <>
      {slots?.photo ?? (
        <Photo
          uri={p.photo}
          width="100%"
          height={244}
          radius={0}
          alt={p.name}
          kind="product"
        />
      )}

      <View style={{ padding: 20, gap: 16 }}>
        {p.farmName ? (
          <Pressable
            accessibilityRole="link"
            disabled={!onFarmPress}
            onPress={onFarmPress}
            style={{ minHeight: 48, justifyContent: "center" }}
          >
            <T
              variant="sub"
              weight="semibold"
              color={tokens.color.accent}
              numberOfLines={1}
            >
              {p.farmName} ›
            </T>
          </Pressable>
        ) : null}
        {slots?.name ?? (
          <T variant="title" accessibilityRole="header">
            {p.name}
          </T>
        )}
        {slots?.subName ?? null}
        {slots?.sale ?? (
          <SaleRows
            p={p}
            cur={cur}
            left={left}
            fee={fee}
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
        <View style={{ paddingHorizontal: 20, paddingTop: 40, gap: 8 }}>
          <T variant="sub" muted>
            {p.farmName}의 한마디
          </T>
          <T variant="body">{p.farmerNote}</T>
        </View>
      ) : null}

      <View style={{ marginHorizontal: 20, marginTop: 40 }}>
        <Fold
          label="상품정보"
          open={infoOpen}
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
              <T variant="sub" muted style={{ width: 80 }}>
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
        <Fold
          label="취소 규정"
          open={open === "cancel"}
          onPress={() => toggle("cancel")}
          last
        >
          <T variant="sub">예약할 때 전액을 한 번에 결제해요.</T>
          <T variant="sub">
            보내기 전에는 언제든 취소할 수 있고 전액 환불돼요. 수수료는 없어요.
          </T>
          <T variant="sub">
            신선식품이라 보낸 뒤에는 단순 변심으로 취소·반품할 수 없어요. 받은
            상품에 문제가 있으면 받은 뒤 24시간 안에 사진과 함께 알려주세요.
          </T>
        </Fold>
      </View>
    </>
  );
}

function Fold({
  label,
  open,
  onPress,
  children,
  last,
}: {
  label: string;
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
          minHeight: 52,
        }}
      >
        <T variant="body">{label}</T>
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

type Open = null | "window" | "fee" | "info" | "cancel";
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
  left,
  fee,
  open,
  toggle,
  reference,
}: {
  p: ProductPageData;
  cur: ProductPageData["stages"][number] | null;
  left: number;
  fee: string;
  open: Open;
  toggle: (k: NonNullable<Open>) => void;
  reference: (optionId: string) => number | null;
}) {
  return (
    <>
      <Fold
        label={deliveryText(p.deliveryWindow, lastReservationEnd(p))}
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
      </Fold>
      {p.soldOut ? (
        <>
          <T variant="heading">
            {AVAILABILITY_LABEL[p.availability] ?? unavailableLabel(p.availability)}
          </T>
          <T variant="sub" muted>
            {p.nextStageStartsAt
              ? `다음 예약은 ${md(p.nextStageStartsAt)}에 열려요.`
              : "지금은 새 예약을 받지 않아요."}
          </T>
        </>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
          {p.options.map((o) => {
            const value = cur?.options[o.optionId];
            const sold =
              !value ||
              value.reservedCount >= value.quantity ||
              p.remainingGrams < Math.round(o.weightKg * 1000);
            return (
              <View key={o.optionId} style={{ minWidth: 145, flex: 1, gap: 8 }}>
                <T weight="semibold" numberOfLines={1}>
                  {o.label}
                </T>
                <Price
                  large
                  current={value?.price ?? null}
                  reference={reference(o.optionId)}
                  soldOut={sold}
                  availability={p.availability}
                />
              </View>
            );
          })}
        </View>
      )}
      {!p.soldOut ? (
        <T variant="sub" muted numberOfLines={1}>
          {joinMeta(`${left}박스 남음`, closesText(p.dDay))}
        </T>
      ) : null}
      <Fold
        label={fee + " · 도서산간 추가"}
        open={open === "fee"}
        onPress={() => toggle("fee")}
      >
        <T variant="sub">
          {joinSentences(
            p.shippingFeeType !== "FREE" && !(p.shippingFee > 0)
              ? "배송비는 확정 전이에요."
              : null,
            `도서산간 주소는 추가 운임 ${won(p.remoteAreaFee)}이 붙어요.`,
          )}
        </T>
      </Fold>
    </>
  );
}
