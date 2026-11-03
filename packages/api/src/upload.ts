// 업로드할 파일(DEV-33). 웹은 File·Blob, 네이티브는 expo-image-picker가 준 {uri, name, type}을 FormData에 그대로 붙인다.
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
    // React Native FormData는 {uri, name, type}을 파일로 보낸다. DOM 타입에는 없어 Blob으로 본다
    form.append(field, { ...file, name: name ?? file.name } as unknown as Blob);
  else if (name) form.append(field, file, name);
  else form.append(field, file);
}
