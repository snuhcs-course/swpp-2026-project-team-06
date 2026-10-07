// SCR-25 상품 편집 (FEAT-04, R-16·18·20·21·23·25, M-13) — design: p-scr-25, s-25-disabled, s-25-leavesheet, s-25-windowsheet
import {
  catalog,
  newIdempotencyKey,
  type MyProduct,
  type ProductOption,
  type ProductPatch,
  type ProductStatus,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  Checkbox,
  HeaderBar,
  Icon,
  Input,
  Notice,
  Photo,
  Screen,
  Scroll,
  Segmented,
  Sheet,
  Skeleton,
  T,
  md,
  period,
  tokens,
  won,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, View } from "react-native";

import { DateSheet, NumField, addDays } from "../../../../lib/fields";
import { pickMedia } from "../../../../lib/pick";
import { useHideTabBar, useSession } from "../../../../lib/session";
import {
  FieldButton,
  LoadError,
  TODAY,
  errMsg,
  fieldErrors,
} from "../../../../lib/views";

const STATUS: Record<ProductStatus, string> = {
  DRAFT: "초안",
  PENDING_APPROVAL: "승인 대기",
  REJECTED: "반려",
  PUBLISHED: "판매 중",
  CLOSED: "종료",
};
const WEIGHTS = [3, 5, 10];
const GRADES = [
  { value: "특", label: "특" },
  { value: "상", label: "상" },
  { value: "보통", label: "보통" },
];

type Form = {
  photos: string[];
  name: string;
  variety: string;
  description: string;
  origin: string;
  storage: string;
  expectedBrix: number | null;
  measuredBrix: number | null;
  grade: string | null;
  options: ProductOption[];
  deliveryWindow: { start: string; end: string } | null;
  maxDelayUntil: string | null;
  shippingFeeType: "FREE" | "SEPARATE";
  shippingFee: number | null;
  remoteAreaFee: number | null;
};

const toForm = (p: MyProduct): Form => ({
  photos: p.photos,
  name: p.name,
  variety: p.variety,
  description: p.description,
  origin: p.info.origin,
  storage: p.info.storage,
  expectedBrix: p.expectedBrix,
  measuredBrix: p.measuredBrix,
  grade: p.grade,
  options: p.options,
  deliveryWindow: p.deliveryWindow,
  maxDelayUntil: p.maxDelayUntil,
  shippingFeeType: p.shippingFeeType,
  shippingFee: p.shippingFee,
  remoteAreaFee: p.remoteAreaFee,
});

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function Sec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 40, gap: 16 }}>
      <T variant="heading" accessibilityRole="header">
        {title}
      </T>
      {children}
    </View>
  );
}

