// 사진 고르기(iOS·Android, expo-image-picker, DEV-33). 사진 보관함에서 한 장을 골라 {uri, name, type, size}로 돌려준다.
import { PICK_QUALITY, pickedImage } from "@farmclub/api";
import * as ImagePicker from "expo-image-picker";

export type PickedPhoto = { uri: string; name: string; type: string; size: number };

export async function pickPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: PICK_QUALITY,
  });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  // 형식·이름은 다시 압축한 파일 기준(원본 HEIC·WebP의 mimeType을 그대로 쓰면 서버가 거절, DEV-493)
  return pickedImage(a);
}
