// 하단 사업자 정보와 약관·처리방침 본문 (DEV-113, R-16, policy.md 6장). 문안·값은 legalContent.ts
import { Linking, Pressable, View, type StyleProp, type ViewStyle } from "react-native";

import {
  BROKER_NOTICE,
  TEST_SERVICE,
  HOSTING_PROVIDER,
  businessCheckUrl,
  businessLines,
  officerLines,
  type LegalBlock,
  type LegalDoc,
  type LegalPath,
} from "./legalContent";
import { T } from "./Text";
import { tokens } from "./tokens";

function FooterLink({
  label,
  strong,
  onPress,
}: {
  label: string;
  strong?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={{ minHeight: tokens.touchTarget.min, justifyContent: "center" }}
    >
      <T variant="sub" weight={strong ? "semibold" : "regular"}>
        {label}
      </T>
    </Pressable>
  );
}

/** 화면 하단 사업자 정보. 값이 없는 항목은 빼고, 하나도 없으면 ‘테스트 서비스’만 보인다 */
export function LegalFooter({
  onOpen,
  style,
}: {
  /** 약관·처리방침 열기. 앱이 라우터로 연다 */
  onOpen: (path: LegalPath) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const lines = businessLines();
  const check = businessCheckUrl();
  return (
    <View
      testID="legal-footer"
      style={[
        {
          paddingHorizontal: tokens.space.gutter,
          paddingTop: tokens.space.md,
          paddingBottom: tokens.space.lg,
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
          gap: tokens.space.xs,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: tokens.space.md }}>
        <FooterLink label="이용약관" onPress={() => onOpen("/terms")} />
        <FooterLink label="개인정보 처리방침" strong onPress={() => onOpen("/privacy")} />
        {check ? (
          <FooterLink label="사업자정보 확인" onPress={() => void Linking.openURL(check)} />
        ) : null}
      </View>
      {lines.length === 0 ? (
        <T variant="caption" muted>
          {TEST_SERVICE}
        </T>
      ) : (
        lines.map(([label, value]) => (
          <T key={label} variant="caption" muted>
            {`${label} ${value}`}
          </T>
        ))
      )}
      <T variant="caption" muted>
        {`호스팅서비스 제공자 ${HOSTING_PROVIDER}`}
      </T>
      <T variant="caption" muted style={{ marginTop: tokens.space.xs }}>
        {BROKER_NOTICE}
      </T>
    </View>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") return <T variant="body">{block}</T>;
  if ("list" in block)
    return (
      <View style={{ gap: tokens.space.sm }}>
        {block.list.map((item) => (
          <View key={item} style={{ flexDirection: "row", gap: tokens.space.sm }}>
            <T variant="body">·</T>
            <T variant="body" style={{ flex: 1 }}>
              {item}
            </T>
          </View>
        ))}
      </View>
    );
  if ("table" in block)
    // 좁은 화면이라 표는 행마다 카드로 그린다. 첫 칸이 카드 제목
    return (
      <View style={{ gap: tokens.space.sm }}>
        {block.table.rows.map((row) => (
          <View
            key={row.join("|")}
            style={{
              borderRadius: tokens.radius.sm,
              backgroundColor: tokens.color.surface,
              padding: tokens.space.md,
              gap: tokens.space.xs,
            }}
          >
            <T variant="sub" weight="semibold">
              {row[0]}
            </T>
            {row.slice(1).map((cell, i) => (
              <T key={i} variant="sub">
                <T variant="sub" muted>{`${block.table.head[i + 1]}  `}</T>
                {cell}
              </T>
            ))}
          </View>
        ))}
      </View>
    );
  const business = businessLines().map(([l, v]) => `${l} ${v}`);
  const lines =
    "officer" in block
      ? officerLines()
      : [...(business.length ? business : [TEST_SERVICE]), `호스팅서비스 제공자 ${HOSTING_PROVIDER}`];
  return (
    <View style={{ gap: tokens.space.xs }}>
      {lines.map((line) => (
        <T key={line} variant="body">
          {line}
        </T>
      ))}
    </View>
  );
}

/** 약관·처리방침 본문. 제목·뒤로 가기는 앱 화면이 그린다 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <View style={{ paddingHorizontal: tokens.space.gutter, gap: tokens.space.lg }}>
      <T variant="sub" muted>{`시행일 ${doc.effective}`}</T>
      {doc.intro.map((p) => (
        <T key={p} variant="body">
          {p}
        </T>
      ))}
      {doc.sections.map((s) => (
        <View key={s.title} style={{ gap: tokens.space.md }}>
          <T variant="heading" accessibilityRole="header">
            {s.title}
          </T>
          {s.body.map((b, i) => (
            <Block key={i} block={b} />
          ))}
        </View>
      ))}
    </View>
  );
}
