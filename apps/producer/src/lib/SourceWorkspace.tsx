import { SourceBasicInfo } from "./SourceBasicInfo";
import { SourceAttachments } from "./SourceAttachments";
import {
  allPages,
  catalog,
  isMock,
  newIdempotencyKey,
  sourceAnalysis as api,
  sourcePageImage,
  type MyProductCard,
  type SourceBatch,
  type SourceDraft,
  type SourceReview,
  type SourceRun,
} from "@farmclub/api";
import {
  Button,
  BottomBar,
  HeaderBar,
  Icon,
  ModuleStory,
  Photo,
  Screen,
  Scroll,
  Sheet,
  T,
  tokens,
} from "@farmclub/ui";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
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
    CANDIDATES_REJECTED:
      "근거를 확인하지 못한 내용은 제외했어요. 원문을 확인해 주세요.",
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
      aria-checked={selected}
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
      ...new Set([
        ...(draft.snapshot.representativeAssetId
          ? [draft.snapshot.representativeAssetId]
          : []),
        ...draft.snapshot.previewModules.flatMap((m) => m.photoAssetIds),
      ]),
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
      {draft.snapshot.representativeAssetId ? (
        <Photo
          uri={photos[draft.snapshot.representativeAssetId]}
          width="100%"
          height={244}
          alt="대표사진"
        />
      ) : null}
      <ModuleStory
        content={{
          modules: draft.snapshot.previewModules.map((m) => ({
            ...m,
            photos: m.photoAssetIds.map((id) => ({
              uri: photos[id] || "",
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
  const flushAttachments = useRef<(() => Promise<void>) | null>(null);
  const saveEditor = useRef<(() => void) | null>(null);
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
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [tab, setTab] = useState("자료"),
    [editing, setEditing] = useState(false);
  const [visual] = useState<Record<string, number[]>>({});
  const [ack, setAck] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [applyTarget, setApplyTarget] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{
    draft: SourceDraft;
    productId: string;
    version: number;
    name: string;
  } | null>(null);
  const activeRun = runs.find((r) => ACTIVE.includes(r.status));
  const working = !!activeRun && activeRun.status !== "PRIVACY_REVIEW";
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const allowLeave = useRef(false);
  const [basicDirty, setBasicDirty] = useState(false);
  const flushBasicInfo = useRef<
    ((required?: boolean) => Promise<void>) | undefined
  >(undefined);
  const dirty = editing || basicDirty;
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
            if (!r.items.some((job) => ACTIVE.includes(job.status)))
              return load();
          }
        })
        .catch((e) => {
          if (alive.current) setError(String(e));
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [batchId, runs, load]);
  const canEdit =
    !!batch &&
    !activeRun &&
    (!!drafts.length ||
      (!!runs[0] &&
        (!runs[0].inputs?.length ||
          (runs[0].inputs.length === batch.sources.length &&
            runs[0].inputs.every((i) =>
              batch.sources.some(
                (s) =>
                  s.id === i.id &&
                  s.revision === i.revision &&
                  (s.description || "") === i.description,
              ),
            ))) &&
        (["SUCCEEDED", "PARTIAL"].includes(runs[0].status) ||
          (runs[0].status === "FAILED" &&
            batch.sources.some(
              (s) => s.originalPhoto && s.status === "PREPARED",
            ))) &&
        batch.sources
          .filter((s) => !s.originalPhoto)
          .every((s) =>
            runs[0].items.some(
              (i) => i.assetId === s.id && i.revision === s.revision,
            ),
          ) &&
        (batch.sources.some(
          (s) => s.originalPhoto && s.status === "PREPARED",
        ) ||
          !!review?.editorFields?.some(
            (e) =>
              e.status === "ready" &&
              (e.field.value || e.field.photoAssetIds.length),
          ))));
  return (
    <Screen>
      <HeaderBar title="판매페이지 만들기" onBack={() => router.back()} />
      <Scroll bottom={180}>
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
              {batch.targets.length === 1 && batch.targets[0].productId ? (
                <Button
                  label="상품 정보·판매 설정"
                  variant="text"
                  icon="box"
                  disabled={busy || dirty}
                  onPress={() =>
                    router.push(`/products/${batch.targets[0].productId}/edit`)
                  }
                />
              ) : null}
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
                        : "이전 분석을 다시 시작해 주세요"}
                    </T>
                    <T variant="caption" muted>
                      {activeRun.status === "PREPARING"
                        ? "올려주신 자료를 읽고 있어요."
                        : activeRun.status === "PRIVACY_REVIEW"
                          ? "아래에서 이전 분석을 취소한 뒤 다시 시작해 주세요."
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
                {["자료", "상세 편집"].map((t) => (
                  <Button
                    key={t}
                    label={t === "상세 편집" ? "상세페이지 편집" : t}
                    disabled={busy || (t === "상세 편집" && !canEdit)}
                    variant="text"
                    style={{
                      flex: 1,
                      alignSelf: "stretch",
                      backgroundColor: tab === t ? "white" : "transparent",
                      borderRadius: 12,
                    }}
                    onPress={() => {
                      if (t === tab) return;
                      const go = () => {
                        setEditing(false);
                        if (t === "상세 편집")
                          mutate(async () => {
                            await flushBasicInfo.current?.();
                            await load();
                            setTab(t);
                          });
                        else setTab(t);
                      };
                      if (editing) setLeaving(() => go);
                      else go();
                    }}
                  />
                ))}
              </View>
              {tab === "자료" ? (
                <>
                  <SourceBasicInfo
                    key={batch.id}
                    batch={batch}
                    disabled={busy || !!activeRun}
                    flushRef={flushBasicInfo}
                    onDirty={(dirty) => {
                      setBasicDirty(dirty);
                      if (dirty) setError("");
                    }}
                    onSaved={setBatch}
                  />
                  <SourceAttachments
                    key={`attachments-${batch.id}`}
                    flushRef={flushAttachments}
                    beforeUpload={async () => {
                      await flushBasicInfo.current?.();
                    }}
                    batch={batch}
                    busy={busy || !!activeRun}
                    refresh={load}
                    onBusy={setBusy}
                    onDirty={setEditing}
                  />
                  {!batch.sources.some(
                    (s) => s.originalPhoto && s.status === "PREPARED",
                  ) ? (
                    <T variant="caption" muted>
                      대표 상품사진을 한 장 이상 올려야 분석을 시작할 수 있어요.
                    </T>
                  ) : null}
                  <Button
                    label={
                      working
                        ? "분석 중이에요"
                        : activeRun?.status === "PRIVACY_REVIEW"
                          ? "이전 분석을 취소해 주세요"
                          : "자료 준비·분석 시작"
                    }
                    disabled={
                      busy ||
                      !batch.sources.some(
                        (s) => s.originalPhoto && s.status === "PREPARED",
                      ) ||
                      runs.some((r) => ACTIVE.includes(r.status))
                    }
                    onPress={() =>
                      mutate(async () => {
                        await flushAttachments.current?.();
                        await flushBasicInfo.current?.(true);
                        const latest = await api.get(batch.id);
                        const pages = Object.fromEntries(
                          Object.entries(visual).filter(([, ns]) => ns.length),
                        );
                        await api.start(
                          batch.id,
                          latest.version,
                          keyFor("start", [latest.version, pages]),
                          pages,
                        );
                        pending.current.clear();
                        await load();
                      })
                    }
                  />
                  {runs.slice(0, 1).map((r) => (
                    <View key={r.id} style={panel}>
                      <T>
                        {r.status === "SUCCEEDED"
                          ? "분석이 완료됐어요"
                          : r.status === "PARTIAL"
                            ? "일부 내용을 반영하지 못했어요. 원문을 확인해 주세요."
                            : r.status === "PRIVACY_REVIEW"
                              ? "이전 분석을 취소한 뒤 다시 시작해 주세요"
                              : (states[r.status] ?? r.status)}
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
                      {r.items.some((i) =>
                        ["FAILED", "PARTIAL"].includes(i.status),
                      ) ? (
                        <>
                          <Choice
                            label="결과가 불명확한 요청을 재시도하면 비용이 다시 발생할 수 있음을 확인했어요"
                            selected={ack}
                            disabled={busy}
                            onPress={() => setAck(!ack)}
                          />
                          <Button
                            label={
                              r.items.some((i) => i.status === "PARTIAL")
                                ? "미완료 항목 재시도"
                                : "실패한 항목 재시도"
                            }
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
                                  .filter((i) =>
                                    ["FAILED", "PARTIAL"].includes(i.status),
                                  )
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
                </>
              ) : review ? (
                <>
                  <SourceDetailsEditor
                    key={batch.id}
                    batch={batch}
                    review={review}
                    drafts={drafts}
                    saveRef={saveEditor}
                    onDirty={setEditing}
                    onBusy={setBusy}
                    onSaved={async () => {
                      await load();
                      setPreview(null);
                      setNotice(
                        "비공개 초안을 저장했어요. 상품에는 아직 적용되지 않았어요.",
                      );
                    }}
                  />
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
                  {drafts
                    .filter(
                      (d, i) =>
                        drafts.findIndex((x) => x.targetId === d.targetId) ===
                        i,
                    )
                    .map((d) => {
                      const target = batch.targets.find(
                        (t) => t.id === d.targetId,
                      )!;
                      const pid = target.productId ?? applyTarget[d.id];
                      return (
                        <View key={d.id} testID="source-drafts" style={panel}>
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
      {tab === "상세 편집" && review ? (
        <BottomBar>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="비공개 저장"
              loading={busy}
              disabled={busy}
              style={{ flex: 1 }}
              onPress={() => saveEditor.current?.()}
            />
            {drafts.length ? (
              <Button
                label="저장 초안·공개"
                variant="outline"
                disabled={busy}
                onPress={() => {
                  if (typeof document !== "undefined")
                    document
                      .querySelector('[data-testid="source-drafts"]')
                      ?.scrollIntoView({ behavior: "smooth" });
                }}
              />
            ) : null}
          </View>
        </BottomBar>
      ) : null}

      <Sheet visible={!!leaving} onClose={() => setLeaving(null)}>
        <T variant="title">저장하지 않은 내용을 닫을까요?</T>
        <T>저장한 비공개 초안은 그대로 남아요.</T>
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
