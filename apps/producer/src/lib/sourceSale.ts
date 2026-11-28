import { isMock, productWorkspace, sourceAnalysis, type MyProduct, type SalePreview } from "@farmclub/api";
import { sourcePhotoUrl } from "./sourcePhoto";

/** Load a saved private page for explicit review, never apply it while navigating. */
export async function salePage(product: MyProduct): Promise<{ state: SalePreview | null; product: MyProduct; release: () => void }> {
  if (isMock || !(await sourceAnalysis.config()).enabled) return { state: null, product, release: () => {} };
  const state = await productWorkspace.salePreview(product.productId);
  if (state?.workspace) {
    const s = state.workspace.snapshot;
    return { state, product: { ...product, photos: s.representativeUri ? [s.representativeUri, ...product.photos.filter(p => p !== s.representativeUri)] : product.photos,
      moduleDetail: { schemaVersion: 1, modules: s.modules.filter(m => m.enabled), hiddenSectionIds: s.hiddenSectionIds, design: s.design } }, release: () => {} };
  }
  if (!state?.draft) return { state, product, release: () => {} };
  const snapshot = state.draft.snapshot;
  const ids = [...new Set([snapshot.representativeAssetId, ...snapshot.previewModules.flatMap(m => m.photoAssetIds)].filter((id): id is string => !!id))];
  const urls: Record<string, string> = {};
  await Promise.all(ids.map(async id => {
    const source = state.batch.sources.find(s => s.id === id);
    if (source) urls[id] = await sourcePhotoUrl(state.batch, source, "display").catch(() => "");
  }));
  const cover = snapshot.representativeAssetId ? urls[snapshot.representativeAssetId] : undefined;
  return { state, product: { ...product,
    photos: cover ? [cover, ...product.photos.filter(p => p !== cover)] : product.photos,
    moduleDetail: { schemaVersion: 1, modules: snapshot.previewModules.map(m => ({ id: m.id, texts: m.texts, illustrationId: m.illustrationId,
      photos: m.photoAssetIds.filter(id => !!urls[id]).map(id => ({ uri: urls[id], alt: "생산자가 선택한 상품사진" })) })) },
  }, release: () => Object.values(urls).forEach(u => { if (u.startsWith("blob:")) URL.revokeObjectURL(u); }) };
}

export function salePageWarnings(state: SalePreview | null): string[] {
  if (!state) return [];
  return [
    ...((!state.draft && !state.workspace) || !state.current ? ["판매페이지의 최신 내용을 저장해 주세요."] : []),
    ...(state.processingIssues.length ? ["아직 읽지 못한 자료가 있어요. 판매페이지에서 미완료 부분을 다시 처리하거나 자료를 제외해 주세요."] : []),
    ...(state.reviewPending ? [`공개 전 확인할 문구가 ${state.reviewPending}개 있어요. 판매페이지에서 확인·수정해 주세요.`] : []),
    ...(!(state.draft?.snapshot.representativeAssetId || state.workspace?.snapshot.representativeUri) ? ["판매페이지에서 대표 상품사진을 선택해 주세요."] : []),
  ];
}
