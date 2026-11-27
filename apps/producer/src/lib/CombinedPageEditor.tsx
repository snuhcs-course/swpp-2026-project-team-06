// DEV-452: edit view for the combined setup flow (자료 + 판매 설정 → generated page → 수정).
// Order (user-approved 2026-11-26): ① 사진 ② 기본 정보(입력값 우선, 자료 값은 참고) ③ 판매 설정 요약
// ④ 페이지 본문(섹션마다 확인 메모) ⑤ 자료에서 찾았지만 안 넣은 내용. ④·⑤ live in SourceDetailsEditor.
import {
  type SourceAsset,
  type SourceBatch,
  type SourceReview,
} from "@farmclub/api";
import { Button, T, tokens } from "@farmclub/ui";
import { useEffect, useState, type ReactNode } from "react";
import { Image, ScrollView, View } from "react-native";

import { sourcePhotoUrl } from "./sourcePhoto";

/** Decision note used when the producer puts the material's prices into the page (② 가격). */
export const PRICE_KEEP_NOTE = "판매 설정 가격과 다른 자료 속 가격을 확인하고 본문에 넣었어요.";
export const PRICE_TRANSFER_NOTE = "판매 설정의 가격을 사용해요.";
export const WEIGHT_KEEP_NOTE = "판매 설정 중량과 다른 자료 속 구성을 확인하고 본문에 넣었어요.";
export const WEIGHT_TRANSFER_NOTE = "판매 설정의 중량 옵션을 사용해요.";
export const SEASON_KEEP_NOTE = "받는 시기와 다른 자료 속 수확·제철 시기를 확인하고 본문에 넣었어요.";
export const SEASON_TRANSFER_NOTE = "판매 설정의 받는 시기를 사용해요.";
type DocPassage = { inputPreferred?: "PRICE" | "WEIGHT" | "SEASON"; decision: { action: string; note?: string | null } | null };
/** Material passages left out because the setup prices win, or put back by the producer in ② 가격. */
export const isDocPrice = (p: DocPassage) =>
  p.inputPreferred === "PRICE" || (!!p.decision && [PRICE_KEEP_NOTE, PRICE_TRANSFER_NOTE].includes(p.decision.note ?? ""));
/** Harvest/season sentences outside the delivery months (② 받는 시기). */
export const isDocSeason = (p: DocPassage) =>
  p.inputPreferred === "SEASON" || (!!p.decision && [SEASON_KEEP_NOTE, SEASON_TRANSFER_NOTE].includes(p.decision.note ?? ""));
/** Same for box sizes that differ from the sale options (② 구성). */
export const isDocWeight = (p: DocPassage) =>
  p.inputPreferred === "WEIGHT" || (!!p.decision && [WEIGHT_KEEP_NOTE, WEIGHT_TRANSFER_NOTE].includes(p.decision.note ?? ""));

export { sourceCopyOnce } from "./SourceCopyReview";

export const isExtracted = (s: SourceAsset) => !!s.placement?.extracted;
export const needsPhotoConfirm = (s: SourceAsset) => isExtracted(s) && !s.placement?.extracted?.confirmed;

/** Photos of this product: uploaded product photos and photos found inside documents. */
export function productPhotos(batch: SourceBatch, targetId: string) {
  return batch.sources.filter(
    (s) => s.originalPhoto && s.status === "PREPARED" && (s.common || s.targetIds.includes(targetId)),
  );
}

/** Extracted photos the page currently uses (placed in a section or the representative). */
export function photosInUse(batch: SourceBatch, targetId: string) {
  const target = batch.targets.find((t) => t.id === targetId);
  return productPhotos(batch, targetId).filter(
    (s) => s.placement?.fieldKey || s.id === target?.representativeAssetId,
  );
}

