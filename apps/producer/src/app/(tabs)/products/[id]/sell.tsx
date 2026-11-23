import { FieldFeedback, FieldFeedbackContext } from "../../../../lib/FieldFeedback";
import { EditorActions } from "../../../../lib/EditorActions";
// 새 상품 둘째 장: 판매·가격 → 미리보기 → 판매 시작 요청(DEV-184, FEAT-04/05, R-18·21·25).
// 판매 조건 칸은 composer 판매 조건 시트와 같은 SalesTermsEditor(DEV-361 PR C). 판매 중 상품은 composer(상품 수정)에서 고친다.
import {
  ApiError,
  catalog,
  farms,
  newIdempotencyKey,
  type MyFarm,
  type MyProduct,
} from "@farmclub/api";
import {
  BottomBar,
  Button,
  HeaderBar,
  Notice,
  Screen,
  Scroll,
  Skeleton,
  T,
  tokens,
} from "@farmclub/ui";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { BuyerPreview } from "../../../../lib/BuyerPreview";
import { NumField } from "../../../../lib/fields";
import { useHideTabBar, useSession } from "../../../../lib/session";
import { LoadError } from "../../../../lib/views";
import { goBackOr } from "../../../../lib/nav";
import { SELL_FIELD_GROUPS, isServerTrouble, sellErrorCode, serverErrorCode } from "../../../../lib/producerEvents";
import {
  PreSaleSteps,
  SalesTermsEditor,
  TermsSummary,
  checkTerms,
  termsFrom,
  termsKey,
  termsStages,
  type Terms,
} from "../../../../lib/SalesTermsEditor";
import { CollapsingFrame, CollapsingSpacer, CollapsingTop, useCollapsingTop } from "../../../../lib/CollapsingTop";
import { track } from "@farmclub/analytics";

