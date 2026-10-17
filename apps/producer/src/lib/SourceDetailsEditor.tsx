import { PageCanvas } from "./PageCanvas";
import { chooseSourceFiles } from "./sourceFiles";
import {
  newIdempotencyKey,
  sourcePageImage,
  uploadSource,
  sourceAnalysis,
  type SourceBatch,
  type SourceDraft,
  type SourceEditorField,
  type SourceField,
  type SourceReview,
} from "@farmclub/api";
import { Button, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

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
const initialHidden = (drafts: SourceDraft[]) => {
  const hidden: Record<string, string[]> = {};
  // Drafts arrive newest first, matching initialSelection.
  for (const draft of drafts) {
    if (!(draft.targetId in hidden))
      hidden[draft.targetId] = draft.snapshot.hiddenSectionIds ?? [];
  }
  return hidden;
};
export function SourceDetailsEditor({
  batch,
  review,
  drafts,
  onDirty,
  onSaved,
  onBusy,
  saveRef,
}: {
  batch: SourceBatch;
  review: SourceReview;
  drafts: SourceDraft[];
  saveRef: { current: (() => void) | null };
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
  const [hidden, setHidden] = useState<Record<string, string[]>>(() =>
    initialHidden(drafts),
  );
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const extraUrls = useRef<string[]>([]);
  useEffect(
    () => () => {
      extraUrls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  const [evidenceOpen, setEvidenceOpen] = useState<string | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<
    { uri: string; alt: string; targetId: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    Promise.all(
      batch.sources
        .filter((s) => s.originalPhoto && s.status === "PREPARED")
        .map(async (s) => {
          const url = await sourcePageImage(batch.id, s.id, 1);
          urls.push(url);
          return [s.id, url] as const;
        }),
    )
      .then((pairs) => {
        if (alive) setPhotoUrls(Object.fromEntries(pairs));
        else urls.forEach(URL.revokeObjectURL);
      })
      .catch(() => setError("사진을 불러오지 못했어요. 다시 열어 주세요."));
    return () => {
      alive = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [batch.id, batch.sources]);
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
      setHidden(initialHidden(drafts));
      version.current = review.reviewVersion;
    }
  }, [review, drafts, batch, dirty]);
  const change = (field: SourceField) => {
    const id = SOURCE_MODULES.find(([id]) =>
      keys(id).includes(field.fieldKey),
    )?.[0];
    if (id)
      setEnabled((old) => ({
        ...old,
        [field.targetId]: [...new Set([...(old[field.targetId] ?? []), id])],
      }));
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
      hiddenSectionIds: hidden[t.id] ?? [],
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
  useEffect(() => {
    saveRef.current = () => {
      if (!busy && !uploading) void save();
    };
    return () => {
      saveRef.current = null;
    };
  });
  return (
    <View style={{ gap: 16 }}>
      {error ? <T color={tokens.color.error}>{error}</T> : null}
      {batch.sources.some(
        (s) =>
          s.originalPhoto &&
          !s.placement?.fieldKey &&
          !entries.some((e) => e.field.photoAssetIds.includes(s.id)),
      ) ? (
        <T muted variant="sub">
          아직 배치되지 않은 사진이 있어요. 원하는 항목의 + 사진 추가 칸에서
          골라 주세요.
        </T>
      ) : null}
      {batch.targets.map((target) => (
        <PageCanvas
          key={target.id}
          hiddenSectionIds={hidden[target.id] ?? []}
          onHiddenSectionsChange={(ids) => {
            setHidden((old) => ({ ...old, [target.id]: ids }));
            setDirty(true);
          }}
          busy={busy}
          onUploading={(v) => {
            setUploading(v);
            onBusy(v);
          }}
          blocked={SOURCE_MODULES.filter(([id]) =>
            entries.some(
              (e) =>
                e.field.targetId === target.id &&
                keys(id).includes(e.field.fieldKey) &&
                ["conflict", "outdated", "unassigned"].includes(e.status),
            ),
          ).map(([id]) => id)}
          representativeUri={
            target.representativeAssetId ||
            batch.sources.find(
              (s) =>
                s.originalPhoto &&
                (s.common || s.targetIds.includes(target.id)),
            )?.id
          }
          media={(uri) => photoUrls[uri] ?? ""}
          modules={SOURCE_MODULES.map(([id]) => ({
            id,
            enabled: enabled[target.id]?.includes(id) ?? false,
            texts: entries
              .filter(
                (e) =>
                  e.field.targetId === target.id &&
                  keys(id).includes(e.field.fieldKey),
              )
              .map((e) => ({
                fieldKey: e.field.fieldKey,
                value: e.field.value,
              })),
            photos: entries
              .filter(
                (e) =>
                  e.field.targetId === target.id &&
                  keys(id).includes(e.field.fieldKey),
              )
              .flatMap((e) =>
                e.field.photoAssetIds.map((uri) => ({
                  uri,
                  alt:
                    batch.sources.find((s) => s.id === uri)?.description ||
                    "상품 사진",
                })),
              ),
            illustrationId: entries.find(
              (e) => e.field.targetId === target.id && e.field.fieldKey === id,
            )?.field.illustrationId,
          }))}
          photos={[
            ...extraPhotos.filter((p) => p.targetId === target.id),
            ...batch.sources
              .filter(
                (s) =>
                  s.originalPhoto &&
                  s.status === "PREPARED" &&
                  (s.common || s.targetIds.includes(target.id)),
              )
              .map((s) => ({ uri: s.id, alt: s.description || s.filename })),
          ]}
          onUpload={async () => {
            const files = await chooseSourceFiles(true);
            const added: { uri: string; alt: string }[] = [];
            for (const file of files) {
              const latest = await sourceAnalysis.get(batch.id);
              if (latest.reviewVersion !== version.current)
                throw new Error(
                  "다른 곳에서 내용이 바뀌었어요. 현재 입력을 보관하고 다시 열어 주세요.",
                );
              const asset = await uploadSource(
                batch.id,
                latest.version,
                [target.id],
                false,
                true,
                file,
              );
              version.current += 1;
              added.push({ uri: asset.id, alt: file.name });
              const url = await sourcePageImage(batch.id, asset.id, 1);
              extraUrls.current.push(url);
              setPhotoUrls((old) => ({ ...old, [asset.id]: url }));
            }
            setExtraPhotos((old) => [
              ...old,
              ...added.map((p) => ({ ...p, targetId: target.id })),
            ]);
            return added;
          }}
          onChange={(modules) => {
            setEnabled((old) => ({
              ...old,
              [target.id]: modules.filter((m) => m.enabled).map((m) => m.id),
            }));
            setEntries((old) =>
              old.map((entry) => {
                if (entry.field.targetId !== target.id) return entry;
                const f = entry.field;
                const m = modules.find((m) => keys(m.id).includes(f.fieldKey))!;
                const value =
                  m.texts.find((t) => t.fieldKey === f.fieldKey)?.value ??
                  f.value;
                const photoAssetIds =
                  f.fieldKey === "name"
                    ? f.photoAssetIds
                    : m.photos.map((p) => p.uri);
                const illustrationId = m.illustrationId ?? null;
                if (
                  value === f.value &&
                  JSON.stringify(photoAssetIds) ===
                    JSON.stringify(f.photoAssetIds) &&
                  illustrationId === f.illustrationId
                )
                  return entry;
                return {
                  status: "ready" as const,
                  field: {
                    ...f,
                    value,
                    photoAssetIds,
                    illustrationId,
                    state: "CONFIRMED" as const,
                    provenance: "PRODUCER" as const,
                    candidateIds: [],
                  },
                };
              }),
            );
            setDirty(true);
          }}
          details={(id) => (
            <View style={{ gap: 8 }}>
              <Button
                label={
                  evidenceOpen === `${target.id}:${id}`
                    ? "원문 닫기"
                    : "원문 보기"
                }
                variant="text"
                onPress={() =>
                  setEvidenceOpen(
                    evidenceOpen === `${target.id}:${id}`
                      ? null
                      : `${target.id}:${id}`,
                  )
                }
              />
              {evidenceOpen === `${target.id}:${id}`
                ? review.candidates
                    .filter(
                      (c) =>
                        keys(id).includes(c.fieldKey) &&
                        (c.targetId === target.id || c.targetId === null),
                    )
                    .flatMap((c) =>
                      c.evidence.map((e, i) => (
                        <T key={`${c.id}:${i}`} variant="caption" muted>
                          {
                            batch.sources.find((s) => s.id === e.sourceId)
                              ?.filename
                          }{" "}
                          {e.page}쪽: {e.quote}
                        </T>
                      )),
                    )
                : null}
              {entries
                .filter(
                  (e) =>
                    e.field.targetId === target.id &&
                    keys(id).includes(e.field.fieldKey) &&
                    ["conflict", "outdated", "unassigned"].includes(e.status),
                )
                .map((e) => (
                  <View key={e.field.fieldKey}>
                    <T>
                      내용 확인 필요 · 사용할 문구를 선택하거나 직접 수정해
                      주세요.
                    </T>
                    {review.candidates
                      .filter(
                        (c) =>
                          !c.outdated &&
                          !c.historical &&
                          c.fieldKey === e.field.fieldKey &&
                          (c.targetId === target.id || c.targetId === null),
                      )
                      .map((c) => (
                        <Button
                          key={c.id}
                          label={c.value}
                          variant="outline"
                          onPress={() =>
                            change({
                              ...e.field,
                              value: c.value,
                              candidateIds: c.candidateIds,
                              provenance: "EXTRACTED",
                              state: "CONFIRMED",
                            })
                          }
                        />
                      ))}
                  </View>
                ))}
            </View>
          )}
        />
      ))}
    </View>
  );
}
