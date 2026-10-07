import { StyleSheet, Text, View } from "react-native";

import { tokens } from "./tokens";

type PlaceholderProps = {
  /** 화면 ID, 예: "SCR-02" */
  screen: string;
  /** 화면 이름, 예: "농가 목록" */
  title: string;
  /** 연결된 기능, 예: "FEAT-06" */
  feature: string;
};

/** 뼈대 화면 자리. 기능 화면이 생기면 쓰지 않는다. */
export function Placeholder({ screen, title, feature }: PlaceholderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {screen} {title}
      </Text>
      <Text style={styles.feature}>{feature}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: tokens.space.lg,
    backgroundColor: tokens.color.background,
  },
  title: {
    fontSize: tokens.fontSize.title,
    fontWeight: "600",
    color: tokens.color.text,
  },
  feature: {
    marginTop: tokens.space.sm,
    fontSize: tokens.fontSize.body,
    color: tokens.color.textMuted,
  },
});
