import { Image, View } from "react-native";
import { T } from "./Text";
import { Icon } from "./Icon";
import { brixText, md } from "./format";
import { IllustrationBackdrop } from "./IllustrationBackdrop";
import { tokens } from "./tokens";

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
  // DEV-227: 실측 → 예상 → 등록 전. 예상이 없어도 '-Brix' 같은 숫자 자리를 만들지 않는다.
  const pending = brixText(expected);
  return (
    <View
      testID="brix-reading"
      style={{
        paddingHorizontal: 20,
        marginTop: hasMeasurement ? 40 : 0,
        paddingTop: hasMeasurement ? 96 : 40,
        paddingBottom: hasMeasurement ? 96 : 0,
        flexDirection: hasMeasurement ? "column" : "row",
        alignItems: "center",
        gap: 16,
      }}
    >
      {hasMeasurement ? <IllustrationBackdrop /> : null}
      {hasMeasurement ? (
        <Image
          testID="brix-meter-illustration"
          source={require("../assets/source/brix-meter.png")}
          resizeMode="contain"
          accessible={false}
          aria-hidden
          style={{ width: 280, height: 280, maxWidth: "100%" }}
        />
      ) : (
        <Icon name="drop" />
      )}
      <View style={{ flex: hasMeasurement ? undefined : 1, gap: 4 }}>
        <T
          style={hasMeasurement ? { fontSize: 17, lineHeight: 26 } : undefined}
          variant="body"
          weight="semibold"
          center={hasMeasurement}
          color={hasMeasurement ? tokens.color.onAccent : undefined}
        >
          {hasMeasurement
            ? "당도 실측"
            : pending.title}
        </T>
        {hasMeasurement ? (
          <T weight="bold" center color={tokens.color.onAccent} style={{ fontSize: 40, lineHeight: 48 }}>
            {`${measured} Brix`}
          </T>
        ) : null}
        <T
          style={hasMeasurement ? { fontSize: 17, lineHeight: 26 } : undefined}
          variant="sub"
          muted={!hasMeasurement}
          center={hasMeasurement}
          color={hasMeasurement ? tokens.color.onAccent : undefined}
        >
          {hasMeasurement
            ? measuredAt
              ? `${md(measuredAt)} 측정`
              : "측정일 미등록"
            : pending.note}
        </T>
      </View>
    </View>
  );
}
