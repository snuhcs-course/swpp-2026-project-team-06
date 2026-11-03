// 사진 고르기(웹). 웹은 <input type="file">을 직접 그리므로(PrivatePhotos) 이 함수는 쓰지 않는다. 네이티브는 pickPhoto.native.ts(DEV-33).
export type PickedPhoto = { uri: string; name: string; type: string; size: number };

export async function pickPhoto(): Promise<PickedPhoto | null> {
  return null;
}
