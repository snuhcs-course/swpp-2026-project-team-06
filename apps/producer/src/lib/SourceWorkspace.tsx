import {
  allPages,
  catalog,
  isMock,
  newIdempotencyKey,
  sourceAnalysis as api,
  sourcePageImage,
  uploadSource,
  type MyProductCard,
  type SourceAsset,
  type SourceBatch,
  type SourceCandidate,
  type SourceDraft,
  type SourceField,
  type SourcePage,
  type SourceReview,
  type SourceRun,
  type SourceTarget,
} from "@farmclub/api";
import {
  Button,
  HeaderBar,
  Icon,
  ModuleStory,
  Screen,
  Scroll,
  Sheet,
  SOURCE_MODULES,
  StoryImage,
  T,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { useHideTabBar } from "./session";
const inputStyle = {
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: 12,
  padding: 12,
  fontSize: 16,
  minHeight: 48,
  color: tokens.color.text,
  backgroundColor: "white",
};
const panel = {
  padding: 16,
  gap: 12,
  borderWidth: 1,
  borderColor: tokens.color.border,
  borderRadius: 16,
};
function SourceThumbnail({
  bid,
  source,
  localUri,
}: {
  bid: string;
  source: SourceAsset;
  localUri?: string;
}) {
  const [uri, setUri] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true,
      objectUrl = "";
    setUri("");
    setFailed(false);
    if (source.pageCount && source.mime !== "text/plain") {
      void sourcePageImage(bid, source.id, 1)
        .then((url) => {
          objectUrl = url;
          if (alive) setUri(url);
          else URL.revokeObjectURL(url);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    }
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    bid,
    source.id,
    source.revision,
    source.sanitizationVersion,
    source.pageCount,
  ]);
  const preview = uri || (!source.pageCount ? localUri : undefined);
  const kind =
    source.mime === "application/pdf"
      ? "PDF"
      : source.mime === "text/plain"
        ? "TXT"
        : "사진";
  return (
    <View
      testID={`source-thumbnail-${source.id}`}
      style={{
        width: tokens.thumb.summary,
        height: tokens.thumb.summary,
        borderRadius: tokens.radius.sm,
        overflow: "hidden",
        backgroundColor: tokens.color.surface,
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      {preview && !failed ? (
        <Image
          accessibilityLabel={`${source.filename} 미리보기`}
          source={{ uri: preview }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ width: 64, height: 64 }}
        />
      ) : (
        <>
          <Icon
            name={kind === "사진" ? "photo" : "news"}
            size={24}
            color={tokens.color.textMuted}
          />
          <T variant="caption" muted>
            {kind}
          </T>
        </>
      )}
    </View>
  );
}
const ACTIVE = ["QUEUED", "PREPARING", "ANALYZING", "PRIVACY_REVIEW"];
const states: Record<string, string> = {
  QUEUED: "대기",
  PREPARING: "자료 읽는 중",
  ANALYZING: "분석 중",
  PRIVACY_REVIEW: "개인정보 확인 필요",
  SUCCEEDED: "완료",
  PARTIAL: "일부 완료",
  FAILED: "실패",
  CANCELLED: "취소",
  UPLOADED: "업로드됨",
  PREPARED: "자료 준비됨",
  RUNNING: "처리 중",
};
function sourceError(code: string) {
  const messages: Record<string, string> = {
    BUDGET_EXCEEDED:
      "자료 분석 예산 한도에 도달했어요. 담당자에게 확인해 주세요.",
    INVALID_EVIDENCE:
      "자료에서 근거를 확인하지 못했어요. 선명한 자료를 넣거나 직접 내용을 확인해 주세요.",
    REQUEST_UNCERTAIN: "분석 요청의 완료 여부를 확인하지 못했어요.",
    UNSUPPORTED_NUMBER: "자료에 없는 수치가 포함되어 결과를 사용하지 않았어요.",
    UNSUPPORTED_PIECE_COUNT: "상품 개수의 근거를 확인하지 못했어요.",
    PRIVACY_CHANGED: "가림 내용이 바뀌었어요. 다시 확인한 후 분석해 주세요.",
    UNKNOWN_MOCK_SOURCE: "테스트 환경에서 지원하지 않는 자료예요.",
  };
  return (
    messages[code] ??
    "자료를 처리하지 못했어요. 내용을 확인한 후 다시 시도해 주세요."
  );
}
function Choice({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      style={{
        minHeight: 48,
        padding: 10,
        borderRadius: 10,
        backgroundColor: selected ? "#FFF3EB" : tokens.color.surface,
        justifyContent: "center",
      }}
    >
      <T>
        {selected ? "✓ " : "○ "}
        {label}
      </T>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChange,
  multiline = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  multiline?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 6 }}>
      <T variant="caption">{label}</T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        editable={!disabled}
        style={[inputStyle, multiline && { minHeight: 100 }]}
      />
    </View>
  );
}
function filePicker(): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve([]);
    const el = document.createElement("input");
    el.type = "file";
    el.multiple = true;
    el.accept = ".jpg,.jpeg,.png,.webp,.heic,.pdf,.txt";
    el.onchange = () => resolve(Array.from(el.files ?? []));
    el.oncancel = () => resolve([]);
    el.click();
  });
}
function PrivatePhoto({
  bid,
  sid,
  page = 1,
  revision,
  onPoint,
  regions = [],
}: {
  bid: string;
  sid: string;
  page?: number;
  revision: number;
  onPoint?: (x: number, y: number) => void;
  regions?: number[][];
}) {
  const [uri, setUri] = useState(""),
    [error, setError] = useState("");
  const bounds = useRef({ width: 1, height: 1 });
  useEffect(() => {
    let alive = true,
      objectUrl = "";
    setUri("");
    setError("");
    sourcePageImage(bid, sid, page)
      .then((url) => {
        objectUrl = url;
        if (alive) setUri(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => {
        if (alive)
          setError("사진을 불러오지 못했어요. 자료를 다시 열어 주세요.");
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [bid, sid, page, revision]);
  if (!uri) return <T>{error || "사진 불러오는 중…"}</T>;
  return (
    <Pressable
      disabled={!onPoint}
      accessibilityLabel="가릴 영역의 왼쪽 위와 오른쪽 아래 선택"
      onLayout={(e) => {
        bounds.current = e.nativeEvent.layout;
      }}
      onPress={(e) =>
        onPoint?.(
          e.nativeEvent.locationX / bounds.current.width,
          e.nativeEvent.locationY / bounds.current.height,
        )
      }
    >
      <StoryImage uri={uri} alt="가림 처리된 비공개 자료" />
      {regions.map((box, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: `${box[0] * 100}%`,
            top: `${box[1] * 100}%`,
            width: `${(box[2] - box[0]) * 100}%`,
            height: `${(box[3] - box[1]) * 100}%`,
            backgroundColor: "rgba(0,0,0,0.4)",
            borderWidth: 2,
            borderColor: "#D64B35",
          }}
        />
      ))}
    </Pressable>
  );
}
function PrivacyEditor({
  batch,
  source,
  busy,
  mutate,
  refresh,
  onDirty,
}: {
  batch: SourceBatch;
  source: SourceAsset;
  busy: boolean;
  mutate: (fn: () => Promise<void>) => void;
  refresh: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [number, setNumber] = useState(1),
    [page, setPage] = useState<SourcePage | null>(null),
    [error, setError] = useState("");
  const [spans, setSpans] = useState<string[]>([]),
    [regions, setRegions] = useState<{ page: number; box: number[] }[]>([]),
    [point, setPoint] = useState<number[] | null>(null);
  useEffect(() => {
    onDirty(!!spans.length || !!regions.length || !!point);
    return () => onDirty(false);
  }, [spans, regions, point, onDirty]);
  useEffect(() => {
    let alive = true;
    setPage(null);
    setError("");
    api
      .page(batch.id, source.id, number)
      .then((p) => {
        if (alive) setPage(p);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [batch.id, source.id, number, source.sanitizationVersion]);
  return (
    <View style={{ gap: 10 }}>
      <T>
        개인정보가 남아 있으면 문구를 선택하거나 사진에서 가릴 사각형의 왼쪽
        위·오른쪽 아래를 차례로 눌러 주세요.
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {Array.from({ length: source.pageCount }, (_, i) => (
          <Button
            key={i}
            label={`${i + 1}쪽`}
            variant={number === i + 1 ? "secondary" : "outline"}
            onPress={() => {
              setNumber(i + 1);
              setPoint(null);
            }}
          />
        ))}
      </View>
      {error ? <T>{error}</T> : null}
      {page?.hasImage ? (
        <>
          <PrivatePhoto
            bid={batch.id}
            sid={source.id}
            page={number}
            revision={source.sanitizationVersion}
            regions={regions.filter((r) => r.page === number).map((r) => r.box)}
            onPoint={(x, y) => {
              if (!point) setPoint([x, y]);
              else {
                const box = [
                  Math.min(x, point[0]),
                  Math.min(y, point[1]),
                  Math.max(x, point[0]),
                  Math.max(y, point[1]),
                ];
                if (box[2] > box[0] && box[3] > box[1])
                  setRegions([...regions, { page: number, box }]);
                setPoint(null);
              }
            }}
          />
          <T variant="caption">
            {point
              ? "반대쪽 모서리를 눌러 주세요."
              : `추가 가림 영역 ${regions.length}개`}
          </T>
        </>
      ) : null}
      {page?.redactedSpans.map((span) => {
        const id = `${number}:${span.id}`;
        return (
          <Choice
            key={id}
            label={span.text}
            selected={spans.includes(id)}
            disabled={busy}
            onPress={() =>
              setSpans(
                spans.includes(id)
                  ? spans.filter((x) => x !== id)
                  : [...spans, id],
              )
            }
          />
        );
      })}
      <Button
        label="가림 선택 초기화"
        variant="text"
        disabled={busy || (!spans.length && !regions.length && !point)}
        onPress={() => {
          setSpans([]);
          setRegions([]);
          setPoint(null);
        }}
      />
      <Button
        label="선택한 개인정보 가리기"
        disabled={busy || !page || (!spans.length && !regions.length)}
        variant="outline"
        onPress={() =>
          mutate(async () => {
            await api.privacy(batch.id, source.id, {
              sourceRevision: source.revision,
              sanitizationVersion: source.sanitizationVersion,
              approved: false,
              spanIds: spans,
              regions,
            });
            setSpans([]);
            setRegions([]);
            await refresh();
          })
        }
      />
      <T variant="caption">
        모든 페이지의 가림 결과를 확인한 후 승인해 주세요. 승인하면 대기 중인
        분석에 가림 처리된 자료가 전송돼요. 이미지·PDF의 모든 쪽은 문자인식을
        위해 가림 이미지가 AI에 전달돼요.
      </T>
      <Button
        label={
          source.privacyApproved
            ? "승인 취소"
            : "모든 페이지 확인 · 분석 전송 승인"
        }
        disabled={
          busy || !page || !!spans.length || !!regions.length || !!point
        }
        onPress={() =>
          mutate(async () => {
            await api.privacy(batch.id, source.id, {
              sourceRevision: source.revision,
              sanitizationVersion: source.sanitizationVersion,
              approved: !source.privacyApproved,
              spanIds: [],
              regions: [],
            });
            await refresh();
          })
        }
      />
    </View>
  );
}
function ReviewEditor({
  batch,
  review,
  target,
  fieldKey,
  busy,
  save,
  close,
}: {
  batch: SourceBatch;
  review: SourceReview;
  target: SourceTarget;
  fieldKey: string;
  busy: boolean;
  save: (field: SourceField, version: number) => void;
  close: () => void;
}) {
  const existing = review.fields.find(
    (f) => f.targetId === target.id && f.fieldKey === fieldKey,
  );
  const [value, setValue] = useState(existing?.value ?? ""),
    [chosen, setChosen] = useState<SourceCandidate | null>(null);
  const [photos, setPhotos] = useState(existing?.photoAssetIds ?? []),
    [illustration, setIllustration] = useState<string | null>(
      existing?.illustrationId ?? null,
    );
  const [baseline] = useState(review.reviewVersion);
  const candidates = review.candidates.filter(
    (c) =>
      !c.outdated &&
      (c.targetId === target.id || c.targetId === null) &&
      c.fieldKey === fieldKey,
  );
  const label = SOURCE_MODULES.find(([id]) => id === fieldKey)?.[1] ?? fieldKey;
  const submit = (state: SourceField["state"]) => {
    const fromCandidate = chosen && chosen.value === value;
    const unchanged = !chosen && existing?.value === value;
    save(
      {
        targetId: target.id,
        fieldKey,
        value,
        state,
        provenance: fromCandidate
          ? "EXTRACTED"
          : unchanged
            ? existing!.provenance
            : "PRODUCER",
        candidateIds: fromCandidate
          ? chosen.candidateIds
          : unchanged
            ? existing!.candidateIds
            : [],
        photoAssetIds: photos,
        illustrationId: illustration,
      },
      baseline,
    );
  };
  return (
    <View style={panel}>
      <T variant="title">
        {target.name} · {label}
      </T>
      {candidates.length > 1 ? (
        <T>
          후보가 여러 개예요. 원문을 비교해 하나를 선택하거나 직접 수정해
          주세요.
        </T>
      ) : null}
      {candidates.map((c) => (
        <View key={c.id} style={panel}>
          <T>{c.value}</T>
          {c.targetId === null ? (
            <T variant="caption">
              상품 미지정 자료 · 이 상품의 정보인지 확인해 주세요.
            </T>
          ) : null}
          {c.evidence.map((e, i) => (
            <T key={i} variant="caption">
              {batch.sources.find((s) => s.id === e.sourceId)?.filename ??
                "자료"}{" "}
              {e.page}쪽: “{e.quote}”
            </T>
          ))}
          <Button
            label="이 근거 사용"
            variant="outline"
            disabled={busy}
            onPress={() => {
              setChosen(c);
              setValue(c.value);
            }}
          />
        </View>
      ))}
      <Field
        label={`${label} 내용`}
        disabled={busy}
        value={value}
        onChange={setValue}
        multiline
      />
      <T variant="caption">직접 수정한 문구는 생산자 제공 내용으로 기록돼요.</T>
      {[
        "hero",
        "sizePhoto",
        "crossSectionPhoto",
        "packagePhoto",
        "farmPhotos",
      ].includes(fieldKey) ? (
        <>
          {batch.sources
            .filter(
              (s) =>
                s.originalPhoto &&
                s.status === "PREPARED" &&
                (s.common || s.targetIds.includes(target.id)),
            )
            .map((s) => (
              <Choice
                key={s.id}
                label={s.filename}
                selected={photos.includes(s.id)}
                onPress={() =>
                  setPhotos(
                    photos.includes(s.id)
                      ? photos.filter((id) => id !== s.id)
                      : [...photos, s.id],
                  )
                }
                disabled={busy}
              />
            ))}
        </>
      ) : null}
      {fieldKey === "sizePhoto" ? (
        <>
          {[
            null,
            "hand-citrus-small",
            "hand-citrus-medium",
            "hand-citrus-large",
          ].map((id, i) => (
            <Choice
              key={id ?? "none"}
              label={
                ["일러스트 없음", "설명용 소과", "설명용 중과", "설명용 대과"][
                  i
                ]
              }
              selected={illustration === id}
              onPress={() => setIllustration(id)}
              disabled={busy}
            />
          ))}
        </>
      ) : null}
      <Button
        label="확정 저장"
        disabled={busy || (!value.trim() && !photos.length && !illustration)}
        onPress={() => submit("CONFIRMED")}
      />
      <Button
        label="이 항목 제외"
        variant="outline"
        disabled={busy}
        onPress={() => submit("EXCLUDED")}
      />
      <Button
        label="편집 닫기"
        variant="text"
        disabled={busy}
        onPress={close}
      />
    </View>
  );
}
function DraftPreview({
  batch,
  draft,
}: {
  batch: SourceBatch;
  draft: SourceDraft;
}) {
  const [photos, setPhotos] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const urls: string[] = [];
    setPhotos({});
    setError("");
    const ids = [
      ...new Set(draft.snapshot.previewModules.flatMap((m) => m.photoAssetIds)),
    ];
    Promise.all(
      ids.map(async (id) => {
        const url = await sourcePageImage(batch.id, id, 1);
        urls.push(url);
        if (!alive) URL.revokeObjectURL(url);
        return [id, url] as const;
      }),
    )
      .then((entries) => {
        if (alive) setPhotos(Object.fromEntries(entries));
      })
      .catch(() => {
        if (alive) setError("사진을 불러오지 못했어요. 자료를 확인해 주세요.");
      });
    return () => {
      alive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [batch.id, draft.id]);
  return (
    <>
      {error ? <T>{error}</T> : null}
      <ModuleStory
        content={{
          modules: draft.snapshot.previewModules.map((m) => ({
            ...m,
            photos: m.photoAssetIds
              .filter((id) => photos[id])
              .map((id) => ({
                uri: photos[id],
                alt: "생산자가 제공한 원본 사진",
              })),
          })),
        }}
      />
    </>
  );
}
export function SourceWorkspace() {
  useHideTabBar();
  const router = useRouter(),
    navigation = useNavigation(),
    { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const [products, setProducts] = useState<MyProductCard[]>([]),
    [batches, setBatches] = useState<SourceBatch[]>([]);
  const [batch, setBatch] = useState<SourceBatch | null>(null),
    [review, setReview] = useState<SourceReview | null>(null),
    [runs, setRuns] = useState<SourceRun[]>([]),
    [drafts, setDrafts] = useState<SourceDraft[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [name, setName] = useState(""),
    [uploadTargets, setUploadTargets] = useState<string[]>([]),
    [common, setCommon] = useState(true),
    [original, setOriginal] = useState(false),
    [text, setText] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("자료"),
    [privacyId, setPrivacyId] = useState<string | null>(null),
    [editing, setEditing] = useState<{
      target: SourceTarget;
      field: string;
    } | null>(null);
  const [enabled, setEnabled] = useState<Record<string, string[]>>({}),
    [visual, setVisual] = useState<Record<string, number[]>>({});
  const [ack, setAck] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [applyTarget, setApplyTarget] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{
    draft: SourceDraft;
    productId: string;
    version: number;
    name: string;
  } | null>(null);
  const [showText, setShowText] = useState(false);
  const [uploadOptions, setUploadOptions] = useState(false);
  const [sourceOptions, setSourceOptions] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>(
    {},
  );
  const previewUrls = useRef(new Map<string, string>());
  useEffect(
    () => () => {
      for (const url of previewUrls.current.values()) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    [batchId],
  );
  const activeRun = runs.find((r) => ACTIVE.includes(r.status));
  const working = !!activeRun && activeRun.status !== "PRIVACY_REVIEW";
  const [privacyDirty, setPrivacyDirty] = useState(false);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const allowLeave = useRef(false);
  const dirty =
    !!editing ||
    privacyDirty ||
    !!text.trim() ||
    Object.entries(enabled).some(([targetId, ids]) => {
      const saved =
        drafts
          .find((d) => d.targetId === targetId)
          ?.snapshot.modules.filter((m) => m.enabled)
          .map((m) => m.id) ?? SOURCE_MODULES.map(([id]) => id);
      return (
        ids.length !== saved.length || ids.some((id) => !saved.includes(id))
      );
    });
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        if (allowLeave.current || !(dirty || busy)) return;
        event.preventDefault();
        setLeaving(() => () => {
          allowLeave.current = true;
          navigation.dispatch(event.data.action);
        });
      }),
    [navigation, dirty, busy],
  );
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, busy]);
  const lock = useRef(false),
    alive = useRef(true),
    pending = useRef(new Map<string, string>());
  const keyFor = (scope: string, body: unknown) => {
    const id = scope + JSON.stringify(body);
    if (!pending.current.has(id)) pending.current.set(id, newIdempotencyKey());
    return pending.current.get(id)!;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    if (!batchId) {
      const result = await allPages((cursor) => api.list(cursor));
      if (alive.current) setBatches(result);
      return;
    }
    const [b, r, jobs, ds] = await Promise.all([
      api.get(batchId),
      api.review(batchId),
      api.runs(batchId),
      api.drafts(batchId),
    ]);
    if (!alive.current) return;
    setBatch(b);
    setReview(r);
    setRuns(jobs.items);
    setDrafts(ds.items);
    setEnabled((previous) => {
      const next = { ...previous };
      for (const t of b.targets)
        if (!next[t.id])
          next[t.id] =
            ds.items
              .find((d) => d.targetId === t.id)
              ?.snapshot.modules.filter((m) => m.enabled)
              .map((m) => m.id) ?? SOURCE_MODULES.map(([id]) => id);
      return next;
    });
  }, [batchId]);
  const mutate = (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    void fn()
      .catch((e) => {
        if (alive.current)
          setError(
            e instanceof Error
              ? e.message
              : "처리하지 못했어요. 다시 시도해 주세요.",
          );
      })
      .finally(() => {
        lock.current = false;
        if (alive.current) setBusy(false);
      });
  };
  useEffect(() => {
    if (isMock) return;
    void Promise.all([
      load(),
      allPages((cursor) => catalog.mine({ limit: 50, cursor })).then((p) => {
        if (alive.current) setProducts(p);
      }),
    ]).catch((e) => {
      if (alive.current) setError(String(e));
    });
  }, [load]);
  useEffect(() => {
    if (!batchId || !runs.some((r) => ACTIVE.includes(r.status))) return;
    const timer = setInterval(() => {
      if (lock.current) return;
      void Promise.all([api.get(batchId), api.runs(batchId)])
        .then(([b, r]) => {
          if (alive.current) {
            setBatch(b);
            setRuns(r.items);
          }
        })
        .catch((e) => {
          if (alive.current) setError(String(e));
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [batchId, runs]);
  const upload = async (input: File | string) => {
    if (!batch) return;
    const b = await api.get(batch.id);
    const uploaded = await uploadSource(
      b.id,
      b.version,
      common ? [] : uploadTargets,
      common,
      original,
      input,
    );
    if (
      typeof input !== "string" &&
      input.type.startsWith("image/") &&
      alive.current
    ) {
      const old = previewUrls.current.get(uploaded.id);
      if (old) URL.revokeObjectURL(old);
      const url = URL.createObjectURL(input);
      previewUrls.current.set(uploaded.id, url);
      setLocalPreviews((previous) => ({ ...previous, [uploaded.id]: url }));
    }
  };
  return (
    <Screen>
      <HeaderBar title="자료로 상세 만들기" onBack={() => router.back()} />
      <Scroll>
        <View style={{ padding: tokens.space.gutter, gap: tokens.space.md }}>
          {error ? (
            <View accessibilityRole="alert" style={panel}>
              <T>{error}</T>
              <Button
                label="서버 상태 다시 확인"
                variant="outline"
                disabled={busy}
                onPress={() => mutate(load)}
              />
            </View>
          ) : null}
          {notice ? (
            <View accessibilityRole="alert">
              <T>{notice}</T>
            </View>
          ) : null}
          {isMock ? (
            <T>
              자료 분석은 로컬 API 검증 환경에서 사용할 수 있어요. 현재 데모
              화면은 서버에 연결되지 않았어요.
            </T>
          ) : !batchId ? (
            <>
              <T variant="heading">상세를 만들 상품 선택 (최대 10개)</T>
              {products.map((p) => (
                <Choice
                  key={p.productId}
                  label={p.name}
                  selected={selected.includes(p.productId)}
                  disabled={busy}
                  onPress={() =>
                    setSelected(
                      selected.includes(p.productId)
                        ? selected.filter((id) => id !== p.productId)
                        : selected.length < 10
                          ? [...selected, p.productId]
                          : selected,
                    )
                  }
                />
              ))}
              <Field
                label="새 상품 초안 이름 (선택)"
                disabled={busy}
                value={name}
                onChange={setName}
              />
              <Button
                label="자료 작업 시작"
                disabled={
                  busy ||
                  (!selected.length && !name.trim()) ||
                  selected.length + (name.trim() ? 1 : 0) > 10
                }
                onPress={() =>
                  mutate(async () => {
                    const targets: { name: string; productId?: string }[] =
                      selected.map((id) => ({
                        name: products.find((p) => p.productId === id)!.name,
                        productId: id,
                      }));
                    if (name.trim())
                      targets.push({ name: name.trim(), productId: undefined });
                    const b = await api.create(
                      targets,
                      keyFor("create", targets),
                    );
                    pending.current.clear();
                    router.setParams({ batchId: b.id });
                  })
                }
              />
              <T variant="heading">이전 작업 이어하기</T>
              {batches.map((b) => (
                <Button
                  key={b.id}
                  label={b.targets.map((t) => t.name).join(" · ")}
                  variant="outline"
                  onPress={() => router.setParams({ batchId: b.id })}
                />
              ))}
            </>
          ) : !batch ? (
            <T>작업 불러오는 중…</T>
          ) : (
            <>
              <T variant="sub" muted numberOfLines={2}>
                {batch.targets.map((t) => t.name).join(" · ")}
              </T>
              {activeRun ? (
                <View
                  testID="source-analysis-status"
                  accessibilityLiveRegion="polite"
                  style={{
                    ...panel,
                    backgroundColor: tokens.color.surface,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  {working ? (
                    <ActivityIndicator color={tokens.color.accent} />
                  ) : (
                    <Icon name="lock" color={tokens.color.accent} />
                  )}
                  <View style={{ flex: 1, gap: 4 }}>
                    <T weight="semibold">
                      {working
                        ? "분석 중이에요"
                        : "개인정보 가림을 확인해 주세요"}
                    </T>
                    <T variant="caption" muted>
                      {activeRun.status === "PREPARING"
                        ? "자료를 읽고 가림 영역을 준비하고 있어요."
                        : activeRun.status === "PRIVACY_REVIEW"
                          ? "아래 자료의 가림 결과를 승인하면 분석을 이어가요."
                          : "자료에서 상품 정보를 찾고 있어요. 잠시만 기다려 주세요."}
                    </T>
                  </View>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  padding: 4,
                  backgroundColor: tokens.color.surface,
                  borderRadius: tokens.radius.md,
                }}
              >
                {["자료", "근거 검토", "상세 편집"].map((t) => (
                  <Button
                    key={t}
                    label={t}
                    disabled={!!editing || privacyDirty || busy}
                    variant="text"
                    style={{
                      flex: 1,
                      alignSelf: "stretch",
                      backgroundColor: tab === t ? "white" : "transparent",
                      borderRadius: 12,
                    }}
                    onPress={() => setTab(t)}
                  />
                ))}
              </View>
              {tab === "자료" ? (
                <>
                  <View style={panel}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <T variant="heading">자료 추가</T>
                      <Button
                        label={
                          uploadOptions ? "연결 설정 접기" : "자료 연결 설정"
                        }
                        variant="text"
                        icon="settings"
                        onPress={() => setUploadOptions(!uploadOptions)}
                      />
                    </View>
                    <T variant="caption" muted>
                      JPG·PNG·WebP·HEIC·PDF·TXT, 파일당 20MB, 최대 30개·총
                      100MB. PDF는 파일당 20쪽, 합계 60쪽까지예요.
                    </T>
                    {uploadOptions ? (
                      <>
                        <Choice
                          label="농가 공통 자료"
                          selected={common}
                          disabled={busy}
                          onPress={() => setCommon(!common)}
                        />
                        {!common
                          ? batch.targets.map((t) => (
                              <Choice
                                key={t.id}
                                label={t.name}
                                selected={uploadTargets.includes(t.id)}
                                disabled={busy}
                                onPress={() =>
                                  setUploadTargets(
                                    uploadTargets.includes(t.id)
                                      ? uploadTargets.filter(
                                          (id) => id !== t.id,
                                        )
                                      : [...uploadTargets, t.id],
                                  )
                                }
                              />
                            ))
                          : null}
                      </>
                    ) : null}
                    <Choice
                      label="상품에 사용할 원본 사진"
                      selected={original}
                      disabled={busy}
                      onPress={() => setOriginal(!original)}
                    />
                    <Button
                      label="파일 선택·업로드"
                      icon="plus"
                      variant="outline"
                      disabled={busy || (!common && !uploadTargets.length)}
                      onPress={() =>
                        mutate(async () => {
                          const files = await filePicker();
                          try {
                            for (const file of files) await upload(file);
                          } finally {
                            await load();
                          }
                        })
                      }
                    />
                    {!original ? (
                      <Button
                        label={
                          showText ? "문구 입력 접기" : "판매 문구 붙여넣기"
                        }
                        variant="text"
                        icon="copy"
                        onPress={() => setShowText(!showText)}
                      />
                    ) : null}
                    {!original && showText ? (
                      <>
                        <Field
                          label="판매 문구 붙여넣기"
                          disabled={busy}
                          value={text}
                          onChange={setText}
                          multiline
                        />
                        <Button
                          label="문구 추가"
                          disabled={
                            busy ||
                            !text.trim() ||
                            (!common && !uploadTargets.length)
                          }
                          onPress={() =>
                            mutate(async () => {
                              await upload(text);
                              setText("");
                              await load();
                            })
                          }
                        />
                      </>
                    ) : null}
                  </View>
                  {batch.sources.map((s) => (
                    <View key={s.id} style={panel}>
                      <View
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <SourceThumbnail
                          bid={batch.id}
                          source={s}
                          localUri={localPreviews[s.id]}
                        />
                        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                          <T weight="semibold" numberOfLines={2}>
                            {s.filename}
                          </T>
                          <T variant="caption" muted>
                            {states[s.status] ?? s.status}
                            {s.pageCount ? ` · ${s.pageCount}쪽` : ""}
                            {s.originalPhoto ? " · 상품 사진" : ""}
                          </T>
                          <T variant="caption" muted numberOfLines={1}>
                            {s.common
                              ? "농가 공통"
                              : batch.targets
                                  .filter((t) => s.targetIds.includes(t.id))
                                  .map((t) => t.name)
                                  .join(" · ")}
                          </T>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            sourceOptions === s.id
                              ? "자료 관리 접기"
                              : "자료 관리"
                          }
                          accessibilityState={{
                            expanded: sourceOptions === s.id,
                          }}
                          onPress={() =>
                            setSourceOptions(
                              sourceOptions === s.id ? null : s.id,
                            )
                          }
                          style={{
                            width: 48,
                            height: 48,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Icon
                            name="settings"
                            size={22}
                            color={tokens.color.textMuted}
                          />
                        </Pressable>
                      </View>
                      {s.error ? <T>{sourceError(s.error)}</T> : null}
                      {sourceOptions === s.id ? (
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <Button
                            label="공통 자료로 연결"
                            variant="text"
                            disabled={busy || s.common}
                            onPress={() =>
                              mutate(async () => {
                                await api.assign(batch.id, s, [], true);
                                await load();
                              })
                            }
                          />
                          {batch.targets.map((t) => (
                            <Button
                              key={t.id}
                              label={`${t.name}에 연결`}
                              variant="text"
                              disabled={busy}
                              onPress={() =>
                                mutate(async () => {
                                  await api.assign(batch.id, s, [t.id], false);
                                  await load();
                                })
                              }
                            />
                          ))}
                        </View>
                      ) : null}
                      {s.status === "PREPARED" ? (
                        <>
                          <Button
                            label={
                              s.privacyApproved
                                ? "가림 결과·승인 확인"
                                : "개인정보 가림 검토"
                            }
                            variant="outline"
                            disabled={privacyDirty || busy}
                            onPress={() =>
                              setPrivacyId(privacyId === s.id ? null : s.id)
                            }
                          />
                          {privacyId === s.id ? (
                            <PrivacyEditor
                              batch={batch}
                              source={s}
                              busy={busy}
                              mutate={mutate}
                              refresh={load}
                              onDirty={setPrivacyDirty}
                            />
                          ) : null}
                          {sourceOptions === s.id &&
                          !s.originalPhoto &&
                          s.privacyApproved &&
                          s.mime !== "text/plain" ? (
                            <View style={{ gap: 8 }}>
                              <T>
                                이미지·PDF는 가림 승인 후 문자인식을 위해 AI에
                                전송돼요. 추가 시각 분석이 필요한 쪽을 선택할 수
                                있으며, Gemini 문자인식 모드에서는 모든 쪽의
                                가림 이미지를 읽고 글자만 분석해요.
                              </T>
                              {Array.from({ length: s.pageCount }, (_, i) => (
                                <Choice
                                  key={i}
                                  label={`${i + 1}쪽 이미지도 분석`}
                                  selected={(visual[s.id] ?? []).includes(
                                    i + 1,
                                  )}
                                  disabled={busy}
                                  onPress={() =>
                                    setVisual({
                                      ...visual,
                                      [s.id]: (visual[s.id] ?? []).includes(
                                        i + 1,
                                      )
                                        ? visual[s.id].filter(
                                            (n) => n !== i + 1,
                                          )
                                        : [...(visual[s.id] ?? []), i + 1],
                                    })
                                  }
                                />
                              ))}
                            </View>
                          ) : null}
                        </>
                      ) : null}
                      {sourceOptions === s.id ? (
                        <Button
                          label="자료 삭제"
                          variant="text"
                          disabled={busy}
                          onPress={() =>
                            mutate(async () => {
                              await api.removeSource(batch.id, s);
                              const url = previewUrls.current.get(s.id);
                              if (url) URL.revokeObjectURL(url);
                              previewUrls.current.delete(s.id);
                              setLocalPreviews((previous) => {
                                const next = { ...previous };
                                delete next[s.id];
                                return next;
                              });
                              await load();
                            })
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                  <Button
                    label={
                      working
                        ? "분석 중이에요"
                        : activeRun?.status === "PRIVACY_REVIEW"
                          ? "가림 승인 후 분석을 이어가요"
                          : "자료 준비·분석 시작"
                    }
                    disabled={
                      busy ||
                      !batch.sources.length ||
                      runs.some((r) => ACTIVE.includes(r.status))
                    }
                    onPress={() =>
                      mutate(async () => {
                        const pages = Object.fromEntries(
                          Object.entries(visual).filter(([, ns]) => ns.length),
                        );
                        await api.start(
                          batch.id,
                          batch.version,
                          keyFor("start", [batch.version, pages]),
                          pages,
                        );
                        pending.current.clear();
                        await load();
                      })
                    }
                  />
                  {runs.map((r) => (
                    <View key={r.id} style={panel}>
                      <T>
                        {states[r.status] ?? r.status} · {r.completed}/{r.total}
                        {r.mode === "mock" ? " · 테스트 결과" : ""}
                      </T>
                      {r.items
                        .filter((i) => i.error)
                        .map((i) => (
                          <T key={i.id} variant="caption">
                            {
                              batch.sources.find((s) => s.id === i.assetId)
                                ?.filename
                            }
                            : {sourceError(i.error!)}
                          </T>
                        ))}
                      {ACTIVE.includes(r.status) ? (
                        <Button
                          label="분석 취소"
                          variant="outline"
                          disabled={busy}
                          onPress={() =>
                            mutate(async () => {
                              await api.cancel(batch.id, r.id);
                              await load();
                            })
                          }
                        />
                      ) : null}
                      {r.items.some((i) => i.status === "FAILED") ? (
                        <>
                          <Choice
                            label="결과가 불명확한 요청을 재시도하면 비용이 다시 발생할 수 있음을 확인했어요"
                            selected={ack}
                            disabled={busy}
                            onPress={() => setAck(!ack)}
                          />
                          <Button
                            label="실패한 항목 재시도"
                            variant="outline"
                            disabled={
                              busy ||
                              (r.items.some(
                                (i) => i.error === "REQUEST_UNCERTAIN",
                              ) &&
                                !ack)
                            }
                            onPress={() =>
                              mutate(async () => {
                                const ids = r.items
                                  .filter((i) => i.status === "FAILED")
                                  .map((i) => i.id);
                                await api.retry(
                                  batch.id,
                                  r.id,
                                  ids,
                                  ack,
                                  keyFor("retry", [r.id, ids, ack]),
                                );
                                pending.current.clear();
                                await load();
                              })
                            }
                          />
                        </>
                      ) : null}
                    </View>
                  ))}
                  <Button
                    label="분석 결과 불러오기"
                    variant="outline"
                    disabled={busy}
                    onPress={() =>
                      mutate(async () => {
                        await load();
                        setTab("근거 검토");
                      })
                    }
                  />
                </>
              ) : review ? (
                <>
                  {review.sourcePhotoRequests.map((request, i) => (
                    <View key={`${request.sourceId}-${i}`} style={panel}>
                      <T>
                        추가 자료 확인 ·{" "}
                        {
                          batch.sources.find((s) => s.id === request.sourceId)
                            ?.filename
                        }
                      </T>
                      {request.requests.map((message, j) => (
                        <T key={j}>{message}</T>
                      ))}
                    </View>
                  ))}
                  {editing ? (
                    <ReviewEditor
                      key={`${editing.target.id}:${editing.field}`}
                      batch={batch}
                      review={review}
                      target={editing.target}
                      fieldKey={editing.field}
                      busy={busy}
                      close={() => setLeaving(() => () => setEditing(null))}
                      save={(field, version) =>
                        mutate(async () => {
                          await api.saveReview(batch.id, version, [field]);
                          setEditing(null);
                          await load();
                        })
                      }
                    />
                  ) : null}
                  {batch.targets.map((t) => (
                    <View key={t.id} style={panel}>
                      <T variant="title">{t.name}</T>
                      {SOURCE_MODULES.map(([id, title]) => {
                        const fields = review.fields.filter(
                          (f) =>
                            f.targetId === t.id &&
                            (f.fieldKey === id ||
                              (id === "hero" && f.fieldKey === "name")),
                        );
                        return (
                          <View key={id} style={{ gap: 6 }}>
                            {tab === "상세 편집" ? (
                              <Choice
                                label={title}
                                selected={(enabled[t.id] ?? []).includes(id)}
                                disabled={busy}
                                onPress={() =>
                                  setEnabled({
                                    ...enabled,
                                    [t.id]: (enabled[t.id] ?? []).includes(id)
                                      ? enabled[t.id].filter((m) => m !== id)
                                      : [...(enabled[t.id] ?? []), id],
                                  })
                                }
                              />
                            ) : (
                              <T>
                                {title} ·{" "}
                                {fields.some((f) => f.state === "CONFIRMED")
                                  ? "확정됨"
                                  : "확인 필요"}
                              </T>
                            )}
                            {fields
                              .filter((f) => f.state === "CONFIRMED" && f.value)
                              .map((f) => (
                                <T key={f.fieldKey} variant="caption">
                                  {f.value}
                                </T>
                              ))}
                            <Button
                              label={`${title} 근거·내용 편집`}
                              variant="text"
                              disabled={busy || !!editing}
                              onPress={() =>
                                setEditing({ target: t, field: id })
                              }
                            />
                            {id === "hero" ? (
                              <Button
                                label="상품 이름 근거·내용 편집"
                                variant="text"
                                disabled={busy || !!editing}
                                onPress={() =>
                                  setEditing({ target: t, field: "name" })
                                }
                              />
                            ) : null}
                          </View>
                        );
                      })}
                      <Button
                        label={`${t.name} 비공개 초안 저장`}
                        disabled={busy || !!editing}
                        onPress={() =>
                          mutate(async () => {
                            const targets = [
                              {
                                targetId: t.id,
                                enabledModuleIds: enabled[t.id] ?? [],
                              },
                            ];
                            const result = await api.saveDraft(
                              batch.id,
                              review.reviewVersion,
                              targets,
                              keyFor("draft", [review.reviewVersion, targets]),
                            );
                            pending.current.clear();
                            await load();
                            setPreview(result.drafts[0].id);
                            setNotice(
                              "비공개 초안을 저장했어요. 상품에는 아직 적용되지 않았어요.",
                            );
                          })
                        }
                      />
                    </View>
                  ))}
                  {review.candidates.some(
                    (c) => c.historical || c.fieldKey === "historicalSales",
                  ) ? (
                    <View style={panel}>
                      <T>과거 판매 정보 · 상세에 자동 반영하지 않아요</T>
                      {review.candidates
                        .filter(
                          (c) =>
                            c.historical || c.fieldKey === "historicalSales",
                        )
                        .map((c) => (
                          <T key={c.id}>{c.value}</T>
                        ))}
                    </View>
                  ) : null}
                  {drafts.map((d) => {
                    const target = batch.targets.find(
                      (t) => t.id === d.targetId,
                    )!;
                    const pid = target.productId ?? applyTarget[d.id];
                    return (
                      <View key={d.id} style={panel}>
                        <T variant="title">
                          {target.name} 저장 초안
                          {d.snapshot.mode === "mock" ? " · 테스트 결과" : ""}
                        </T>
                        <T>
                          {d.snapshot.reviewVersion !== review.reviewVersion
                            ? "검토 내용이 바뀌었어요. 최신 초안을 저장해 주세요."
                            : "비공개 저장됨"}
                        </T>
                        {d.snapshot.warnings.length ? (
                          <T variant="caption">
                            내용이 없는 {d.snapshot.warnings.length}개 섹션은
                            미리보기에서 생략돼요.
                          </T>
                        ) : null}
                        <Button
                          label="구매자 화면 미리보기"
                          variant="outline"
                          onPress={() =>
                            setPreview(preview === d.id ? null : d.id)
                          }
                        />
                        {preview === d.id ? (
                          <DraftPreview batch={batch} draft={d} />
                        ) : null}
                        {!target.productId ? (
                          <>
                            <T>
                              기존 상품 등록 화면에서 상품을 만든 뒤 적용할
                              상품을 선택해 주세요.
                            </T>
                            {products.map((p) => (
                              <Choice
                                key={p.productId}
                                label={p.name}
                                selected={pid === p.productId}
                                onPress={() =>
                                  setApplyTarget({
                                    ...applyTarget,
                                    [d.id]: p.productId,
                                  })
                                }
                              />
                            ))}
                          </>
                        ) : null}
                        <Button
                          label="상품 상세에 적용 검토"
                          disabled={
                            busy ||
                            !pid ||
                            !!editing ||
                            d.snapshot.reviewVersion !== review.reviewVersion
                          }
                          onPress={() =>
                            mutate(async () => {
                              const product = await catalog.myProduct(pid!);
                              setConfirmation({
                                draft: d,
                                productId: pid!,
                                version: product.version,
                                name: product.name,
                              });
                            })
                          }
                        />
                        <Button
                          label="저장 초안 삭제"
                          variant="text"
                          disabled={busy}
                          onPress={() =>
                            mutate(async () => {
                              await api.deleteDraft(batch.id, d);
                              await load();
                            })
                          }
                        />
                      </View>
                    );
                  })}
                  {confirmation ? (
                    <View style={panel}>
                      <T variant="title">{confirmation.name}에 적용할까요?</T>
                      <T>
                        현재 모듈 상세를 이 초안으로 교체해요. 판매 중인
                        상품이면 구매자에게 바로 보여요. 가격과 재고는 바뀌지
                        않아요.
                      </T>
                      <Button
                        label="확인 · 상품 상세 적용"
                        disabled={busy}
                        onPress={() =>
                          mutate(async () => {
                            const c = confirmation;
                            await api.apply(
                              batch.id,
                              c.draft,
                              c.productId,
                              c.version,
                              keyFor("apply", [
                                c.draft.id,
                                c.productId,
                                c.version,
                              ]),
                            );
                            pending.current.clear();
                            setConfirmation(null);
                            setNotice("상품 상세에 적용했어요.");
                            await load();
                          })
                        }
                      />
                      <Button
                        label="적용 취소"
                        variant="outline"
                        disabled={busy}
                        onPress={() => setConfirmation(null)}
                      />
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </View>
      </Scroll>
      <Sheet visible={!!leaving} onClose={() => setLeaving(null)}>
        <T variant="title">저장하지 않은 내용을 닫을까요?</T>
        <T>확정 저장한 근거와 비공개 초안은 그대로 남아요.</T>
        <Button label="계속 편집" onPress={() => setLeaving(null)} />
        <Button
          label="저장하지 않고 닫기"
          variant="outline"
          onPress={() => {
            const go = leaving;
            setLeaving(null);
            go?.();
          }}
        />
      </Sheet>
    </Screen>
  );
}
