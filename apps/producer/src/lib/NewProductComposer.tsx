import { useRetryGate } from "./useRetryGate";
import { FieldFeedback, FieldFeedbackContext } from "./FieldFeedback";
import { chooseSourceFiles } from "./sourceFiles";
import { EditorActions } from "./EditorActions";
import { sourceActionError, type SourceActionError } from "./sourceFeedback";
import { SourceRunProgress } from "./SourceRunProgress";
import { AI_POLICY_NOTE, SourceExclusions } from "./SourceExclusions";
// 새 상품 한 화면 편집(DEV-184): 기본 정보 + 상세페이지를 한 스크롤에 두고,
// 사진·자료는 아래에 붙은 AI 시트에서 넣는다. 비공개 저장과 명시적 적용은 그대로 나눈다.
import { useSourceBasicInfo, type BasicInfoKey } from "./SourceBasicInfo";
import { OriginFieldHint } from "./OriginFieldHint";
import { SourceAttachments } from "./SourceAttachments";
import {
  ApiError,
  catalog,
  farms,
  newIdempotencyKey,
  productWorkspace,
  uploadSource,
  sourceAnalysis as api,
  type DraftStage,
  type MyProduct,
  type ProductChange,
  type ProductChangeGroups,
  type ProductDraftFields,
  type ProductDraftView,
  type ProductOption,
  type ProductPatch,
  type SourceBatch,
  type SourceDraft,
  type SourceField,
  type SourceReview,
  type SourceRun,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  DetailStory,
  HeaderBar,
  ModuleStory,
  Icon,
  Notice,
  PeekSheet,
  Photo,
  ProductPageBody,
  Screen,
  Scroll,
  Sheet,
  Skeleton,
  T,
  md,
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
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, TextInput, View, type ScrollView } from "react-native";
import { SourceDetailsEditor } from "./SourceDetailsEditor";
import { toPageData } from "./BuyerPreview";
import { useHideTabBar, useSession } from "./session";
import { ACTIVE, canEditBatch, panel, sourceError, sourceNotices, states } from "./sourceBatch";
import { isPreSale } from "./productGroups";
import { pickMedia } from "./pick";
import { CollapsingFrame, CollapsingSpacer, CollapsingTop, useCollapsingTop } from "./CollapsingTop";
import {
  PreSaleSteps,
  SalesTermsEditor,
  TermsSummary,
  cellOf,
  checkTerms,
  NEW_STAGE_PREFIX,
  termsFrom,
  termsKey,
  termsStages,
  type Terms,
} from "./SalesTermsEditor";
import { goBackOr } from "./nav";
import { productPhotoUrl, sourcePhotoUrl } from "./sourcePhoto";
import { track } from "@farmclub/analytics";
import { composerErrorCode, draftResult, isServerTrouble } from "./producerEvents";
/** 구매자에게 보이고 고칠 수 있는 상품(상품 초안·'상품에 반영', DEV-361 PR C). 판매 종료는 고치지 않는다(결정 10) */
const isLive = (status: string) => status === "PUBLISHED" || status === "PENDING_APPROVAL";
/** 상품 초안 칸 이름(서버 product_draft 값 키) → 화면 이름. 충돌 안내에 쓴다 */
const DRAFT_LABELS: Record<string, string> = {
  name: "상품명",
  photos: "사진",
  variety: "품종",
  expectedBrix: "예상 당도",
  measuredBrix: "측정 당도",
  "info.origin": "원산지",
  "info.storage": "보관 방법",
  options: "중량 옵션",
  deliveryWindow: "받는 시기",
  maxDelayUntil: "전액 환불 날짜",
  shippingFeeType: "배송비",
  shippingFee: "배송비",
  remoteAreaFee: "도서산간 추가 운임",
  stages: "예약 기간·가격",
  grade: "등급",
};
// 서버가 새 상품을 만들 때 이름은 비어 있거나 "새 상품"이다. 이때만 AI 값으로 채운다.
const DEFAULT_NAMES = ["", "새 상품"];
// 새 상품의 서버 기본 보관 문구(catalog.create_product). 이 값이면 AI 값으로 바꿔도 된다.
const DEFAULT_STORAGE = ["", "서늘하고 통풍되는 곳"];
type ProductForm = {
  name: string;
  origin: string;
  storage: string;
  options: ProductOption[];
  /** 아래 셋은 구매자에게 보이는 상품·상품만 여는 composer에서 쓴다. 판매 전 batch composer는 품종·당도를 기본 정보(batch)에 쓴다 */
  variety: string;
  brix: string;
  photos: string[];
  /** 등급(특·상·보통, 예전 SCR-25와 같음, PM 11/18 되살림) */
  grade: string | null;
};
const GRADES = ["특", "상", "보통"];
/** 대표사진 포함 최대 사진 수(PM 11/18, 1 + 9). 서버도 같은 한도로 거절한다(catalog/schemas.py MAX_PRODUCT_PHOTOS) */
const MAX_PHOTOS = 10;
/**
 * 새로 올린 대표사진은 반영 때 맨 앞에 들어가 지금 사진이 밀린다. 한도를 넘으면 잘라 내지 않고 막는다(생산자가 뺄 사진을 고름).
 * 서버(source_analysis/publish.py `apply_draft`)도 같은 셈·같은 문구로 거절한다. over = 한도를 넘는 장수
 */
const photoCapMessage = (over: number) =>
  `새 대표사진이 맨 앞에 들어가요. 사진은 ${MAX_PHOTOS}장까지라 ${over > 1 ? `${over}장` : "한 장"}을 빼 주세요.`;
const brixText = (p: Pick<MyProduct, "measuredBrix" | "expectedBrix">) =>
  p.measuredBrix != null ? String(p.measuredBrix) : p.expectedBrix != null ? String(p.expectedBrix) : "";
const toForm = (p: MyProduct): ProductForm => ({
  name: p.name,
  origin: p.info.origin,
  storage: p.info.storage,
  options: p.options,
  variety: p.variety,
  brix: brixText(p),
  photos: p.photos,
  grade: p.grade,
});
const brixValue = (v: string) => (v.trim() ? Number(v) : null);
/** 서버 상품 초안을 상품 값 위에 덮는다(화면 값·미리보기용) */
function withDraft(p: MyProduct, draft: ProductDraftView["draft"]): MyProduct {
  if (!draft) return p;
  const f = draft.fields;
  const stages = draft.stages
    ? draft.stages.map((s, i) => {
        const old = p.stages.find((x) => x.stageId === s.stageId);
        return {
          ...(old ?? { reservedOrderCount: 0, awaitingOrderCount: 0, preparingOrderCount: 0, harvestStarted: false, name: "" }),
          // 새 기간은 표시용 ID(termsFrom이 stageId로 쓰지 않음). 화면 행 key로만 쓴다
          stageId: s.stageId ?? `${NEW_STAGE_PREFIX}${i}`,
          seq: i + 1,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          options: Object.fromEntries(
            Object.entries(s.options).map(([k, v]) => [
              k,
              { price: v.price, quantity: v.quantity, reservedCount: old?.options[k]?.reservedCount ?? 0 },
            ]),
          ),
        } as MyProduct["stages"][number];
      })
    : p.stages;
  return {
    ...p,
    ...(f.name != null ? { name: f.name } : {}),
    ...(f.variety != null ? { variety: f.variety } : {}),
    ...("expectedBrix" in f ? { expectedBrix: f.expectedBrix ?? null } : {}),
    ...("measuredBrix" in f ? { measuredBrix: f.measuredBrix ?? null } : {}),
    ...(f.photos ? { photos: f.photos } : {}),
    ...("grade" in f ? { grade: f.grade ?? null } : {}),
    ...(f.info ? { info: { ...p.info, ...f.info } } : {}),
    ...(f.options ? { options: f.options.map((o) => ({ ...o, note: o.note ?? undefined })) as ProductOption[] } : {}),
    ...("deliveryWindow" in f ? { deliveryWindow: f.deliveryWindow ?? null } : {}),
    ...("maxDelayUntil" in f ? { maxDelayUntil: f.maxDelayUntil ?? null } : {}),
    ...(f.shippingFeeType ? { shippingFeeType: f.shippingFeeType } : {}),
    ...(f.shippingFee != null ? { shippingFee: f.shippingFee } : {}),
    ...(f.remoteAreaFee != null ? { remoteAreaFee: f.remoteAreaFee } : {}),
    stages,
  };
}
/** 화면 값(상품 칸·판매 조건)과 상품 값의 차이 → 상품 초안 본문. 바뀐 칸만 */
function draftBody(p: MyProduct, form: ProductForm, terms: Terms) {
  const base = toForm(p),
    baseTerms = termsFrom(p);
  const fields: ProductDraftFields = {};
  if (form.name !== base.name) fields.name = form.name;
  if (form.origin !== base.origin || form.storage !== base.storage)
    fields.info = { origin: form.origin, storage: form.storage };
  if (form.variety !== base.variety) fields.variety = form.variety;
  // 예전 상품 편집(SCR-25)처럼 당도 한 칸이 예상·측정 당도에 함께 들어간다
  if (form.brix !== base.brix) {
    fields.expectedBrix = brixValue(form.brix);
    fields.measuredBrix = brixValue(form.brix);
  }
  if (JSON.stringify(form.photos) !== JSON.stringify(base.photos)) fields.photos = form.photos;
  if (form.grade !== base.grade) fields.grade = form.grade;
  if (JSON.stringify(terms.options) !== JSON.stringify(baseTerms.options))
    fields.options = terms.options.map((o) => ({ optionId: o.optionId, label: o.label, weightKg: o.weightKg }));
  if (JSON.stringify(terms.deliveryWindow) !== JSON.stringify(baseTerms.deliveryWindow))
    fields.deliveryWindow = terms.deliveryWindow;
  if (terms.maxDelayUntil !== baseTerms.maxDelayUntil) fields.maxDelayUntil = terms.maxDelayUntil;
  const fee = (t: Terms) => (t.shippingFeeType === "SEPARATE" ? (t.shippingFee ?? 0) : 0);
  if (terms.shippingFeeType !== baseTerms.shippingFeeType || fee(terms) !== fee(baseTerms)) {
    fields.shippingFeeType = terms.shippingFeeType;
    fields.shippingFee = fee(terms);
  }
  if ((terms.remoteAreaFee ?? 0) !== (baseTerms.remoteAreaFee ?? 0)) fields.remoteAreaFee = terms.remoteAreaFee ?? 0;
  const stagesChanged = stagesKey(terms) !== stagesKey(baseTerms);
  // 지금 상품에 있는 기간 ID만 보낸다(새 기간은 null). 화면 값에 낯선 ID가 섞여도 반영이 막히지 않게
  const known = new Set(p.stages.map((s) => s.stageId));
  const stages: DraftStage[] | undefined = stagesChanged
    ? termsStages(terms).map((s) => ({ stageId: s.stageId && known.has(s.stageId) ? s.stageId : null, startsAt: s.startsAt, endsAt: s.endsAt, options: s.options }))
    : undefined;
  return { fields, stages };
}
const stagesKey = (t: Terms) => JSON.stringify(JSON.parse(termsKey(t))[6]);
/** 바뀐 칸 이름(배너 수·'● 수정됨'). 상품정보는 칸별 */
function changedKeys(p: MyProduct, form: ProductForm, terms: Terms | null): string[] {
  const base = toForm(p);
  const keys: string[] = [];
  if (form.name !== base.name) keys.push("name");
  if (form.origin !== base.origin) keys.push("origin");
  if (form.storage !== base.storage) keys.push("storage");
  if (form.variety !== base.variety) keys.push("variety");
  if (form.brix !== base.brix) keys.push("brix");
  if (form.photos[0] !== base.photos[0]) keys.push("cover");
  if (JSON.stringify(form.photos.slice(1)) !== JSON.stringify(base.photos.slice(1))) keys.push("photos");
  if (form.grade !== base.grade) keys.push("grade");
  if (terms) {
    const b = termsFrom(p);
    const part = (t: Terms) => JSON.parse(termsKey(t)) as unknown[];
    const [now, was] = [part(terms), part(b)];
    const names = ["options", "deliveryWindow", "maxDelayUntil", "shipping", "shipping", "remoteAreaFee", "stages"];
    names.forEach((n, i) => {
      if (JSON.stringify(now[i]) !== JSON.stringify(was[i]) && !keys.includes(n)) keys.push(n);
    });
  }
  return keys;
}
/** 반영 확인 시트의 표 한 줄(항목 | 전 | 후). 값이 없으면 null('—') */
type ChangeRow = { label: string; before: string | null; after: string | null };
type ChangeRows = { now: ChangeRow[]; newOrders: ChangeRow[]; consent: ChangeRow[] };
const won = (n: number | null | undefined) => (n == null ? null : `${n.toLocaleString("ko-KR")}원`);
const boxes = (n: number | null | undefined) => (n == null ? null : `${n.toLocaleString("ko-KR")}박스`);
const shortDay = (iso: string) => iso.slice(5).replace("-", ".");
/** '11월 10일~20일'(같은 달), '11월 28일~12월 3일' */
function rangeText(w: { start: string; end: string } | null): string | null {
  if (!w) return null;
  return w.start.slice(0, 7) === w.end.slice(0, 7)
    ? `${md(w.start)}~${Number(w.end.slice(8))}일`
    : `${md(w.start)}~${md(w.end)}`;
}
const feeText = (t: Pick<Terms, "shippingFeeType" | "shippingFee">) =>
  t.shippingFeeType === "FREE" ? "무료" : (won(t.shippingFee ?? 0) ?? "무료");
/**
 * 화면 값(상품 칸·판매 조건)과 지금 상품의 차이를 바뀐 칸 하나에 한 줄로(PM 11/18). 묶음은 서버 저장 방식과 같다:
 * 바로 보임(상품 칸·중량 옵션) / 새 예약부터(기간·가격·박스·배송비·환불 날짜, 예약자가 없을 때 받는 시기) /
 * 예약자 동의 필요(예약자가 있을 때 받는 시기, R-21)
 */
