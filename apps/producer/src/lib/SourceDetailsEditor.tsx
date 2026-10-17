import {
  newIdempotencyKey,
  sourceAnalysis,
  type SourceBatch,
  type SourceDraft,
  type SourceEditorField,
  type SourceField,
  type SourceReview,
} from "@farmclub/api";
import { Button, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Switch, TextInput, View } from "react-native";

const card = {
  padding: 16,
  gap: 12,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: tokens.color.border,
};
const identity = (f: SourceField) => `${f.targetId}:${f.fieldKey}`;
const filled = (f: SourceField) =>
  !!(f.value.trim() || f.photoAssetIds.length || f.illustrationId);
const keys = (id: string) => (id === "hero" ? ["name", "hero"] : [id]);
const initialSelection = (
  batch: SourceBatch,
  review: SourceReview,
  drafts: SourceDraft[],
): Record<string, string[]> =>
  Object.fromEntries(
    batch.targets.map((t) => [
      t.id,
      drafts
        .find((d) => d.targetId === t.id)
        ?.snapshot.modules.filter((m) => m.enabled)
        .map((m) => m.id) ??
        SOURCE_MODULES.filter(
          ([id]) =>
            review.editorFields.some(
              (e) =>
                e.field.targetId === t.id &&
                keys(id).includes(e.field.fieldKey) &&
                e.status === "ready" &&
                e.field.state !== "EXCLUDED" &&
                filled(e.field),
            ) &&
            !review.editorFields.some(
              (e) =>
                e.field.targetId === t.id &&
                keys(id).includes(e.field.fieldKey) &&
                ["conflict", "outdated", "unassigned"].includes(e.status),
            ),
        ).map(([id]) => id),
    ]),
  );
