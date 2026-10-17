import { Image, View } from "react-native";
import { T } from "./Text";
import { Icon } from "./Icon";
import { md } from "./format";

export function BrixReading({
  measured,
  measuredAt,
  expected,
}: {
  measured: number | null;
  measuredAt: string | null;
  expected: number | null;
}) {
  const hasMeasurement = measured !== null;
  return (
    <View
      testID="brix-reading"
      style={{
        paddingHorizontal: 20,
        paddingTop: 40,
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
      }}
    >
      {hasMeasurement ? (
        <Image
          testID="brix-meter-illustration"
          source={require("../assets/source/brix-meter.png")}
          resizeMode="contain"
          accessible={false}
          aria-hidden
          style={{ width: 88, height: 104 }}
        />
      ) : (
        <Icon name="drop" />
      )}
      <View style={{ flex: 1, gap: 4 }}>
        <T variant="body" weight="semibold">
          {hasMeasurement
            ? `당도 실측 ${measured}Brix`
            : `당도 예상 ${expected ?? "-"}Brix`}
        </T>
        <T variant="sub" muted>
          {hasMeasurement
            ? measuredAt
              ? `${md(measuredAt)} 측정`
              : "측정일 미등록"
            : "실측 당도가 등록되면 이곳에서 확인할 수 있어요"}
        </T>
      </View>
    </View>
  );
}