function diffRows(p: MyProduct, form: ProductForm, terms: Terms | null, reserved: number): ChangeRows {
  const now: ChangeRow[] = [],
    newOrders: ChangeRow[] = [],
    consent: ChangeRow[] = [];
  const row = (to: ChangeRow[], label: string, before: string | null, after: string | null) => {
    if ((before ?? "") !== (after ?? "")) to.push({ label, before: before || null, after: after || null });
  };
  const base = toForm(p);
  row(now, "상품명", base.name, form.name);
  row(now, "원산지", base.origin, form.origin);
  row(now, "보관 방법", base.storage, form.storage);
  row(now, "품종", base.variety, form.variety);
  row(now, "측정 당도", base.brix ? `${base.brix}°Bx` : null, form.brix ? `${form.brix}°Bx` : null);
  row(now, "등급", base.grade, form.grade);
  if (base.photos[0] !== form.photos[0])
    now.push({ label: "대표사진", before: base.photos[0] ? "이전 사진" : null, after: form.photos[0] ? "새 사진" : null });
  if (JSON.stringify(base.photos.slice(1)) !== JSON.stringify(form.photos.slice(1)))
    now.push({ label: "사진", before: `${base.photos.length}장`, after: `${form.photos.length}장` });
  if (!terms) return { now, newOrders, consent };
  const was = termsFrom(p);
  const labels = (t: Terms) => t.options.map((o) => o.label).join(", ");
  row(now, "중량 옵션", labels(was) || null, labels(terms) || null);
  // 기간·옵션 칸마다(기간은 stageId로 맞춘다. 새 기간은 '새', 지운 기간은 '지움')
  const before = new Map(was.rows.filter((r) => r.stageId).map((r) => [r.stageId!, r]));
  terms.rows.forEach((r, i) => {
    const old = r.stageId ? before.get(r.stageId) : undefined;
    const name = `${i + 1}기간${old ? "" : "(새)"}`;
    if (old && (old.startsAt !== r.startsAt || old.endsAt !== r.endsAt))
      newOrders.push({
        label: `${name} 날짜`,
        before: `${shortDay(old.startsAt)}~${shortDay(old.endsAt)}`,
        after: `${shortDay(r.startsAt)}~${shortDay(r.endsAt)}`,
      });
    for (const o of terms.options) {
      const a = cellOf(r, o.optionId),
        b = old ? cellOf(old, o.optionId) : { price: null, quantity: null };
      row(newOrders, `${name} · ${o.label} 가격`, won(b.price), won(a.price));
      row(newOrders, `${name} · ${o.label} 박스`, boxes(b.quantity), boxes(a.quantity));
    }
    // 옵션을 뺀 기간의 칸은 따로 적지 않는다(중량 옵션 줄이 보인다)
  });
  const kept = new Set(terms.rows.map((r) => r.stageId).filter(Boolean));
  was.rows.forEach((r, i) => {
    if (r.stageId && !kept.has(r.stageId))
      newOrders.push({ label: `${i + 1}기간 지움`, before: `${shortDay(r.startsAt)}~${shortDay(r.endsAt)}`, after: null });
  });
  row(newOrders, "배송비", feeText(was), feeText(terms));
  row(newOrders, "도서산간 추가 운임", won(was.remoteAreaFee ?? 0), won(terms.remoteAreaFee ?? 0));
  row(newOrders, "전액 환불 날짜", md(was.maxDelayUntil) || null, md(terms.maxDelayUntil) || null);
  row(reserved > 0 ? consent : newOrders, "받는 시기", rangeText(was.deliveryWindow), rangeText(terms.deliveryWindow));
  return { now, newOrders, consent };
}
/**
 * 화면 표가 통째로 비었는데 서버 미리보기에 줄이 있으면(화면이 모르는 칸 등) 서버 줄을 쓴다. 화면 표가 한 줄이라도
 * 있으면 서버 줄은 섞지 않는다(같은 칸이 두 묶음에 나뉘어 보이지 않게, scan-before-merge)
 */
function withServerFallback(rows: ChangeRows, server: ProductChangeGroups | null): ChangeRows {
  if (!server || rows.now.length + rows.newOrders.length + rows.consent.length) return rows;
  const pick = (mine: ChangeRow[], theirs: ProductChange[]) =>
    mine.length || !theirs.length ? mine : theirs.map((c) => ({ label: c.label, before: c.before, after: c.after }));
  return { now: pick(rows.now, server.now), newOrders: pick(rows.newOrders, server.newOrders), consent: pick(rows.consent, server.consent) };
}
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
  onFocus,
  numeric = false,
  changed = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  maxLength: number;
  editable?: boolean;
  title?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  numeric?: boolean;
  /** 반영 안 한 수정(구매자에게 보이는 상품, DEV-361): 파란 테두리와 '● 수정됨' */
  changed?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const feedback = useContext(FieldFeedbackContext);
  const fieldKey = label === "원산지" || label === "상품정보 원산지" ? "origin" : label === "상품명" ? "name" : label;
  // 누른 뒤에만 생기는 오류(C-19): 입력 칸 자기 빨간 테두리와 문구(바깥 강조 상자 없음)
  const invalid = feedback.fields[fieldKey];

  return (
    <FieldFeedback outline={false} field={fieldKey}><View style={{ gap: 5, minWidth: 0 }}>

    <TextInput
      accessibilityLabel={label}
      value={value}
      placeholder={placeholder}
      placeholderTextColor="#B5B5B5"
      maxLength={maxLength}
      editable={editable}
      onChangeText={value => { feedback.clear(fieldKey); onChange(value); }}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      keyboardType={numeric ? "decimal-pad" : "default"}
      style={{
        fontFamily: tokens.fontFamily,
        // 제목은 구매자 화면 상품명(T title)과 같은 크기·자간
        fontSize: title ? tokens.fontSize.title : 15,
        ...(title ? { letterSpacing: -0.68 } : {}),
        fontWeight: title ? "700" : "400",
        color: tokens.color.text,
        minHeight: title ? tokens.lineHeight.title + 12 : 40,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 8,
        borderStyle: "solid",
        borderWidth: changed || invalid ? 1.5 : 1,
        borderColor: invalid ? tokens.color.error : focused ? tokens.color.accent : changed ? CHANGED : editable ? "#E9B980" : tokens.color.border,
        backgroundColor: !editable ? tokens.color.surface : changed ? "#F2F6FE" : focused ? "#FFF0DC" : "#FFF7EB",
      }}
    />
    {invalid ? <T variant="caption" color={tokens.color.error}>{invalid}</T> : null}
    {changed ? <ChangedMark label={label} /> : null}
    </View></FieldFeedback>
  );
}
/**
 * 대표사진 뒤 사진(PM 11/18 되살림, 예전 SCR-25처럼 더하기·빼기, 대표사진 포함 최대 10장). 대표사진(첫 장)은 위 대표사진 자리에서 바꾼다.
 * 대표사진이 아직 상품에 없으면(새 상품 첫 '다음' 전) 더하지 않는다: 첫 장이 대표사진이 되어 순서가 섞이지 않게
 */
