// DEV-452 (PM 11/27): one-at-a-time check sheet for the generated page.
// Lists what still needs the producer's eye — photos taken from the material and flagged
// passages — and saves each answer right away. Same decisions and rules as SourceCopyReview.
import {
  sourceAnalysis,
  type SourceAsset,
  type SourceBatch,
  type SourceCopyAction,
  type SourceCopyDecision,
  type SourceCopyPassage,
  type SourceCopyReview as SourceCopyData,
} from "@farmclub/api";
import { Button, Input, SOURCE_MODULES, Sheet, T, tokens } from "@farmclub/ui";
import { useEffect, useMemo, useState } from "react";
import { Image, View } from "react-native";

import { reasonMessages, requiresNote } from "./SourceCopyReview";
import { sourcePhotoUrl } from "./sourcePhoto";

const RESTRICTED = ["PRIVATE_VALUE", "HEALTH_CLAIM", "OTHER_PRODUCT"];
const EDIT_NOTE = "원문과 현재 정보를 확인하고 문구를 직접 바로잡았어요.";
const KEEP_NOTE = "원문과 현재 사용 내용을 확인했어요.";
const sectionTitle = (id: string | null) => SOURCE_MODULES.find(([m]) => m === id)?.[1] ?? "넣을 곳 정하기";

type TextItem = { kind: "text"; key: string; passage: SourceCopyPassage; unit: SourceCopyPassage[]; module: string | null };
type Item = { kind: "photo"; key: string; source: SourceAsset } | TextItem;
type Related = { action: "EDIT" | "KEEP"; phrase: string; replacement?: string; items: { item: TextItem; before: string; after: string }[] };

/** Date/time expressions the date reasons flag (e.g. "10년", "작년", "올해"). */
const TIME_PHRASE = /\d+\s*(?:년|개월|주|일)\s*(?:전|째|동안|간)?|올해|작년|내년|지난해|이번\s*(?:주|달|해)/g;
const TIME_REASONS = ["RELATIVE_TIME", "DATED_OR_HISTORICAL", "SEASON_OR_AVAILABILITY"];

/** The part of a sentence the producer changed: shared start and end are removed. */
export function changedPart(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { removed: before.slice(start, before.length - end).trim(), added: after.slice(start, after.length - end).trim() };
}

/**
 * Other open items with the same phrase as the one just answered. EDIT: the changed phrase
 * (2–30 characters) is replaced the same way; KEEP: the same flagged date/time phrase with a
 * shared date reason. Only offered to the producer, never applied on its own.
 */
export function relatedItems(data: SourceCopyData, done: TextItem, action: SourceCopyAction, before: string, after: string): Related | null {
  const open = (checkItems(data, [], null).filter((i) => i.kind === "text" && i.key !== done.key)) as TextItem[];
  if (action === "EDIT") {
    const { removed, added } = changedPart(before, after);
    // A whole-sentence rewrite is not a phrase fix; nothing to carry over.
    if (removed.length < 2 || removed.length > 30 || removed === before.trim()) return null;
    const items = open
      .map((item) => ({ item, before: shownText(item.passage, data.plan) }))
      .filter(({ before: text }) => text.includes(removed))
      .map(({ item, before: text }) => ({ item, before: text, after: text.split(removed).join(added) }));
    return items.length ? { action: "EDIT", phrase: removed, replacement: added, items } : null;
  }
  if (action === "KEEP") {
    const reasons = done.unit.flatMap((u) => Object.values(u.reasonCodes).flat()).filter((r) => TIME_REASONS.includes(r));
    const phrase = reasons.length ? before.match(TIME_PHRASE)?.[0]?.trim() : undefined;
    if (!phrase) return null;
    const items = open
      .filter((item) => item.unit.some((u) => Object.values(u.reasonCodes).flat().some((r) => TIME_REASONS.includes(r))))
      .filter((item) => !item.unit.some((u) => u.reasonCodes.SAFETY.some((r) => RESTRICTED.includes(r))))
      .map((item) => ({ item, before: shownText(item.passage, data.plan), after: shownText(item.passage, data.plan) }))
      .filter(({ before: text }) => text.includes(phrase));
    return items.length ? { action: "KEEP", phrase, items } : null;
  }
  return null;
}

/** Section a passage is shown in now (presentation placement first, as in SourceCopyReview). */
export function currentModule(p: SourceCopyPassage, plan: SourceCopyData["plan"]) {
  return (
    plan.modules.find((m) => m.texts.some((t) => t.passageIds?.includes(p.id)))?.module ??
    p.optionAssembly?.module ??
    p.autoRepair?.module ??
    p.module
  );
}

