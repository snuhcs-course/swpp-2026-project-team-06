import { PageCanvas } from "./PageCanvas";
import { chooseSourceFiles } from "./sourceFiles";
import {
  hasHealthClaim,
  hasMoney,
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
  emptyHint = false,
  showStoryTextHints = false,
  displayName,
  preview = false,
}: {
  /** 새 상품 채우기: 상세 맨 위 제목을 입력 중인 상품명으로 바로 보여 준다(저장 때 같은 값으로 맞춤). */
  displayName?: string;
  preview?: boolean;
  emptyHint?: boolean;
  showStoryTextHints?: boolean;
  batch: SourceBatch;
  review: SourceReview;
  drafts: SourceDraft[];
  /** fresh: 고친 내용이 없을 때 서버의 최신 review로 저장한다(기본 정보 저장으로 reviewVersion이 오른 경우). */
  /** name: 상품명과 상세 맨 위 제목을 맞출 때 그 값으로 저장한다(DEV-184). */
  saveRef: {
    current: ((fresh?: SourceReview, name?: string) => Promise<boolean>) | null;
  };
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
  const [extraPhotos, setExtraPhotos] = useState<
    { uri: string; alt: string; targetId: string }[]
  >([]);
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  // 저장 뒤 batch를 다시 읽어도 사진이 같으면 blob URL을 해제·재요청하지 않는다(표시 중 URL 해제 방지).
  const photoKey = batch.sources
    .filter((s) => s.originalPhoto && s.status === "PREPARED")
    .map((s) => `${s.id}:${s.revision}`)
    .join(",");
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
  }, [batch.id, photoKey]);
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
  const save = async (
    fresh?: SourceReview,
    name?: string,
  ): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    // 고친 내용이 있으면 그 버전 그대로(오래됐으면 서버가 거절), 없으면 최신 review로 저장한다.
    const useFresh = !!fresh && !dirty;
    const reviewVersion = useFresh ? fresh.reviewVersion : version.current;
    const fields = (useFresh ? fresh.editorFields : entries).map((e) =>
      name &&
      batch.targets.length === 1 &&
      e.field.fieldKey === "name" &&
      e.field.state !== "EXCLUDED" &&
      e.field.value !== name
        ? {
            ...e.field,
            value: name,
            state: "CONFIRMED" as const,
            provenance: "PRODUCER" as const,
            candidateIds: [],
          }
        : e.field,
    );
    const targets = batch.targets.map((t) => ({
      targetId: t.id,
      enabledModuleIds: enabled[t.id],
      hiddenSectionIds: hidden[t.id] ?? [],
    }));
    const signature = JSON.stringify([reviewVersion, fields, targets]);
    if (!requests.current.has(signature))
      requests.current.set(signature, newIdempotencyKey());
    try {
      const result = await sourceAnalysis.saveEditor(
        batch.id,
        reviewVersion,
        fields,
        targets,
        requests.current.get(signature)!,
      );
      if (alive.current) {
        await onSaved(result.drafts[0]);
        setDirty(false);
      }
      return true;
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : "저장하지 못했어요.");
      return false;
    } finally {
      lock.current = false;
      if (alive.current) {
        setBusy(false);
        onBusy(false);
      }
    }
  };
  useEffect(() => {
    saveRef.current = (fresh, name) =>
      busy || uploading ? Promise.resolve(false) : save(fresh, name);
    return () => {
      saveRef.current = null;
    };
  });
  return (
    <View style={{ gap: 16 }}>
      {error ? <T color={tokens.color.error}>{error}</T> : null}
      {!preview && !emptyHint &&
      batch.sources.some(
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
          preview={preview}
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
                  keys(id).includes(e.field.fieldKey) &&
                  (!preview || e.field.state !== "EXCLUDED"),
              )
              .map((e) => ({
                fieldKey: e.field.fieldKey,
                value:
                  displayName &&
                  e.field.fieldKey === "name" &&
                  e.field.state !== "EXCLUDED"
                    ? displayName
                    : e.field.value,
              })),
            photos: entries
              .filter(
                (e) =>
                  e.field.targetId === target.id &&
                  keys(id).includes(e.field.fieldKey) &&
                  (!preview || e.field.state !== "EXCLUDED"),
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
              (e) => e.field.targetId === target.id && e.field.fieldKey === id &&
                (!preview || e.field.state !== "EXCLUDED"),
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
                // 표시용 상품명(displayName)은 저장 값이 아니다. 이름 칸은 원래 값을 유지한다.
                const value =
                  displayName && f.fieldKey === "name"
                    ? f.value
                    : (m.texts.find((t) => t.fieldKey === f.fieldKey)?.value ??
                      f.value);
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
          emptyHint={emptyHint}
          showStoryTextHints={showStoryTextHints}
          details={(id) => (
            <View style={{ gap: 8 }}>
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
                    {e.status === "conflict" && e.field.value ? (
                      <Button
                        label={e.field.value}
                        variant="outline"
                        onPress={() => change({ ...e.field, state: "CONFIRMED" })}
                      />
                    ) : null}
                    {review.candidates
                      .filter(
                        (c) =>
                          !c.outdated &&
                          !c.historical &&
                          !hasMoney(c.value) &&
                          !hasHealthClaim(c.value) &&
                          (e.status !== "conflict" || c.value !== e.field.value) &&
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
