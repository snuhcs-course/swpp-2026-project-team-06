// 사진 고르기(iOS·Android, expo-image-picker, DEV-33). 사진 보관함에서 한 장을 골라 {uri, name, type, size}로 돌려준다.
import * as ImagePicker from "expo-image-picker";

export type PickedPhoto = { uri: string; name: string; type: string; size: number };

export async function pickPhoto(): Promise<PickedPhoto | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    quality: 0.8,
  });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  return {
    uri: a.uri,
    name: a.fileName || `photo-${Date.now()}.jpg`,
    type: a.mimeType || "image/jpeg",
    size: a.fileSize ?? 0,
  };
}