/** Things to check, photos first, then passages in page order; optionally one section only. */
export function checkItems(
  data: SourceCopyData | null,
  photos: SourceAsset[],
  only?: string[] | null,
): Item[] {
  const items: Item[] = only ? [] : photos.map((source) => ({ kind: "photo" as const, key: `photo-${source.id}`, source }));
  if (!data) return items;
  const seen = new Set<string>();
  for (const p of data.plan.passages) {
    if (!p.reviewPending) continue;
    const ids = p.autoRepair?.passageIds;
    const unit = ids?.length
      ? ids.map((id) => data.plan.passages.find((x) => x.id === id)).filter((x): x is SourceCopyPassage => !!x)
      : [p];
    const key = unit.map((x) => x.bindingHash).join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const module = currentModule(p, data.plan);
    if (only && !(module && only.includes(module))) continue;
    items.push({ kind: "text", key, passage: p, unit: unit.length ? unit : [p], module });
  }
  return items;
}

const shownText = (p: SourceCopyPassage, plan: SourceCopyData["plan"]) =>
  plan.modules.flatMap((m) => m.texts).find((t) => t.passageIds?.includes(p.id))?.value ?? p.value;

export function CheckSheet({
  batch,
  targetId,
  photos,
  only,
  title,
  onClose,
  beforeMutation,
  onChanged,
  onConfirmPhoto,
  onRemovePhoto,
}: {
  batch: SourceBatch;
  targetId: string;
  /** Extracted photos the page uses that still need confirmation. */
  photos: SourceAsset[];
  /** Only these sections (opened from a section's "확인 N"). */
  only?: string[] | null;
  title?: string;
  onClose: () => void;
  /** Saves unsaved page edits first; false stops the decision. */
  beforeMutation: () => Promise<boolean>;
  /** After any saved answer: reload the page and counts. */
  onChanged: () => Promise<void>;
  onConfirmPhoto: (s: SourceAsset) => Promise<void>;
  onRemovePhoto: (s: SourceAsset) => Promise<void>;
}) {
  const [data, setData] = useState<SourceCopyData | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState("");
  const [place, setPlace] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [related, setRelated] = useState<Related | null>(null);
  const reload = () => sourceAnalysis.sourceCopy(batch.id, targetId).then(setData);
  useEffect(() => { reload().catch((e: unknown) => setError(e instanceof Error ? e.message : "불러오지 못했어요.")); }, [batch.id, targetId]);
  const items = useMemo(() => checkItems(data, photos, only), [data, photos, only]);
  const total = items.length;
  const at = Math.min(index, Math.max(0, total - 1));
  const item = items[at];
  useEffect(() => { setEditing(null); setPlace(null); setError(""); }, [item?.key]);
  useEffect(() => {
    if (item?.kind !== "photo") return;
    let alive = true, made = "";
    sourcePhotoUrl(batch, item.source, "display").then((url) => { if (url.startsWith("blob:")) made = url; if (alive) setPhotoUrl(url); }).catch(() => undefined);
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
  }, [item?.key]);

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await work();
      await onChanged();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  /** Decisions for one item (auto-joined units answer together, as in SourceCopyReview). */
  const decisionsFor = (it: TextItem, action: SourceCopyAction, plan: SourceCopyData["plan"], value?: string, module?: string | null): SourceCopyDecision[] => {
    const live = it.unit.map((u) => plan.passages.find((x) => x.bindingHash === u.bindingHash));
    if (live.some((x) => !x)) throw new Error("자료가 바뀌었어요. 다시 열어 주세요.");
    const notes = [...new Set((it.passage.reviewPrompts ?? []).map((q) => q.confirmation))].join(" ") || KEEP_NOTE;
    return live.map((u) => {
      const sub = action === "EDIT" && u!.id !== it.passage.id;
      const where = module ?? currentModule(u!, plan);
      return {
        bindingHash: u!.bindingHash,
        action: sub ? "OMIT" : action,
        ...(where ? { module: where } : {}),
        ...(action === "EDIT" && !sub ? { value } : {}),
        ...(sub ? { note: "같은 문단의 직접 수정으로 대체했어요." }
          : action === "EDIT" ? { note: EDIT_NOTE }
          : action === "KEEP" ? { note: notes }
          : action === "ACCEPT_REPAIR" ? { note: "최소 수정 제안을 사용해요." } : {}),
      };
    });
  };
  const decide = (it: TextItem, action: SourceCopyAction, value?: string, module?: string | null) =>
    run(async () => {
      if (!(await beforeMutation())) throw new Error("고친 페이지를 먼저 저장하지 못했어요. 다시 시도해 주세요.");
      const latest = await sourceAnalysis.sourceCopy(batch.id, targetId);
      const before = shownText(it.passage, latest.plan);
      const saved = await sourceAnalysis.saveSourceCopy(batch.id, targetId, {
        reviewVersion: latest.reviewVersion,
        planHash: latest.plan.planHash,
        decisions: decisionsFor(it, action, latest.plan, value, module),
      });
      // DEV-452 (PM 11/27): offer the same answer for the same phrase elsewhere — never applied silently.
      setRelated(relatedItems(saved, it, action, before, value ?? ""));
    });
  const applyRelated = (r: Related) =>
    run(async () => {
      if (!(await beforeMutation())) throw new Error("고친 페이지를 먼저 저장하지 못했어요. 다시 시도해 주세요.");
      const latest = await sourceAnalysis.sourceCopy(batch.id, targetId);
      const decisions = r.items.flatMap(({ item, after }) =>
        decisionsFor(item, r.action, latest.plan, r.action === "EDIT" ? after : undefined));
      await sourceAnalysis.saveSourceCopy(batch.id, targetId, {
        reviewVersion: latest.reviewVersion,
        planHash: latest.plan.planHash,
        decisions,
      });
      setRelated(null);
    });

  let body = null;
  if (related) body = (
    <View style={{ gap: 12 }} testID="related-offer">
      <T weight="semibold">
        {related.action === "EDIT"
          ? `‘${related.phrase}’이(가) ${related.items.length}곳 더 있어요. 같이 ‘${related.replacement}’(으)로 바꿀까요?`
          : `‘${related.phrase}’이(가) 들어간 확인 항목이 ${related.items.length}곳 더 있어요. 모두 괜찮아요로 할까요?`}
      </T>
      {related.items.map(({ item, before, after }) => (
        <View key={item.key} style={{ padding: 12, borderRadius: 12, backgroundColor: "#FBF7EE", gap: 4 }}>
          <T variant="caption" muted>{sectionTitle(item.module)}</T>
          {related.action === "EDIT" ? <><T variant="sub" muted>{before}</T><T variant="sub">{`→ ${after}`}</T></> : <T variant="sub">{before}</T>}
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={related.action === "EDIT" ? "모두 바꾸기" : "모두 괜찮아요"} style={{ flex: 2 }} disabled={busy} loading={busy} onPress={() => void applyRelated(related)} />
        <Button label="하나씩 볼게요" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => setRelated(null)} />
      </View>
    </View>
  );
  else if (!data && !error) body = <T muted>불러오는 중이에요.</T>;
  else if (!item) body = (
    <View style={{ gap: 12 }}>
      <T weight="semibold">{only ? "이 섹션에서 확인할 것을 모두 마쳤어요." : "확인할 것을 모두 마쳤어요."}</T>
      <T variant="sub" muted>페이지를 한 번 훑어보고 판매 시작을 요청해 주세요.</T>
      <Button label="닫기" onPress={onClose} />
    </View>
  );
  else if (item.kind === "photo") {
    const info = item.source.placement?.extracted;
    body = (
      <View style={{ gap: 12 }} testID="check-photo">
        <T variant="caption" muted>사진</T>
        <View style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 12, overflow: "hidden", backgroundColor: "#F2EEE6" }}>
          {photoUrl ? <Image source={{ uri: photoUrl }} resizeMode="contain" style={{ width: "100%", height: "100%" }} accessibilityLabel="자료에서 가져온 사진" /> : null}
        </View>
        <T>
          {`자료(${batch.sources.find((s) => s.id === info?.sourceId)?.filename ?? "자료"}${info ? ` ${info.page}쪽` : ""})에서 가져온 사진이에요. 이 상품 사진이 맞고, 개인정보가 보이지 않으면 페이지에 써 주세요.`}
        </T>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="이 사진 쓸게요" style={{ flex: 2 }} disabled={busy} loading={busy} onPress={() => void run(() => onConfirmPhoto(item.source))} />
          <Button label="빼기" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => void run(() => onRemovePhoto(item.source))} />
        </View>
      </View>
    );
  } else {
    const p = item.passage;
    const reasons = item.unit.flatMap((u) => Object.values(u.reasonCodes).flat());
    const critical = item.unit.some((u) => u.reasonCodes.SAFETY.some((r) => RESTRICTED.includes(r)));
    const prompts = [...new Map(item.unit.flatMap((u) => u.reviewPrompts ?? []).map((q) => [q.question, q])).values()];
    const shown = shownText(p, data!.plan);
    const repair = p.repairValue && p.repairValue !== p.originalValue && !p.reasonCodes.OWNER_CONFIRMATION.length && !p.reasonCodes.SAFETY.length ? p.repairValue : null;
    const needsPlace = item.module === null;
    body = (
      <View style={{ gap: 12 }} testID={`check-passage-${p.id}`}>
        <T variant="caption" muted>{sectionTitle(item.module)}</T>
        <View style={{ padding: 14, borderRadius: 12, backgroundColor: critical ? "#FFF0ED" : "#FBF7EE" }}>
          <T>{shown}</T>
        </View>
        {/* Show the original only when the words differ, not just spacing or line breaks. */}
        {p.originalValue.replace(/\s+/g, "") !== shown.replace(/\s+/g, "") ? <T variant="caption" muted>{`원문: ${p.originalValue}`}</T> : null}
        {prompts.length
          ? prompts.slice(0, 2).map((q) => (
              <View key={q.question} style={{ gap: 4 }}>
                <T weight="semibold" color={q.severity === "critical" ? tokens.color.error : undefined}>{q.question}</T>
                <T variant="sub" muted>{q.detail}</T>
              </View>
            ))
          : [...new Set(reasons.map((r) => reasonMessages[r]).filter(Boolean))].slice(0, 2).map((m) => <T key={m} variant="sub">{m}</T>)}
        {repair ? <T variant="sub">{`제안: ${repair}`}</T> : null}
        {editing === item.key ? (
          <View style={{ gap: 8 }}>
            <Input label="이렇게 바꿀게요" multiline value={draft} onChangeText={setDraft} editable={!busy} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="저장" style={{ flex: 2 }} disabled={busy || !draft.trim()} loading={busy} onPress={() => void decide(item, "EDIT", draft.trim(), place)} />
              <Button label="취소" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => setEditing(null)} />
            </View>
          </View>
        ) : (
          <>
            {needsPlace ? (
              <View style={{ gap: 6 }}>
                <T variant="sub">어느 섹션에 넣을까요?</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {SOURCE_MODULES.filter(([id]) => !["sizePhoto", "crossSectionPhoto", "packagePhoto", "farmPhotos", "hero"].includes(id)).map(([id, label]) => (
                    <Button key={id} compact variant={place === id ? "primary" : "outline"} label={label} disabled={busy} onPress={() => setPlace(id)} />
                  ))}
                </View>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {!critical && (!needsPlace || place) && !p.reasonCodes.PLACEMENT.includes("COMMON_SCOPE_UNCONFIRMED") ? (
                <Button label={needsPlace ? "여기에 넣기" : "괜찮아요"} style={{ flex: 1 }} disabled={busy} loading={busy}
                  onPress={() => void decide(item, "KEEP", undefined, place)} />
              ) : null}
              <Button label="고치기" variant="outline" style={{ flex: 1 }} disabled={busy || (needsPlace && !place)}
                onPress={() => { setDraft(shown); setEditing(item.key); }} />
              {/* PM 11/27: 괜찮아요 / 고치기 / 빼기 are the three main answers. */}
              <Button label="빼기" variant="outline" style={{ flex: 1 }} disabled={busy} onPress={() => void decide(item, "OMIT")} />
            </View>
            {repair && !needsPlace ? <Button label="제안대로 고치기" variant="secondary" disabled={busy} onPress={() => void decide(item, "ACCEPT_REPAIR")} /> : null}
            {needsPlace && !place ? <T variant="caption" muted>섹션을 고르면 넣거나 고칠 수 있어요.</T> : null}
            {requiresNote(p) && !critical ? <T variant="caption" muted>‘괜찮아요’를 누르면 지금도 맞는 내용인지 확인했다고 기록해요.</T> : null}
          </>
        )}
      </View>
    );
  }

  return (
    // Closing is always allowed; an answer being saved finishes in the background and the page refreshes.
    <Sheet visible onClose={onClose} title={title ?? (total ? `확인 ${at + 1} / ${total}` : "확인")}>
      <View style={{ gap: 14 }}>
        {body}
        {error ? <View accessibilityRole="alert"><T color={tokens.color.error}>{error}</T></View> : null}
        {total > 1 ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Button label="‹ 이전" variant="text" disabled={busy || at === 0} onPress={() => setIndex(at - 1)} />
            <T variant="caption" muted>{`${at + 1} / ${total}`}</T>
            <Button label="다음 ›" variant="text" disabled={busy || at >= total - 1} onPress={() => setIndex(at + 1)} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