// 서버 missing_fields 중 이 화면에 칸이 없는 상품 정보(판매페이지 ①에서 채움). 나머지는 이 화면 check()가 본다(DEV-361).
// 서버(server/app/catalog/service.py missing_fields)·Mock(missing())의 표시 문자열과 같아야 한다
const PRODUCT_INFO_FIELDS = ["상품명", "품종", "원산지", "보관 방법"];
/** 이 화면이 저장하는 상품 값(PATCH 칸과 기간·가격). 다른 화면에서 바뀌었는지 볼 때 쓴다(DEV-361) */
function sellOwned(r: MyProduct): string {
  return JSON.stringify([
    r.options,
    r.deliveryWindow,
    r.maxDelayUntil,
    r.shippingFeeType,
    r.shippingFee,
    r.remoteAreaFee,
    [...r.stages]
      .sort((a, b) => a.seq - b.seq)
      .map((s) => [
        s.stageId,
        s.startsAt,
        s.endsAt,
        Object.entries(s.options)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, v.price, v.quantity]),
      ]),
  ]);
}
export default function Sell() {
  useHideTabBar();
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const router = useRouter();
  const { toast } = useSession();
  const [p, setP] = useState<MyProduct | null>(null),
    [farm, setFarm] = useState<MyFarm | null>(null),
    [loadError, setLoadError] = useState<unknown>(null);
  const [terms, setTerms] = useState<Terms | null>(null),
    [requestedKg, setRequestedKg] = useState<number | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    // 다른 화면에서 이 화면 칸이 바뀌어 저장이 버전 충돌(409)로 막혔다. 다시 불러오기를 보인다(DEV-361)
    [stale, setStale] = useState(false),
    [preview, setPreview] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Record<string, string>>({});
  // 단계 표시는 대표사진에 붙여 두지 않고 스크롤에 따라 머리 아래로 숨긴다(composer와 같은 부품, PM 11/18)
  const top = useCollapsingTop();
  const actionLock = useRef(false);
  const keys = useRef(new Map<string, string>());
  const keyFor = (scope: string, body: unknown) => {
    const k = scope + JSON.stringify(body);
    if (!keys.current.has(k)) keys.current.set(k, newIdempotencyKey());
    return keys.current.get(k)!;
  };

  // 칸을 채운 기준 입력(draftKey). 지금 입력이 이와 같으면 생산자가 이 화면에서 아직 고치지 않은 것이다
  const baseline = useRef("");
  // 포커스 콜백이 최신 상태를 보도록 렌더마다 갱신한다
  const latest = useRef<{ terms: Terms | null; requestedKg: number | null }>({ terms: null, requestedKg });
  latest.current = { terms, requestedKg };
  // 포커스마다 다시 읽는 요청 순번. 마지막 요청의 응답만 쓴다(늦게 온 옛 응답이 새 상태를 되돌리지 않게)
  const focusSeq = useRef(0);
  // 지금 상품을 렌더를 기다리지 않고 본다(저장 응답과 늦게 온 포커스 응답을 견줄 때). setP는 늘 setProduct로 한다
  const product = useRef<MyProduct | null>(null);
  const setProduct = (next: MyProduct) => {
    product.current = next;
    setP(next);
  };
  const fill = (r: MyProduct, requestedKg: number | null) => {
    const t = termsFrom(r);
    setTerms(t);
    setRequestedKg(requestedKg);
    baseline.current = termsKey(t);
  };

  /** keepRequestedKg: ‘최신 값 다시 불러오기’처럼 다시 채울 때, 서버에 저장하지 않는 총 물량 입력을 지킨다 */
  const load = useCallback(async (keepRequestedKg?: number | null): Promise<boolean> => {
    setLoadError(null);
    try {
      const [r, f] = await Promise.all([catalog.myProduct(id), farms.mine()]);
      setProduct(r);
      setFarm(f);
      fill(
        r,
        r.pendingCapacityRequest
          ? r.pendingCapacityRequest.requestedTotalGrams / 1000
          : (keepRequestedKg ?? null),
      );
      return true;
    } catch (e) {
      setLoadError(e);
      return false;
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  // 입금 계좌를 등록하고 돌아오면 안내를 다시 판단한다.
  // 판매페이지(①)에서 돌아오면 상품을 다시 읽어 빈 칸 안내를 고친다(DEV-361). 새 버전은 이 화면 칸이 그대로일 때만 받는다:
  // 다른 곳에서 옵션·받는 시기·배송비 등이 바뀌었으면, 이 화면에서 아직 고친 게 없을 때는 새 값으로 다시 채우고,
  // 고친 게 있으면 입력과 옛 버전을 그대로 둬서 저장 때 서버가 충돌(409)로 막게 한다(조용히 덮어쓰지 않음).
  useFocusEffect(
    useCallback(() => {
      void farms
        .mine()
        .then(setFarm)
        .catch(() => {});
      const seq = ++focusSeq.current;
      void catalog
        .myProduct(id)
        .then((r) => {
          if (seq !== focusSeq.current) return;
          const old = product.current,
            { terms: t, requestedKg: currentKg } = latest.current;
          // 그사이 이 화면 저장이 먼저 끝났으면 늦게 온 옛 응답은 버린다
          if (!old || !t || r.version < old.version) return;
          if (sellOwned(r) === sellOwned(old)) setProduct(r);
          else if (termsKey(t) === baseline.current) {
            setProduct(r);
            fill(r, currentKg);
            // 옛 입력에 대한 오류·칸 강조는 새 값과 맞지 않는다
            setError("");
            setInvalidFields({});
            setStale(false);
          } else setProduct({ ...old, missingFields: r.missingFields });
        })
        .catch(() => {});
    }, [id]),
  );

  if (!p || !terms || !farm)
    return (
      <Screen>
        <HeaderBar title="판매·가격" onBack={() => goBackOr(router, "/products")} right={<EditorActions preview={false} onPreview={() => setPreview(true)} />} />
        {loadError ? (
          <LoadError error={loadError} onRetry={() => void load()} />
        ) : (
          <Skeleton width="90%" height={300} style={{ margin: 20 }} />
        )}
      </Screen>
    );

  const changeTerms = (next: Terms) => {
    setInvalidFields({});
    setError("");
    setTerms(next);
  };
  const editable = p.status === "DRAFT" || p.status === "REJECTED";
  const infoMissing = p.missingFields.filter((f) =>
    PRODUCT_INFO_FIELDS.includes(f),
  );
  // 서버 has_deposit_account와 같이 세 칸이 모두 있어야 한다.
  const hasAccount = !!(
    farm.bankName &&
    farm.accountNumber &&
    farm.accountHolder
  );

  /** 화면 값 검사. 서버도 같은 규칙(R-18 기간·가격, AC-04-1 필수 칸)을 다시 검사한다. */
  function check() {
    const bad = (key: string, message: string) => { setPreview(false); setInvalidFields({ [key]: message }); track("form_error_shown", { screen: "product_sell", code: sellErrorCode(key) }); return message; };
    const problem = checkTerms(terms!);
    if (problem) return bad(problem.field, problem.message);
    if (!requestedKg || requestedKg <= 0)
      return bad("quantity", "판매할 총 물량(kg)을 적어 주세요.");
    return "";
  }

  function failure(e: unknown) {
    // 오류 안내 위치·종류만 보낸다(글자 없음, DEV-312). 연결·서버·충돌 실패(생산자가 고칠 409 제외)는 세지 않는다
    if (!isServerTrouble(e))
      track("form_error_shown", { screen: "product_sell", code: serverErrorCode(e) });
    setStale(e instanceof ApiError && e.details.reason === "STALE_VERSION");
    if (e instanceof ApiError && e.details.reason === "NO_FARM_ACCOUNT") {
      // 계좌 안내 줄('입금 계좌 등록' 버튼)이 보이도록 농가 정보를 다시 읽는다
      void farms.mine().then(setFarm).catch(() => {});
      return setError("입금 계좌를 먼저 등록해 주세요");
    }
    // 서버 메시지(예: '빠진 칸이 있어요: 품종, …')를 먼저, 칸별 사유는 이름과 함께 붙인다.
    if (e instanceof ApiError) {
      const aliases = SELL_FIELD_GROUPS;
      const invalid = Object.entries(e.details.fields ?? {}).find(([key]) => aliases[key]);
      if (invalid) { setPreview(false); setInvalidFields({ [aliases[invalid[0]]]: invalid[1] }); }
      const fields = Object.entries(e.details.fields ?? {}).map(
        ([k, v]) => `${k}: ${v}`,
      );
      // 서버 메시지에 칸 이름이 이미 있으면(예: 빠진 칸이 있어요: 품종) 칸별 사유를 다시 붙이지 않는다.
      const named = Object.keys(e.details.fields ?? {}).some((k) =>
        e.message.includes(k),
      );
      return setError(
        [e.message, ...(named ? [] : fields)].filter(Boolean).join("\n"),
      );
    }
    setError(
      e instanceof Error ? e.message : "저장하지 못했어요. 다시 시도해 주세요.",
    );
  }

  /** 상품 PATCH → 기간·가격 PUT. 버전은 앞 응답을 이어받는다. */
  async function save(): Promise<MyProduct | null> {
    const problem = check();
    if (problem) {
      setError(problem);
      return null;
    }
    const t = terms!;
    const body = {
      version: p!.version,
      options: t.options,
      deliveryWindow: t.deliveryWindow!,
      maxDelayUntil: t.maxDelayUntil!,
      shippingFeeType: t.shippingFeeType,
      shippingFee: t.shippingFeeType === "SEPARATE" ? t.shippingFee! : 0,
      remoteAreaFee: t.remoteAreaFee ?? 0,
    };
    const patched = await catalog.update(id, body, keyFor("patch", body));
    // 기간 저장이 실패해도 다음 저장이 최신 버전으로 가도록 바로 반영한다.
    setProduct(patched);
    const stages = termsStages(t);
    await catalog.putStages(
      id,
      stages,
      patched.version,
      keyFor("stages", [stages, patched.version]),
    );
    const fresh = await catalog.myProduct(id);
    setProduct(fresh);
    // 저장한 입력이 새 기준이다(다음 포커스 때 고친 것으로 보지 않음)
    baseline.current = termsKey(t);
    return fresh;
  }

  const run = (fn: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    setStale(false);
    void fn()
      .catch(failure)
      .finally(() => { actionLock.current = false; setBusy(false); });
  };

  const requestedGrams = Math.round((requestedKg ?? 0) * 1000);
  // 판매페이지(①)에서 '다음'으로 왔으면 뒤로(스택에 composer를 또 쌓지 않음), 아니면 상품 수정을 연다
  const toPage = () =>
    from === "composer" && router.canGoBack()
      ? router.back()
      : router.push({ pathname: "/products/[id]/detail", params: { id } });
  const salesEditor = (
    <View style={{ gap: 24 }}>
      {p.status === "REJECTED" && p.rejectReason ? (
        <Notice title={`반려 사유: ${p.rejectReason}`} body="고친 뒤 다시 판매 시작을 요청해 주세요." tone="error" />
      ) : null}
      {!editable ? (
        <Notice
          title={
            p.status === "PENDING_APPROVAL"
              ? "판매 시작을 요청했어요. 운영자 확인을 기다리는 중이에요."
              : "판매 중인 상품은 상품 수정에서 고쳐 주세요."
          }
        />
      ) : null}
      {editable && infoMissing.length ? (
        <View style={{ gap: 8 }}>
          <Notice
            title={`판매 시작 전에 채워 주세요: ${infoMissing.join(", ")}`}
            body="이 칸은 판매페이지(①)에서 채워요."
            tone="error"
          />
          <Button label="판매페이지에서 채우기" variant="outline" disabled={busy} onPress={toPage} />
        </View>
      ) : null}
      {!hasAccount ? (
        <View style={{ gap: 8 }}>
          <Notice title="입금 계좌를 먼저 등록해 주세요" tone="error" />
          <Button
            label="입금 계좌 등록"
            variant="outline"
            onPress={() => router.push("/farm/account")}
          />
        </View>
      ) : null}
      <SalesTermsEditor value={terms} onChange={changeTerms} mode="new" editable={editable} busy={busy} product={p}>
        <FieldFeedback field="quantity">
          <View style={{ gap: 12 }}>
            <T variant="heading" accessibilityRole="header">
              물량
            </T>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <NumField highlight={editable} disabled={!editable || busy}
                label="판매할 총 물량"
                value={requestedKg}
                onChange={(value) => {
                  setError("");
                  setInvalidFields({});
                  setRequestedKg(value);
                }}
                unit="kg"
              />
            </View>
            <T variant="caption" muted>
              총 물량은 &apos;판매 시작 요청&apos; 때 함께 보내요(저장만 하면
              남지 않아요). 운영자가 확인한 물량만큼 판매돼요.
            </T>
          </View>
        </FieldFeedback>
      </SalesTermsEditor>
    </View>
  );
  const salesReadOnly = (
    <TermsSummary value={terms}>
      <T variant="caption" muted>{requestedKg == null ? "판매할 총 물량 미입력" : `판매할 총 물량 ${requestedKg}kg`}</T>
    </TermsSummary>
  );
  return (
    <FieldFeedbackContext.Provider value={{ fields: invalidFields, clear: () => {} }}><Screen>
      <HeaderBar title="판매·가격" onBack={() => goBackOr(router, "/products")} right={<EditorActions preview={preview} onPreview={() => setPreview(!preview)} />} />
      <CollapsingFrame>
        {editable ? (
          <CollapsingTop visible={top.visible} scrolled={top.scrolled} onHeight={top.setHeight}>
            <PreSaleSteps step={2} />
          </CollapsingTop>
        ) : null}
        <Scroll bottom={160} onScroll={top.onScroll}>
          {editable ? <CollapsingSpacer height={top.height} /> : null}
          <View testID={preview ? "buyer-preview" : "sales-editor"}>
            <BuyerPreview product={p} farm={farm} requestedGrams={requestedGrams} salesPreview={preview ? salesReadOnly : salesEditor} />
          </View>
        </Scroll>
      </CollapsingFrame>
      <BottomBar summary={error ? <View accessibilityRole="alert" style={{ gap: 4 }}><T variant="caption" color={tokens.color.error}>{error}</T>{stale ? (
        <><T variant="caption" color={tokens.color.error}>다시 불러오면 이 화면에서 고친 판매 조건을 버려요.</T><Button label="최신 값 다시 불러오기" variant="text" compact disabled={busy} onPress={() => run(async () => {
          setInvalidFields({});
          // 실패하면 오류와 이 버튼을 다시 보인다(처음 불러오기 실패 화면은 상품이 있으면 안 나온다)
          if (!(await load(requestedKg))) {
            setError("최신 값을 불러오지 못했어요. 다시 시도해 주세요.");
            setStale(true);
          }
        })} /></>
      ) : null}</View> : undefined}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button label="저장" variant="secondary" size="producer" disabled={busy || !editable} style={{ flex: 1 }} onPress={() => run(async () => { if (await save()) toast("저장했어요"); })} />
          <Button label="판매 시작 요청" size="producer" disabled={busy || !editable} loading={busy} style={{ flex: 2 }} onPress={() => run(async () => {
            const fresh = await save();
            if (!fresh) return;
            await catalog.requestCapacity(id, requestedGrams, fresh.version, keyFor("request", [requestedGrams, fresh.version]));
            track("sale_start_requested", { productId: id, screen: "product_sell", requestKind: fresh.approvedSupplyGrams === 0 ? "initial" : "increase" });
            toast("판매 시작을 요청했어요. 운영자가 확인하면 공개돼요.");
            router.dismissTo("/products");
          })} />
        </View>
      </BottomBar>
    </Screen></FieldFeedbackContext.Provider>
  );
}
