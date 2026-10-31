// 새 상품 한 화면 편집(DEV-184): 기본 정보 + 상세페이지를 한 스크롤에 두고,
// 사진·자료는 아래에 붙은 AI 시트에서 넣는다. 비공개 저장과 명시적 적용은 그대로 나눈다.
import { SourceBasicInfo } from "./SourceBasicInfo";
import { SourceAttachments } from "./SourceAttachments";
import {
  catalog,
  isMock,
  newIdempotencyKey,
  sourceAnalysis as api,
  type MyProduct,
  type ProductOption,
  type ProductPatch,
  type SourceBatch,
  type SourceDraft,
  type SourceReview,
  type SourceRun,
} from "@farmclub/api";
import {
  Button,
  Checkbox,
  HeaderBar,
  Icon,
  Input,
  PeekSheet,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  tokens,
} from "@farmclub/ui";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
import { useHideTabBar } from "./session";
import {
  ACTIVE,
  canEditBatch,
  Choice,
  DraftPreview,
  panel,
  sourceError,
  states,
} from "./SourceWorkspace";
const WEIGHTS = [3, 5, 10];
// 서버가 새 상품을 만들 때 이름은 비어 있거나 "새 상품"이다. 이때만 AI 값으로 채운다.
const DEFAULT_NAMES = ["", "새 상품"];
// 새 상품의 서버 기본 보관 문구(catalog.create_product). 이 값이면 AI 값으로 바꿔도 된다.
const DEFAULT_STORAGE = ["", "서늘하고 통풍되는 곳"];
type ProductForm = {
  name: string;
  origin: string;
  storage: string;
  options: ProductOption[];
};
const toForm = (p: MyProduct): ProductForm => ({
  name: p.name,
  origin: p.info.origin,
  storage: p.info.storage,
  options: p.options,
});
// 재분석 결과가 같으면 reviewVersion은 그대로여도 batch 버전은 오른다. 적용은 둘 다 맞아야 한다.
const isFresh = (d: SourceDraft, reviewVersion: number, batchVersion: number) =>
  d.snapshot.reviewVersion === reviewVersion &&
  // 서버 apply와 같은 판정: batchVersion 없는 초안은 최신이 아니다.
  (d.snapshot.batchVersion ?? -1) === batchVersion;
