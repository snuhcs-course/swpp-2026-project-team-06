// Local recovery route: real authenticated private workspace; no source regeneration.
import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, View, Image } from "react-native";
import { productWorkspace, newIdempotencyKey, type ProductWorkspace, type PageReviewAction } from "@farmclub/api";
import { Button, SourceGuidedStory, T, type SourceStoryDesign } from "@farmclub/ui";
import { PageReviewActions } from "../lib/PageReviewActions";
import { PageTextInput } from "../lib/PageCanvas";
import { chooseSourceFiles } from "../lib/sourceFiles";
import { productPhotoUrl } from "../lib/sourcePhoto";
export default function RecoveredPage() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const router = useRouter();
    const [row, setRow] = useState<ProductWorkspace | null>(null), [preview, setPreview] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
    const [showNotes, setShowNotes] = useState(true);
    const [showResolved, setShowResolved] = useState(false), [editingRef, setEditingRef] = useState<string | null>(null);
    async function reviewAction(reference: string, action: PageReviewAction, note: string, suggestion?: string) {
        if (!row)
            return;
        const item = row.snapshot.reviewItems?.[reference];
        if (!item)
            return;
        let snapshot = row.snapshot;
        if (suggestion !== undefined) {
            const [mid, index] = reference.split(":");
            snapshot = { ...snapshot, modules: snapshot.modules.map(m => m.id === mid ? { ...m, texts: m.texts.map((t, i) => i === Number(index) ? { ...t, value: suggestion } : t) } : m) };
            setRow({ ...row, snapshot });
        }
        setBusy(true);
        setMessage("");
        try {
            setRow(await productWorkspace.reviewPassage(id, { version: row.version, snapshot, reference, bindingHash: item.bindingHash, action, note }, newIdempotencyKey()));
            setEditingRef(null);
            setMessage(action === "REOPEN" ? "확인을 되돌렸어요." : "선택한 문구의 검토를 저장했어요.");
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : String(e));
        }
        finally {
            setBusy(false);
        }
    }
    const reviewItems = row?.snapshot.reviewItems ?? {};
    const pendingCount = Object.values(reviewItems).filter(i => i.pending).length;
    const reviewNotes = Object.fromEntries(Object.entries(reviewItems).filter(([, item]) => showResolved || item.pending).map(([ref, item]) => [ref, item.messages]));
    const [urls, setUrls] = useState<Record<string, string>>({});
    useEffect(() => { let alive = true; productWorkspace.open(id, newIdempotencyKey()).then(r => { if (alive)
        setRow(r); }).catch(e => setMessage(e.message)); return () => { alive = false; }; }, [id]);
    const media = (row?.snapshot.design as {
        media?: Record<string, {
            uri: string;
        }>;
    } | undefined)?.media ?? {};
    const photoKey = Object.values(media).map(m => m.uri).join('|');
    useEffect(() => { let alive = true; const made: string[] = []; Promise.all([...new Set(photoKey.split('|').filter(Boolean))].map(async (uri) => { const url = await productPhotoUrl(id, uri); if (url.startsWith('blob:'))
        made.push(url); return [uri, url] as const; })).then(entries => { if (alive)
        setUrls(Object.fromEntries(entries)); }).catch(e => setMessage(e.message)); return () => { alive = false; made.forEach(URL.revokeObjectURL); }; }, [id, photoKey]);
    async function save() { if (!row)
        return false; setBusy(true); setMessage(""); try {
        setRow(await productWorkspace.save(id, row.version, row.snapshot, newIdempotencyKey()));
        setMessage("비공개로 저장했어요. 다시 열어도 문구와 사진을 유지해요.");
        return true;
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
        return false;
    }
    finally {
        setBusy(false);
    } }
    if (!row)
        return <T>{message || "저장된 페이지를 여는 중이에요"}</T>;
    return <ScrollView style={{ flex: 1, backgroundColor: '#FFFCF6' }}><View style={{ width: '100%', maxWidth: 480, alignSelf: 'center' }}>
 <View style={{ padding: 20, gap: 12 }}><T variant="heading">페이지 수정</T><T>문구와 사진을 수정한 뒤 비공개로 저장해 주세요.</T>{row.snapshot.sourceReviewRequired ? <><T>확인이 남은 초안이에요. 비공개 편집·저장은 가능하며, 판매 요청 전 원문 검토가 필요해요.</T><Button label={showNotes ? "확인 안내 접기" : `확인할 내용 ${pendingCount}개`} onPress={() => setShowNotes(!showNotes)}/></> : null}{Object.keys(reviewItems).length ? <Button label={showResolved ? "완료한 확인 접기" : "완료한 확인도 보기"} variant="text" onPress={() => { setShowResolved(!showResolved); setShowNotes(true); }}/> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}><Button label={preview ? "페이지 편집" : "미리보기"} disabled={busy} onPress={() => setPreview(!preview)}/><Button label="비공개 저장" disabled={busy} onPress={() => void save()}/><Button label="자료·판매 설정" disabled={busy} onPress={() => void save().then(ok => { if (ok)
        router.push({ pathname: "/product-setup", params: { id } }); })}/></View>{showResolved ? Object.entries(reviewItems).filter(([, item]) => item.decision?.action === "OMIT").map(([ref, item]) => <View key={ref} style={{ gap: 8 }}><T>제외한 문구: {item.originalValue}</T><Button label="제외 되돌리기" variant="outline" disabled={busy} onPress={() => void reviewAction(ref, "REOPEN", "")}/></View>) : null}{message ? <T>{message}</T> : null}</View>
 <SourceGuidedStory reviewNotes={showNotes ? reviewNotes : undefined} reviewActions={reference => {
            const item = reviewItems[reference];
            if (!item)
                return null;
            const [mid, index] = reference.split(":");
            const value = row.snapshot.modules.find(m => m.id === mid)?.texts[Number(index)]?.value ?? "";
            return <PageReviewActions item={item} value={value} busy={busy} onAction={(action, note, suggestion) => void reviewAction(reference, action, note, suggestion)} onEdit={() => { setPreview(false); setEditingRef(reference); }}/>;
        }} content={{ modules: row.snapshot.modules, hiddenSectionIds: row.snapshot.hiddenSectionIds }} design={row.snapshot.design as SourceStoryDesign} mediaUrl={u => urls[u] ?? u} editText={preview ? undefined : (module, index, style) => <PageTextInput autoFocus={editingRef === `${module.id}:${index}`} editable={!busy} accessibilityLabel={`${module.id} 문구 ${index + 1}`} multiline value={module.texts[index].value} style={[style, { padding: 8, borderWidth: 1, borderColor: '#D9C8AF', borderRadius: 6 }]} onChangeText={value => setRow({ ...row, snapshot: { ...row.snapshot, modules: row.snapshot.modules.map(m => m.id === module.id ? { ...m, texts: m.texts.map((t, i) => i === index ? { ...t, value } : t) } : m) } })}/>} mediaTools={preview ? undefined : mediaId => <View style={{ flexDirection: 'row', gap: 8, padding: 8 }}><Button label="사진 바꾸기" disabled={busy} onPress={() => void (async () => {
                const [file] = await chooseSourceFiles(true, false);
                if (!file)
                    return;
                setBusy(true);
                try {
                    const uploaded = await productWorkspace.uploadPhoto(id, file);
                    const url = await productPhotoUrl(id, uploaded.uri);
                    const dimensions = await new Promise<{
                        width: number;
                        height: number;
                    }>((resolve, reject) => Image.getSize(url, (width, height) => resolve({ width, height }), reject));
                    if (typeof File === 'undefined' || !(file instanceof File))
                        throw new Error('사진을 웹 브라우저에서 다시 선택해 주세요.');
                    const bytes = await file.arrayBuffer();
                    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
                    setUrls(old => ({ ...old, [uploaded.uri]: url }));
                    const design = row.snapshot.design as SourceStoryDesign;
                    setRow({ ...row, snapshot: { ...row.snapshot, design: { ...design, media: { ...design.media, [mediaId]: { ...design.media[mediaId], uri: uploaded.uri, alt: uploaded.alt, ...dimensions, sourceId: 'producer-upload', sourceRegionId: uploaded.uri.split('/').pop()!, sourceSha256: digest } } } } });
                    setMessage('사진을 바꿨어요. 비공개 저장을 눌러 주세요.');
                }
                catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                }
                finally {
                    setBusy(false);
                }
            })()}/><Button label="사진 빼기" variant="secondary" disabled={busy} onPress={() => { const design = row.snapshot.design as SourceStoryDesign; setRow({ ...row, snapshot: { ...row.snapshot, design: { ...design, sections: design.sections.map(s => ({ ...s, mediaIds: s.mediaIds.filter(v => v !== mediaId) })).filter(s => s.moduleIds.length || s.mediaIds.length), media: Object.fromEntries(Object.entries(design.media).filter(([k]) => k !== mediaId)) } } }); setMessage('사진을 뺐어요. 비공개 저장을 눌러 주세요.'); }}/></View>}/>

 </View></ScrollView>;
}
