import { T } from "./Text";
import { Asset } from "expo-asset";
import { createElement } from "react";
import { Platform, View } from "react-native";
import { StoryImage } from "./DetailStory";

// The original nine-slice frame surrounds the photo; it never covers or crops it.
const frame = Asset.fromModule(
  require("../assets/source/decor/photo-frame.png"),
);
export function SourcePhoto({ uri, alt }: { uri: string; alt: string }) {
  const photo = uri ? (
    <StoryImage uri={uri} alt={alt} />
  ) : (
    <View style={{ padding: 32 }}>
      <T muted center>
        사진 불러오는 중…
      </T>
    </View>
  );
  return (
    <View style={{ gap: 8 }}>
      {Platform.OS === "web"
        ? createElement(
            "div",
            {
              "data-testid": "source-photo-frame",
              style: {
                minWidth: 0,
                border: "14px solid transparent",
                borderImage: `url("${frame.uri}") 9% / 1 / 0 stretch`,
              },
            },
            photo,
          )
        : photo}
    </View>
  );
}
