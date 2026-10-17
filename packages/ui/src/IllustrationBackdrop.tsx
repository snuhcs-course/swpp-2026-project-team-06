import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
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
      <LinearGradient
        testID="illustration-fade-top"
        colors={["#FFFFFF", "rgba(255,255,255,0)"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48 }}
      />
      <LinearGradient
        testID="illustration-fade-bottom"
        colors={["rgba(255,255,255,0)", "#FFFFFF"]}
        style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 48 }}
      />
    </View>
  );
}