export function SourceDetailsEditor({
  batch,
  review,
  drafts,
  onDirty,
  onSaved,
  onBusy,
}: {
  batch: SourceBatch;
  review: SourceReview;
  drafts: SourceDraft[];
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (draft: SourceDraft) => Promise<void>;
}) {
  const [entries, setEntries] = useState<SourceEditorField[]>(
    review.editorFields,
  );
  const [enabled, setEnabled] = useState<Record<string, string[]>>(() =>
    initialSelection(batch, review, drafts),
  );
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [opened, setOpened] = useState<string | null>(null),
    [evidence, setEvidence] = useState<string | null>(null);
  const version = useRef(review.reviewVersion),
    lock = useRef(false),
    alive = useRef(true);
  const requests = useRef(new Map<string, string>());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  // Keep an unsaved edit anchored to its version; stale saves must fail, not overwrite.
  useEffect(() => {
    if (!dirty) {
      setEntries(review.editorFields);
      setEnabled(initialSelection(batch, review, drafts));
      version.current = review.reviewVersion;
    }
  }, [review, drafts, batch, dirty]);
  const change = (field: SourceField) => {
    setEntries((old) =>
      old.map((e) =>
        identity(e.field) === identity(field) ? { field, status: "ready" } : e,
      ),
    );
    setDirty(true);
  };
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    const fields = entries.map((e) => e.field);
    const targets = batch.targets.map((t) => ({
      targetId: t.id,
      enabledModuleIds: enabled[t.id],
    }));
    const signature = JSON.stringify([version.current, fields, targets]);
    if (!requests.current.has(signature))
      requests.current.set(signature, newIdempotencyKey());
    try {
      const result = await sourceAnalysis.saveEditor(
        batch.id,
        version.current,
        fields,
        targets,
        requests.current.get(signature)!,
      );
      if (alive.current) {
        await onSaved(result.drafts[0]);
        setDirty(false);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  return (
    <View style={{ gap: 16 }}>
      <T variant="sub" muted>
        넣을 항목만 켜 주세요. 문구는 바로 수정할 수 있어요.
      </T>
      {error ? (
        <View accessibilityRole="alert">
          <T color={tokens.color.error}>{error}</T>
        </View>
      ) : null}
      {batch.targets.map((target) => (
        <View key={target.id} style={{ gap: 12 }}>
          {batch.targets.length > 1 ? (
            <T variant="heading">{target.name}</T>
          ) : null}
          {SOURCE_MODULES.map(([id, title]) => {
            const group = entries.filter(
              (e) =>
                e.field.targetId === target.id &&
                keys(id).includes(e.field.fieldKey),
            );
            const needsAttention = group.some((e) =>
              ["conflict", "outdated", "unassigned"].includes(e.status),
            );
            const on = enabled[target.id]?.includes(id) ?? false;
            const sectionKey = `${target.id}:${id}`,
              expanded = opened === sectionKey;
            return (
              <View key={id} style={card}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${title} 편집`}
                    accessibilityState={{ expanded }}
                    disabled={busy}
                    onPress={() => setOpened(expanded ? null : sectionKey)}
                    style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
                  >
                    <T weight="semibold">{title}</T>
                    <T variant="caption" muted>
                      {needsAttention
                        ? "확인 필요 · 값을 선택하거나 수정해 주세요"
                        : on
                          ? group
                              .map((e) => e.field.value)
                              .filter(Boolean)
                              .join(" · ") || "사진·일러스트 포함"
                          : "페이지에서 숨김"}
                    </T>
                  </Pressable>
                  <Switch
                    thumbColor="#FFFFFF"
                    {...(Platform.OS === "web"
                      ? { activeThumbColor: "#FFFFFF" }
                      : {})}
                    accessibilityLabel={`${title} 표시`}
                    value={on}
                    disabled={busy || (needsAttention && !on)}
                    trackColor={{
                      false: tokens.color.border,
                      true: tokens.color.accent,
                    }}
                    onValueChange={(value) => {
                      setEnabled((old) => ({
                        ...old,
                        [target.id]: value
                          ? [...old[target.id], id]
                          : old[target.id].filter((x) => x !== id),
                      }));
                      if (value)
                        setEntries((old) =>
                          old.map((e) =>
                            e.field.targetId === target.id &&
                            keys(id).includes(e.field.fieldKey) &&
                            e.field.state === "EXCLUDED"
                              ? {
                                  ...e,
                                  field: { ...e.field, state: "CONFIRMED" },
                                }
                              : e,
                          ),
                        );
                      setDirty(true);
                    }}
                  />
                </View>
                {expanded
                  ? group.map((entry) => {
                      const f = entry.field,
                        fid = identity(f),
                        label = f.fieldKey === "name" ? "상품 이름" : title;
                      const choices = review.candidates.filter(
                        (c) =>
                          !c.historical &&
                          !c.outdated &&
                          c.fieldKey === f.fieldKey &&
                          (c.targetId === target.id || c.targetId === null),
                      );
                      return (
                        <View key={fid} style={{ gap: 8 }}>
                          {id === "hero" ? (
                            <T variant="caption">{label}</T>
                          ) : null}
                          <TextInput
                            accessibilityLabel={`${label} 내용`}
                            multiline
                            editable={!busy}
                            value={f.value}
                            maxLength={3000}
                            style={{
                              borderWidth: 1,
                              borderColor: tokens.color.border,
                              borderRadius: 12,
                              padding: 12,
                              fontSize: 16,
                              lineHeight: 24,
                              minHeight: 88,
                              color: tokens.color.text,
                            }}
                            onChangeText={(value) =>
                              change({
                                ...f,
                                value,
                                state: "CONFIRMED",
                                provenance: "PRODUCER",
                                candidateIds: [],
                              })
                            }
                          />
                          <Button
                            label={evidence === fid ? "원문 닫기" : "원문 보기"}
                            variant="text"
                            disabled={busy}
                            onPress={() =>
                              setEvidence(evidence === fid ? null : fid)
                            }
                          />
                          {evidence === fid ||
                          ["conflict", "outdated", "unassigned"].includes(
                            entry.status,
                          ) ? (
                            <View style={{ gap: 8 }}>
                              {choices.length ? (
                                choices.map((c) => (
                                  <View
                                    key={c.id}
                                    style={{
                                      padding: 12,
                                      gap: 8,
                                      backgroundColor: tokens.color.surface,
                                      borderRadius: 12,
                                    }}
                                  >
                                    <T variant="sub">{c.value}</T>
                                    {evidence === fid
                                      ? c.evidence.map((e, i) => (
                                          <T key={i} variant="caption" muted>
                                            {
                                              batch.sources.find(
                                                (s) => s.id === e.sourceId,
                                              )?.filename
                                            }{" "}
                                            {e.page}쪽: {e.quote}
                                          </T>
                                        ))
                                      : null}
                                    <Button
                                      label="이 내용 선택"
                                      variant="outline"
                                      disabled={busy}
                                      onPress={() =>
                                        change({
                                          ...f,
                                          value: c.value,
                                          state: "CONFIRMED",
                                          provenance: "EXTRACTED",
                                          candidateIds: c.candidateIds,
                                        })
                                      }
                                    />
                                  </View>
                                ))
                              ) : (
                                <T variant="caption" muted>
                                  현재 사용할 수 있는 원문이 없어요. 내용을 직접
                                  입력할 수 있어요.
                                </T>
                              )}
                            </View>
                          ) : null}
                          {[
                            "hero",
                            "sizePhoto",
                            "crossSectionPhoto",
                            "packagePhoto",
                            "farmPhotos",
                          ].includes(f.fieldKey)
                            ? batch.sources
                                .filter(
                                  (s) =>
                                    s.originalPhoto &&
                                    s.status === "PREPARED" &&
                                    (s.common ||
                                      s.targetIds.includes(target.id)),
                                )
                                .map((photo) => (
                                  <Pressable
                                    key={photo.id}
                                    accessibilityRole="checkbox"
                                    accessibilityLabel={photo.filename}
                                    accessibilityState={{
                                      checked: f.photoAssetIds.includes(
                                        photo.id,
                                      ),
                                    }}
                                    disabled={busy}
                                    style={{
                                      minHeight: 48,
                                      justifyContent: "center",
                                    }}
                                    onPress={() =>
                                      change({
                                        ...f,
                                        state: "CONFIRMED",
                                        photoAssetIds: f.photoAssetIds.includes(
                                          photo.id,
                                        )
                                          ? f.photoAssetIds.filter(
                                              (p) => p !== photo.id,
                                            )
                                          : [...f.photoAssetIds, photo.id],
                                      })
                                    }
                                  >
                                    <T variant="sub">
                                      {f.photoAssetIds.includes(photo.id)
                                        ? "✓"
                                        : "○"}{" "}
                                      {photo.filename}
                                    </T>
                                  </Pressable>
                                ))
                            : null}
                          {f.fieldKey === "sizePhoto" ? (
                            <View style={{ gap: 8 }}>
                              {[
                                [null, "그림 없음"],
                                ["hand-citrus-small", "소과"],
                                ["hand-citrus-medium", "중과"],
                                ["hand-citrus-large", "대과"],
                              ].map(([value, label]) => (
                                <Button
                                  key={label}
                                  label={label!}
                                  variant={
                                    f.illustrationId === value
                                      ? "secondary"
                                      : "outline"
                                  }
                                  disabled={busy}
                                  onPress={() =>
                                    change({
                                      ...f,
                                      state: "CONFIRMED",
                                      illustrationId: value,
                                    })
                                  }
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })
                  : null}
              </View>
            );
          })}
        </View>
      ))}
      <Button
        label="미리보기 · 비공개 저장"
        loading={busy}
        disabled={busy}
        onPress={() => void save()}
      />
    </View>
  );
}
