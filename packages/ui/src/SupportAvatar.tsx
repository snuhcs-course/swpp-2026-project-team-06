import { View } from "react-native";
import { BrandLogo } from "./BrandLogo";
import { tokens } from "./tokens";

/** farmclub 문의 대화방(DEV-111·DEV-150)의 프로필 자리. 사람 사진 대신 로고를 보인다 */
export function SupportAvatar({ size = 48 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tokens.color.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <BrandLogo variant="icon" width={Math.round(size * 0.8)} decorative />
    </View>
  );
}
