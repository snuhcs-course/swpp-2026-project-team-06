import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { View, TextInput } from "react-native";
import { catalog, productWorkspace, sourceAnalysis as api, newIdempotencyKey, type MyProduct, type ProductWorkspace, type SourceBatch, type ProductSetupInputs } from "@farmclub/api";
import { HeaderBar, Screen, Scroll, BottomBar, Button, T, tokens } from "@farmclub/ui";
import { SourceAttachments } from "../lib/SourceAttachments";
import { SalesTermsEditor, termsFrom, checkTerms, type Terms } from "../lib/SalesTermsEditor";
import { NumField } from "../lib/fields";
import { goBackOr } from "../lib/nav";
import { useHideTabBar } from "../lib/session";
import { FieldFeedback, FieldFeedbackContext } from "../lib/FieldFeedback";
// 하단 고정 바(요약 줄 + 버튼 + 안전 영역)보다 크게 비워 마지막 입력칸이 가려지지 않게 한다(DEV-452)
const BOTTOM_BAR_ROOM = 180;
export default function ProductSetup() {
    useHideTabBar();
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const router = useRouter();
    const [workspace, setWorkspace] = useState<ProductWorkspace | null>(null), [batch, setBatch] = useState<SourceBatch | null>(null), [product, setProduct] = useState<MyProduct | null>(null);
    const [terms, setTerms] = useState<Terms | null>(null), [name, setName] = useState(""), [hint, setHint] = useState(""), [origin, setOrigin] = useState(""), [kg, setKg] = useState<number | null>(null);
    const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [message, setMessage] = useState("");
    // DEV-452 (PM 11/27): required items are checked before a page is made; first missing one is highlighted.
    const [fields, setFields] = useState<Record<string, string>>({}), [attempt, setAttempt] = useState(0);
    const clearField = (k: string) => setFields((old) => { if (!(k in old)) return old; const next = { ...old }; delete next[k]; return next; });
    const flush = useRef<(() => Promise<void>) | null>(null), opening = useRef<Promise<ProductWorkspace> | null>(null), key = useRef(newIdempotencyKey());
    useEffect(() => {
        let alive = true;
        if (!opening.current)
            opening.current = productWorkspace.open(id, key.current);
        opening.current.then(async (w) => {
            const [p, b] = await Promise.all([catalog.myProduct(id), api.get(w.batchId)]);
            if (!alive)
                return;
            setWorkspace(w);
            setProduct(p);
            setBatch(b);
            const saved = w.snapshot.setupInputs;
            setName(saved?.productName ?? p.name);
            setHint(saved?.productHint ?? p.variety);
            setOrigin(saved?.origin ?? p.info.origin ?? "");
            setKg(saved?.requestedKg ?? null);
            setTerms(saved ? { ...saved.terms, rows: saved.terms.rows.map(r => ({ ...r, startsAt: r.startsAt ?? "", endsAt: r.endsAt ?? "" })) } : termsFrom(p));
        }).catch(e => setMessage(e.message));
        return () => { alive = false; };
    }, [id]);
    const refresh = async () => { if (workspace)
        setBatch(await api.get(workspace.batchId)); };
    /** Required to generate: product, at least one material, options, prices, dates, total quantity. */
    function required(latest: SourceBatch): Record<string, string> {
        const result: Record<string, string> = {};
        if (!hint.trim()) result.hint = "어떤 상품인지 적어 주세요.";
        // Product photos alone do not make a page: at least one text, image, PDF or TXT material (QA 11/28).
        if (!latest.sources.some((x) => !x.productPhoto && !x.originalPhoto)) result.materials = "상품사진 말고 분석 자료(글·이미지·PDF·TXT)를 하나 이상 넣어 주세요.";
        const problem = terms ? checkTerms(terms) : null;
        if (problem) result[problem.field] = problem.message;
        if (!kg || kg <= 0) result.kg = "판매할 총 물량을 적어 주세요.";
        return result;
    }
    function inputs(): ProductSetupInputs { return { productName: name, productHint: hint, origin, requestedKg: kg, terms: { ...terms!, rows: terms!.rows.map(r => ({ ...r, startsAt: r.startsAt || null, endsAt: r.endsAt || null })) } }; }
    async function submit(generate: boolean) {
        if (!workspace || !batch || !terms)
            return;
        setBusy(true);
        setMessage("");
        try {
            await flush.current?.();
            const latest = await api.get(batch.id);
            if (generate) {
                const missingNow = required(latest);
                setFields(missingNow);
                if (Object.keys(missingNow).length) {
                    setAttempt((n) => n + 1);
                    setMessage(`필수 항목 ${Object.keys(missingNow).length}개를 채워야 페이지를 만들 수 있어요.`);
                    return;
                }
            }
            const result = generate ? await productWorkspace.generate(id, workspace.version, latest.version, inputs(), newIdempotencyKey()) : await productWorkspace.saveSetup(id, workspace.version, inputs(), newIdempotencyKey());
            setWorkspace(result.workspace);
            setProduct(result.product);
            setBatch(await api.get(batch.id));
            if (generate)
                router.replace({ pathname: "/products/source-analysis", params: { batchId: batch.id, composer: "1", from: "setup" } });
            else
                setMessage("자료와 판매 설정을 비공개로 저장했어요.");
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }
    const off = busy || uploading;
    if (!workspace || !batch || !product || !terms)
        return <Screen><HeaderBar title="자료·판매 설정" onBack={() => goBackOr(router, "/products")}/><T>{message || "불러오는 중이에요"}</T></Screen>;
    const field = (label: string, value: string, set: (v: string) => void, placeholder: string, key?: string) => <FieldFeedback field={key ?? label} outline={false}><View style={{ gap: 8 }}><T weight="semibold">{label}</T><TextInput accessibilityLabel={label} value={value} onChangeText={(v) => { set(v); if (key) clearField(key); }} editable={!off} placeholder={placeholder} style={{ padding: 14, borderWidth: 1, borderColor: key && fields[key] ? tokens.color.error : tokens.color.border, borderRadius: 10, fontSize: 16 }}/>{key && fields[key] ? <T variant="caption" color={tokens.color.error}>{fields[key]}</T> : null}</View></FieldFeedback>;
    return <FieldFeedbackContext.Provider value={{ fields, clear: clearField, attempt }}><Screen><HeaderBar title="자료·판매 설정" onBack={() => goBackOr(router, "/products")}/><Scroll bottom={BOTTOM_BAR_ROOM}><View style={{ padding: 20, gap: 24 }}>
 <T>가지고 있는 자료와 현재 판매할 조건을 함께 넣어 주세요. 이 정보로 페이지를 만든 뒤, 마음에 들지 않거나 틀린 부분을 고칠 수 있어요. * 표시는 페이지를 만들 때 꼭 필요해요.</T>
 {field("어떤 상품인가요? *", hint, setHint, "예: 카라향 · 여러 상품 자료라면 하나를 지정해 주세요", "hint")}
 {field("상품명 (선택)", name, setName, "자료에서 상품명을 찾을 수도 있어요")}
 {field("원산지 (선택)", origin, setOrigin, "예: 제주 서귀포")}
 <FieldFeedback field="materials"><View style={{ gap: 12 }}><T variant="heading">가지고 있는 자료 *</T><SourceAttachments batch={batch} busy={busy} refresh={async () => { await refresh(); clearField("materials"); }} onBusy={setUploading} onDirty={() => clearField("materials")} flushRef={flush} beforeUpload={async () => { }}/>{fields.materials ? <T variant="caption" color={tokens.color.error}>{fields.materials}</T> : null}</View></FieldFeedback>
 <View style={{ gap: 12 }}><T variant="heading">현재 판매할 조건 *</T><T variant="caption">자료에 적힌 옛 가격보다 여기 입력한 현재 조건을 기준으로 사용해요. 중량 옵션·가격·받는 시기·전액 환불 날짜·총 물량은 모두 필요해요.</T>
 <SalesTermsEditor value={terms} onChange={(next) => { setTerms(next); for (const k of ["options", "delivery", "prices", "shipping"]) clearField(k); }} mode="new" editable={!off} busy={off} product={product}>
 <FieldFeedback field="kg"><View style={{ gap: 6 }}><NumField label="판매할 총 물량 *" value={kg} onChange={(v) => { setKg(v); clearField("kg"); }} unit="kg" disabled={off}/>{fields.kg ? <T variant="caption" color={tokens.color.error}>{fields.kg}</T> : null}</View></FieldFeedback>
 </SalesTermsEditor>
 {["options", "delivery", "prices", "shipping"].filter((k) => fields[k] && k !== "prices").map((k) => <T key={k} variant="caption" color={tokens.color.error}>{fields[k]}</T>)}
 </View>
 {message ? <View accessibilityRole="alert"><T>{message}</T></View> : null}
 </View></Scroll><BottomBar summary={Object.keys(fields).length ? <T variant="caption" color={tokens.color.error}>{`필수 항목 ${Object.keys(fields).length}개를 채워 주세요.`}</T> : undefined}><View style={{ flexDirection: 'row', gap: 10 }}><Button label="임시 저장" variant="secondary" disabled={off} onPress={() => void submit(false)} style={{ flex: 1 }}/><Button label="이 정보로 페이지 만들기" disabled={off} loading={busy} onPress={() => void submit(true)} style={{ flex: 2 }}/></View></BottomBar></Screen></FieldFeedbackContext.Provider>;
}
