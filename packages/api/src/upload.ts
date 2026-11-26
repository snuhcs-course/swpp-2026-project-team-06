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

