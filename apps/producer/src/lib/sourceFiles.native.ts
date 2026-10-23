// 원본 자료 파일 고르기 — iOS·Android(expo-image-picker, DEV-33). 사진 보관함의 사진만 고른다.
// PDF·텍스트 파일 첨부는 웹 전용으로 남긴다(문서 선택기는 후속).
import type { NativeFile } from "@farmclub/api";
import * as ImagePicker from "expo-image-picker";

export type PickedFile = File | (NativeFile & { size: number });

export async function chooseSourceFiles(_images = false): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.9,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({
    uri: a.uri,
    name: a.fileName || `photo-${Date.now()}.jpg`,
    type: a.mimeType || "image/jpeg",
    size: a.fileSize ?? 0,
  }));
}