export default function EditProduct() {
  useHideTabBar();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<MyProduct | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pendingSave = useRef<{ body: string; key: string } | null>(null);
  const [publishing, setPublishing] = useState(false);
  const { toast, failToast } = useSession();
  const [sheet, setSheet] = useState<
    null | "leave" | "window" | "options" | "delivery" | "maxDelay"
  >(null);
  const [afterWindow, setAfterWindow] = useState<null | (() => void)>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await catalog.myProduct(id);
      setP(r);
      setForm(toForm(r));
    } catch (e) {
      setLoadError(e);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // 단계 화면에서 돌아오면 단계 요약만 다시 읽는다(고치던 값은 유지)
  useFocusEffect(
    useCallback(() => {
      catalog
        .myProduct(id)
        .then((r) =>
          setP((old) =>
            old
              ? {
                  ...old,
                  // Only refresh the edit version if its editable fields did not change elsewhere.
                  version: same(toForm(old), toForm(r))
                    ? r.version
                    : old.version,
                  approvedSupplyGrams: r.approvedSupplyGrams,
                  salesLimitGrams: r.salesLimitGrams,
                  reservedGrams: r.reservedGrams,
                  shippedGrams: r.shippedGrams,
                  maxQuantityPerOrder: r.maxQuantityPerOrder,
                  salesPaused: r.salesPaused,
                  soldQuantity: r.soldQuantity,
                  remainingGrams: r.remainingGrams,
                  stages: r.stages,
                  missingFields: r.missingFields,
                  status: r.status,
                  pendingCapacityRequest: r.pendingCapacityRequest,
                }
              : old,
          ),
        )
        .catch(() => undefined);
    }, [id]),
  );

  const base = useMemo(() => (p ? toForm(p) : null), [p]);
  const changed = useMemo(
    () =>
      form && base
        ? (Object.keys(form) as (keyof Form)[]).filter(
            (k) => !same(form[k], base[k]),
          )
        : [],
    [form, base],
  );
  const dirty = changed.length > 0;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  if (!form || !p) {
    return (
      <Screen>
        <HeaderBar title="상품 편집" onBack={() => router.back()} />
        {loadError ? (
          <LoadError error={loadError} onRetry={load} />
        ) : (
          <Skeleton width="90%" height={300} style={{ margin: 20 }} />
        )}
      </Screen>
    );
  }

  // 게시 요청 전에 채워야 할 칸(AC-04-1). 지금 입력값 기준 + 기간별 가격은 서버 값 기준.
  const missing: Record<string, string> = {};
  if (!form.name.trim()) missing.name = "상품명을 적어 주세요";
  if (!form.variety.trim()) missing.variety = "품종을 적어 주세요";
  if (!form.options.length) missing.options = "중량 옵션을 골라 주세요";
  if (!form.deliveryWindow) missing.deliveryWindow = "받는 시기를 정해야 해요";
  if (!form.maxDelayUntil) missing.maxDelayUntil = "환불 기한을 정해야 해요";
  const stagesOk =
    p.stages.length > 0 &&
    p.stages.every((s) =>
      form.options.every((o) => (s.options[o.optionId]?.price ?? 0) > 0),
    );
  if (!stagesOk) missing.stages = "아직 가격을 정하지 않았어요";
  const missingCount = Object.keys(missing).length;
  const err = (k: string) => errors[k] || missing[k];

  function patch(): ProductPatch {
    const f = form!;
    const out: ProductPatch = { version: p!.version };
    for (const k of changed) {
      if (k === "origin" || k === "storage")
        out.info = { ...out.info, origin: f.origin, storage: f.storage };
      else if (k === "shippingFee") out.shippingFee = f.shippingFee ?? 0;
      else if (k === "remoteAreaFee") out.remoteAreaFee = f.remoteAreaFee ?? 0;
      else (out as Record<string, unknown>)[k] = f[k];
    }
    return out;
  }

  /** 저장. 예약이 있는 상품의 받는 시기를 바꾸면 먼저 안내 시트(R-21) */
  async function save(then?: () => void) {
    if (!dirty) {
      then?.();
      return true;
    }
    if (
      p!.reservedCount > 0 &&
      p!.deliveryWindow &&
      changed.includes("deliveryWindow") &&
      sheet !== "window"
    ) {
      setAfterWindow(() => () => void doSave(then));
      setSheet("window");
      return false;
    }
    return doSave(then);
  }

  async function doSave(then?: () => void) {
    setSaving(true);
    setFailed(null);
    try {
      const body = patch();
      const encoded = JSON.stringify(body);
      if (pendingSave.current?.body !== encoded)
        pendingSave.current = { body: encoded, key: newIdempotencyKey() };
      const r = await catalog.update(id, body, pendingSave.current.key);
      pendingSave.current = null;
      setP(r);
      setForm(toForm(r));
      toast("저장했어요");
      then?.();
      return true;
    } catch (e) {
      // 실패해도 입력은 그대로. 연결 문제는 공통 토스트 + 다시 시도(D-19)
      if (failToast(e, () => void doSave(then))) return false;
      const f = fieldErrors(e);
      setErrors(f);
      setFailed(errMsg(e, "저장하지 못했어요. 다시 시도해 주세요."));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    setFailed(null);
    try {
      if (dirty) {
        const ok = await save();
        if (!ok) return;
      }
      router.push(`/products/${id}/sales`);
    } catch (e) {
      if (failToast(e, () => void publish())) return;
      setFailed(errMsg(e, "요청하지 못했어요. 다시 시도해 주세요."));
    } finally {
      setPublishing(false);
    }
  }

  async function addPhotos() {
    setPhotoError(null);
    const picked = await pickMedia({ multiple: true });
    const ok = picked
      .filter((x) => x.ok)
      .map((x) => (x as { uri: string }).uri);
    const bad = picked
      .filter((x) => !x.ok)
      .map((x) => (x as { reason: string }).reason);
    if (ok.length) set("photos", [...form!.photos, ...ok].slice(0, 5));
    if (bad.length) setPhotoError(bad.join("\n"));
  }

  const back = () =>
    dirty
      ? setSheet("leave")
      : router.canGoBack()
        ? router.back()
        : router.replace("/products");
  const closed = p.status === "CLOSED";
  // 받는 시기: 오늘 다음 날부터, 그리고 마지막 예약 기간가 끝난 다음 날부터(s-25-datesheet)
  const lastStageEnd = p.stages.reduce<string | null>(
    (m, s) => (!m || s.endsAt > m ? s.endsAt : m),
    null,
  );
  const deliveryMin = [
    addDays(TODAY, 1),
    lastStageEnd ? addDays(lastStageEnd.slice(0, 10), 1) : "",
  ]
    .sort()
    .pop()!;
  const firstPrice =
    p.stages[0] && form.options[0]
      ? p.stages[0].options[form.options[0].optionId]?.price
      : undefined;

  const toggleWeight = (w: number) => {
    const has = form.options.some((o) => o.weightKg === w);
    const next = has
      ? form.options.filter((o) => o.weightKg !== w)
      : [
          ...form.options,
          { optionId: `opt-${w}`, label: `${w}kg`, weightKg: w },
        ].sort((a, b) => a.weightKg - b.weightKg);
    set("options", next);
  };

  return (
    <Screen>
      <HeaderBar title="상품 편집" onBack={back} />
      <Scroll bottom={140}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 8 }}>
          <T variant="sub" muted weight="semibold">
            상태 · {STATUS[p.status]}
            {p.pendingCapacityRequest?.kind === "INCREASE"
              ? " · 물량 추가 심사 중"
              : ""}
          </T>
        </View>
        {p.status === "REJECTED" && p.rejectReason ? (
          <Notice
            title="반려됐어요. 고쳐서 다시 요청해 주세요."
            body={`사유: ${p.rejectReason}`}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        {p.status === "PUBLISHED" ? (
          <Notice
            title="판매 중 상품이에요"
            body="가격·옵션·예약 기간·받는 시기를 바꾸면 다시 승인받을 때까지 지금 값으로 팔려요."
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        {missingCount && !closed && p.status !== "PENDING_APPROVAL" ? (
          <Notice
            title={`빈 칸 ${missingCount}개를 채우면 게시를 요청할 수 있어요`}
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}
        {failed ? (
          <Notice
            title={failed}
            tone="error"
            style={{ marginHorizontal: 20, marginTop: 20 }}
          />
        ) : null}

        <Sec title="사진">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {form.photos.map((uri, i) => (
              <View
                key={`${i}-${uri.slice(-12)}`}
                style={{ position: "relative" }}
              >
                <Photo
                  uri={uri}
                  width={104}
                  height={104}
                  alt={`상품 사진 ${i + 1}`}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`상품 사진 ${i + 1} 빼기`}
                  onPress={() =>
                    set(
                      "photos",
                      form.photos.filter((_, j) => j !== i),
                    )
                  }
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    backgroundColor: tokens.color.photoButton,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {form.photos.length < 5 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="사진 추가"
                onPress={addPhotos}
                style={{
                  width: 104,
                  height: 104,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1.5,
                  borderStyle: "dashed",
                  borderColor: tokens.color.textMuted,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <Icon name="photo" size={24} color={tokens.color.textMuted} />
                <T variant="caption" muted>
                  사진 추가
                </T>
              </Pressable>
            ) : null}
          </View>
          {photoError ? (
            <T variant="sub" color={tokens.color.error}>
              {photoError}
            </T>
          ) : null}
        </Sec>

        <Sec title="기본 정보">
          <Input
            label="상품명"
            value={form.name}
            onChangeText={(v) => set("name", v)}
            error={err("name")}
            maxLength={40}
          />
          <Input
            label="품종"
            value={form.variety}
            onChangeText={(v) => set("variety", v)}
            error={err("variety")}
            maxLength={30}
          />
          <Input
            label="설명"
            value={form.description}
            onChangeText={(v) => set("description", v)}
            multiline
            height={120}
            maxLength={1000}
          />
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Input
              label="원산지"
              value={form.origin}
              onChangeText={(v) => set("origin", v)}
              style={{ flex: 1 }}
              maxLength={30}
            />
            <Input
              label="보관"
              value={form.storage}
              onChangeText={(v) => set("storage", v)}
              style={{ flex: 1 }}
              maxLength={30}
            />
          </View>
        </Sec>

        <Sec title="품질">
          <View style={{ flexDirection: "row", gap: 12 }}>
            <NumField
              label="예상 당도"
              value={form.expectedBrix}
              onChange={(v) => set("expectedBrix", v)}
              unit="Brix"
            />
            <NumField
              label="실측 당도"
              value={form.measuredBrix}
              onChange={(v) => set("measuredBrix", v)}
              unit="Brix"
              placeholder="재면 입력"
            />
          </View>
          <View style={{ gap: 8 }}>
            <T variant="sub" weight="semibold">
              등급
            </T>
            <Segmented
              options={GRADES}
              value={form.grade ?? ""}
              onChange={(v) => set("grade", v)}
            />
          </View>
        </Sec>

        <Sec title="중량·수량">
          <FieldButton
            label="중량 옵션"
            value={form.options.map((o) => o.label).join(" · ")}
            placeholder="골라 주세요"
            right="바꾸기"
            error={err("options")}
            onPress={() => setSheet("options")}
          />
          <Button
            label={`물량·판매 설정 · 승인 ${p.approvedSupplyGrams / 1000}kg`}
            variant="outline"
            onPress={() =>
              void save(() => router.push(`/products/${id}/sales`))
            }
          />
        </Sec>

        <Sec title="받는 시기·배송">
          <FieldButton
            label="받는 시기"
            value={
              form.deliveryWindow
                ? `${md(form.deliveryWindow.start)} ~ ${md(form.deliveryWindow.end)}`
                : ""
            }
            placeholder="날짜를 골라 주세요"
            error={err("deliveryWindow")}
            onPress={() => setSheet("delivery")}
          />
          <FieldButton
            label="이 날까지 못 보내면 전액 환불"
            value={md(form.maxDelayUntil)}
            placeholder="날짜를 골라 주세요"
            error={err("maxDelayUntil")}
            onPress={() => setSheet("maxDelay")}
          />
          <View style={{ gap: 8 }}>
            <T variant="sub" weight="semibold">
              배송비
            </T>
            <Segmented
              options={[
                { value: "FREE", label: "무료" },
                { value: "SEPARATE", label: "따로 받기" },
              ]}
              value={form.shippingFeeType}
              onChange={(v) => set("shippingFeeType", v)}
            />
          </View>
          {form.shippingFeeType === "SEPARATE" ? (
            <NumField
              label="배송비"
              value={form.shippingFee}
              onChange={(v) => set("shippingFee", v)}
              unit="원"
            />
          ) : null}
          <NumField
            label="도서산간 추가 운임"
            value={form.remoteAreaFee}
            onChange={(v) => set("remoteAreaFee", v)}
            unit="원"
          />
        </Sec>

        <Pressable
          accessibilityRole="link"
          disabled={saving}
          onPress={() => void save(() => router.push(`/products/${id}/stages`))}
          style={{
            marginHorizontal: 20,
            marginTop: 40,
            minHeight: tokens.height.listRowProducer,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <View>
            <T variant="body" weight="semibold">
              예약 기간·가격
            </T>
            {stagesOk ? (
              <T variant="sub" muted>
                {p.stages.length}개 기간
                {firstPrice ? ` · ${won(firstPrice)}부터` : ""}
              </T>
            ) : (
              <T variant="sub" color={tokens.color.error}>
                {form.options.length
                  ? "아직 가격을 정하지 않았어요"
                  : "중량 옵션을 먼저 골라 주세요"}
              </T>
            )}
          </View>
          <Icon name="chevron" size={24} color={tokens.color.textMuted} />
        </Pressable>
      </Scroll>

      {closed ? (
        <BottomBar summary="판매가 끝난 상품이에요">
          <Button
            label="저장"
            variant="secondary"
            size="producer"
            disabled={!dirty}
            loading={saving}
            onPress={() => void save()}
          />
        </BottomBar>
      ) : (
        <BottomBar>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              label="저장"
              variant="secondary"
              size="producer"
              loading={saving}
              disabled={p.status === "PENDING_APPROVAL"}
              onPress={() => void save()}
              style={{ flex: 1 }}
            />
            <Button
              label={
                p.status === "PUBLISHED"
                  ? "물량·판매 설정"
                  : p.status === "PENDING_APPROVAL"
                    ? "물량 심사 확인"
                    : "공급 물량 신청"
              }
              size="producer"
              disabled={
                p.status !== "PUBLISHED" &&
                p.status !== "PENDING_APPROVAL" &&
                missingCount > 0
              }
              loading={publishing}
              onPress={publish}
              style={{ flex: 2 }}
            />
          </View>
        </BottomBar>
      )}

      {/* 중량 옵션 */}
      <Sheet
        visible={sheet === "options"}
        onClose={() => setSheet(null)}
        title="중량 옵션"
      >
        {WEIGHTS.map((w) => (
          <Checkbox
            key={w}
            checked={form.options.some((o) => o.weightKg === w)}
            onPress={() => toggleWeight(w)}
            label={`${w}kg`}
          />
        ))}
        <T variant="sub" muted>
          옵션을 바꾸면 기간별 가격도 다시 정해야 해요.
        </T>
        <Button
          label="정하기"
          size="producer"
          onPress={() => setSheet(null)}
          style={{ marginTop: 8 }}
        />
      </Sheet>

      <DateSheet
        visible={sheet === "delivery"}
        title="받는 시기"
        range
        start={form.deliveryWindow?.start ?? null}
        end={form.deliveryWindow?.end ?? null}
        min={deliveryMin}
        note="지난 날짜와 오늘은 고를 수 없어요. 받는 시기는 마지막 예약 기간가 끝난 다음 날부터예요."
        onClose={() => setSheet(null)}
        onSave={(start, end) => {
          set("deliveryWindow", { start, end });
          setSheet(null);
        }}
      />
      <DateSheet
        visible={sheet === "maxDelay"}
        title="이 날까지 못 보내면 전액 환불"
        range={false}
        start={form.maxDelayUntil}
        min={
          form.deliveryWindow?.end
            ? addDays(form.deliveryWindow.end, 1)
            : addDays(TODAY, 1)
        }
        onClose={() => setSheet(null)}
        onSave={(d) => {
          set("maxDelayUntil", d);
          setSheet(null);
        }}
      />

      {/* 저장 안 하고 나가기 */}
      <Sheet visible={sheet === "leave"} onClose={() => setSheet(null)}>
        <T variant="heading">{"저장하지 않고\n나갈까요?"}</T>
        <T variant="body">고친 내용 {changed.length}곳이 사라져요.</T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="나가기"
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => {
              setSheet(null);
              router.canGoBack() ? router.back() : router.replace("/products");
            }}
          />
          <Button
            label="저장하고 나가기"
            size="producer"
            style={{ flex: 2 }}
            loading={saving}
            onPress={() => {
              setSheet(null);
              void save(() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/products"),
              );
            }}
          />
        </View>
      </Sheet>

      {/* 받는 시기 변경 안내(R-21) */}
      <Sheet visible={sheet === "window"} onClose={() => setSheet(null)}>
        <T variant="heading">받는 시기를 바꿀까요?</T>
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              minHeight: 52,
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: tokens.color.border,
            }}
          >
            <T variant="sub" muted>
              지금
            </T>
            <T variant="sub">
              {period(p.deliveryWindow?.start, p.deliveryWindow?.end)}
            </T>
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              minHeight: 52,
              alignItems: "center",
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: tokens.color.border,
            }}
          >
            <T variant="sub" muted>
              바꿀 기간
            </T>
            <T variant="sub" weight="bold">
              {period(form.deliveryWindow?.start, form.deliveryWindow?.end)}
            </T>
          </View>
        </View>
        <T variant="body">
          이미 예약한 {p.reservedCount}명에게 새 기간에 동의할지 물어봐요.
          동의하지 않은 분께는 전액 환불돼요.
        </T>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Button
            label="그대로 두기"
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => {
              set("deliveryWindow", p.deliveryWindow);
              setAfterWindow(null);
              setSheet(null);
            }}
          />
          <Button
            label="바꾸기"
            size="producer"
            style={{ flex: 2 }}
            onPress={() => {
              setSheet(null);
              const run = afterWindow;
              setAfterWindow(null);
              run?.();
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}