function AiBadge() {
  return (
    <T variant="caption" color={tokens.color.accent}>
      ✨ AI가 채웠어요 · 고쳐도 돼요
    </T>
  );
}
function Section({
  title,
  testID,
  children,
}: {
  title: string;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View testID={testID} style={{ gap: 12 }}>
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}
export function NewProductComposer() {
  useHideTabBar();
  const flushAttachments = useRef<(() => Promise<void>) | null>(null);
  const saveEditor = useRef<
    ((fresh?: SourceReview) => Promise<boolean>) | null
  >(null);
  const router = useRouter(),
    navigation = useNavigation(),
    { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const [batch, setBatch] = useState<SourceBatch | null>(null),
    [review, setReview] = useState<SourceReview | null>(null),
    [runs, setRuns] = useState<SourceRun[]>([]),
    [drafts, setDrafts] = useState<SourceDraft[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [attachDirty, setAttachDirty] = useState(false),
    [editorDirty, setEditorDirty] = useState(false);
  const [ack, setAck] = useState(false),
    [preview, setPreview] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    draft: SourceDraft;
    productId: string;
    version: number;
    published: boolean;
  } | null>(null);
  const [product, setProduct] = useState<MyProduct | null>(null),
    [form, setForm] = useState<ProductForm | null>(null);
  // 생산자가 손댄 칸은 AI가 다시 채우지 않는다. aiFilled는 배지 표시용.
  const touched = useRef(new Set<keyof ProductForm>());
  const [aiFilled, setAiFilled] = useState<(keyof ProductForm)[]>([]);
  const activeRun = runs.find((r) => ACTIVE.includes(r.status));
  const working = !!activeRun && activeRun.status !== "PRIVACY_REVIEW";
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const allowLeave = useRef(false);
  const [basicDirty, setBasicDirty] = useState(false);
  const flushBasicInfo = useRef<
    ((required?: boolean) => Promise<void>) | undefined
  >(undefined);
  const target = batch?.targets.length === 1 ? batch.targets[0] : null;
  const productId = target?.productId ?? null;
  const productDirty =
    !!form &&
    !!product &&
    JSON.stringify(form) !== JSON.stringify(toForm(product));
  const dirty = attachDirty || editorDirty || basicDirty || productDirty;
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
    if (!batchId) return;
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
    void load().catch((e) => {
      if (alive.current) setError(String(e));
    });
  }, [load]);
  // 상품 편집(SCR-25)에서 돌아오면 버전·값이 바뀌었을 수 있어 다시 읽는다. 고치던 칸이 있으면 덮지 않는다.
  const productDirtyRef = useRef(false);
  productDirtyRef.current = productDirty;
  const reloadProduct = useCallback(async () => {
    if (!productId) return;
    const p = await catalog.myProduct(productId);
    if (!alive.current || productDirtyRef.current) return;
    setProduct(p);
    setForm(toForm(p));
  }, [productId]);
  useFocusEffect(
    useCallback(() => {
      void reloadProduct().catch((e) => {
        if (alive.current) setError(String(e));
      });
    }, [reloadProduct]),
  );
  // 빈 새 상품이면 처음부터 시트를 올려 사진·자료를 넣게 한다.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !batch) return;
    opened.current = true;
    if (!batch.sources.length && !runs.length) setSheetOpen(true);
  }, [batch, runs.length]);
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
  // 분석 결과의 상품명·보관 방법을 아직 기본값인 칸에만 채운다(가격은 채우지 않음, AC-03-1).
  useEffect(() => {
    if (!review || !target || !product) return;
    const value = (key: string) =>
      review.editorFields
        .find(
          (e) =>
            e.field.targetId === target.id &&
            e.field.fieldKey === key &&
            e.field.state !== "EXCLUDED" &&
            e.field.provenance === "EXTRACTED" &&
            e.status === "ready",
        )
        ?.field.value.trim() ?? "";
    const name = value("name").slice(0, 40),
      storage = value("storage");
    setForm((old) => {
      if (!old) return old;
      const next = { ...old },
        filled: (keyof ProductForm)[] = [];
      if (
        name &&
        !touched.current.has("name") &&
        DEFAULT_NAMES.includes(old.name.trim())
      ) {
        next.name = name;
        filled.push("name");
      }
      if (
        storage &&
        storage.length <= 30 &&
        !touched.current.has("storage") &&
        DEFAULT_STORAGE.includes(old.storage.trim()) &&
        storage !== old.storage.trim()
      ) {
        next.storage = storage;
        filled.push("storage");
      }
      if (filled.length) setAiFilled((a) => [...new Set([...a, ...filled])]);
      return filled.length ? next : old;
    });
  }, [review, target, product]);
  const setField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => {
    touched.current.add(k);
    setAiFilled((a) => a.filter((x) => x !== k));
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };
  const toggleWeight = (w: number) => {
    if (!form) return;
    const has = form.options.some((o) => o.weightKg === w);
    setField(
      "options",
      has
        ? form.options.filter((o) => o.weightKg !== w)
        : [
            ...form.options,
            { optionId: `opt-${w}`, label: `${w}kg`, weightKg: w },
          ].sort((a, b) => a.weightKg - b.weightKg),
    );
  };
  // 품종·예상 당도는 AI 입력용 기본 정보(batch)에 쓰고, 상품에도 같은 값을 넣는다.
  const saveProduct = async () => {
    if (!productId || !product || !form) return;
    const latest = target ? (await api.get(batch!.id)).targets[0] : null;
    // 기본 정보에서 지운 예상 당도(null)도 그대로 상품에 반영한다.
    const variety = latest
        ? (latest.basicInfo?.variety ?? "")
        : product.variety,
      brix = latest
        ? (latest.basicInfo?.expectedBrix ?? null)
        : product.expectedBrix;
    const base = toForm(product);
    const body: ProductPatch = { version: product.version };
    if (form.name !== base.name) body.name = form.name;
    if (form.origin !== base.origin || form.storage !== base.storage)
      body.info = { origin: form.origin, storage: form.storage };
    if (JSON.stringify(form.options) !== JSON.stringify(base.options))
      body.options = form.options;
    if (variety && variety !== product.variety) body.variety = variety;
    if (brix !== product.expectedBrix) body.expectedBrix = brix;
    if (Object.keys(body).length === 1) return;
    const saved = await catalog.update(
      productId,
      body,
      keyFor("product", body),
    );
    if (!alive.current) return;
    setProduct(saved);
    setForm(toForm(saved));
  };
  const currentDraft =
    target && review
      ? drafts.find(
          (d) =>
            d.targetId === target.id &&
            isFresh(d, review.reviewVersion, batch!.version),
        )
      : undefined;
  const canEdit = canEditBatch(batch, runs, drafts, review, activeRun);
  // 저장하지 않은 상세 수정이 있으면 편집기를 내리지 않는다(첨부를 바꿔도 수정이 사라지지 않게).
  const showEditor = !!review && !working && (canEdit || editorDirty);
  /** 화면의 모든 입력을 비공개로 저장한다. 상품에는 아직 적용하지 않는다. */
  const saveAll = async () => {
    await flushAttachments.current?.();
    await flushBasicInfo.current?.();
    await saveProduct();
    if (!review || !showEditor || !target) return;
    // flush로 batch·review 버전이 바뀌었을 수 있으니 렌더 시점 값이 아니라 서버 값으로 판단한다.
    const [b, r, ds] = await Promise.all([
      api.get(batch!.id),
      api.review(batch!.id),
      api.drafts(batch!.id),
    ]);
    const fresh = ds.items.some(
      (d) => d.targetId === target.id && isFresh(d, r.reviewVersion, b.version),
    );
    if (editorDirty || !fresh) {
      const ok = await saveEditor.current?.(r);
      if (ok === false)
        throw new Error(
          "상세페이지를 저장하지 못했어요. 상세페이지 위의 안내를 확인해 주세요.",
        );
    }
  };
  // 화면 전체 작업(mutate) 중에는 하위 컴포넌트의 busy 해제가 버튼을 다시 켜지 않게 한다.
  const editorBusy = (v: boolean) => {
    if (!lock.current) setBusy(v);
  };
  const goNext = () => {
    if (productId) router.push(`/products/${productId}/edit`);
  };
  const hasPhoto = !!batch?.sources.some(
    (s) => s.originalPhoto && s.status === "PREPARED",
  );
  const photoCount = batch?.sources.filter((s) => s.originalPhoto).length ?? 0,
    materialCount = batch?.sources.filter((s) => !s.originalPhoto).length ?? 0;
  const startLabel = working
    ? "AI가 작성 중이에요"
    : activeRun?.status === "PRIVACY_REVIEW"
      ? "이전 분석을 취소해 주세요"
      : runs.length
        ? "AI로 다시 채우기"
        : "AI로 채우기";
  const start = () =>
    mutate(async () => {
      if (!batch) return;
      // 재분석 전에 고친 상세페이지를 비공개 저장해 PRODUCER 값으로 남긴다(AC-SRC-11).
      if (editorDirty && (await saveEditor.current?.()) === false)
        throw new Error(
          "고친 상세페이지를 저장하지 못해 AI로 다시 채우지 않았어요. 위 안내를 확인해 주세요.",
        );
      await flushAttachments.current?.();
      await flushBasicInfo.current?.(true);
      const latest = await api.get(batch.id);
      await api.start(
        batch.id,
        latest.version,
        keyFor("start", [latest.version, {}]),
        {},
      );
      pending.current.clear();
      setSheetOpen(false);
      await load();
    });
  const run = runs[0];
  const runPanel = run ? (
    <View key={run.id} style={panel}>
      <T>
        {run.status === "SUCCEEDED"
          ? "AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요."
          : run.status === "PARTIAL"
            ? "일부 내용을 반영하지 못했어요. 원문을 확인해 주세요."
            : run.status === "PRIVACY_REVIEW"
              ? "이전 분석을 취소한 뒤 다시 시작해 주세요"
              : (states[run.status] ?? run.status)}
        {run.mode === "mock" ? " · 테스트 결과" : ""}
      </T>
      {run.items
        .filter((i) => i.error)
        .map((i) => (
          <T key={i.id} variant="caption">
            {batch?.sources.find((s) => s.id === i.assetId)?.filename}:{" "}
            {sourceError(i.error!)}
          </T>
        ))}
      {ACTIVE.includes(run.status) ? (
        <Button
          label="분석 취소"
          variant="outline"
          disabled={busy}
          onPress={() =>
            mutate(async () => {
              await api.cancel(batch!.id, run.id);
              await load();
            })
          }
        />
      ) : null}
      {run.items.some((i) => ["FAILED", "PARTIAL"].includes(i.status)) ? (
        <>
          <Choice
            label="결과가 불명확한 요청을 재시도하면 비용이 다시 발생할 수 있음을 확인했어요"
            selected={ack}
            disabled={busy}
            onPress={() => setAck(!ack)}
          />
          <Button
            label={
              run.items.some((i) => i.status === "PARTIAL")
                ? "미완료 항목 재시도"
                : "실패한 항목 재시도"
            }
            variant="outline"
            disabled={
              busy ||
              (run.items.some((i) => i.error === "REQUEST_UNCERTAIN") && !ack)
            }
            onPress={() =>
              mutate(async () => {
                const ids = run.items
                  .filter((i) => ["FAILED", "PARTIAL"].includes(i.status))
                  .map((i) => i.id);
                await api.retry(
                  batch!.id,
                  run.id,
                  ids,
                  ack,
                  keyFor("retry", [run.id, ids, ack]),
                );
                pending.current.clear();
                await load();
              })
            }
          />
        </>
      ) : null}
    </View>
  ) : null;
  const errorPanel = error ? (
    <View accessibilityRole="alert" style={panel}>
      <T>{error}</T>
      <Button
        label="서버 상태 다시 확인"
        variant="outline"
        disabled={busy}
        onPress={() => mutate(load)}
      />
    </View>
  ) : null;
  const title =
    form && !DEFAULT_NAMES.includes(form.name.trim()) ? form.name : "새 상품";
  return (
    <Screen>
      <HeaderBar title={title} onBack={() => router.back()} />
      <Scroll bottom={batch ? 240 : 40}>
        <View style={{ padding: tokens.space.gutter, gap: tokens.space.lg }}>
          {sheetOpen ? null : errorPanel}
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
              <T>열 상품을 찾지 못했어요. 상품 목록에서 다시 골라 주세요.</T>
              <Button
                label="상품 목록으로"
                variant="outline"
                onPress={() => router.replace("/products")}
              />
            </>
          ) : !batch ? (
            <T>상품 불러오는 중…</T>
          ) : (
            <>
              <Section title="기본 정보" testID="product-basic-info">
                {form ? (
                  <View style={{ gap: 6 }}>
                    <Input
                      label="상품명"
                      value={form.name}
                      placeholder={
                        working ? "AI가 채우는 중…" : "예: 제주 노지 감귤"
                      }
                      maxLength={40}
                      editable={!busy}
                      onChangeText={(v) => setField("name", v)}
                    />
                    {aiFilled.includes("name") ? <AiBadge /> : null}
                  </View>
                ) : productId ? (
                  <Skeleton width="100%" height={56} />
                ) : (
                  <T variant="caption" muted>
                    예전 방식의 자료 작업이에요. 상품 정보는 상품 편집 화면에서
                    고쳐 주세요.
                  </T>
                )}
                <SourceBasicInfo
                  key={batch.id}
                  embedded
                  batch={batch}
                  disabled={busy || !!activeRun || editorDirty}
                  flushRef={flushBasicInfo}
                  onDirty={(dirty) => {
                    setBasicDirty(dirty);
                    if (dirty) setError("");
                  }}
                  onSaved={(b) => {
                    setBatch(b);
                    // 기본 정보 저장은 reviewVersion도 올린다. 편집기가 최신 review를 받게 다시 읽는다.
                    if (review)
                      void load().catch((e) => {
                        if (alive.current) setError(String(e));
                      });
                  }}
                />
                {form ? (
                  <>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Input
                        label="원산지"
                        value={form.origin}
                        placeholder="예: 제주 서귀포"
                        maxLength={30}
                        editable={!busy}
                        onChangeText={(v) => setField("origin", v)}
                        style={{ flex: 1 }}
                      />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Input
                          label="보관"
                          value={form.storage}
                          placeholder="예: 서늘한 곳"
                          maxLength={30}
                          editable={!busy}
                          onChangeText={(v) => setField("storage", v)}
                        />
                        {aiFilled.includes("storage") ? <AiBadge /> : null}
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      <T variant="sub" weight="semibold">
                        중량 옵션
                      </T>
                      <View style={{ flexDirection: "row", gap: 12 }}>
                        {WEIGHTS.map((w) => (
                          <Checkbox
                            key={w}
                            label={`${w}kg`}
                            checked={form.options.some((o) => o.weightKg === w)}
                            onPress={() => !busy && toggleWeight(w)}
                          />
                        ))}
                      </View>
                    </View>
                  </>
                ) : null}
              </Section>
              <Section title="상세페이지" testID="product-detail-page">
                {working ? (
                  <View
                    testID="source-analysis-status"
                    accessibilityLiveRegion="polite"
                    style={{ gap: 12 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <ActivityIndicator color={tokens.color.accent} />
                      <T variant="sub" muted>
                        {activeRun?.status === "PREPARING"
                          ? "올려주신 자료를 읽고 있어요."
                          : "AI가 자료를 보고 상세페이지를 쓰고 있어요. 잠시만 기다려 주세요."}
                      </T>
                    </View>
                    <Skeleton width="100%" height={220} radius={16} />
                    <Skeleton width="70%" height={20} />
                    <Skeleton width="90%" height={20} />
                    <Skeleton width="80%" height={20} />
                  </View>
                ) : showEditor && review ? (
                  <>
                    <SourceDetailsEditor
                      key={batch.id}
                      batch={batch}
                      review={review}
                      drafts={drafts}
                      saveRef={saveEditor}
                      onDirty={setEditorDirty}
                      onBusy={editorBusy}
                      onSaved={async () => {
                        await load();
                        setPreview(false);
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
                    {currentDraft && !editorDirty ? (
                      <>
                        <Button
                          label={
                            preview ? "미리보기 닫기" : "구매자 화면 미리보기"
                          }
                          variant="outline"
                          onPress={() => setPreview(!preview)}
                        />
                        {preview ? (
                          <DraftPreview batch={batch} draft={currentDraft} />
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : (
                  <Pressable
                    testID="detail-placeholder"
                    accessibilityRole="button"
                    accessibilityLabel="사진·자료 넣기"
                    onPress={() => setSheetOpen(true)}
                    style={{
                      ...panel,
                      borderStyle: "dashed",
                      alignItems: "center",
                      paddingVertical: 32,
                    }}
                  >
                    <Icon name="photo" size={28} color={tokens.color.accent} />
                    <T weight="semibold">아래에 사진·자료를 넣어 주세요</T>
                    <T variant="caption" muted style={{ textAlign: "center" }}>
                      &apos;AI로 채우기&apos;를 누르면 맛·재배 과정·보관 방법
                      같은 상세페이지를 AI가 써 드려요. 쓴 내용은 여기서 바로
                      고칠 수 있어요.
                    </T>
                  </Pressable>
                )}
              </Section>
            </>
          )}
        </View>
      </Scroll>
      {batch ? (
        <PeekSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          label="사진·자료"
          peek={
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              {working ? (
                <ActivityIndicator color={tokens.color.accent} />
              ) : (
                <Icon name="photo" color={tokens.color.accent} />
              )}
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="semibold">
                  {working
                    ? "AI가 작성 중이에요"
                    : runs.length
                      ? "사진·자료 바꾸고 AI로 다시 채우기"
                      : "사진·자료를 넣으면 AI가 채워 드려요"}
                </T>
                <T variant="caption" muted>
                  {photoCount || materialCount
                    ? `상품사진 ${photoCount}장 · 자료 ${materialCount}개`
                    : "대표 상품사진 한 장은 꼭 넣어 주세요"}
                </T>
              </View>
              {/* 시트는 위로 펼쳐진다: 접힘 ⌃, 펼침 ⌄ */}
              <View
                style={
                  sheetOpen ? undefined : { transform: [{ rotate: "180deg" }] }
                }
              >
                <Icon name="chevronDown" color={tokens.color.textMuted} />
              </View>
            </View>
          }
          footer={
            sheetOpen ? (
              <Button
                label={startLabel}
                size="producer"
                loading={busy && !working}
                disabled={
                  busy ||
                  !hasPhoto ||
                  runs.some((r) => ACTIVE.includes(r.status))
                }
                onPress={start}
              />
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  label="임시 저장"
                  variant="secondary"
                  size="producer"
                  disabled={busy || working}
                  style={{ flex: 1 }}
                  onPress={() =>
                    mutate(async () => {
                      await saveAll();
                      setNotice(
                        "비공개로 저장했어요. 상품에는 아직 적용되지 않았어요.",
                      );
                    })
                  }
                />
                <Button
                  label="다음: 가격·판매"
                  size="producer"
                  disabled={busy || working || !productId}
                  style={{ flex: 2 }}
                  onPress={() =>
                    mutate(async () => {
                      await saveAll();
                      if (!target || !productId) return;
                      const [ds, r, b] = await Promise.all([
                        api.drafts(batch.id),
                        api.review(batch.id),
                        api.get(batch.id),
                      ]);
                      const d = ds.items.find(
                        (x) =>
                          x.targetId === target.id &&
                          isFresh(x, r.reviewVersion, b.version),
                      );
                      if (!d) {
                        // 분석 전이면 상품 정보만 저장하고 넘어간다. 분석 뒤인데 최신 초안이 없으면 멈춘다.
                        // 취소된 분석만 있으면 분석 전과 같다(결과가 없어 다시 채울 이유가 없음).
                        if (
                          ds.items.length ||
                          runs.some((x) => x.status !== "CANCELLED")
                        )
                          throw new Error(
                            "상세페이지가 지금 사진·자료와 맞지 않아요. AI로 다시 채우거나 임시 저장한 뒤 다시 눌러 주세요.",
                          );
                        return goNext();
                      }
                      const p = await catalog.myProduct(productId);
                      setConfirmation({
                        draft: d,
                        productId,
                        version: p.version,
                        published: p.status === "PUBLISHED",
                      });
                    })
                  }
                />
              </View>
            )
          }
        >
          {errorPanel}
          {editorDirty ? (
            <T variant="caption" muted>
              상세페이지에 저장하지 않은 수정이 있어요. &apos;임시 저장&apos;을
              누르거나 &apos;AI로 다시 채우기&apos;(먼저 저장해요) 뒤에
              사진·자료와 품종·사이즈·예상 당도를 바꿀 수 있어요.
            </T>
          ) : null}
          <SourceAttachments
            key={`attachments-${batch.id}`}
            flushRef={flushAttachments}
            beforeUpload={async () => {
              await flushBasicInfo.current?.();
            }}
            batch={batch}
            busy={busy || !!activeRun || editorDirty}
            refresh={load}
            onBusy={editorBusy}
            onDirty={setAttachDirty}
          />
          {runPanel}
        </PeekSheet>
      ) : null}

      <Sheet visible={!!confirmation} onClose={() => setConfirmation(null)}>
        <T variant="title">상품에 반영할까요?</T>
        <T>
          {confirmation?.published
            ? "판매 중인 상품이라 상세페이지와 사진이 구매자에게 바로 보여요. 가격과 재고는 바뀌지 않아요."
            : "상세페이지와 사진을 상품에 넣어요. 아직 구매자에게는 보이지 않아요. 다음 화면에서 받는 시기·가격을 정하고 공급 물량을 신청하면 승인 후 공개돼요."}
        </T>
        <Button
          label="반영하고 다음으로"
          size="producer"
          disabled={busy}
          onPress={() =>
            mutate(async () => {
              const c = confirmation!;
              await api.apply(
                batch!.id,
                c.draft,
                c.productId,
                c.version,
                keyFor("apply", [c.draft.id, c.productId, c.version]),
              );
              pending.current.clear();
              setConfirmation(null);
              await Promise.all([load(), reloadProduct()]);
              goNext();
            })
          }
        />
        <Button
          label="아직 반영하지 않기"
          variant="outline"
          disabled={busy}
          onPress={() => setConfirmation(null)}
        />
      </Sheet>
      <Sheet visible={!!leaving} onClose={() => setLeaving(null)}>
        <T variant="title">저장하지 않은 내용을 닫을까요?</T>
        <T>임시 저장한 내용은 그대로 남아요.</T>
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
