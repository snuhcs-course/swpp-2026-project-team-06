import { emoticonLabel, isEmoticonId, type EmoticonId } from "../emoticons";
import { invalid } from "./router";

export function emoticonMessage(value: unknown, text: string, media: unknown[]): { text: string; emoticonId?: EmoticonId } {
  if (value == null) return { text };
  if (!isEmoticonId(value)) invalid({ emoticonId: "사용할 수 없는 이모티콘이에요" });
  if (text.trim() || media.length) invalid({ emoticonId: "이모티콘은 따로 보내 주세요" });
  return { text: emoticonLabel(value)!, emoticonId: value };
}
