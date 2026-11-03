// 사진·영상 고르기(iOS·Android, expo-image-picker, DEV-33). 웹은 pick.ts(<input type="file"> + 600px 축소).
// 고른 파일은 {uri, name, type}으로 uploadMedia에 보낸다(FormData). 축소는 하지 않고 picker quality 0.8로 압축한다.
// 정책은 웹과 같다: 사진 장당 10MB, 영상 1개 60초·100MB(SCR-27). Mock은 웹 전용이라 여기서는 늘 서버로 올린다.
import { ApiError, uploadMedia } from "@farmclub/api";
import * as ImagePicker from "expo-image-picker";

export type Picked =
  | { name: string; ok: true; uri: string; video: boolean }
  | { name: string; ok: false; reason: string };

const MB = 1024 * 1024;

const mmss = (s: number) =>
  s >= 60
    ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`
    : `${Math.round(s)}초`;

export async function pickMedia({
  multiple = true,
  video = false,
}: { multiple?: boolean; video?: boolean; imageWidth?: number } = {}): Promise<
  Picked[]
> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return [];
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: video ? ["images", "videos"] : ["images"],
    allowsMultipleSelection: multiple,
    quality: 0.8,
  });
  if (res.canceled) return [];
  const out: Picked[] = [];
  for (const a of res.assets) {
    const isVideo = a.type === "video";
    const name =
      a.fileName || `${isVideo ? "video" : "photo"}-${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
    const size = a.fileSize ?? 0;
    const type = a.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
    try {
      if (isVideo) {
        if (size > 100 * MB) {
          out.push({ name, ok: false, reason: `${name} · ${Math.round(size / MB)}MB라 100MB를 넘어요` });
          continue;
        }
        const seconds = (a.duration ?? 0) / 1000;
        if (seconds > 60) {
          out.push({ name, ok: false, reason: `${name} · ${mmss(seconds)}라 60초를 넘어요` });
          continue;
        }
      } else if (size > 10 * MB) {
        out.push({ name, ok: false, reason: `${name} · ${Math.round(size / MB)}MB라 장당 10MB를 넘어요` });
        continue;
      }
      out.push({
        name,
        ok: true,
        uri: await uploadMedia({ uri: a.uri, name, type }, name),
        video: isVideo,
      });
    } catch (e) {
      const fields = e instanceof ApiError ? e.details.fields : undefined;
      out.push({
        name,
        ok: false,
        reason: `${name} · ${
          fields?.file
            ? String(fields.file)
            : e instanceof ApiError
              ? e.message
              : "파일을 읽지 못했어요"
        }`,
      });
    }
  }
  return out;
}
