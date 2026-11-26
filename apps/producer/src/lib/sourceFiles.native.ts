// 원본 자료 파일 고르기 — iOS·Android(expo-image-picker, DEV-33). 사진 보관함의 사진만 고른다.
// PDF·텍스트 파일 첨부는 웹 전용으로 남긴다(문서 선택기는 후속).
import { PICK_QUALITY, pickedImage, type NativeFile } from "@farmclub/api";
import * as ImagePicker from "expo-image-picker";

export type PickedFile = File | (NativeFile & { size: number });

export async function chooseSourceFiles(_images = false, multiple = true): Promise<PickedFile[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: multiple,
    quality: PICK_QUALITY,
  });
  if (res.canceled) return [];
  // 형식·이름은 다시 압축한 파일 기준(원본 HEIC·WebP의 mimeType을 그대로 쓰면 서버가 거절, DEV-493)
  return res.assets.map((a) => pickedImage(a));
}
