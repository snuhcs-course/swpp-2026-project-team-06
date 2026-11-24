import { SourceCopyReview } from "./SourceCopyReview";
import { PageCanvas } from "./PageCanvas";
import { chooseSourceFiles } from "./sourceFiles";
import { sourcePhotoUrl } from "./sourcePhoto";
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
  type SourceAsset,
  type SourceReview,
} from "@farmclub/api";
import { Button, Icon, Sheet, SOURCE_MODULES, T, tokens } from "@farmclub/ui";
import { useEffect, useRef, useState, type RefObject } from "react";
import { View, type ScrollView } from "react-native";

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
// 다른 화면이 모듈 켜기·숨김만 바꿔 저장했는지 보려고 초안 선택을 한 줄로 만든다.
const draftChoices = (drafts: SourceDraft[]) =>
  JSON.stringify(
    drafts.map((d) => [
      d.targetId,
      d.snapshot.modules.filter((m) => m.enabled).map((m) => m.id),
      d.snapshot.hiddenSectionIds ?? [],
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
// Mirrors the server's fact normalization so "3kg" and "3000g" offer one button.
function sameValue(v: string) {
  return v
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*(kg|g|킬로그램|그램)/g, (_, n: string, u: string) =>
      `${+(Number(n) * (u === "kg" || u === "킬로그램" ? 1000 : 1)).toFixed(3)}g`)
    .replace(/(\d+(?:\.\d+)?)\s*(?:°?\s*(?:bx|brix)|브릭스)/g, (_, n: string) => `${Number(n)}bx`)
    .replace(/[\s:：,，。]+|[.!]+$/g, "");
}

function uniqueChoices<C extends { candidateIds: string[]; value: string }>(choices: C[], current: string) {
  const seen = new Set(current ? [sameValue(current)] : []);
  return [...choices]
    // Same representative as the server: the lowest candidate id in code-point order.
    .map((c) => ({ c, key: [...c.candidateIds].sort()[0] ?? "" }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ c }) => c)
    .filter((c) => {
      const key = sameValue(c.value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function SourceDetailsEditor({
  batch,
  review,
  drafts,
  onDirty,
  onSaved,
  onBusy,
  saveRef,
  onReload,
  scrollRef,
  emptyHint = false,
  showStoryTextHints = false,
  displayName,
  preview = false,
  locked = false,
}: {
  /** 새 상품 채우기: 상세 맨 위 제목을 입력 중인 상품명으로 바로 보여 준다(저장 때 같은 값으로 맞춤). */
  displayName?: string;
  preview?: boolean;
  locked?: boolean;
  emptyHint?: boolean;
  showStoryTextHints?: boolean;
  scrollRef?: RefObject<ScrollView | null>;
  batch: SourceBatch;
  review: SourceReview;
  drafts: SourceDraft[];
  /** fresh: 고친 내용이 없을 때 서버의 최신 review로 저장한다(기본 정보 저장으로 reviewVersion이 오른 경우). */
  /** name: 상품명과 상세 맨 위 제목을 맞출 때 그 값으로 저장한다(DEV-184). */
  saveRef: {
    current: ((fresh?: SourceReview, name?: string, freshDrafts?: SourceDraft[]) => Promise<boolean>) | null;
  };
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (draft: SourceDraft) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [copyBusy, setCopyBusy] = useState(false);
  const sourceCopyRefresh = useRef(false);
  const sourceCopyModules = useRef<Record<string, string[]>>({});
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
  const recoveryNode = useRef<View>(null);
  useEffect(() => {
    if (error) (recoveryNode.current as unknown as HTMLElement | null)?.scrollIntoView?.({ block: "center" });
  }, [error]);
  const [confirmReload, setConfirmReload] = useState(false);
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
    .map((s) => `${s.id}:${s.revision}:${s.sanitizationVersion}`)
    .join(",");
  // DEV-341: 사진마다 따로 받는다(표시용 JPEG, 대표사진·첨부 칸과 같은 요청을 공유). 한 장이 실패해도
  // 나머지는 보이고, 실패한 사진만 다시 불러온다.
  type PhotoRef = Pick<SourceAsset, "id" | "revision" | "sanitizationVersion">;
  const [failedPhotos, setFailedPhotos] = useState<PhotoRef[]>([]);
  const failPhoto = (p: PhotoRef) =>
    setFailedPhotos((old) => [...old.filter((f) => f.id !== p.id), p]);
  /** 실패한 그 사진만 다시 받는다. 다른 사진 주소는 그대로 둔다 */
  const retryPhoto = (p: PhotoRef) => {
    setFailedPhotos((old) => old.filter((f) => f.id !== p.id));
    const source = batch.sources.find((x) => x.id === p.id);
    // 옮겨 온 사진(DEV-346)은 바이트가 없어 자기 주소로 다시 받는다
    (source
      ? sourcePhotoUrl(batch, source, "display")
      : sourcePageImage(batch.id, p.id, 1, { variant: "display", source: p }))
      .then((url) => {
        if (!alive.current) return URL.revokeObjectURL(url);
        extraUrls.current.push(url);
        setPhotoUrls((old) => ({ ...old, [p.id]: url }));
      })
      .catch(() => {
        if (alive.current) failPhoto(p);
      });
  };
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    setFailedPhotos([]);
    for (const s of batch.sources.filter(
      (s) => s.originalPhoto && s.status === "PREPARED",
    ))
      sourcePhotoUrl(batch, s, "display")
        .then((url) => {
          if (!alive) return URL.revokeObjectURL(url);
          urls.push(url);
          setPhotoUrls((old) => ({ ...old, [s.id]: url }));
        })
        .catch(() => {
          if (alive) failPhoto(s);
        });
    return () => {
      alive = false;
      // 해제할 주소는 화면에서도 뺀다(해제된 주소가 깨진 사진으로 남지 않게). 같은 사진은 메모리 공유로 바로 다시 온다
      const gone = new Set(urls);
      setPhotoUrls((old) =>
        Object.fromEntries(Object.entries(old).filter(([, url]) => !gone.has(url))),
      );
      urls.forEach(URL.revokeObjectURL);
    };
  }, [batch.id, photoKey]);
  const version = useRef(review.reviewVersion),
    // 고치기 시작한 버전의 서버 편집 값·초안 선택. 저장 안 한 수정을 새 버전으로 옮길 수 있는지 판단할 때 쓴다(DEV-329).
    base = useRef<{ fields: SourceEditorField[]; choices: string } | null>(null),
    // effect가 옮긴 결과. 다음 렌더 전(저장 클로저가 아직 옛 entries를 들고 있을 때) save()가 이것을 쓴다.
    rebased = useRef<{ version: number; entries: SourceEditorField[] } | null>(null),
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
  // DEV-329: a basic-info or cover-photo save raises the version and regenerates fields the producer did not
  // touch (specification, qualityEvidence). If every field the producer edited is unchanged on the server and
  // no other screen changed the module choices, the edit is rebased: untouched fields take the new server
  // values and the producer's edits are kept. Otherwise the edit stays on its version and the save fails.
  if (!base.current)
    base.current = { fields: review.editorFields, choices: draftChoices(drafts) };
  /** 저장 안 한 수정을 더 새 review 위로 옮긴 결과. 옮길 수 없으면 null(그 수정은 옛 버전에 남아 저장이 거절된다). */
  const rebase = (
    next: SourceReview,
    nextDrafts: SourceDraft[],
    local: SourceEditorField[],
    start = base.current!,
  ) => {
    if (draftChoices(nextDrafts) !== start.choices) return null;
    const before = new Map(start.fields.map((e) => [identity(e.field), JSON.stringify(e)]));
    const after = new Map(next.editorFields.map((e) => [identity(e.field), JSON.stringify(e)]));
    const edited = local.filter((e) => JSON.stringify(e) !== before.get(identity(e.field)));
    if (edited.some((e) => before.get(identity(e.field)) !== after.get(identity(e.field)))) return null;
    const mine = new Map(edited.map((e) => [identity(e.field), e]));
    return next.editorFields.map((e) => mine.get(identity(e.field)) ?? e);
  };
  // 옮긴 entries가 화면에 반영되면 저장 클로저도 새 entries를 들고 있으니 임시 결과를 지운다.
  // 옮기는 effect보다 먼저 선언해, 같은 커밋에서 둘 다 돌 때 방금 채운 결과를 지우지 않게 한다
  useEffect(() => {
    rebased.current = null;
  }, [entries]);
  useEffect(() => {
    if (!dirty) {
      setEntries(review.editorFields);
      const nextSelection = initialSelection(batch, review, drafts);
      if (sourceCopyRefresh.current && review.sourceCopyEnabled) {
        for (const target of batch.targets) {
          const added = SOURCE_MODULES.filter(([id]) =>
            review.editorFields.some((e) => e.field.targetId === target.id &&
              keys(id).includes(e.field.fieldKey) && e.status === "ready" &&
              e.field.state === "UNREVIEWED" && filled(e.field)) &&
            !entries.some((e) => e.field.targetId === target.id &&
              keys(id).includes(e.field.fieldKey) && e.status === "ready" && filled(e.field)),
          ).map(([id]) => id);
          sourceCopyModules.current[target.id] = [...new Set([...(sourceCopyModules.current[target.id] ?? []), ...added])];
        }
        sourceCopyRefresh.current = false;
      }
      setEnabled(Object.fromEntries(batch.targets.map((t) => [t.id,
        [...new Set([...(nextSelection[t.id] ?? []), ...(sourceCopyModules.current[t.id] ?? [])])],
      ])));
      setHidden(initialHidden(drafts));
      version.current = review.reviewVersion;
      base.current = { fields: review.editorFields, choices: draftChoices(drafts) };
      return;
    }
    if (review.reviewVersion <= version.current) return;
    const start = base.current!;
    const moved = rebase(review, drafts, entries, start);
    if (!moved) return;
    const previousVersion = version.current;
    version.current = review.reviewVersion;
    base.current = { fields: review.editorFields, choices: draftChoices(drafts) };
    rebased.current = { version: review.reviewVersion, entries: moved };
    // 함수형 업데이트: 이 effect 전에 들어온 키 입력도 잃지 않는다. 그 입력 때문에 옮길 수 없게 되면
    // 버전도 원래대로 돌려 저장이 거절되게 한다(서버가 새로 만든 값을 덮어쓰지 않게). 결과는 멱등이다.
    setEntries((old) => {
      const next = rebase(review, drafts, old, start);
      if (next) return next;
      version.current = previousVersion;
      base.current = start;
      rebased.current = null;
      return old;
    });
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
    freshDrafts?: SourceDraft[],
  ): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    setError("");
    // 고친 내용이 있으면 그 버전 그대로(오래됐으면 서버가 거절), 없으면 최신 review로 저장한다.
    const useFresh = !!fresh && !dirty;
    // 고친 내용이 있는데 더 새 review를 받았으면(기본 정보 저장 직후 등) 화면이 다시 그려지기 전이라도
    // 같은 rebase 규칙으로 새 버전에 맞춰 저장한다(DEV-329).
    // 모듈 선택 비교는 서버의 최신 초안(freshDrafts)으로만 한다. 없으면 옮기지 않는다(다른 화면 선택을 덮어쓰지 않게).
    // effect가 방금 옮겼는데 이 클로저가 아직 옛 entries를 들고 있으면 옮긴 결과를 쓴다(옛 값이 새 버전에 실리지 않게)
    const local =
      rebased.current && rebased.current.version === version.current
        ? rebased.current.entries
        : entries;
    const moved =
      fresh && dirty && freshDrafts && fresh.reviewVersion > version.current
        ? rebase(fresh, freshDrafts, local)
        : null;
    const reviewVersion = useFresh || moved ? fresh!.reviewVersion : version.current;
    const fields = (useFresh ? fresh.editorFields : (moved ?? local)).map((e) =>
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
    saveRef.current = (fresh, name, freshDrafts) =>
      busy || uploading || copyBusy ? Promise.resolve(false) : save(fresh, name, freshDrafts);
    return () => {
      saveRef.current = null;
    };
  });
  return (
    <View style={{ gap: 16 }}>
      {error ? (
        <View ref={recoveryNode} accessibilityRole="alert" style={{ gap: 4, paddingHorizontal: emptyHint ? tokens.space.gutter : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="alert" size={18} color={tokens.color.error} />
            <T variant="caption" color={tokens.color.error} style={{ flex: 1 }}>{error}</T>
            <Button label="다시 불러오기" accessibilityLabel="판매페이지 다시 불러오기" variant="text" compact disabled={busy || locked || copyBusy} onPress={() => setConfirmReload(true)} />
          </View>
          <T variant="caption" muted>입력한 내용은 그대로 남아 있어요.</T>
        </View>
      ) : null}
      <Sheet visible={confirmReload} onClose={() => { if (!busy) setConfirmReload(false); }} title="판매페이지 수정을 버릴까요?">
        <T>저장하지 못한 판매페이지 문구·사진·내용 선택을 버리고 최신 값으로 불러와요. 상품명·원산지·보관·옵션 등 다른 입력은 그대로 남아요.</T>
        <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label="계속 수정" accessibilityLabel="수정 계속하기" variant="secondary" style={{ flex: 1 }} disabled={busy} onPress={() => setConfirmReload(false)} />
        <Button label="다시 불러오기" accessibilityLabel="판매페이지 수정 버리고 불러오기" style={{ flex: 1 }} loading={busy} disabled={busy} onPress={() => {
          if (lock.current) return;
          lock.current = true;
          setBusy(true);
          onBusy(true);
          void onReload().then(() => {
            if (!alive.current) return;
            setDirty(false);
            onDirty(false);
            setExtraPhotos([]);
            extraUrls.current.forEach(URL.revokeObjectURL);
            extraUrls.current = [];
            setError("");
            setConfirmReload(false);
          }).catch(() => {
            if (alive.current) setError("다시 불러오지 못했어요. 입력 내용은 남아 있어요. 연결을 확인하고 다시 시도해 주세요.");
            setConfirmReload(false);
          }).finally(() => {
            lock.current = false;
            if (alive.current) { setBusy(false); onBusy(false); }
          });
        }} />
        </View>
      </Sheet>
      {failedPhotos.length ? (
        <View
          accessibilityRole="alert"
          testID="photo-load-failed"
          // 새 상품 화면(emptyHint)은 편집기가 화면 끝까지 붙으므로 둘레 내용과 같은 좌우 여백을 준다
          style={{ gap: 8, paddingHorizontal: emptyHint ? tokens.space.gutter : 0 }}
        >
          <T color={tokens.color.error}>
            사진 {failedPhotos.length}장을 불러오지 못했어요. 다른 사진은 그대로예요.
          </T>
          {failedPhotos.map((p, i) => (
            <Button
              key={p.id}
              compact
              variant="outline"
              label={failedPhotos.length > 1 ? `사진 ${i + 1} 다시 불러오기` : "사진 다시 불러오기"}
              onPress={() => retryPhoto(p)}
            />
          ))}
        </View>
      ) : null}
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
      {preview && review.sourceCopyEnabled ? <T variant="sub" style={{ paddingHorizontal: tokens.space.gutter }}>비공개 초안 미리보기예요. 확인이 필요한 원문도 포함돼 있어요. 편집 화면의 공개 전 확인 대기 항목을 모두 처리해야 상품에 반영할 수 있어요.</T> : null}
      {!preview && typeof review.sourceCopyEnabled === "boolean" && batch.targets.map((target) => (
        <SourceCopyReview key={`copy-${batch.id}-${target.id}`} batchId={batch.id} targetId={target.id}
          enabled={!!review.sourceCopyEnabled} reviewVersion={review.reviewVersion}
          locked={busy || locked || uploading || copyBusy}
          beforeMutation={() => saveRef.current?.() ?? Promise.resolve(false)}
          onReload={async () => { sourceCopyRefresh.current = true; await onReload(); }} onBusy={(value) => { setCopyBusy(value); onBusy(value); }} />
      ))}
      {batch.targets.map((target) => (
        <PageCanvas
          key={target.id}
          preview={preview}
          scrollRef={scrollRef}
          hiddenSectionIds={hidden[target.id] ?? []}
          onHiddenSectionsChange={(ids) => {
            setHidden((old) => ({ ...old, [target.id]: ids }));
            setDirty(true);
          }}
          busy={busy || locked || copyBusy}
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
              // 올리기는 끝났으니 미리보기를 못 받아도 사진은 넣고, 실패 칸에서 다시 불러온다(DEV-341)
              const url = await sourcePageImage(batch.id, asset.id, 1, {
                variant: "display",
                source: asset,
              }).catch(() => null);
              if (url) {
                extraUrls.current.push(url);
                setPhotoUrls((old) => ({ ...old, [asset.id]: url }));
              } else failPhoto(asset);
            }
            setExtraPhotos((old) => [
              ...old,
              ...added.map((p) => ({ ...p, targetId: target.id })),
            ]);
            return added;
          }}
          onChange={(modules) => {
            delete sourceCopyModules.current[target.id];
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
                        disabled={busy || locked || copyBusy}
                        label={e.field.value}
                        variant="outline"
                        onPress={() => change({ ...e.field, state: "CONFIRMED" })}
                      />
                    ) : null}
                    {uniqueChoices(
                      review.candidates.filter(
                        (c) =>
                          !c.outdated &&
                          !c.historical &&
                          !hasMoney(c.value) &&
                          !hasHealthClaim(c.value) &&
                          c.fieldKey === e.field.fieldKey &&
                          (c.targetId === target.id || c.targetId === null),
                      ),
                      e.status === "conflict" ? e.field.value : "",
                    ).map((c) => (
                        <Button
                          disabled={busy || locked || copyBusy}
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
