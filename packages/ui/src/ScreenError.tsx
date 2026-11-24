// 화면 오류 안내(DEV-473). 화면이 그리다 예외로 죽으면 expo-router 오류 경계가 빈 화면 대신 이 화면을 그린다.
// 두 앱의 경계 파일은 홈·운영팀 대화방으로 가는 동작만 넘긴다. 모양은 EmptyState·LoadError와 같은 결(아이콘 32,
// 제목 18 굵게, 보조 14)이고 하단에 ‘다시 시도’(주요, 강조색은 이것 하나)·‘홈으로’(테두리)를 둔다.
// design: DEV-473 디자인 제안 보드 1번(PM 승인 2026-11-24)
import { Pressable, View } from "react-native";

import { Button } from "./Button";
import { Screen } from "./content";
import { Icon } from "./Icon";
import { SCREEN_ERROR_TEXT, devErrorLine } from "./screenErrorText";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing, safe, showFocus } from "./web";

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export type ScreenErrorProps = {
  error: unknown;
  /** 같은 화면을 다시 그린다(expo-router ErrorBoundary의 retry) */
  retry: () => void | Promise<void>;
  /** 홈으로 */
  home: () => void;
  /** 운영팀 대화방 열기. 없으면 글자 링크를 숨긴다 */
  support?: () => void;
  /** 탭 바가 남는 탭 안 화면이면 true: 하단 버튼을 탭 바 위로 올린다 */
  aboveTabs?: boolean;
  /** 테스트·미리보기용. 기본은 개발 빌드(__DEV__) 여부 */
  dev?: boolean;
};

export function ScreenError({
  error,
  retry,
  home,
  support,
  aboveTabs = false,
  dev = isDev,
}: ScreenErrorProps) {
  const devLine = devErrorLine(error, dev);
  return (
    <Screen>
      <View testID="screen-error" style={styles.body}>
        <Icon name="alert" size={32} color={tokens.color.textMuted} />
        <T variant="heading" weight="bold" center accessibilityRole="header">
          {SCREEN_ERROR_TEXT.title}
        </T>
        {devLine ? (
          <T variant="caption" muted center numberOfLines={2}>
            {devLine}
          </T>
        ) : null}
        <T variant="sub" muted center>
          {SCREEN_ERROR_TEXT.body}
        </T>
        {support ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={SCREEN_ERROR_TEXT.support}
            onPress={support}
            style={(st) =>
              [
                styles.link,
                showFocus(st as { focused?: boolean }) && focusRing,
              ] as never
            }
          >
            <T
              variant="body"
              weight="semibold"
              style={{ textDecorationLine: "underline" }}
            >
              {SCREEN_ERROR_TEXT.support}
            </T>
          </Pressable>
        ) : null}
      </View>
      <View
        style={[
          styles.actions,
          {
            paddingBottom: aboveTabs
              ? safe("bottom", tokens.height.tabBar + 14)
              : safe("bottom", 14),
          },
        ]}
      >
        <Button label={SCREEN_ERROR_TEXT.retry} onPress={() => void retry()} />
        <Button
          label={SCREEN_ERROR_TEXT.home}
          variant="outline"
          onPress={home}
          style={{ minHeight: tokens.height.buttonSecondary }}
        />
      </View>
    </Screen>
  );
}

const styles = {
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  link: {
    minHeight: tokens.touchTarget.min,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  actions: {
    paddingHorizontal: tokens.space.gutter,
    paddingTop: 12,
    gap: 8,
  },
} as const;
