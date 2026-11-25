import { Image, View, type ImageSourcePropType } from "react-native";
import { emoticonLabel, type EmoticonId } from "@farmclub/api";
import { T } from "./Text";

const SOURCES: Record<EmoticonId, ImageSourcePropType> = {
  "farmclub-reserved": require("../assets/emoticons/01-reserved.display.webp"),
  "farmclub-paid": require("../assets/emoticons/02-paid.display.webp"),
  "farmclub-packing": require("../assets/emoticons/03-packing.display.webp"),
  "farmclub-shipping": require("../assets/emoticons/04-shipping.display.webp"),
  "farmclub-arrived": require("../assets/emoticons/05-arrived.display.webp"),
  "farmclub-delicious": require("../assets/emoticons/06-delicious.display.webp"),
  "farmclub-wait": require("../assets/emoticons/07-wait.display.webp"),
  "farmclub-check": require("../assets/emoticons/08-check.display.webp"),
  "farmclub-thanks": require("../assets/emoticons/09-thanks.display.webp"),
  "farmclub-sorry": require("../assets/emoticons/10-sorry.display.webp"),
};

export function EmoticonImage({ id, size = 160 }: { id: string; size?: number }) {
  const label = emoticonLabel(id);
  if (!label) return <T variant="sub">이모티콘</T>;
  return <Image source={SOURCES[id as EmoticonId]} accessibilityLabel={`${label} 이모티콘`}
    resizeMode="contain" style={{ width: size, height: size }} />;
}

/** Same 160px image and vertical space in 1:1, private replies and news cards. */
export function EmoticonMessage({ id }: { id: string }) {
  return <View testID="emoticon-message" style={{ paddingVertical: 12, marginTop: 8, marginBottom: 4 }}>
    <EmoticonImage id={id} />
  </View>;
}