// ① 사진
export function PhotoStrip({
  batch,
  targetId,
  busy,
  onRepresentative,
  onConfirm,
  onRemove,
  onAdd,
}: {
  batch: SourceBatch;
  targetId: string;
  busy: boolean;
  onRepresentative: (s: SourceAsset) => void;
  onConfirm: (s: SourceAsset) => void;
  onRemove: (s: SourceAsset) => void;
  onAdd: () => void;
}) {
  const photos = productPhotos(batch, targetId);
  const target = batch.targets.find((t) => t.id === targetId);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = photos.map((p) => `${p.id}:${p.revision}`).join(",");
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    for (const p of photos)
      sourcePhotoUrl(batch, p, "thumb")
        .then((url) => {
          if (url.startsWith("blob:")) made.push(url);
          if (alive) setUrls((old) => ({ ...old, [p.id]: url }));
        })
        .catch(() => undefined);
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.id, key]);
  const pending = photos.filter((p) => needsPhotoConfirm(p) && photosInUse(batch, targetId).includes(p)).length;
  const sourceName = (id: string) => batch.sources.find((s) => s.id === id)?.filename ?? "자료";
  return (
    <View testID="combined-photos" style={{ gap: 10, paddingVertical: 16 }}>
      <View style={{ paddingHorizontal: tokens.space.gutter, gap: 4 }}>
        <T weight="semibold">사진 · {photos.length}장</T>
        <T variant="caption" muted>
          {pending
            ? `자료에서 가져온 사진 ${pending}장이 페이지에 들어갔어요. 쓸 사진은 '확인', 아니면 '빼기'를 눌러 주세요. 확인해야 판매를 요청할 수 있어요.`
            : "대표로 쓸 사진을 고르고, 필요 없는 사진은 빼 주세요."}
        </T>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: tokens.space.gutter }}>
        {photos.map((p) => {
          const info = p.placement?.extracted;
          const rep = p.id === target?.representativeAssetId;
          const inUse = rep || !!p.placement?.fieldKey;
          return (
            <View key={p.id} testID={`combined-photo-${p.id}`} style={{ width: 148, gap: 6 }}>
              <View style={{ width: 148, height: 148, borderRadius: 12, overflow: "hidden", backgroundColor: "#F2EEE6", borderWidth: rep ? 3 : 1, borderColor: rep ? tokens.color.accent : tokens.color.border }}>
                {urls[p.id] ? <Image source={{ uri: urls[p.id] }} style={{ width: "100%", height: "100%" }} accessibilityLabel={p.description || "상품 사진"} /> : null}
              </View>
              <T variant="caption" weight="semibold">
                {rep ? "대표 사진" : inUse ? "페이지에 사용" : "사용 안 함"}
              </T>
              {info ? (
                <T variant="caption" muted numberOfLines={2}>
                  자료에서 가져옴 · {sourceName(info.sourceId)} {info.page}쪽{info.confirmed ? " · 확인함" : ""}
                </T>
              ) : (
                <T variant="caption" muted>올린 사진</T>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {info && !info.confirmed && inUse ? <Button compact label="확인" disabled={busy} onPress={() => onConfirm(p)} /> : null}
                {!rep ? <Button compact variant="outline" label="대표로" disabled={busy} onPress={() => onRepresentative(p)} /> : null}
                <Button compact variant="text" label="빼기" disabled={busy} onPress={() => onRemove(p)} />
              </View>
            </View>
          );
        })}
        <View style={{ width: 148, height: 148, justifyContent: "center" }}>
          <Button variant="outline" label="+ 사진 추가" disabled={busy} onPress={onAdd} />
        </View>
      </ScrollView>
    </View>
  );
}

// ② 기본 정보: producer input wins. The document's different value is shown for reference.
export type FactRow = {
  key: string;
  label: string;
  input: ReactNode;
  /** What the document says, when it differs from the input. */
  doc?: string | null;
  /** Replace the input with the document value. */
  onUseDoc?: () => void;
  /** Put the document wording into the page body. */
  onAddDoc?: () => void;
  docAdded?: boolean;
};

export function BasicFacts({ rows, busy }: { rows: FactRow[]; busy: boolean }) {
  return (
    <View testID="combined-facts" style={{ gap: 14, padding: tokens.space.gutter, borderTopWidth: 1, borderBottomWidth: 1, borderColor: tokens.color.border }}>
      <View style={{ gap: 2 }}>
        <T weight="semibold">기본 정보</T>
        <T variant="caption" muted>입력한 값이 페이지에 쓰여요. 자료에 다른 내용이 있으면 아래에 함께 보여 드려요.</T>
      </View>
      {rows.map((r) => (
        <View key={r.key} testID={`fact-${r.key}`} style={{ gap: 6 }}>
          <T variant="caption" muted>{r.label}</T>
          {r.input}
          {r.doc ? (
            <View testID={`fact-doc-${r.key}`} style={{ gap: 6, padding: 10, borderRadius: 10, backgroundColor: "#F7F3EA" }}>
              <T variant="caption">자료에는: {r.doc}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {r.onUseDoc ? <Button compact variant="outline" label="이 내용으로 바꾸기" disabled={busy} onPress={r.onUseDoc} /> : null}
                {r.onAddDoc ? (
                  <Button compact variant="outline" label={r.docAdded ? "본문에 넣음 · 빼기" : "본문에 추가"} disabled={busy} onPress={r.onAddDoc} />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();
/** Document value differs from the input (and is not just contained in it). */
export function differs(input: string, doc: string | null | undefined): doc is string {
  if (!doc?.trim()) return false;
  const a = norm(input), b = norm(doc);
  return !!b && a !== b && !a.includes(b) && !b.includes(a || "\u0000");
}

/** First current (non-historical) extracted value for a field. */
export function docValue(review: SourceReview | null, targetId: string, fieldKey: string) {
  return (
    review?.candidates.find(
      (c) => c.targetId === targetId && c.fieldKey === fieldKey && !c.historical && !c.outdated && c.value.trim(),
    )?.value ?? null
  );
}

const NAME_LABEL = /^\s*(?:\d+\s*[.)]\s*)?(?:품목\s*(?:또는|및)?\s*명칭|품목|품명|상품\s*명|제품\s*명|명칭)\s*[:：]?\s*/;
/**
 * A product name as read from material, without form labels such as "1. 품목 또는 명칭"
 * (상품정보제공고시 tables) and without line breaks. Returns "" when only a label is left.
 */
export function cleanProductName(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.replace(NAME_LABEL, "").trim()).filter(Boolean);
  return (lines[0] ?? "").replace(/\s{2,}/g, " ").slice(0, 40);
}

