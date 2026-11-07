// 상품 원산지 칸 아래 한 줄(DEV-121). 시행령 별표 1 1호가목1) 국산 농산물 표시 형식과 원산지 표시제도 안내(/origin-notice)로 가는 길
import { T, originNotice, tokens } from "@farmclub/ui";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

export function OriginFieldHint() {
  const router = useRouter();
  return (
    <View style={{ gap: 2 }}>
      <T variant="caption" muted>
        {originNotice.fieldHint}
      </T>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="원산지 표시 방법 보기"
        onPress={() => router.push("/origin-notice")}
        style={{ minHeight: 32, justifyContent: "center", alignSelf: "flex-start" }}
      >
        <T variant="caption" weight="semibold" color={tokens.color.accent}>
          표시 방법 보기 ›
        </T>
      </Pressable>
    </View>
  );
}
