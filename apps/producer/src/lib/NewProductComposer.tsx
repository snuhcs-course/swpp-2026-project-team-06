import { AI_POLICY_NOTE, SourceExclusions } from "./SourceExclusions";
// 새 상품 한 화면 편집(DEV-184): 기본 정보 + 상세페이지를 한 스크롤에 두고,
// 사진·자료는 아래에 붙은 AI 시트에서 넣는다. 비공개 저장과 명시적 적용은 그대로 나눈다.
import { useSourceBasicInfo, type BasicInfoKey } from "./SourceBasicInfo";
import { SourceAttachments } from "./SourceAttachments";
import {
  catalog,
  farms,
  isMock,
  newIdempotencyKey,
  sourcePageImage,
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
  HeaderBar,
  Icon,
  PeekSheet,
  Photo,
  ProductPageBody,
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
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
import { toPageData } from "./BuyerPreview";
import { useHideTabBar } from "./session";
import {
  ACTIVE,
  canEditBatch,
  Choice,
  panel,
  sourceError,
  sourceNotices,
  states,
} from "./SourceWorkspace";
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
// 이 상품에 마지막으로 반영한 초안(id:version). 같은 초안을 다시 apply하면 서버가 대표사진을 또 복사하므로
// 새로고침 뒤에도 알 수 있게 세션 저장소에 둔다. 초안이 바뀌면(사진만 바뀌어도 새 버전) 다시 반영한다.
const appliedKey = (productId: string) =>
  `farmclub-producer:applied-draft:${productId}`;
const readApplied = (productId: string) => {
  try {
    return sessionStorage.getItem(appliedKey(productId)) ?? "";
  } catch {
    return "";
  }
};
const writeApplied = (productId: string, value: string) => {
  try {
    sessionStorage.setItem(appliedKey(productId), value);
  } catch {
    // 저장소를 못 쓰면 화면 안에서만 기억한다.
  }
};
function AiBadge() {
  return (
    <T variant="caption" color={tokens.color.accent}>
      ✨ AI가 채웠어요 · 고쳐도 돼요
    </T>
  );
}
/** 구매자 화면 글자 모양 그대로 쓰는 칸. 비어 있으면 점선 네모로 '여기를 채워 주세요'를 알린다. */
function FillInput({
  label,
  value,
  placeholder,
  onChange,
  maxLength,
  editable = true,
  title = false,
  onBlur,
  numeric = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  maxLength: number;
  editable?: boolean;
  title?: boolean;
  onBlur?: () => void;
  numeric?: boolean;
}) {
  const empty = !value.trim();
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      placeholder={placeholder}
      placeholderTextColor="#B5B5B5"
      maxLength={maxLength}
      editable={editable}
      onChangeText={onChange}
      onBlur={onBlur}
      keyboardType={numeric ? "decimal-pad" : "default"}
      style={{
        fontFamily: tokens.fontFamily,
        // 제목은 구매자 화면 상품명(T title)과 같은 크기·자간
        fontSize: title ? tokens.fontSize.title : 15,
        ...(title ? { letterSpacing: -0.68 } : {}),
        fontWeight: title ? "700" : "400",
        color: tokens.color.text,
        minHeight: title ? tokens.lineHeight.title + 12 : 40,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderStyle: empty ? "dashed" : "solid",
        borderColor: empty ? tokens.color.textMuted : "transparent",
        backgroundColor: empty ? "white" : "transparent",
      }}
    />
  );
}
/** 기본 정보 훅을 batch가 있을 때만 쓰기 위한 감싸개(훅은 조건부로 부를 수 없다). */
function BasicInfo({
  children,
  ...options
}: Parameters<typeof useSourceBasicInfo>[0] & {
  children: (basic: ReturnType<typeof useSourceBasicInfo>) => ReactNode;
}) {
  return <>{children(useSourceBasicInfo(options))}</>;
}
/** 채우기 화면에서 아직 정할 수 없는 자리(가격·받는 시기)를 알리는 점선 칸. */
function LaterNote({ text }: { text: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: tokens.color.border,
        borderRadius: 8,
        padding: 12,
      }}
    >
      <T variant="sub" muted>
        {text}
      </T>
    </View>
  );
}
export function NewProductComposer() {
  useHideTabBar();
  const flushAttachments = useRef<(() => Promise<void>) | null>(null);
  const saveEditor = useRef<
    ((fresh?: SourceReview, name?: string) => Promise<boolean>) | null
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
  const [ack, setAck] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    draft: SourceDraft;
    productId: string;
    version: number;
    published: boolean;
    status: string;
  } | null>(null);
  const [farmName, setFarmName] = useState("");
  useEffect(() => {
    void farms
      .mine()
      .then((f) => alive.current && setFarmName(f.name))
      .catch(() => {});
  }, []);
  // 대표사진(인증 blob). 채우기 화면 맨 위에 구매자 화면처럼 보인다.
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  // 편집기·첨부함과 같은 대표사진 선택식(SourceDetailsEditor·SourceAttachments).
  const coverTarget = batch?.targets[0];
  const cover =
    batch && coverTarget
      ? batch.sources.find(
          (s) =>
            s.id ===
            (coverTarget.representativeAssetId ||
              batch.sources.find(
                (p) =>
                  p.originalPhoto &&
                  (p.common || p.targetIds.includes(coverTarget.id)),
              )?.id),
        )
      : undefined;
  const coverId = cover?.status === "PREPARED" ? cover.id : null;
  const coverRevision = cover?.revision;
  useEffect(() => {
    setCoverUrl(null);
    setCoverFailed(false);
    if (!batch || !coverId) return;
    let alive = true;
    let url = "";
    void sourcePageImage(batch.id, coverId, 1)
      .then((u) => {
        url = u;
        if (alive) setCoverUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {
        // 못 불러오면 '불러오는 중'에 머물지 않고 사진 넣기 칸으로 돌아간다.
        if (alive) setCoverFailed(true);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [batch?.id, coverId, coverRevision]);
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
  // 판매·가격(SCR-24b)에서 돌아오면 버전·값이 바뀌었을 수 있어 다시 읽는다. 고치던 칸이 있으면 덮지 않는다.
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
            ["EXTRACTED", "REFINED"].includes(e.field.provenance) &&
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
    // 상품명이 상세 맨 위 제목과 다르면 같이 맞춘다(구매자 화면에 이름이 둘로 보이지 않게).
    const name =
      form && !DEFAULT_NAMES.includes(form.name.trim()) ? form.name.trim() : "";
    const nameDiffers =
      !!name &&
      r.editorFields.some(
        (e) =>
          e.field.targetId === target.id &&
          e.field.fieldKey === "name" &&
          e.field.state !== "EXCLUDED" &&
          e.field.value !== name,
      );
    if (editorDirty || !fresh || nameDiffers) {
      const ok = await saveEditor.current?.(r, name || undefined);
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
  /** 상세페이지 초안을 상품에 반영(apply). 판매·가격 저장보다 먼저 해야 상품 버전이 꼬이지 않는다. */
  // 이 화면에서 이미 반영한 초안. 같은 초안을 다시 반영하면 서버가 대표사진을 또 복사해 사진이 늘어난다.
  const applied = useRef("");
  const applyDraft = async (c: {
    draft: SourceDraft;
    productId: string;
    version: number;
    published: boolean;
  }) => {
    const id = `${c.draft.id}:${c.draft.version}`;
    if (applied.current !== id && readApplied(c.productId) !== id) {
      await api.apply(
        batch!.id,
        c.draft,
        c.productId,
        c.version,
        keyFor("apply", [c.draft.id, c.productId, c.version]),
      );
      applied.current = id;
      writeApplied(c.productId, id);
      pending.current.clear();
      await Promise.all([load(), reloadProduct()]);
    }
    goNext(c.published);
  };
  // 판매 전 새 상품은 판매·가격(SCR-24b), 판매 중 상품은 기존 상품 편집(SCR-25)으로.
  const goNext = (
    published = !!product && !["DRAFT", "REJECTED"].includes(product.status),
  ) => {
    if (!productId) return;
    router.push(
      published ? `/products/${productId}/edit` : `/products/${productId}/sell`,
    );
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
      {run.items.flatMap((item) =>
        sourceNotices(item).map((note, index) => (
          <T key={`${item.id}-note-${index}`} variant="caption">
            {item.phase !== "REFINE"
              ? `${batch?.sources.find((s) => s.id === item.assetId)?.filename}: `
              : ""}
            {note}
          </T>
        )),
      )}
      {run.items
        .filter(
          (i) => i.error &&
            !(
              i.status === "PARTIAL" &&
              ((i.pagesFailed ?? 0) > 0 || (i.chunksFailed ?? 0) > 0)
            ) &&
            (i.phase !== "REFINE" || i.status === "FAILED"),
        )
        .map((i) => (
          <T key={i.id} variant="caption">
            {i.phase !== "REFINE"
              ? `${batch?.sources.find((s) => s.id === i.assetId)?.filename}: `
              : ""}
            {sourceError(
              i.error!,
              i.phase,
              i.status === "PARTIAL" ? i.rejectedCount : 0,
            )}
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
        // 상품을 못 불러온 경우도 여기서 다시 시도한다(채우기 화면은 상품이 있어야 그려진다).
        onPress={() =>
          mutate(async () => {
            await Promise.all([load(), reloadProduct()]);
          })
        }
      />
    </View>
  ) : null;
  const title =
    form && !DEFAULT_NAMES.includes(form.name.trim()) ? form.name : "새 상품";
  return (
    <Screen>
      <HeaderBar title={title} onBack={() => router.back()} />
      <Scroll bottom={batch ? 240 : 40}>
        {/* 미리보기와 같은 구매자 화면(ProductPageBody)에서 빈 칸만 점선으로, 누르면 그 자리에서 고친다(DEV-184). */}
        {(sheetOpen ? null : errorPanel) || notice ? (
          <View style={{ padding: tokens.space.gutter, gap: 8 }}>
            {sheetOpen ? null : errorPanel}
            {notice ? (
              <View accessibilityRole="alert">
                <T>{notice}</T>
              </View>
            ) : null}
          </View>
        ) : null}
        {isMock ? (
          <View style={{ padding: tokens.space.gutter }}>
            <T>
              자료 분석은 로컬 API 검증 환경에서 사용할 수 있어요. 현재 데모
              화면은 서버에 연결되지 않았어요.
            </T>
          </View>
        ) : !batchId ? (
          <View style={{ padding: tokens.space.gutter, gap: 12 }}>
            <T>열 상품을 찾지 못했어요. 상품 목록에서 다시 골라 주세요.</T>
            <Button
              label="상품 목록으로"
              variant="outline"
              onPress={() => router.replace("/products")}
            />
          </View>
        ) : !batch || !product || !form || !target ? (
          <View style={{ padding: tokens.space.gutter, gap: 12 }}>
            {batch && (!target || !productId) ? (
              <>
                <T variant="caption" muted>
                  예전 방식(상품이 연결되지 않았거나 여러 상품)의 자료
                  작업이에요. 이 화면 대신 자료 작업 화면에서 고쳐 주세요.
                </T>
                <Button
                  label="자료 작업 화면으로"
                  variant="outline"
                  onPress={() =>
                    router.replace({
                      pathname: "/products/source-analysis",
                      params: { batchId: batch.id },
                    })
                  }
                />
              </>
            ) : (
              <>
                <Skeleton width="100%" height={244} />
                <Skeleton width="60%" height={28} />
              </>
            )}
          </View>
        ) : (
          <BasicInfo
            key={batch.id}
            batch={batch}
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
          >
            {(basic) => {
              const values = basic.inputs[target.id] ?? {
                variety: "",
                size: "",
                brix: "",
              };
              const locked = busy || !!activeRun || editorDirty;
              const basicField = (
                key: BasicInfoKey,
                label: string,
                placeholder: string,
                maxLength: number,
              ) => (
                <FillInput
                  label={label}
                  value={values[key]}
                  placeholder={placeholder}
                  maxLength={maxLength}
                  editable={!locked}
                  numeric={key === "brix"}
                  onChange={(v) => basic.change(target.id, key, v)}
                  onBlur={basic.blur}
                />
              );
              return (
                <View testID="product-basic-info">
                  <ProductPageBody
                    p={toPageData(
                      {
                        ...product,
                        name: form.name,
                        info: {
                          ...product.info,
                          origin: form.origin,
                          storage: form.storage,
                          size: values.size,
                        },
                      },
                      farmName,
                      0,
                    )}
                    reference={() => null}
                    slots={{
                      photo: (
                        <>
                          <SourceExclusions
                            batchId={batch.id}
                            products={[{
                              name: form.name || target.name,
                              result: working ? undefined : review?.refinementResults?.[target.id],
                            }]}
                          />
                          {coverUrl || (hasPhoto && !coverFailed) ? (
                            !coverUrl ? (
                              <View
                                testID="hero-photo"
                                style={{
                                  height: 244,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: tokens.color.surface,
                                }}
                              >
                                <T variant="sub" muted>
                                  대표 사진 불러오는 중…
                                </T>
                              </View>
                            ) : (
                              <Pressable
                                testID="hero-photo"
                                accessibilityRole="button"
                                accessibilityLabel="대표 사진 바꾸기"
                                onPress={() => setSheetOpen(true)}
                              >
                                <Photo
                                  uri={coverUrl}
                                  width="100%"
                                  height={244}
                                  radius={0}
                                  alt="대표사진"
                                />
                              </Pressable>
                            )
                          ) : (
                            <Pressable
                              testID="hero-placeholder"
                              accessibilityRole="button"
                              accessibilityLabel="대표 사진 넣기"
                              onPress={() => setSheetOpen(true)}
                              style={{
                                height: 244,
                                margin: 12,
                                borderWidth: 1.5,
                                borderStyle: "dashed",
                                borderColor: tokens.color.textMuted,
                                borderRadius: 16,
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                              }}
                            >
                              <Icon
                                name="photo"
                                size={28}
                                color={tokens.color.accent}
                              />
                              <T weight="semibold">대표 사진을 넣어 주세요</T>
                              <T variant="caption" muted>
                                아래 &apos;사진·자료&apos;에서 넣어요
                              </T>
                            </Pressable>
                          )}
                        </>
                      ),
                      name: (
                        <View style={{ gap: 4 }}>
                          <FillInput
                            label="상품명"
                            value={form.name}
                            placeholder={
                              working
                                ? "AI가 채우는 중…"
                                : "상품 이름을 적어 주세요"
                            }
                            title
                            maxLength={40}
                            editable={!busy}
                            onChange={(v) => setField("name", v)}
                          />
                          {aiFilled.includes("name") ? <AiBadge /> : null}
                        </View>
                      ),
                      subName: (
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <T variant="sub" muted>
                            품종 *
                          </T>
                          <View style={{ flex: 1 }}>
                            {basicField(
                              "variety",
                              "과일 품종명",
                              "예: 온주밀감",
                              100,
                            )}
                          </View>
                        </View>
                      ),
                      sale: (
                        <LaterNote text="받는 시기·가격·배송비는 다음 단계(판매·가격)에서 정해요" />
                      ),
                      story: (
                        <View testID="product-detail-page" style={{ gap: 12 }}>
                          {working ? (
                            <View
                              testID="source-analysis-status"
                              accessibilityLiveRegion="polite"
                              style={{ gap: 12, padding: 20 }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                <ActivityIndicator
                                  color={tokens.color.accent}
                                />
                                <T variant="sub" muted>
                                  {activeRun?.status === "PREPARING"
                                    ? "올려주신 자료를 읽고 있어요."
                                    : "AI가 자료를 보고 상세페이지를 쓰고 있어요. 잠시만 기다려 주세요."}
                                </T>
                              </View>
                              <Skeleton width="100%" height={220} radius={16} />
                              <Skeleton width="70%" height={20} />
                              <Skeleton width="90%" height={20} />
                            </View>
                          ) : showEditor && review ? (
                            <>
                              <SourceDetailsEditor
                                key={batch.id}
                                emptyHint
                                showStoryTextHints
                                displayName={
                                  DEFAULT_NAMES.includes(form.name.trim())
                                    ? undefined
                                    : form.name.trim()
                                }
                                batch={batch}
                                review={review}
                                drafts={drafts}
                                saveRef={saveEditor}
                                onDirty={setEditorDirty}
                                onBusy={editorBusy}
                                onSaved={async () => {
                                  await load();
                                }}
                              />
                            </>
                          ) : (
                            <Pressable
                              testID="detail-placeholder"
                              accessibilityRole="button"
                              accessibilityLabel="사진·자료 넣기"
                              onPress={() => setSheetOpen(true)}
                              style={{
                                ...panel,
                                margin: 20,
                                borderStyle: "dashed",
                                borderColor: tokens.color.textMuted,
                                alignItems: "center",
                                paddingVertical: 32,
                              }}
                            >
                              <T weight="semibold">상세 스토리를 채워 주세요</T>
                              <T
                                variant="caption"
                                muted
                                style={{ textAlign: "center" }}
                              >
                                &apos;AI로 채우기&apos;를 누르면 맛·재배
                                과정·보관 방법 같은 이야기를 AI가 써 드려요. 쓴
                                내용은 여기서 바로 고칠 수 있어요.
                              </T>
                            </Pressable>
                          )}
                        </View>
                      ),
                      brix: (
                        <View
                          style={{
                            paddingHorizontal: 20,
                            paddingTop: 40,
                            gap: 8,
                          }}
                        >
                          <T variant="sub" muted>
                            당도 예상
                          </T>
                          {basicField("brix", "예상 당도 (°Bx)", "예: 12.5", 8)}
                        </View>
                      ),
                      info: {
                        origin: (
                          <View style={{ flex: 1 }}>
                            <FillInput
                              label="원산지"
                              value={form.origin}
                              placeholder="예: 제주 서귀포"
                              maxLength={30}
                              editable={!busy}
                              onChange={(v) => setField("origin", v)}
                            />
                          </View>
                        ),
                        size: (
                          <View style={{ flex: 1 }}>
                            {basicField(
                              "size",
                              "사이즈",
                              "예: 중과, 지름 6~7cm",
                              200,
                            )}
                          </View>
                        ),
                        storage: (
                          <View style={{ flex: 1, gap: 4 }}>
                            <FillInput
                              label="보관"
                              value={form.storage}
                              placeholder="예: 서늘한 곳"
                              maxLength={30}
                              editable={!busy}
                              onChange={(v) => setField("storage", v)}
                            />
                            {aiFilled.includes("storage") ? <AiBadge /> : null}
                          </View>
                        ),
                      },
                      infoOpen: true,
                    }}
                  />
                  {basic.error ? (
                    <View accessibilityRole="alert" style={{ padding: 20 }}>
                      <T variant="caption" color={tokens.color.error}>
                        {basic.error}
                      </T>
                    </View>
                  ) : null}
                </View>
              );
            }}
          </BasicInfo>
        )}
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
                  // 기본 정보 칸(품종 필수 검사)이 화면에 올라오기 전에는 시작하지 않는다.
                  !form ||
                  !productId ||
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
                  disabled={busy || working || !product || !form}
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
                  label="다음: 판매·가격"
                  size="producer"
                  disabled={busy || working || !productId || !product || !form}
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
                      const c = {
                        draft: d,
                        productId,
                        version: p.version,
                        // 판매 전(초안·반려)만 확인 없이 반영하고 ②로. 그 밖의 상태는 확인 후 상품 편집(SCR-25).
                        published: !["DRAFT", "REJECTED"].includes(p.status),
                      };
                      // 판매 전 상품은 반영해도 구매자에게 보이지 않아 확인 없이 반영하고 넘어간다.
                      // 이미 반영한 초안이면 확인할 것이 없으니 바로 이동한다.
                      const key = `${d.id}:${d.version}`;
                      if (
                        applied.current === key ||
                        readApplied(productId) === key
                      )
                        return goNext(c.published);
                      if (c.published)
                        return setConfirmation({ ...c, status: p.status });
                      await applyDraft(c);
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
          <T variant="caption" muted>
            {AI_POLICY_NOTE}
          </T>
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
          {confirmation?.status === "PUBLISHED"
            ? "판매 중인 상품이라 상세페이지와 사진이 구매자에게 바로 보여요. 가격과 재고는 바뀌지 않아요."
            : confirmation?.status === "PENDING_APPROVAL"
              ? "승인 대기 중인 상품이에요. 반영한 상세페이지는 승인되면 구매자에게 보여요."
              : "판매가 끝난 상품이에요. 상품 페이지에 남은 상세가 이 내용으로 바뀌어요."}
        </T>
        <Button
          label="반영하고 다음으로"
          size="producer"
          disabled={busy}
          onPress={() =>
            mutate(async () => {
              await applyDraft(confirmation!);
              setConfirmation(null);
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
