import {
  apiUrl,
  productWorkspace,
  sourcePageImage,
  type SourceAsset,
  type SourceBatch,
} from "@farmclub/api";

/**
 * 상품 페이지가 쓰는 사진 주소의 화면 주소(DEV-346).
 * 반영한 사진(`/api/source-media/…`)은 판매 전이면 공개 주소가 막혀 있어 생산자 인증 주소로(서버처럼 URL 경로로 판단,
 * 절대 주소도), 그 밖의 `/api/…`는 API 주소, 앱 사진(`/photos/…`)·https 주소는 그대로.
 * 돌려준 값이 blob이 아닐 수 있다(URL.revokeObjectURL은 그런 값에 아무것도 하지 않는다).
 */
export function productPhotoUrl(productId: string | null | undefined, uri: string): Promise<string> {
  let path = uri;
  try {
    path = new URL(uri, apiUrl || "http://localhost").pathname;
  } catch {
    // 주소가 아니면 그대로 둔다
  }
  if (productId && path.startsWith("/api/source-media/"))
    return productWorkspace.photo(productId, path.split("/").pop()!);
  return Promise.resolve(uri.startsWith("/api/") ? apiUrl + uri : uri);
}

/**
 * 자료 작업 사진 한 장의 화면 주소.
 * 올린 사진은 인증된 가벼운 사본(DEV-341 display/thumb JPEG, blob)을 받는다. 상품 페이지에서 옮겨 온 사진(`productPhoto`)은 바이트가 없어
 * 그 주소를 `productPhotoUrl`로 연다.
 */
export function sourcePhotoUrl(
  batch: Pick<SourceBatch, "id" | "targets">,
  source: Pick<
    SourceAsset,
    "id" | "productPhoto" | "targetIds" | "common" | "revision" | "sanitizationVersion"
  >,
  /** DEV-341 가벼운 사본: 편집 화면은 display(긴 변 1600px), 첨부 칸은 thumb */
  variant: "display" | "thumb",
): Promise<string> {
  const uri = source.productPhoto?.uri;
  // 옮겨 온 사진은 바이트가 없어 사본 주소가 없다: 상품 페이지 주소 그대로 쓴다.
  if (!uri) return sourcePageImage(batch.id, source.id, 1, { variant, source });
  const productId = batch.targets.find(
    (t) => source.common || source.targetIds.includes(t.id),
  )?.productId;
  return productPhotoUrl(productId, uri);
}
