import { View } from "react-native";
import { StoryImage } from "./DetailStory";
import { T } from "./Text";

export function SourcePhoto({ uri, alt }: { uri: string; alt: string }) {
  return (
    <View
      testID="source-photo-panel"
      style={{ gap: 8, padding: 16, backgroundColor: "#F6F1E7" }}
    >
      <StoryImage uri={uri} alt={alt} />
      {alt ? (
        <T variant="caption" muted center>
          {alt}
        </T>
      ) : null}
    </View>
  );
}
