// 업로드할 파일(DEV-33). 웹은 File·Blob, 네이티브는 expo-image-picker가 준 {uri, name, type}을 FormData에 붙인다.
// 앱의 {uri} 파트는 RN XMLHttpRequest만 보낼 수 있다. 전역 fetch(expo/fetch)는 거절하므로 업로드는 postForm으로 보낸다(DEV-493).
export type NativeFile = { uri: string; name: string; type: string };
export type UploadFile = Blob | NativeFile;

export const isNativeFile = (file: UploadFile): file is NativeFile =>
  typeof (file as NativeFile).uri === "string";

/** FormData에 파일 필드를 붙인다. name을 주면 그 이름으로 보낸다 */
export function appendFile(
  form: FormData,
  field: string,
  file: UploadFile,
  name?: string,
) {
  if (isNativeFile(file))
    // React Native FormData는 {uri, name, type}을 파일로 보낸다. DOM 타입에는 없어 Blob으로 본다.
    // 고를 때 붙은 size 같은 다른 칸은 빼고 세 칸만 보낸다(RN 네트워킹은 읽지 않지만 파트에 섞여 들어간다, DEV-493)
    form.append(field, { uri: file.uri, name: name ?? file.name, type: file.type } as unknown as Blob);
  else if (name) form.append(field, file, name);
  else form.append(field, file);
}

/** expo-image-picker가 준 사진 한 장(필요한 칸만) */
export type PickedImageAsset = { uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null };
/** 사진 고르기의 압축 품질. 1보다 작아야 아래 pickedImage의 형식 판단이 맞다 */
export const PICK_QUALITY = 0.8;

/**
 * 고른 사진을 올릴 파일로(DEV-493). 형식과 이름은 picker가 준 원본 mimeType·fileName이 아니라 실제로 만든 파일(uri)로 정한다.
 * quality < 1이면 expo-image-picker는 사진을 다시 압축한다. Android는 출력 확장자가 .png일 때만 PNG이고 그 밖(HEIC·WebP·GIF 등)은
 * 모두 JPEG 바이트다(expo-image-picker android MediaHandler.handleImage → CompressionImageExporter, ImagePickerUtils
 * toBitmapCompressFormat). 그런데 mimeType·fileName은 원본 그대로(image/heic, IMG.heic)라, 서버가 선언 형식과 내용이 다르다며
 * 400을 준다(server/app/core/images.py sanitize). iOS도 PNG 밖은 JPEG로 만든다.
 */
export function pickedImage(asset: PickedImageAsset, fallbackBase = "photo"): NativeFile & { size: number } {
  const png = /\.png$/i.test(asset.uri.split(/[?#]/)[0]);
  const ext = png ? "png" : "jpg";
  const base = (asset.fileName || "").replace(/\.[^./\\]*$/, "") || `${fallbackBase}-${Date.now()}`;
  return {
    uri: asset.uri,
    name: `${base}.${ext}`,
    type: png ? "image/png" : "image/jpeg",
    size: asset.fileSize ?? 0,
  };
}
