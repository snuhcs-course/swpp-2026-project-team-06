import { Image, StyleSheet, View } from "react-native";

/** Generated paper edges blend directly into the white page. */
export function IllustrationBackdrop() {
  return (
    <View
      testID="illustration-backdrop"
      pointerEvents="none"
      accessible={false}
      aria-hidden
      style={[StyleSheet.absoluteFill, { backgroundColor: "#FFFFFF" }]}
    >
      <Image
        source={require("../assets/source/decor/orange-paper.png")}
        accessible={false}
        resizeMode="stretch"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}
