import { Image, StyleSheet, View } from "react-native";
import { tokens } from "./tokens";

/** Generated paper grain over the same orange used by the primary button. */
export function IllustrationBackdrop() {
  return (
    <View
      testID="illustration-backdrop"
      pointerEvents="none"
      accessible={false}
      aria-hidden
      style={[StyleSheet.absoluteFill, { backgroundColor: tokens.color.accent }]}
    >
      <Image
        source={require("../assets/source/decor/orange-paper.png")}
        accessible={false}
        resizeMode="cover"
        style={{ width: "100%", height: "100%", opacity: 0.35 }}
      />
    </View>
  );
}