function ExtraPhotos({
  productId,
  photos,
  editable,
  changed,
  onChange,
  onError,
  max = MAX_PHOTOS,
  note,
}: {
  productId: string;
  photos: string[];
  editable: boolean;
  changed: boolean;
  onChange: (next: string[]) => void;
  onError: (message: string) => void;
  /** 지금 사진 목록이 가질 수 있는 최대 장수(새 대표사진이 반영 때 앞에 들어가면 하나 줄어든다) */
  max?: number;
  /** 줄 아래 안내(새 대표사진 때문에 한 장을 빼야 할 때) */
  note?: string;
}) {
  const extra = photos.slice(1);
  const add = async () => {
    const picked = await pickMedia({ multiple: true });
    const ok = picked.filter((x) => x.ok).map((x) => (x as { uri: string }).uri);
    const bad = picked.filter((x) => !x.ok).map((x) => (x as { reason: string }).reason);
    if (ok.length) onChange([...photos, ...ok.filter((u) => !photos.includes(u))].slice(0, max));
    if (bad.length) onError(bad.join("\n"));
  };
  if (!photos.length) return null;
  return (
    <View testID="extra-photos" style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 10, gap: 6 }}>
      <T variant="caption" muted>
        사진 더 보여 주기 · 대표사진 포함 최대 {MAX_PHOTOS}장
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {extra.map((uri, i) => (
          <View key={`${i}-${uri.slice(-16)}`} style={{ position: "relative" }}>
            <PhotoThumb productId={productId} uri={uri} alt={`상품 사진 ${i + 2}`} />
            {editable ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`상품 사진 ${i + 2} 빼기`}
                onPress={() => onChange(photos.filter((_, j) => j !== i + 1))}
                style={{ position: "absolute", top: -6, right: -6, width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tokens.color.photoButton, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="close" size={14} color="#FFFFFF" />
                </View>
              </Pressable>
            ) : null}
          </View>
        ))}
        {editable && photos.length < max ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="사진 추가"
            onPress={() => void add()}
            style={{ width: 64, height: 64, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed", borderColor: tokens.color.textMuted, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="photo" size={20} color={tokens.color.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {note ? (
        <T variant="caption" color={tokens.color.error}>
          {note}
        </T>
      ) : null}
      {changed ? <ChangedMark text="사진" /> : null}
    </View>
  );
}
/** 상품 사진 한 장(비공개 사진은 인증 blob으로) */
function PhotoThumb({ productId, uri, alt }: { productId: string; uri: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made = "";
    void productPhotoUrl(productId, uri)
      .then((u) => {
        made = u.startsWith("blob:") ? u : "";
        if (alive) setUrl(u);
        else if (made) URL.revokeObjectURL(made);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [productId, uri]);
  return <Photo uri={url} width={64} height={64} radius={12} alt={alt} />;
}
/** 반영 안 한 수정 표시 색(시안 --changed) */
const CHANGED = "#2F6FDB";
/** '● 수정됨'(text가 있으면 '● {text} 수정됨'). label은 화면 읽기용 칸 이름 */
function ChangedMark({ text, label }: { text?: string; label?: string }) {
  return (
    <View testID="changed-mark" accessible accessibilityLabel={`${label ?? text ?? ""} 수정됨`.trim()}>
      <T variant="caption" weight="bold" color={CHANGED}>
        ● {text ? `${text} ` : ""}수정됨
      </T>
    </View>
  );
}
/** 반영 확인 시트의 한 줄: '상품명: 이전 → 새' */
const TONES = {
  now: { bg: "#E9F5EE", fg: "#1F7A3A" },
  new: { bg: "#F2F6FE", fg: CHANGED },
  consent: { bg: "#FDECEA", fg: tokens.color.error },
  admin: { bg: "#FFF3E8", fg: tokens.color.accent },
};
// 숫자 값(가격·박스·날짜)은 오른쪽 맞춤·고정폭 숫자로 줄을 맞춘다
const NUMERIC = /^[\d,.~\s]+(원|박스|장|°Bx)?$|^\d{2}\.\d{2}~\d{2}\.\d{2}$/;
/** 반영 확인 시트의 전·후 표(PM 11/18): 항목 | 전 | 후. 긴 글은 칸 안에서 두 줄까지 */
function ChangeTable({ rows }: { rows: ChangeRow[] }) {
  // 한 줄의 전·후 중 하나라도 숫자면 둘 다 오른쪽 맞춤('—'·'무료'도 숫자 줄에 맞춘다)
  const cell = (value: string | null, old: boolean, numeric: boolean) => {
    return (
      <T
        variant="sub"
        numberOfLines={2}
        color={old ? tokens.color.textMuted : tokens.color.text}
        weight={old ? "regular" : "semibold"}
        style={{
          flex: 1,
          textAlign: numeric ? "right" : "left",
          fontVariant: ["tabular-nums"],
          ...(old && value ? { textDecorationLine: "line-through", textDecorationColor: tokens.color.border } : {}),
        }}
      >
        {value ?? "—"}
      </T>
    );
  };
  return (
    <View accessibilityRole="list">
      <View style={{ flexDirection: "row", gap: 8, paddingBottom: 4 }}>
        {["항목", "전", "후"].map((h, i) => (
          <T key={h} variant="caption" muted style={{ flex: i === 0 ? 1.3 : 1, textAlign: i === 0 ? "left" : "right" }}>
            {h}
          </T>
        ))}
      </View>
      {rows.map((r, i) => (
        <View
          // 같은 이름 줄이 둘일 수 있어(예: 대표사진) 순서로 구분한다
          key={`${i}-${r.label}`}
          accessibilityRole="text"
          accessibilityLabel={`${r.label}, ${r.before ?? "없음"}에서 ${r.after ?? "없음"}으로`}
          style={{ flexDirection: "row", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: tokens.color.border, alignItems: "flex-start" }}
        >
          <T variant="sub" numberOfLines={2} style={{ flex: 1.3 }}>
            {r.label}
          </T>
          {cell(r.before, true, NUMERIC.test(r.before ?? "") || NUMERIC.test(r.after ?? ""))}
          {cell(r.after, false, NUMERIC.test(r.before ?? "") || NUMERIC.test(r.after ?? ""))}
        </View>
      ))}
    </View>
  );
}
/** 반영 확인 시트의 묶음(저장 방식별, C-8). 줄이 없고 안내도 없으면 그리지 않는다 */
function ChangeGroup({ tag, tone, rows, note }: { tag: string; tone: keyof typeof TONES; rows: ChangeRow[]; note?: string }) {
  if (!rows.length && (tone !== "admin" || !note)) return null;
  return (
    <View testID={`change-group-${tone}`} style={{ borderTopWidth: 1, borderTopColor: tokens.color.border, paddingTop: 12, gap: 6 }}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ backgroundColor: TONES[tone].bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
          <T variant="caption" weight="bold" color={TONES[tone].fg}>{tag}</T>
        </View>
      </View>
      {rows.length ? <ChangeTable rows={rows} /> : null}
      {note ? <T variant="caption" muted>{note}</T> : null}
    </View>
  );
}
/** 로딩 전후 같은 트리에서 기본 정보 훅과 편집 화면을 유지한다. */
function BasicInfo({
  children,
  ...options
}: Parameters<typeof useSourceBasicInfo>[0] & {
  children: (basic: ReturnType<typeof useSourceBasicInfo>) => ReactNode;
}) {
  return <>{children(useSourceBasicInfo(options))}</>;
}
/**
 * 판매페이지 화면(composer) = 상품 수정 한 화면(DEV-184·346·361).
 * `productId`를 주면 자료 작업(batch) 없이 상품만 연다(Mock·자료 분석이 꺼진 서버·composer로 못 옮긴 페이지, DEV-361 C-1).
 */
export function NewProductComposer({ productId: fixedProductId }: { productId?: string } = {}) {
  const scrollRef = useRef<ScrollView>(null);
  useHideTabBar();
  const { toast } = useSession();
  const flushAttachments = useRef<(() => Promise<void>) | null>(null);
  const saveEditor = useRef<
    ((fresh?: SourceReview, name?: string, freshDrafts?: SourceDraft[]) => Promise<boolean>) | null
  >(null);
  const router = useRouter(),
    navigation = useNavigation(),
    { batchId, notice: openNotice, terms: termsParam, from } = useLocalSearchParams<{ batchId?: string; notice?: string; terms?: string; from?: string }>();
  const productOnly = !!fixedProductId;
  const [batch, setBatch] = useState<SourceBatch | null>(null),
    [review, setReview] = useState<SourceReview | null>(null),
    [runs, setRuns] = useState<SourceRun[]>([]),
    [drafts, setDrafts] = useState<SourceDraft[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<SourceActionError | null>(null),
    [notice, setNotice] = useState("");
  // DEV-346: 판매페이지 수정으로 열 때 서버가 다른 화면에서 반영한 페이지로 새로 불러왔다고 알린 경우.
  // 한 번 보이고 주소 값을 지운다(새로고침 때 다시 뜨지 않게).
  useEffect(() => {
    if (openNotice !== "replaced" && openNotice !== "replaced-ai") return;
    setNotice(
      openNotice === "replaced-ai"
        ? "다른 화면에서 반영한 판매페이지로 새로 불러왔어요. 이전 임시 저장과 진행 중이던 AI 작업은 반영되지 않았어요."
        : "다른 화면에서 반영한 판매페이지로 새로 불러왔어요. 이전 임시 저장은 반영되지 않았어요.",
    );
    router.setParams({ notice: undefined });
  }, [openNotice, router]);
  // 반영이 409 PAGE_CHANGED(그 사이 다른 화면에서 판매페이지를 반영함)로 막혔는지: '다시 열기'를 보인다.
  const [pageChanged, setPageChanged] = useState(false);
  const [pendingText, setPendingText] = useState(false);
  const [attachDirty, setAttachDirty] = useState(false),
    [editorDirty, setEditorDirty] = useState(false);
  // DEV-329: 판매페이지에 저장 안 한 수정이 있어도 품종·사이즈·당도 칸을 누르면 그 수정을 먼저 임시 저장하고 바로 입력한다.
  // 기본 정보 저장은 그 저장이 끝난 뒤에만(두 저장이 같은 배치 버전을 다투지 않게).
  // 그 임시 저장 중에는 편집기가 busy를 켜도 기본 정보 칸은 잠그지 않는다(포커스된 칸이 읽기 전용이 되면 키보드가 내려간다).
  const editorSaving = useRef<Promise<boolean> | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const focusedKey = useRef("");
  // blur로 시작한 기본 정보 저장. 판매페이지를 먼저 저장하는 곳은 이것이 끝난 뒤 최신 review로 저장한다.
  const basicSave = useRef<Promise<void> | null>(null);
  // 칸 아래 안내. 원인이 사라지면(AI 작업 끝, 판매페이지 저장됨) 저절로 감춘다.
  const [basicNote, setBasicNote] = useState<{ key: string; kind: "run" | "save" } | null>(null);
  const retryGate = useRetryGate();
  const [validationFields, setValidationFields] = useState<Record<string, string>>({});
  const [footerHeight, setFooterHeight] = useState(100);
  // 상품 초안 PUT의 칸 오류는 `fields.photos`처럼 본문 이름이 붙어 온다. 화면 칸 이름(photos)으로 맞춰 강조한다(5차 scan)
  const showFieldErrors = (fields: Record<string, string> | undefined) =>
    setValidationFields(Object.fromEntries(Object.entries(fields ?? {}).map(([k, v]) => [k.replace(/^fields\./, ""), v])));
  const clearValidation = (key: string) => { if (validationFields[key]) setError(null); setValidationFields(old => { if (!old[key]) return old; const next = { ...old }; delete next[key]; return next; }); };
  const [sheetOpen, setSheetOpen] = useState(false);
  const [buyerPreview, setBuyerPreview] = useState(false);
  const [startError, setStartError] = useState("");
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
    // DEV-341: 표시용 JPEG(긴 변 1600px), 편집기의 같은 사진 요청과 공유. 옮겨 온 사진은 자기 주소(DEV-346)
    void sourcePhotoUrl(batch, cover!, "display")
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
  }, [batch?.id, coverId, coverRevision, cover?.sanitizationVersion]);
  const [product, setProduct] = useState<MyProduct | null>(null),
    [form, setForm] = useState<ProductForm | null>(null);
  // DEV-361: 구매자에게 보이는 상품의 판매 조건(화면 안 초안)과 서버 상품 초안
  const [terms, setTerms] = useState<Terms | null>(null);
  const [draftView, setDraftView] = useState<ProductDraftView | null>(null);
  // draft = 서버 상품 초안, direct = 초안 API가 없는 서버(자료 분석 꺼짐)라 '상품에 반영' 때 바로 PATCH·PUT(C-2)
  const [draftMode, setDraftMode] = useState<"draft" | "direct" | null>(null);
  // 서버에 저장된(또는 불러온) 화면 값. 지금 값과 다르면 저장 안 한 수정이다
  const savedKey = useRef("");
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsEdit, setTermsEdit] = useState<Terms | null>(null);
  const [termsInvalid, setTermsInvalid] = useState<Record<string, string>>({});
  // 반영 확인 시트(C-8)
  const [plan, setPlan] = useState<{
    changes: ChangeRows;
    reservedCount: number;
    page: SourceDraft | null;
    /** '바로 보여요'의 판매페이지·대표사진 줄 */
    pageRows: ChangeRow[];
    status: string;
  } | null>(null);
  const [consent, setConsent] = useState(false);
  // 반영 안 한 수정이 있는 채로 나가려 할 때 보류한 이동(나가기 확인 시트, PM 11/18)
  const [leaving, setLeaving] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  // 나가기 감시는 렌더마다 갱신하는 값을 본다(리스너가 다시 붙기 전에도 최신 값)
  const leaveGuard = useRef({ live: false, unapplied: 0 });
  // 반영했지만 판매 한도를 다 써서 여전히 전체 물량 품절이면 그 한도(g). 한도 늘리기로 안내한다(DEV-345, 예전 SCR-26)
  const [soldOutAfter, setSoldOutAfter] = useState<number | null>(null);
  const [consentInvalid, setConsentInvalid] = useState(false);
  // 처음 연 때의 대표사진·판매페이지 초안(이 화면에서 바뀌었는지 보는 기준, C-9)
  const coverBase = useRef<string | null | undefined>(undefined);
  const pageBase = useRef<string | null | undefined>(undefined);
  // 생산자가 손댄 칸은 AI가 다시 채우지 않는다.
  const touched = useRef(new Set<keyof ProductForm>());
  const brixEdited = useRef(false);
  const activeRun = runs.find((r) => ACTIVE.includes(r.status));
  // 칸 아래 안내는 원인이 사라지면 지운다(같은 조건이 다시 생겨도 예전 안내가 되살아나지 않게).
  useEffect(() => {
    if ((basicNote?.kind === "save" && !editorDirty) || (basicNote?.kind === "run" && !activeRun))
      setBasicNote(null);
  }, [basicNote, editorDirty, activeRun]);
  const working = !!activeRun && activeRun.status !== "PRIVACY_REVIEW";
  const allowLeave = useRef(false);
  const saveBeforeLeave = useRef<() => Promise<void>>(async () => {});
  const exitSaving = useRef(false);
  const [basicDirty, setBasicDirty] = useState(false);
  const flushBasicInfo = useRef<
    ((required?: boolean) => Promise<void>) | undefined
  >(undefined);
  const target = batch?.targets.length === 1 ? batch.targets[0] : null;
  const productId = target?.productId ?? fixedProductId ?? null;
  // 판매 전(작성 중·반려): 저장하면 바로 상품에. 구매자에게 보이는 상품(판매 중·승인 대기): 상품 초안 → '상품에 반영'.
  // 그 밖(판매 종료): 읽기 전용(결정 10, C-11)
  const preSale = !product || isPreSale(product);
  const live = !!product && isLive(product.status);
  const readOnly = !!product && !preSale && !live;
  const editKey = (f: ProductForm | null, t: Terms | null) => JSON.stringify([f, t ? termsKey(t) : null]);
  const productDirty = live
    ? !!form && editKey(form, terms) !== savedKey.current
    : !!form && !!product && JSON.stringify(form) !== JSON.stringify(toForm(product));
  const dirty = attachDirty || editorDirty || basicDirty || productDirty;
  const keys = live && product && form ? changedKeys(product, form, terms) : [];
  // 상품만 여는 composer의 대표사진은 상품 사진 첫 장(바꾸면 화면 값 photos 맨 앞)
  const productCover = productOnly ? (form?.photos[0] ?? null) : null;
  const [productCoverUrl, setProductCoverUrl] = useState<string | null>(null);
  useEffect(() => {
    setProductCoverUrl(null);
    if (!productCover || !productId) return;
    let alive = true;
    let url = "";
    void productPhotoUrl(productId, productCover)
      .then((u) => {
        url = u;
        if (alive) setProductCoverUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [productId, productCover]);
  // 이 화면에서 대표사진·판매페이지 초안이 바뀌었는지(처음 연 때와 비교). 다른 세션의 수정은 모른다(C-9)
  // 처음 연 뒤 새 대표사진을 올렸다(판매 전·판매 중 모두). 반영 때 맨 앞에 들어가 사진 수가 하나 는다
  const coverReplaced = !productOnly && coverBase.current !== undefined && (coverId ?? null) !== coverBase.current;
  const coverChanged = live && coverReplaced;
  // 사진 10장 상한(PM 11/18, 4차 scan): 반영 뒤 사진 수를 서버 apply_draft와 같은 셈으로 본다.
  // batch: 새 대표사진이 지금 사진에 이미 있으면(쓰던 사진을 대표로) 그대로, 아니면 맨 앞에 한 장 더.
  // 상품만 여는 composer: 새 대표사진을 이미 사진 맨 앞에 넣어 두므로 사진 수 그대로
  const coverUri = cover?.productPhoto?.uri;
  const coverAdds = !productOnly && coverReplaced && !(coverUri && form?.photos.includes(coverUri)) ? 1 : 0;
  const photoOver = Math.max(0, (form?.photos.length ?? 0) + coverAdds - MAX_PHOTOS);
  const photoCapHit = photoOver > 0;
  // An untouched legacy basic-info value must not replace a registered measurement.
  const displayBrix = (input: string) => {
    const value = input.trim() ? Number(input) : null;
    return !brixEdited.current && product?.measuredBrix != null && value === product.expectedBrix
      ? String(product.measuredBrix)
      : input;
  };
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (event) => {
        // 구매자에게 보이는 상품에 반영 안 한 수정이 있으면 나가기 전에 묻는다(PM 11/18, 배너 대신)
        const guard = leaveGuard.current.live && (leaveGuard.current.unapplied > 0 || dirty);
        if (allowLeave.current || !(dirty || busy || guard)) return;
        event.preventDefault();
        if (exitSaving.current) return;
        if (busy || lock.current) { setNotice("저장 중이에요. 잠시 후 다시 나가 주세요."); return; }
        if (guard) {
          setError(null);
          setLeaving(() => event.data.action);
          return;
        }
        exitSaving.current = true;
        lock.current = true;
        setBusy(true);
        void saveBeforeLeave.current().then(() => {
          allowLeave.current = true;
          toast("임시 저장됐어요");
          navigation.dispatch(event.data.action);
        }).catch(error => {
          setError(sourceActionError(error));
          if (error instanceof ApiError && error.status === 400) showFieldErrors(error.details.fields);
          setNotice("임시 저장하지 못했어요. 입력 내용은 남아 있어요. 다시 시도해 주세요.");
        }).finally(() => { exitSaving.current = false; lock.current = false; if (alive.current) setBusy(false); });
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
  // 칸 자동 저장 중에는 편집기 busy가 켜지지만 상품명·원산지·보관 칸도 잠그지 않는다(같은 키보드 문제).
  // 이 칸들은 상품 PATCH 값이라 판매페이지 저장과 버전을 다투지 않는다.
  // 화면 전체 작업(lock: 임시 저장·다음·나가기)이 시작되면 예외를 끈다(그 사이 입력이 저장에서 빠지지 않게).
  const fieldsLocked = busy && !(autoSaving && !lock.current);
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
  const mutate = (fn: () => Promise<void>, starting = false) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setPageChanged(false);
    setValidationFields({});
    if (starting) setStartError("");
    setNotice("");
    void fn()
      .catch((e) => {
        if (alive.current) {
          // 오류 안내 위치·종류만 보낸다(글자 없음, DEV-312). 연결·서버·충돌 실패는 세지 않는다
          if (!isServerTrouble(e))
            track("form_error_shown", { screen: "product_new", code: composerErrorCode(e) });
          if (e instanceof ApiError) {
            const reason = (e.details as { reason?: string }).reason;
            // PHOTO_CHANGED: 다른 곳에서 대표사진이 바뀜 → composer를 다시 연다(PR B 한계, C-10)
            const changed = reason === "PAGE_CHANGED" || reason === "PHOTO_CHANGED";
            setPageChanged(changed);
            if (changed) setPlan(null); // 확인 시트를 닫아 오류 줄의 '다시 열기'가 보이게
            if (reason === "PRODUCT_CHANGED") {
              // 칸 이름 목록(서버 product_draft). 확인 시트를 닫고 위 안내에서 고른다
              const stale = (e.details as { fields?: unknown }).fields;
              setConflicts(Array.isArray(stale) ? stale.map(String) : []);
              setPlan(null);
            } else if (reason === "DELIVERY_CONSENT_REQUIRED") {
              // 그사이 예약자 수가 바뀜: 새 수로 다시 확인받는다
              const count = Number((e.details as { reservedCount?: number }).reservedCount ?? 0);
              // 표도 새 수로 다시 만든다: 예약자가 있으면 '받는 시기'는 예약자 동의 필요 묶음으로 옮기고 확인 체크를 보인다
              setPlan((old) =>
                old && product && form
                  ? {
                      ...old,
                      reservedCount: count,
                      changes: withServerFallback(diffRows(product, form, terms, count), draftMode === "draft" ? (draftView?.changes ?? null) : null),
                    }
                  : old,
              );
              setConsent(false);
              setConsentInvalid(false);
            } else {
              showFieldErrors(e.details.fields);
              if (Object.keys(e.details.fields ?? {}).length) { setBuyerPreview(false); setSheetOpen(false); setPlan(null); }
            }
          }
          const feedback = sourceActionError(e);
          if (starting) setStartError(feedback.message);
          else setError(feedback);
        }
      })
      .finally(() => {
        lock.current = false;
        if (alive.current) setBusy(false);
      });
  };
  const pickCover = async () => {
    if (!batch || !target || busy || activeRun) return;
    const files = await chooseSourceFiles(true, false).catch(() => {
      setNotice("사진을 선택하지 못했어요. 다시 시도해 주세요.");
      return [];
    });
    if (!files[0]) return;
    mutate(async () => {
      try {
      // 대표 사진 지정(setRepresentative)과 기본 정보 저장도 review 버전을 올린다. 판매페이지 수정을 먼저 저장해야
      // 옛 버전에 묶여 다시는 저장되지 않는 일이 없다(start()와 같은 순서, DEV-329).
      // 자동 저장 중에는 busy라 보통 여기 오지 않는다. 그래도 순서를 보장하려고 기다린다(saveAll과 같음).
      const auto = editorSaving.current;
      const autoOk = auto ? await auto : false;
      if (editorDirty && !autoOk && !(await saveEditorFirst()))
        throw new Error("판매페이지를 저장하지 못해 사진을 바꾸지 않았어요. 판매페이지 위의 안내를 확인해 주세요.");
      await flushBasicInfo.current?.();
      await flushAttachments.current?.();
      const latest = await api.get(batch.id);
      // Pin the previous fallback before adding a new photo, so failed replacement keeps it.
      const previous = latest.sources.find(x => x.originalPhoto && (x.common || x.targetIds.includes(target.id)));
      let version = latest.version;
      if (!latest.targets.find(t => t.id === target.id)?.representativeAssetId && previous?.status === "PREPARED") {
        // 응답의 batch 버전을 바로 쓴다(다시 읽지 않음, DEV-341)
        version = (await api.setRepresentative(batch.id, latest.version, [target.id], previous.id)).version;
      }
      const uploaded = await uploadSource(batch.id, version, [target.id], false, true, files[0]);
      const deadline = Date.now() + 30000;
      while (alive.current) {
        const current = await api.get(batch.id);
        const photo = current.sources.find(x => x.id === uploaded.id);
        if (photo?.status === "PREPARED") {
          await api.setRepresentative(batch.id, current.version, [target.id], uploaded.id);
          clearValidation("representativePhoto");
          clearValidation("photos"); // 대표사진이 바뀌면 사진 상한 판단도 다시(3차 scan)
          await load();
          return;
        }
        if (photo?.status === "FAILED" || Date.now() >= deadline) {
          throw new Error("사진을 준비하지 못했어요. 다시 선택해 주세요.");
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      } catch (e) {
        setNotice("사진을 변경하지 못했어요. 기존 사진은 유지돼요. 다시 선택해 주세요.");
        throw e;
      }
    });
  };
  useEffect(() => {
    void load().catch((e) => {
      if (alive.current) setError(sourceActionError(e));
    });
  }, [load]);
  // 처음 불러온 대표사진·최신 판매페이지 초안을 기준으로 둔다(C-9)
  useEffect(() => {
    if (!batch || !review || coverBase.current !== undefined) return;
    coverBase.current = coverId ?? null;
    const d = target && drafts.find((x) => x.targetId === target.id && isFresh(x, review.reviewVersion, batch.version));
    pageBase.current = d ? `${d.id}:${d.version}` : null;
  }, [batch, review, drafts, coverId, target]);
  // 판매·가격(SCR-24b)에서 돌아오면 버전·값이 바뀌었을 수 있어 다시 읽는다. 고치던 칸이 있으면 덮지 않는다.
  // 구매자에게 보이는 상품은 서버 상품 초안도 읽어 화면 값에 덮는다(DEV-361 C-7). force = 반영·버리기 뒤처럼 덮어야 할 때
  const productDirtyRef = useRef(false);
  productDirtyRef.current = productDirty;
  const reloadProduct = useCallback(async (force = false) => {
    if (!productId) return;
    const p = await catalog.myProduct(productId);
    let view: ProductDraftView | null = null;
    if (isLive(p.status))
      view = await productWorkspace.productDraft(productId).catch((e) => {
        // 자료 분석이 꺼진 서버는 초안 API가 404다 → 바로 반영 방식(C-2). workspace를 열지 못한 경우(예전 서버가 composer
        // 열기를 400으로 거절)도 초안을 둘 곳이 없어 같은 방식이다
        if (e instanceof ApiError && (e.status === 404 || (e.status === 400 && e.details.fields?.productId))) return null;
        throw e;
      });
    if (!alive.current || (!force && productDirtyRef.current)) return;
    const shown = withDraft(p, view?.draft ?? null);
    const f = toForm(shown),
      t = isLive(p.status) || p.status === "CLOSED" ? termsFrom(shown) : null;
    setProduct(p);
    setForm(f);
    setTerms(t);
    setDraftView(view);
    setDraftMode(isLive(p.status) ? (view ? "draft" : "direct") : null);
    setConflicts(view?.conflicts ?? []);
    savedKey.current = editKey(f, t);
  }, [productId]);
  // `?terms=1`(예전 기간·가격 주소, 품절 안내): 판매 조건 시트를 연다. 판매 전 상품은 판매·가격으로(C-13)
  const termsHandled = useRef(false);
  useEffect(() => {
    if (termsParam !== "1" || !product || !terms && !isPreSale(product) || termsHandled.current) return;
    termsHandled.current = true;
    router.setParams({ terms: undefined });
    if (isPreSale(product)) {
      allowLeave.current = true;
      router.push({ pathname: "/products/[id]/sell", params: { id: product.productId, from: "composer" } });
    } else if (terms) {
      setTermsEdit(terms);
      setTermsInvalid({});
      setTermsOpen(true);
    }
  }, [termsParam, product, terms, router]);
  useFocusEffect(
    useCallback(() => {
      allowLeave.current = false;
      void reloadProduct().catch((e) => {
        if (alive.current) setError(sourceActionError(e));
      });
    }, [reloadProduct]),
  );
  // 활성 분석이 끝날 때까지 배치와 실행 상태를 함께 갱신한다.
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
          if (alive.current) setError(sourceActionError(e));
        });
    }, 2500);
    return () => clearInterval(timer);
  }, [batchId, runs, load]);
  // DEV-312 PostHog: 편집기 열림(상품마다 이 화면에서 한 번), AI 채우기 요청과 끝. 글자는 보내지 않는다.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!productId || openedFor.current === productId) return;
    openedFor.current = productId;
    track("product_editor_opened", { flow: "source", productId });
  }, [productId]);
  // 이 화면에서 받아들여진 요청의 run만 끝을 기다린다. 처음 불러온, 이미 끝난 run은 보내지 않는다.
  const waiting = useRef<{ runId: string; at: number; productId?: string } | null>(null);
  const requested = (runId: string, trigger: "start" | "retry") => {
    const pid = productId ?? undefined;
    track("draft_requested", { flow: "source", trigger, productId: pid });
    waiting.current = { runId, at: Date.now(), productId: pid };
  };
  useEffect(() => {
    const w = waiting.current;
    const r = w && runs.find((x) => x.id === w.runId);
    const result = r ? draftResult(r.status) : null;
    if (!w || !result) return;
    waiting.current = null;
    track("draft_created", {
      flow: "source",
      result,
      durationMs: Date.now() - w.at,
      productId: w.productId,
    });
  }, [runs]);
  // 분석 결과의 상품명·보관 방법을 아직 기본값인 칸에만 채운다(가격은 채우지 않음, AC-03-1).
  useEffect(() => {
    if (!review || !target || !product || !isPreSale(product)) return;
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
      return filled.length ? next : old;
    });
  }, [review, target, product]);
  const setField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => {
    touched.current.add(k);
    setForm((f) => (f ? { ...f, [k]: v } : f));
  };
  // 품종·측정 당도는 AI 입력용 기본 정보(batch)에 쓰고, 상품에도 같은 값을 넣는다.
  // 판매 전 상품만 부른다(구매자에게 보이는 상품은 상품 초안, DEV-361). 상품만 여는 composer는 화면 칸 값을 쓴다.
  const saveProduct = async () => {
    if (!productId || !product || !form) return;
    const latest = target ? (await api.get(batch!.id)).targets[0] : null;
    // 기본 정보에서 지운 측정 당도(null)도 그대로 상품에 반영한다.
    const variety = latest
        ? (latest.basicInfo?.variety ?? "")
        : productOnly ? form.variety : product.variety,
      brix = latest
        ? (latest.basicInfo?.expectedBrix ?? null)
        : productOnly ? brixValue(form.brix) : product.expectedBrix;
    const base = toForm(product);
    const body: ProductPatch = { version: product.version };
    if (form.name !== base.name) body.name = form.name;
    if (form.origin !== base.origin || form.storage !== base.storage)
      body.info = { origin: form.origin, storage: form.storage };
    if (JSON.stringify(form.options) !== JSON.stringify(base.options))
      body.options = form.options;
    if (JSON.stringify(form.photos) !== JSON.stringify(base.photos)) body.photos = form.photos;
    if (form.grade !== base.grade) body.grade = form.grade;
    if (variety && variety !== product.variety) body.variety = variety;
    if (brix !== product.expectedBrix) body.expectedBrix = brix;
    if (
      (brixEdited.current || brix !== product.expectedBrix || product.measuredBrix == null) &&
      brix !== product.measuredBrix
    ) body.measuredBrix = brix;
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
  /** 구매자에게 보이는 상품: 상품 칸·판매 조건을 비공개 상품 초안에 저장(C-7). rebase = 확인한 충돌 칸 */
  const saveDraft = async (rebase?: string[]): Promise<ProductDraftView | null> => {
    if (!productId || !product || !form || !terms || draftMode !== "draft" || !draftView) return draftView;
    const key = editKey(form, terms);
    if (key === savedKey.current && !rebase?.length) return draftView;
    const { fields, stages } = draftBody(product, form, terms);
    // stages를 빼면 서버가 초안의 기간 변경을 지운다(그래서 바뀌지 않았으면 빼는 게 맞다)
    const view = await productWorkspace.saveProductDraft(
      productId,
      draftView.version,
      fields,
      stages,
      keyFor("product-draft", [draftView.version, fields, stages, rebase]),
      rebase,
    );
    if (!alive.current) return view;
    setDraftView(view);
    setConflicts(view.conflicts);
    savedKey.current = key;
    return view;
  };
  const canEdit = canEditBatch(batch, runs, drafts, review, activeRun);
  // 저장하지 않은 상세 수정이 있으면 편집기를 내리지 않는다(첨부를 바꿔도 수정이 사라지지 않게).
  const showEditor = !!review && !working && (canEdit || editorDirty);
  /** 화면의 모든 입력을 비공개로 저장한다(판매 전 상품은 상품 칸을 바로 상품에). 구매자에게 보이는 상품은 상품 초안 결과를 돌려준다 */
  const saveAll = async (): Promise<ProductDraftView | null> => {
    // 상품만 여는 composer는 새 대표사진을 사진 맨 앞에 넣어 두어 10장을 넘을 수 있다. 서버에 보내기 전에 같은 문구로 막는다(5차 scan)
    if (form && form.photos.length > MAX_PHOTOS) {
      const message = photoCapMessage(form.photos.length - MAX_PHOTOS);
      throw new ApiError(400, { code: "VALIDATION_ERROR", message, details: { fields: { photos: message } } });
    }
    await flushAttachments.current?.();
    // 판매페이지 수정을 기본 정보보다 먼저 저장한다(start()와 같은 순서). 기본 정보 저장이 배치 버전을 올리면
    // 수정 중인 편집기는 옛 버전으로 저장하다 거절되기 때문이다(DEV-184·329).
    // 자동 임시 저장 중에는 busy로 버튼·나가기가 막혀 보통 비어 있다. 그래도 순서를 보장하려고 기다린다.
    const autoSave = editorSaving.current;
    const autoSaved = autoSave ? await autoSave : false;
    if (editorDirty && !autoSaved && !(await saveEditorFirst()))
      throw new Error(
        "판매페이지를 저장하지 못했어요. 판매페이지 위의 안내를 확인해 주세요.",
      );
    await flushBasicInfo.current?.();
    // 판매 전 상품은 상품에 바로 저장, 구매자에게 보이는 상품은 비공개 상품 초안(DEV-361 C-7)
    let view: ProductDraftView | null = null;
    if (preSale) await saveProduct();
    else if (live) view = await saveDraft();
    if (!review || !showEditor || !target) return view;
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
    // 구매자에게 보이는 상품은 맞추지 않는다(DEV-346): 옮겨 온 페이지의 제목을 손대지 않고 반영해도 그대로 두고,
    // 다시 저장해 금액·효능 검사로 막히지 않게. 상품명은 상품 칸으로 반영된다(C-21).
    const name =
      preSale && form && !DEFAULT_NAMES.includes(form.name.trim()) ? form.name.trim() : "";
    const nameDiffers =
      !!name &&
      r.editorFields.some(
        (e) =>
          e.field.targetId === target.id &&
          e.field.fieldKey === "name" &&
          e.field.state !== "EXCLUDED" &&
          e.field.value !== name,
      );
    // 위에서 이미 저장했더라도 기본 정보 저장이 버전을 올렸으면(!fresh) 한 번 더 저장한다. 그 사이 await(api.get 등)로
    // 편집기가 다시 렌더링돼 saveRef의 busy·dirty가 갱신된 뒤라 새 서버 값으로 저장된다.
    if (!fresh || nameDiffers) {
      const ok = await saveEditor.current?.(r, name || undefined, ds.items);
      if (ok === false)
        throw new Error(
          "상세페이지를 저장하지 못했어요. 상세페이지 위의 안내를 확인해 주세요.",
        );
    }
    return view;
  };
  /** 진행 중인 기본 정보 저장을 기다린 뒤, 최신 review를 넘겨 판매페이지 수정을 저장한다(편집기가 새 버전으로 옮겨 저장). */
  const saveEditorFirst = async () => {
    await basicSave.current;
    const [latest, ds] = await Promise.all([api.review(batch!.id), api.drafts(batch!.id)]);
    return (await saveEditor.current?.(latest, undefined, ds.items)) !== false;
  };
  saveBeforeLeave.current = async () => {
    await saveAll();
  };
  const noteText =
    basicNote?.kind === "run"
      ? activeRun
        ? activeRun.status === "PRIVACY_REVIEW"
          ? "이전 분석을 취소하면 입력할 수 있어요"
          : "AI 작업이 끝나면 입력할 수 있어요"
        : ""
      : basicNote?.kind === "save" && editorDirty
        // 이미 포커스된 칸은 다시 눌러도 재시도가 안 되므로, 실제로 저장되는 길(‘임시 저장’)을 안내한다.
        ? basicNote.key === "sheetVariety"
          ? "판매페이지를 저장하지 못했어요. ‘AI로 채우기’를 누르면 먼저 저장해요"
          : "판매페이지를 저장하지 못했어요. ‘임시 저장’을 눌러 주세요"
        : "";
  // 컴포넌트가 아니라 함수로 부른다(렌더마다 새 컴포넌트가 되면 alert가 다시 마운트돼 화면 읽기가 반복된다).
  const basicNoteFor = (key: string) =>
    basicNote?.key === key && noteText ? (
      <View accessibilityRole="alert">
        <T variant="caption" color={tokens.color.error}>{noteText}</T>
      </View>
    ) : null;
  /** 기본 정보 칸을 누르면: 판매페이지에 저장 안 한 수정이 있으면 먼저 임시 저장한다(DEV-329). */
  const focusBasic = (key: string) => {
    focusedKey.current = key;
    setBasicNote(null);
    if (activeRun) {
      setBasicNote({ key, kind: "run" });
      return;
    }
    // 화면 전체 작업(임시 저장·다음·나가기) 중에는 따로 저장을 시작하지 않는다(같은 배치 버전을 다투지 않게).
    if (lock.current || (busy && !autoSaving)) return;
    if (editorDirty && !editorSaving.current && saveEditor.current) {
      setAutoSaving(true);
      // 실패 안내는 저장이 끝날 때 입력 중인 칸 아래에 띄운다(그 사이 다른 칸으로 옮겼을 수 있다).
      // 진행 중인 기본 정보 저장을 기다리고 최신 review로 저장한다(saveEditorFirst와 같은 순서)
      const task = saveEditorFirst().then((ok) => {
        if (!ok) setBasicNote({ key: focusedKey.current, kind: "save" });
        return ok;
      }, () => {
        setBasicNote({ key: focusedKey.current, kind: "save" });
        return false;
      }).finally(() => {
        editorSaving.current = null;
        if (alive.current) setAutoSaving(false);
      });
      editorSaving.current = task;
    }
  };
  // 기본 정보 저장은 review 버전을 올리지만, 편집기는 서버 편집 값이 그대로면 수정을 새 버전으로 옮긴다
  // (SourceDetailsEditor). 그래서 그동안 판매페이지 편집기를 잠그지 않는다(잠그면 그쪽 키보드가 내려간다).
  const saveBasic = () => {
    basicSave.current = flushBasicInfo.current?.().catch(() => {}) ?? null;
  };
  /** 판매페이지 임시 저장이 끝난 뒤에 기본 정보를 저장한다. 실패하면 입력은 남기고 다음 저장 때 함께 저장한다. */
  const blurBasic = () => {
    const saving = editorSaving.current;
    if (saving) void saving.then((ok) => { if (ok) saveBasic(); });
    else if (!editorDirty) saveBasic();
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
    goNext();
  };
  /** 이 화면이 아직 반영하지 않은 최신 판매페이지 초안(C-9). 판매페이지가 바뀌었는데 초안이 낡았으면 멈춘다 */
  const pendingPage = async (): Promise<SourceDraft | null> => {
    if (!batch || !target || !productId) return null;
    const [ds, r, b] = await Promise.all([api.drafts(batch.id), api.review(batch.id), api.get(batch.id)]);
    const d = ds.items.find((x) => x.targetId === target.id && isFresh(x, r.reviewVersion, b.version));
    if (!d) {
      // 판매 전 '다음'과 같은 판정: 분석·초안이 있는데 최신 초안이 없으면 멈춘다
      if (ds.items.length || runs.some((x) => x.status !== "CANCELLED"))
        throw new Error("상세페이지가 지금 사진·자료와 맞지 않아요. AI로 다시 채우거나 임시 저장한 뒤 다시 눌러 주세요.");
      return null;
    }
    const id = `${d.id}:${d.version}`;
    return applied.current === id || readApplied(productId) === id ? null : d;
  };
  /** 구매자에게 보이는 상품 '상품에 반영 (N)': 저장 → 반영 확인 시트(C-8). 빈 필수 칸은 누르면 강조(C-19) */
  const openApply = () =>
    mutate(async () => {
      if (!productId || !product || !form || !terms) return;
      setSoldOutAfter(null);
      const missing: Record<string, string> = {};
      if (!form.name.trim()) missing.name = "상품명을 적어 주세요.";
      if (!form.origin.trim()) missing.origin = "원산지를 적어 주세요.";
      if (!form.variety.trim()) missing["품종명"] = "품종명을 적어 주세요.";
      if (!form.storage.trim()) missing["보관"] = "보관 방법을 적어 주세요.";
      // 새 대표사진이 반영 때 맨 앞에 들어가 합계가 10장을 넘으면 막는다(서버도 400으로 거절)
      if (photoCapHit) missing.photos = photoCapMessage(photoOver);
      if (Object.keys(missing).length)
        throw new ApiError(400, { code: "VALIDATION_ERROR", message: Object.values(missing)[0], details: { fields: missing } });
      if (conflicts.length) throw new Error("다른 곳에서 바뀐 칸을 먼저 확인해 주세요.");
      const view = await saveAll();
      const page = await pendingPage();
      const direct = draftMode !== "draft";
      const reservedCount = direct ? product.reservedCount : (view ?? draftView)!.reservedCount;
      // 표는 화면 값과 지금 상품의 차이로 만든다(PM 11/18). 계산할 수 없는 칸만 서버 미리보기 요약을 쓴다
      const changes = withServerFallback(
        diffRows(product, form, terms, reservedCount),
        direct ? null : (view ?? draftView)!.changes,
      );
      const fieldChanges = changes.now.length + changes.newOrders.length + changes.consent.length;
      if (!page && !fieldChanges) {
        setNotice("반영할 수정이 없어요.");
        return;
      }
      // 판매페이지 줄은 이 화면에서 바꾼 것이 있을 때만. 다른 세션에서 저장했을지 모르는 초안만 있으면 다시 반영한다고 알린다(C-9)
      const pageRows: ChangeRow[] = [
        ...(coverChanged ? [{ label: "대표사진", before: "이전 사진", after: "새 사진" }] : []),
        ...(pageEdited
          ? [{ label: "판매페이지 상세", before: null, after: "고친 내용" }]
          : page && !fieldChanges && !coverChanged
            ? [{ label: "판매페이지 상세", before: null, after: "지금 내용으로 다시 반영" }]
            : []),
      ];
      setConsent(false);
      setConsentInvalid(false);
      setPlan({ changes, reservedCount, page, pageRows, status: product.status });
    });
  /** 자료 분석이 꺼진 서버(초안 API 없음): 예전 SCR-25·26 엔드포인트로 바로 반영(C-2) */
  const applyDirect = async () => {
    if (!productId || !product || !form || !terms) return;
    const { fields, stages } = draftBody(product, form, terms);
    let version = product.version;
    if (Object.keys(fields).length) {
      const body = { ...fields, version } as ProductPatch;
      version = (await catalog.update(productId, body, keyFor("direct", body))).version;
    }
    if (stages) {
      // draftBody가 지금 상품에 없는 기간 ID를 이미 뺐다(새 기간은 ID 없이)
      const input = stages.map(({ stageId, ...rest }) => ({ ...(stageId ? { stageId } : {}), ...rest }));
      await catalog.putStages(productId, input, version, keyFor("direct-stages", [input, version]));
    }
  };
  /** 반영 확인 시트 '반영하기'. R-21 확인 체크도 버튼을 끄지 않고 누르면 강조한다(C-19) */
  const confirmApply = () => {
    if (!plan || !productId) return;
    if (plan.changes.consent.length && !consent) {
      setConsentInvalid(true);
      return;
    }
    const c = plan;
    mutate(async () => {
      if (draftMode === "draft") {
        const body = {
          version: draftView!.version,
          ...(c.page ? { page: { draftId: c.page.id, draftVersion: c.page.version } } : {}),
          ...(c.changes.consent.length ? { confirmDeliveryChange: true, confirmedReservedCount: c.reservedCount } : {}),
        };
        await productWorkspace.applyAll(productId, body, keyFor("apply-all", body));
      } else await applyDirect(); // 바로 반영 방식은 상품만 여는 composer에서만 생긴다(batch 판매페이지 초안 없음)
      if (c.page) {
        const id = `${c.page.id}:${c.page.version}`;
        applied.current = id;
        writeApplied(productId, id);
        pageBase.current = id;
      }
      coverBase.current = coverId ?? null;
      pending.current.clear();
      setPlan(null);
      await Promise.all([load(), reloadProduct(true)]);
      const after = await catalog.myProduct(productId).catch(() => null);
      setSoldOutAfter(after?.status === "PUBLISHED" && after.availability === "TOTAL_SOLD_OUT" ? after.salesLimitGrams : null);
      toast("상품에 반영했어요");
    });
  };
  /** 충돌 안내(C-10) '내 수정으로 반영하기': 바뀐 칸을 확인했으니 지금 값을 새 기준으로 다시 저장 */
  const keepMine = () =>
    mutate(async () => {
      await saveDraft(conflicts);
    });
  const discardDraft = () =>
    mutate(async () => {
      if (!productId || !draftView) return;
      await productWorkspace.discardProductDraft(productId, draftView.version);
      await reloadProduct(true);
      setNotice("반영 안 한 수정을 버렸어요.");
    });
  /** 상품만 여는 composer의 대표사진: 새 사진을 올려 상품 사진 맨 앞에(C-1) */
  const pickProductPhoto = async () => {
    if (!form || busy) return;
    const [picked] = await pickMedia({ multiple: false });
    if (!picked) return;
    if (!picked.ok) {
      setNotice(picked.reason);
      return;
    }
    clearValidation("representativePhoto");
    clearValidation("photos");
    // 잘라 내지 않는다(4차 scan): 10장을 넘으면 사진 줄 안내와 '상품에 반영'·'다음' 강조로 생산자가 뺄 사진을 고른다
    setField("photos", [picked.uri, ...form.photos.filter((u) => u !== picked.uri)]);
  };
  // 판매 전 상품의 ② 판매·가격(SCR-24b). 그 화면의 '판매페이지에서 채우기'가 뒤로 돌아오게 from=composer
  const goNext = () => {
    if (!productId) return;
    allowLeave.current = true;
    router.push({ pathname: "/products/[id]/sell", params: { id: productId, from: "composer" } });
  };
  const hasPhoto = !!batch?.sources.some(
    (s) => s.originalPhoto && s.status === "PREPARED",
  );
  // 화면 맨 위 대표사진: batch composer는 자료 작업 대표사진(고를 수 있음), 상품만 여는 composer는 상품 사진 첫 장(C-1).
  const shownCover = productOnly ? productCoverUrl : coverUrl;
  const coverPresent = productOnly ? !!productCover : hasPhoto && !coverFailed;
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
      // 다른 판매페이지 저장과 같은 순서(자동 저장 대기 → 기본 정보 저장 대기 → 최신 review·drafts로 저장)
      const auto = editorSaving.current;
      const autoOk = auto ? await auto : false;
      if (editorDirty && !autoOk && !(await saveEditorFirst()))
        throw new Error(
          "고친 상세페이지를 저장하지 못해 AI로 다시 채우지 않았어요. 위 안내를 확인해 주세요.",
        );
      await flushAttachments.current?.();
      await flushBasicInfo.current?.(true);
      const latest = await api.get(batch.id);
      const started = await api.start(
        batch.id,
        latest.version,
        keyFor("start", [latest.version, {}]),
        {},
      );
      requested(started.id, "start");
      pending.current.clear();
      setSheetOpen(false);
      await load();
    }, true);
  const run = runs[0];
  const runPanel = run ? (
    <View key={run.id} style={panel}>
      {working && batch && sheetOpen ? <SourceRunProgress batch={batch} run={run} /> : null}
      <T>
        {run.status === "SUCCEEDED"
          ? "AI가 다 채웠어요. 위에서 확인하고 고쳐 주세요."
          : run.status === "PARTIAL"
            ? "일부 내용을 채우지 못했어요. 다시 시도해 주세요."
            : run.status === "PRIVACY_REVIEW"
              ? "이전 분석을 취소한 뒤 다시 시작해 주세요"
              : (states[run.status] ?? run.status)}
        {run.mode === "mock" ? " · 테스트 결과" : ""}
      </T>
      {/* 파일마다 안내(예전 2탭 화면에서 옮김, DEV-361 PR C): 읽지 못한 쪽·건너뛴 쪽·비어 있는 이유·오류 */}
      {run.items.flatMap((item) =>
        sourceNotices(item).map((note, index) => (
          <T key={`${item.id}-note-${index}`} variant="caption">
            {item.phase !== "REFINE" ? `${batch?.sources.find((s) => s.id === item.assetId)?.filename}: ` : ""}
            {note}
          </T>
        )),
      )}
      {run.items
        .filter(
          (i) =>
            i.error &&
            !(i.status === "PARTIAL" && ((i.pagesFailed ?? 0) > 0 || (i.chunksFailed ?? 0) > 0)) &&
            (i.phase !== "REFINE" || i.status === "FAILED"),
        )
        .map((i) => (
          <T key={i.id} variant="caption">
            {i.phase !== "REFINE" ? `${batch?.sources.find((s) => s.id === i.assetId)?.filename}: ` : ""}
            {sourceError(i.error!, i.phase, i.status === "PARTIAL" ? i.rejectedCount : 0)}
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
          <Button
            label="재시도"
            variant="outline"
            disabled={
              busy || !!activeRun || retryGate.cooling
            }
            onPress={() =>
              mutate(async () => {
                if (!retryGate.enter()) return;
                const ids = run.items
                  .filter((i) => ["FAILED", "PARTIAL"].includes(i.status))
                  .map((i) => i.id);
                const retried = await api.retry(
                  batch!.id,
                  run.id,
                  ids,
                  true,
                  keyFor("retry", [run.id, ids]),
                );
                requested(retried.id, "retry");
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
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
      <Icon name="alert" size={18} color={tokens.color.error} />
      <T variant="caption" color={tokens.color.error} style={{ flex: 1 }}>{error.message}</T>
      {pageChanged && productId ? (
        <Button
          label="다시 열기"
          variant="text"
          compact
          disabled={busy}
          // 판매페이지 수정으로 다시 열어 서버가 지금 페이지로 새로 불러오게 한다(DEV-346)
          onPress={() => {
            allowLeave.current = true;
            router.replace(`/products/${productId}/detail`);
          }}
        />
      ) : error.canRefresh ? (
        <Button
          label="다시 확인"
          variant="text"
          compact
          disabled={busy}
          // 상품을 못 불러온 경우도 여기서 다시 시도한다(채우기 화면은 상품이 있어야 그려진다).
          onPress={() =>
            mutate(async () => {
              await Promise.all([load(), reloadProduct()]);
            })
          }
        />
      ) : null}
    </View>
  ) : null;
  const top = useCollapsingTop();
  // 오류는 한 곳에만(4차 scan): 하단 바(상품만 여는 composer·판매 종료)나 batch 시트가 보이면 그쪽, 아니면 위
  const topError = !batch && !(!buyerPreview && (productOnly || readOnly));
  // 위쪽 줄에 둘 것이 있을 때만. 미리보기에서는 구매자 화면 그대로라 단계 표시·판매 종료 안내도 숨긴다(C-32)
  const hasTop = !buyerPreview && !!product && (preSale || readOnly);
  // 구매자에게 보이는 상품의 상품명을 지우는 중이면 지금 상품명을 머리에 둔다('새 상품'으로 보이지 않게)
  const title =
    form && !DEFAULT_NAMES.includes(form.name.trim()) ? form.name : product && !preSale ? product.name : "새 상품";
  /** 판매 전 '다음: 판매·가격': 판매페이지 초안을 반영하고 ②로(확인 없음, 구매자에게 안 보임). 대표사진이 없으면 누르면 강조 */
  const nextPreSale = () =>
    mutate(async () => {
      if (!productId || !form) return;
      // 판매 시작에 필요한 상품 정보(서버 missing_fields 중 이 화면 칸). 버튼은 끄지 않고 누르면 첫 빈 칸을 강조한다(C-19·C-23)
      await flushBasicInfo.current?.();
      const variety = batch && target ? ((await api.get(batch.id)).targets.find((t) => t.id === target.id)?.basicInfo?.variety ?? "") : form.variety;
      const missing: Record<string, string> = {};
      if (DEFAULT_NAMES.includes(form.name.trim())) missing.name = "상품명을 적어 주세요.";
      if (!form.origin.trim()) missing.origin = "원산지를 적어 주세요.";
      if (!variety.trim()) missing["품종명"] = "품종명을 적어 주세요.";
      if (!form.storage.trim()) missing["보관"] = "보관 방법을 적어 주세요.";
      // 판매 전도 '다음'이 판매페이지를 반영하며 새 대표사진을 맨 앞에 넣는다(사진 10장 상한, 서버도 거절)
      if (photoCapHit) missing.photos = photoCapMessage(photoOver);
      if (Object.keys(missing).length)
        throw new ApiError(400, { code: "VALIDATION_ERROR", message: Object.values(missing)[0], details: { fields: missing } });
      if (!batch || !target) {
        // 상품만 여는 composer: 상품 칸만 저장하고 넘어간다
        await saveAll();
        return goNext();
      }
      const photoBatch = await api.get(batch.id);
      const photoTarget = photoBatch.targets.find(t => t.id === target.id);
      const photo = photoBatch.sources.find(source => source.id === photoTarget?.representativeAssetId)
        ?? photoBatch.sources.find(source => source.originalPhoto && (source.common || source.targetIds.includes(target.id)));
      if (!photo || !photo.originalPhoto || photo.status !== "PREPARED")
        throw new ApiError(400, { code: "VALIDATION_ERROR", message: "대표사진을 추가해 주세요.", details: { fields: { representativePhoto: "대표사진을 한 장 올려 주세요." } } });
      await saveAll();
      const [ds, r, b] = await Promise.all([
        api.drafts(batch.id),
        api.review(batch.id),
        api.get(batch.id),
      ]);
      let d = ds.items.find(
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
        // A manual photo-only draft follows the same apply path without an AI run.
        const fields: SourceField[] = r.editorFields.map(entry => entry.field);
        for (const [fieldKey, value, photoAssetIds] of [
          ["name", form?.name ?? "", []],
          ["hero", "", []],
        ] as [string, string, string[]][]) {
          const replacement: SourceField = { targetId: target.id, fieldKey, value, photoAssetIds, state: "CONFIRMED", provenance: "PRODUCER", candidateIds: [], illustrationId: null };
          const index = fields.findIndex(field => field.targetId === target.id && field.fieldKey === fieldKey);
          if (index < 0) fields.push(replacement); else fields[index] = replacement;
        }
        const saved = await api.saveEditor(batch.id, r.reviewVersion, fields, [{ targetId: target.id, enabledModuleIds: ["hero"] }], keyFor("manual-cover", [r.reviewVersion, photo?.id, form?.name]));
        d = saved.drafts.find(draft => draft.targetId === target.id);
        if (!d) throw new Error("상품사진을 저장하지 못했어요. 다시 시도해 주세요.");
      }
      const p = await catalog.myProduct(productId);
      // 이미 반영한 초안이면 확인할 것이 없으니 바로 이동한다.
      const key = `${d.id}:${d.version}`;
      if (applied.current === key || readApplied(productId) === key) return goNext();
      await applyDraft({ draft: d, productId, version: p.version });
    });
  const openTerms = () => {
    if (!terms) return;
    setTermsEdit(terms);
    setTermsInvalid({});
    setTermsOpen(true);
  };
  /** 판매 조건 시트 '수정 담기': 화면 안 초안에만(서버 저장은 '임시 저장'·'상품에 반영' 때, C-6). 빈 칸은 누르면 강조(C-19) */
  const takeTerms = () => {
    if (!termsEdit) return;
    const problem = checkTerms(termsEdit);
    if (problem) {
      setTermsInvalid({ [problem.field]: problem.message });
      return;
    }
    setTerms(termsEdit);
    setTermsOpen(false);
  };
  const changed = (key: string) => live && keys.includes(key);
  // 판매페이지(대표사진 포함)는 한 개로 센다(C-5): 저장 안 한 상세 수정, 처음 연 뒤 새로 저장한 판매페이지 초안, 바꾼 대표사진
  const freshPage = (() => {
    if (!batch || !review || !target) return null;
    const d = drafts.find((x) => x.targetId === target.id && isFresh(x, review.reviewVersion, batch.version));
    return d ? `${d.id}:${d.version}` : null;
  })();
  const pageEdited =
    live &&
    !productOnly &&
    pageBase.current !== undefined &&
    (editorDirty || (!!freshPage && freshPage !== pageBase.current && freshPage !== applied.current));
  const unapplied = keys.length + (pageEdited || coverChanged ? 1 : 0);
  leaveGuard.current = { live: live && !readOnly, unapplied };
  /** 나가기 확인 시트에서 고른 뒤 보류한 이동을 이어 간다 */
  const leaveNow = () => {
    const action = leaving;
    setLeaving(null);
    if (!action) return;
    allowLeave.current = true;
    navigation.dispatch(action);
  };
  // 판매 정보 자리(구매자 화면의 받는 시기·옵션 줄). 판매 전은 다음 단계 안내, 그 밖은 초안 값과 '판매 조건 고치기'(C-6)
  const salesBlock = (shown: MyProduct) => {
    if (preSale)
      return (
        <View testID="sales-next-step" style={{ padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", borderColor: "#E9B980", backgroundColor: "#FFF7EB", gap: 4 }}>
          <T weight="semibold">판매 조건은 다음 단계에서 정해요</T>
          <T variant="caption" muted>받는 시기 · 가격 · 박스 수 · 배송비</T>
        </View>
      );
    if (!terms) return undefined;
    const termsChanged = ["options", "deliveryWindow", "maxDelayUntil", "shipping", "remoteAreaFee", "stages"].some(changed);
    const today = shown.stages.find((s) => s.stageId === shown.currentStageId) ?? [...shown.stages].sort((a, b) => a.seq - b.seq)[0];
    const was = product?.stages.find((s) => s.stageId === today?.stageId);
    return (
      <View
        testID="sales-terms-block"
        style={{ padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: termsChanged ? CHANGED : tokens.color.border, backgroundColor: termsChanged ? "#FAFCFF" : undefined, gap: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <T weight="semibold">
              {shown.deliveryWindow ? `${md(shown.deliveryWindow.start)}~${md(shown.deliveryWindow.end)} 도착 예정` : "받는 시기 미정"}
            </T>
            <T variant="caption" muted>
              {shown.shippingFeeType === "FREE" ? "무료배송" : `배송비 ${shown.shippingFee.toLocaleString("ko-KR")}원`}
              {today ? ` · 이 가격은 ${md(today.endsAt)}까지` : ""}
            </T>
          </View>
          <Button label={live ? "판매 조건 고치기" : "판매 조건 보기"} compact variant={live ? "primary" : "outline"} disabled={busy} onPress={openTerms} />
        </View>
        {shown.options.map((o) => {
          const now = today?.options[o.optionId]?.price ?? null;
          const before = was?.options[o.optionId]?.price ?? null;
          return (
            <View key={o.optionId} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderTopWidth: 1, borderTopColor: tokens.color.border }}>
              <T>{o.label}</T>
              <T weight="semibold">
                {live && before != null && now !== before ? (
                  <T variant="caption" muted style={{ textDecorationLine: "line-through" }}>{`${before.toLocaleString("ko-KR")}원 `}</T>
                ) : null}
                {now == null ? "가격 미정" : `${now.toLocaleString("ko-KR")}원`}
              </T>
            </View>
          );
        })}
        {termsChanged ? <ChangedMark text="판매 조건" /> : null}
      </View>
    );
  };
  const mainLabel = preSale ? "다음: 판매·가격" : unapplied ? `상품에 반영 (${unapplied})` : "상품에 반영";
  // 판매 종료 상품은 하단 버튼이 없다. 같은 안내는 위쪽 줄에만 둔다(PM 11/18)
  const footerButtons = readOnly ? null : (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {/* 바로 반영 방식(C-2)은 비공개 저장이 없다 */}
      {live && draftMode === "direct" ? null : (
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
                preSale
                  ? productOnly
                    ? "저장했어요. 구매자에게는 아직 보이지 않아요."
                    : "비공개로 저장했어요. 상품에는 아직 적용되지 않았어요."
                  : "비공개로 저장했어요. '상품에 반영'을 누르기 전까지 구매자 화면은 그대로예요.",
              );
            })
          }
        />
      )}
      <Button
        label={mainLabel}
        accessibilityLabel={mainLabel}
        size="producer"
        disabled={busy || working || !productId || !product || !form}
        style={{ flex: 2 }}
        onPress={preSale ? nextPreSale : openApply}
      />
    </View>
  );
  const render = (basic: ReturnType<typeof useSourceBasicInfo>) => (
    <FieldFeedbackContext.Provider value={{ fields: validationFields, clear: clearValidation }}><Screen>
      <View style={{ zIndex: 1 }}><HeaderBar title={title} onBack={() => goBackOr(router, "/products")}
        rightWidth={96} right={<EditorActions preview={buyerPreview}
          onPreview={() => { setBuyerPreview(!buyerPreview); setSheetOpen(false); }}
          // 상품만 여는 composer(자료 분석 꺼짐·Mock)와 판매 종료 상품은 AI 버튼을 숨긴다(C-1·C-11)
          aiOpen={sheetOpen} onAi={batch && !readOnly ? () => { setBuyerPreview(false); setSheetOpen(!sheetOpen); } : undefined} />} /></View>
      <CollapsingFrame>
      {/* 위쪽 줄(단계 표시·판매 종료 안내)은 대표사진에 붙여 두지 않고 스크롤에 따라 머리 아래로 숨긴다(PM 11/18) */}
      {hasTop ? (
        <CollapsingTop visible={top.visible} scrolled={top.scrolled} onHeight={top.setHeight}>
          {product && preSale ? <PreSaleSteps step={1} /> : null}
          {readOnly ? (
            // 회색 상자 없이 글자만(PM 11/18). 빨간 경고 삼각형은 화면 읽기에서 뺀다(문장이 같은 뜻)
            <View testID="closed-notice" style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 12, gap: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden testID="closed-warning-icon">
                  <Icon name="warning" size={20} color={tokens.color.error} />
                </View>
                <T weight="semibold">판매가 끝난 상품이라 고칠 수 없어요.</T>
              </View>
              <T variant="sub" muted>
                상품명·사진·상세와 판매 조건은 그대로 보여요.
              </T>
            </View>
          ) : null}
        </CollapsingTop>
      ) : null}
      <Scroll bottom={batch && !readOnly ? footerHeight + 24 : 140} onScroll={top.onScroll} scrollRef={scrollRef}>
        {/* 미리보기와 같은 구매자 화면(ProductPageBody)에서 빈 칸만 점선으로, 누르면 그 자리에서 고친다(DEV-184). */}
        {hasTop ? <CollapsingSpacer height={top.height} /> : null}
        {soldOutAfter !== null && live && !buyerPreview ? (
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingVertical: 12 }}>
            <Notice
              title="상품에 반영했어요."
              body={`판매 한도(${(soldOutAfter / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 3 })}kg)를 모두 써서 아직 예약을 받을 수 없어요.`}
              action={
                <Button
                  label="판매 한도 늘리기"
                  compact
                  style={{ marginTop: 8 }}
                  onPress={() => {
                    allowLeave.current = true;
                    // 물량·판매 설정의 품절 안내에서 왔으면 돌아가서 스택이 쌓이지 않게 한다
                    if (from === "sales" && router.canGoBack()) router.back();
                    else if (productId) router.push({ pathname: "/products/[id]/sales", params: { id: productId } });
                  }}
                />
              }
            />
          </View>
        ) : null}
        {conflicts.length && live ? (
          // 대표사진과 붙지 않게 아래에도 여백(PM 11/18)
          <View style={{ paddingHorizontal: tokens.space.gutter, paddingVertical: 12, gap: 8 }}>
            <Notice
              tone="error"
              title={`다른 곳에서 바뀐 칸이 있어요: ${[...new Set(conflicts.map((k) => DRAFT_LABELS[k] ?? k))].join(", ")}`}
              body="내 수정으로 반영할지, 내 수정을 버리고 지금 값을 쓸지 골라 주세요."
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="내 수정으로 반영하기" compact disabled={busy} onPress={keepMine} />
              <Button label="내 수정 버리기" compact variant="outline" disabled={busy} onPress={discardDraft} />
            </View>
          </View>
        ) : null}
        {(topError ? errorPanel : null) || notice ? (
          <View style={{ padding: tokens.space.gutter, gap: 8 }}>
            {topError ? errorPanel : null}
            {notice ? (
              <View accessibilityRole="alert">
                <T>{notice}</T>
              </View>
            ) : null}
          </View>
        ) : null}
        {!batchId && !productOnly ? (
          <View style={{ padding: tokens.space.gutter, gap: 12 }}>
            <T>열 상품을 찾지 못했어요. 상품 목록에서 다시 골라 주세요.</T>
            <Button
              label="상품 목록으로"
              variant="outline"
              onPress={() => router.replace("/products")}
            />
          </View>
        ) : (!productOnly && !batch) || !product || !form || (!productOnly && !target) ? (
          <View style={{ padding: tokens.space.gutter, gap: 12 }}>
            {batch && (!target || !target.productId) ? (
              <>
                {/* 예전 2탭 자료 작업 화면은 지웠다(DEV-361 C-18) */}
                <T variant="caption" muted>
                  이 자료 작업은 더 이상 이 화면에서 열 수 없어요. 상품 목록에서 상품을 골라 &apos;상품 수정&apos;으로 고쳐 주세요.
                </T>
                <Button
                  label="상품 목록으로"
                  variant="outline"
                  onPress={() => router.replace("/products")}
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
          (() => {
              const inputs = (target && basic.inputs[target.id]) || {
                variety: "",
                size: "",
                brix: "",
              };
              // 판매 전 batch composer는 품종·당도를 기본 정보(batch)에, 그 밖은 화면 값(상품 초안·상품)에 쓴다(C-5)
              const fromBasic = preSale && !productOnly;
              const values = fromBasic
                ? { ...inputs, brix: displayBrix(inputs.brix) }
                : { ...inputs, variety: form.variety, brix: form.brix };
              const locked = fieldsLocked || !!activeRun || readOnly;
              const basicField = (
                key: BasicInfoKey,
                label: string,
                placeholder: string,
                maxLength: number,
              ) => (
                <View style={{ gap: 4 }}>
                  <FillInput
                    label={label}
                    value={values[key]}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    editable={!locked}
                    numeric={key === "brix"}
                    changed={changed(key)}
                    onFocus={() => (fromBasic || key === "size" ? focusBasic(key) : undefined)}
                    onChange={(v) => {
                      if (key === "brix") brixEdited.current = true;
                      // 구매자에게 보이는 상품의 품종·당도는 상품 초안 값이다. 배치 기본 정보(AI 입력)는 건드리지 않는다:
                      // 기본 정보 저장이 배치 버전을 올리면 판매페이지 초안이 낡아 반영 때 다시 저장해야 한다
                      if (!fromBasic && key !== "size") setField(key, v);
                      else if (target) basic.change(target.id, key, v);
                    }}
                    onBlur={fromBasic || key === "size" ? blurBasic : undefined}
                  />
                  {basicNoteFor(key)}
                </View>
              );
              // 미리보기용 상품 값(상품 초안·판매 조건을 덮은 값)
              const shown: MyProduct = {
                ...product,
                ...(live && terms
                  ? withDraft(product, {
                      fields: {
                        options: terms.options,
                        deliveryWindow: terms.deliveryWindow,
                        maxDelayUntil: terms.maxDelayUntil,
                        shippingFeeType: terms.shippingFeeType,
                        shippingFee: terms.shippingFeeType === "SEPARATE" ? (terms.shippingFee ?? 0) : 0,
                      },
                      stages: termsStages({ ...terms, rows: terms.rows.map((r) => ({ ...r, options: Object.fromEntries(terms.options.map((o) => [o.optionId, { price: cellOf(r, o.optionId).price ?? 0, quantity: cellOf(r, o.optionId).quantity ?? 0 }])) })) }).map((x) => ({ ...x, stageId: x.stageId ?? null })),
                      savedAt: null,
                    })
                  : {}),
                name: form.name,
                variety: values.variety,
                photos: productOnly ? form.photos : product.photos,
                expectedBrix: values.brix ? Number(values.brix) : null,
                measuredBrix: values.brix ? Number(values.brix) : null,
                info: {
                  ...product.info,
                  origin: form.origin,
                  storage: form.storage,
                  size: values.size || product.info.size,
                },
              };
              const coverEditable = !readOnly && !busy && !activeRun;
              const pressCover = () => (productOnly ? void pickProductPhoto() : void pickCover());
              return (
                <View testID="product-basic-info">
                  <ProductPageBody
                    p={toPageData(shown, farmName, 0)}
                    reference={() => null}
                    slots={{
                      photo: (
                        <FieldFeedback field="representativePhoto">
                          {batch && target ? <View style={buyerPreview ? { display: "none" } : undefined}><SourceExclusions
                            batchId={batch.id}
                            visible={!buyerPreview}
                            products={[{
                              id: target.id,
                              name: form.name || target.name,
                              result: working ? undefined : review?.refinementResults?.[target.id],
                            }]}
                          /></View> : null}
                          {buyerPreview && !validationFields.representativePhoto ? <Photo uri={shownCover} width="100%" height={244} alt="대표사진" /> : shownCover || coverPresent ? (
                            !shownCover ? (
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
                                accessibilityLabel={readOnly ? "대표사진" : "대표 사진 바꾸기"}
                                style={{ borderWidth: 2, borderColor: coverChanged || changed("cover") ? CHANGED : readOnly ? tokens.color.border : "#E9B980", backgroundColor: "#FFF7EB" }}
                                disabled={!coverEditable}
                                onPress={pressCover}
                              >
                                <Photo
                                  uri={shownCover}
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
                              disabled={!coverEditable}
                              onPress={pressCover}
                              style={{
                                minHeight: 48,
                                padding: 12,
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
                              <T weight="semibold">{validationFields.representativePhoto ? "대표사진을 추가해 주세요" : "대표 사진은 나중에 넣어도 돼요"}</T>
                              <T variant="caption" muted>
                                {productOnly ? "눌러서 사진을 골라 주세요." : "AI는 자료만으로 채울 수 있어요. 공개 전에 넣어 주세요."}
                              </T>
                            </Pressable>
                          )}
                          {!buyerPreview && (coverChanged || changed("cover")) ? (
                            <View style={{ paddingHorizontal: tokens.space.gutter, paddingTop: 6 }}>
                              <ChangedMark text="대표사진" />
                            </View>
                          ) : null}
                          {/* 판매 종료 상품은 더 보여 줄 사진이 없으면 빈 안내 줄을 두지 않는다 */}
                          {buyerPreview || (readOnly && form.photos.length <= 1) ? null : (
                            <FieldFeedback field="photos">
                              <ExtraPhotos
                                productId={product.productId}
                                photos={form.photos}
                                editable={!readOnly && !busy}
                                changed={changed("photos")}
                                onChange={(next) => {
                                  // 사진을 빼면 상한 강조를 지운다(3차 scan)
                                  clearValidation("photos");
                                  setField("photos", next);
                                }}
                                onError={setNotice}
                                // 새로 올린 대표사진은 반영 때 맨 앞에 들어가 지금 사진이 한 칸씩 밀린다(서버 publish). 합계 MAX_PHOTOS를 넘지 않게
                                max={MAX_PHOTOS - coverAdds}
                                note={photoCapHit ? photoCapMessage(photoOver) : undefined}
                              />
                            </FieldFeedback>
                          )}
                        </FieldFeedback>
                      ),
                      name: buyerPreview ? <T variant="heading">{form.name}</T> : (
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
                          editable={!fieldsLocked && !readOnly}
                          changed={changed("name")}
                          onChange={(v) => setField("name", v)}
                        />
                      ),
                      origin: buyerPreview ? undefined : (
                        <FillInput
                          label="원산지"
                          value={form.origin}
                          placeholder="원산지를 적어 주세요. 예: 제주 서귀포"
                          maxLength={30}
                          editable={!fieldsLocked && !readOnly}
                          changed={changed("origin")}
                          onChange={(v) => setField("origin", v)}
                        />
                      ),
                      subName: buyerPreview ? undefined : <View style={{ gap: 8 }}>
                        <T variant="caption" muted>품종명</T>
                        {basicField("variety", "품종명", "예: 온주밀감", 100)}
                      </View>,
                      sale: buyerPreview ? (preSale && !product.stages.length ? <></> : undefined) : salesBlock(shown),
                      story: productOnly ? (
                        <View testID="product-detail-page" style={{ gap: 12 }}>
                          {shown.moduleDetail ? (
                            <ModuleStory content={shown.moduleDetail} />
                          ) : (
                            <DetailStory content={shown.detailContent} fallback={shown.description} title="농가 이야기" />
                          )}
                          {!buyerPreview && !readOnly && shown.moduleDetail ? (
                            // 섹션 상세는 예전 블록 편집기(/story)로 고칠 수 없다. 오가며 맴돌지 않게 버튼 대신 안내만(scan-before-merge)
                            <View style={{ paddingHorizontal: tokens.space.gutter }}>
                              <T variant="caption" muted>
                                이 상품의 상세는 자료로 만든 섹션 상세라 이 화면에서는 고칠 수 없어요. 상품 칸과 판매 조건은 고칠 수 있어요.
                              </T>
                            </View>
                          ) : !buyerPreview && !readOnly ? (
                            <View style={{ paddingHorizontal: tokens.space.gutter, gap: 6 }}>
                              <Button
                                label="상세 고치기"
                                variant="outline"
                                disabled={busy}
                                onPress={() => {
                                  allowLeave.current = true;
                                  router.push({ pathname: "/products/[id]/story", params: { id: product.productId } });
                                }}
                              />
                              {live ? (
                                <T variant="caption" muted>
                                  이 화면에서는 상세를 저장하면 구매자에게 바로 보여요.
                                </T>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      ) : (
                        <View testID="product-detail-page" style={{ gap: 12 }}>
                          {working && !buyerPreview ? (
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
                              {activeRun && !sheetOpen && batch && <SourceRunProgress batch={batch} run={activeRun} />}
                            </View>
                          ) : showEditor && review && batch ? (
                            <>
                              <SourceDetailsEditor
                                scrollRef={scrollRef}
                                locked={busy || working || readOnly}
                                key={batch.id}
                                emptyHint
                                preview={buyerPreview || readOnly}
                                // '금액은 다음 단계(판매·가격)에서' 같은 안내는 다음 단계가 있는 판매 전 상품에만
                                showStoryTextHints={preSale}
                                // 구매자에게 보이는 상품은 페이지 제목을 상품명으로 맞추지 않으므로 저장된 제목을 그대로 보인다(DEV-346).
                                displayName={
                                  !preSale || DEFAULT_NAMES.includes(form.name.trim())
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
                          ) : buyerPreview || readOnly ? null : (
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
                      brix: buyerPreview ? undefined : <View style={{ padding: 20, gap: 8 }}>
                        <T weight="semibold">측정 당도 (선택)</T>
                        {basicField("brix", "측정 당도 (°Bx)", "예: 12.5", 8)}
                        {/* 등급(PM 11/18 되살림, 예전 SCR-25와 같은 세 값). 고른 것을 다시 누르면 지운다 */}
                        <T weight="semibold" style={{ marginTop: 8 }}>등급 (선택)</T>
                        <View accessibilityRole="radiogroup" accessibilityLabel="등급" style={{ flexDirection: "row", gap: 8 }}>
                          {GRADES.map((g) => {
                            const on = form.grade === g;
                            return (
                              <Pressable
                                key={g}
                                accessibilityRole="radio"
                                accessibilityLabel={`등급 ${g}`}
                                accessibilityState={{ checked: on, disabled: readOnly || fieldsLocked }}
                                disabled={readOnly || fieldsLocked}
                                onPress={() => setField("grade", on ? null : g)}
                                style={{
                                  minHeight: 44,
                                  minWidth: 64,
                                  paddingHorizontal: 16,
                                  borderRadius: 999,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderWidth: 1.5,
                                  borderColor: on ? (changed("grade") ? CHANGED : tokens.color.text) : tokens.color.border,
                                  backgroundColor: on ? (changed("grade") ? "#F2F6FE" : tokens.color.surface) : tokens.color.background,
                                }}
                              >
                                <T weight={on ? "bold" : "regular"}>{g}</T>
                              </Pressable>
                            );
                          })}
                        </View>
                        {changed("grade") ? <ChangedMark label="등급" /> : null}
                      </View>,
                      info: buyerPreview ? undefined : {
                        origin: (
                          <View style={{ flex: 1 }}>
                            <FillInput
                              label="상품정보 원산지"
                              value={form.origin}
                              placeholder="예: 서귀포시"
                              maxLength={30}
                              editable={!fieldsLocked && !readOnly}
                              changed={changed("origin")}
                              onChange={(v) => setField("origin", v)}
                            />
                            {/* DEV-121: 원산지 표시 형식과 안내 화면 */}
                            <OriginFieldHint />
                          </View>
                        ),
                        // 사이즈는 composer 전용 기본 정보(batch). 상품만 여는 composer는 상품 값 그대로 보인다
                        ...(target
                          ? {
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
                            }
                          : {}),
                        storage: (
                          <View style={{ flex: 1, gap: 4 }}>
                            <FillInput
                              label="보관"
                              value={form.storage}
                              placeholder="예: 서늘한 곳"
                              maxLength={30}
                              editable={!fieldsLocked && !readOnly}
                              changed={changed("storage")}
                              onChange={(v) => setField("storage", v)}
                            />
                          </View>
                        ),
                      },
                      // 빈 보관 방법을 누른 뒤 강조하면(C-19) 접힌 상품정보 표를 펼쳐 그 칸이 보이게 한다
                      infoOpen: !!validationFields["보관"],
                      // 새 상품 작성에서는 이 줄의 입력이 사이즈다(무게 kg은 다음 화면). 소비자 화면 이름표는 그대로(DEV-329)
                      // 구매자 미리보기는 소비자 화면 그대로 '중량·수량'
                      infoLabels: buyerPreview || !target ? undefined : { size: "사이즈" },
                    }}
                  />
                  {basic.error && !buyerPreview && !sheetOpen ? (
                    <View accessibilityRole="alert" style={{ padding: 20 }}>
                      <T variant="caption" color={tokens.color.error}>
                        {basic.error}
                      </T>
                    </View>
                  ) : null}
                </View>
              );
          })()
        )}
      </Scroll>
      </CollapsingFrame>
      {readOnly ? (
        // 판매 종료: 하단 바는 오류가 있을 때만(안내 문장은 위쪽 줄에 하나만)
        errorPanel && !buyerPreview ? <BottomBar>{errorPanel}</BottomBar> : null
      ) : productOnly ? (
        <View style={buyerPreview ? { display: "none" } : { display: "contents" }}>
          <BottomBar summary={errorPanel ?? undefined}>{footerButtons}</BottomBar>
        </View>
      ) : batch ? (
        <View style={buyerPreview ? { display: "none" } : { display: "contents" }}>
        <PeekSheet hideClosedPeek
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
                    : "사진 없이 자료만으로 AI 채우기가 가능해요"}
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
              <View style={{ gap: 8 }}>
                <T variant="caption">과일 품종명 *</T>
                <FillInput label="과일 품종명" value={basic.inputs[target?.id ?? ""]?.variety ?? ""}
                  placeholder="예: 온주밀감" maxLength={100} editable={!(fieldsLocked || activeRun)}
                  onFocus={() => focusBasic("sheetVariety")}
                  onChange={(v) => { if (target) basic.change(target.id, "variety", v); setStartError(""); }} onBlur={blurBasic} />
                {basicNoteFor("sheetVariety")}
                {startError || basic.error ? <View accessibilityRole="alert"><T color={tokens.color.error}>{startError || basic.error}</T></View> : null}
              {!batch.sources.length && !pendingText ? <T variant="caption" muted>자료를 먼저 넣어 주세요.</T> : null}
              <Button
                label={startLabel}
                size="producer"
                loading={busy && !working && !autoSaving}
                disabled={
                  busy ||
                  // 기본 정보 칸(품종 필수 검사)이 화면에 올라오기 전에는 시작하지 않는다.
                  !form ||
                  !productId ||
                  (batch.sources.length === 0 && !pendingText) ||
                  runs.some((r) => ACTIVE.includes(r.status))
                }
                onPress={() => {
                  if (target) {
                    const input = basic.inputs[target.id]?.brix ?? "";
                    const canonical = displayBrix(input);
                    if (canonical !== input) basic.change(target.id, "brix", canonical);
                  }
                  start();
                }}
              />
              </View>
            ) : (
              <View onLayout={event => setFooterHeight(event.nativeEvent.layout.height + 32)} style={{ gap: 8, paddingTop: 12 }}>
              {errorPanel}
              {footerButtons}
              </View>
            )
          }
        >
          {errorPanel}
          {editorDirty ? (
            <T variant="caption" muted>
              판매페이지 수정을 &apos;임시 저장&apos;한 뒤에 첨부한 사진·자료를 바꿀 수
              있어요.
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
            onPendingText={setPendingText}
          />
          {runPanel}
        </PeekSheet>
        </View>
      ) : null}

      {/* 판매 조건 시트(C-6). 판매 종료 상품은 읽기 전용(C-11) */}
      <Sheet visible={termsOpen} onClose={() => setTermsOpen(false)} title="판매 조건">
        <FieldFeedbackContext.Provider value={{ fields: termsInvalid, clear: () => {} }}>
          {product && termsEdit ? (
            live ? (
              <View style={{ gap: 16 }}>
                <T variant="caption" muted>
                  여기서 고친 값도 &apos;상품에 반영&apos;을 눌러야 구매자에게 보여요.
                </T>
                <SalesTermsEditor
                  value={termsEdit}
                  onChange={(next) => {
                    setTermsInvalid({});
                    setTermsEdit(next);
                  }}
                  mode="live"
                  editable
                  busy={busy}
                  product={product}
                />
                {Object.values(termsInvalid)[0] ? (
                  <View accessibilityRole="alert">
                    <T variant="caption" color={tokens.color.error}>{Object.values(termsInvalid)[0]}</T>
                  </View>
                ) : null}
                <Button label="수정 담기" size="producer" disabled={busy} onPress={takeTerms} />
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <TermsSummary value={termsEdit} />
                <Button label="닫기" variant="outline" onPress={() => setTermsOpen(false)} />
              </View>
            )
          ) : null}
        </FieldFeedbackContext.Provider>
      </Sheet>
      {/* 나가기 확인(PM 11/18): 반영 안 한 수정이 있는 구매자에게 보이는 상품. 판매 전 상품은 지금처럼 나갈 때 바로 저장 */}
      <Sheet visible={!!leaving} onClose={() => setLeaving(null)}>
        <View style={{ gap: 12 }} testID="leave-confirm">
          <T variant="heading">반영하지 않은 수정이 있어요</T>
          <T>&apos;상품에 반영&apos;을 눌러야 구매자에게 보여요.</T>
          <Button
            label="상품에 반영"
            size="producer"
            disabled={busy}
            onPress={() => {
              setLeaving(null);
              openApply();
            }}
          />
          {draftMode === "direct" ? (
            // 비공개 저장이 없는 서버(C-2): 반영하지 않은 수정은 남지 않는다
            <Button label="반영하지 않고 나가기" variant="outline" size="producer" disabled={busy} onPress={leaveNow} />
          ) : dirty ? (
            <Button
              label="임시 저장하고 나가기"
              variant="outline"
              size="producer"
              disabled={busy}
              onPress={() =>
                mutate(async () => {
                  await saveAll();
                  toast("임시 저장됐어요");
                  leaveNow();
                })
              }
            />
          ) : (
            // 이미 비공개로 저장돼 있다: 그대로 나가고 나중에 '상품에 반영'
            <Button label="나중에 반영하기" variant="outline" size="producer" disabled={busy} onPress={leaveNow} />
          )}
          {/* 임시 저장이 실패하면 시트 안에서 보인다(뒤 화면 오류 줄은 시트에 가려짐) */}
          {error ? (
            <View accessibilityRole="alert">
              <T variant="caption" color={tokens.color.error}>{error.message}</T>
            </View>
          ) : null}
          <Button label="계속 고치기" variant="text" disabled={busy} onPress={() => setLeaving(null)} />
        </View>
      </Sheet>
      {/* 반영 확인 시트(C-8) */}
      <Sheet visible={!!plan} onClose={() => setPlan(null)}>
        {plan ? (
          <View style={{ gap: 12 }} testID="apply-confirm">
            <T variant="heading">상품에 반영할까요?</T>
            <T>
              {plan.status === "PENDING_APPROVAL"
                ? "승인 대기 중인 상품이에요. 다시 승인받지 않아도 돼요."
                : "판매 중인 상품이에요. 바뀌는 내용을 확인해 주세요."}
            </T>
            <ChangeGroup
              tag={plan.status === "PENDING_APPROVAL" ? "승인되면 보여요" : "바로 보여요"}
              tone="now"
              rows={[...plan.changes.now, ...plan.pageRows]}
            />
            <ChangeGroup
              tag="새 예약부터"
              tone="new"
              rows={plan.changes.newOrders}
              note="이미 결제한 주문의 가격은 그대로예요"
            />
            {plan.changes.consent.length ? (
              <View style={{ gap: 6 }}>
                <ChangeGroup
                  tag="예약자 동의 필요"
                  tone="consent"
                  rows={plan.changes.consent}
                  note={`예약한 ${plan.reservedCount}명에게 동의를 물어요. 동의하지 않은 분께는 전액 환불돼요.`}
                />
                <FieldFeedbackContext.Provider value={{ fields: consentInvalid ? { consent: "받는 시기 변경 안내에 동의해 주세요." } : {}, clear: () => {} }}>
                  <FieldFeedback field="consent">
                    <Checkbox
                      checked={consent}
                      label="받는 시기 변경을 예약자에게 알리는 것에 동의해요"
                      onPress={() => {
                        setConsent(!consent);
                        setConsentInvalid(false);
                      }}
                    />
                  </FieldFeedback>
                </FieldFeedbackContext.Provider>
                {consentInvalid ? (
                  <View accessibilityRole="alert">
                    <T variant="caption" color={tokens.color.error}>받는 시기 변경 안내에 동의해 주세요.</T>
                  </View>
                ) : null}
              </View>
            ) : null}
            {plan.status === "PENDING_APPROVAL" ? (
              <ChangeGroup tag="운영자에게 기록" tone="admin" rows={[]} note="바뀐 내용은 운영자 심사 화면에 변경 기록으로 남아요" />
            ) : null}
            {error ? (
              <View accessibilityRole="alert">
                <T variant="caption" color={tokens.color.error}>{error.message}</T>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button label="더 고치기" variant="outline" size="producer" disabled={busy} style={{ flex: 1 }} onPress={() => setPlan(null)} />
              <Button label="반영하기" size="producer" loading={busy} disabled={busy} style={{ flex: 2 }} onPress={confirmApply} />
            </View>
          </View>
        ) : null}
      </Sheet>
    </Screen></FieldFeedbackContext.Provider>
  );
  return (
    <BasicInfo
      key={batchId}
      batch={batch}
      flushRef={flushBasicInfo}
      onDirty={(dirty) => {
        setBasicDirty(dirty);
        if (dirty) setError(null);
      }}
      onSaved={(b) => {
        setBatch(b);
        // 기본 정보 저장은 reviewVersion도 올린다. 편집기가 최신 review를 받게 다시 읽는다.
        if (review)
          void load().catch((e) => {
            if (alive.current) setError(sourceActionError(e));
          });
      }}
    >
      {render}
    </BasicInfo>
  );
}
