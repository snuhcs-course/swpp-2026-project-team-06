// 화면 오류 안내(DEV-473). 화면이 그리다 예외로 죽으면 expo-router 오류 경계가 빈 화면 대신 이 화면을 그린다.
// 두 앱의 경계 파일은 홈·운영팀 대화방으로 가는 동작만 넘긴다. 모양은 EmptyState·LoadError와 같은 결(아이콘 32,
// 제목 18 굵게, 보조 14)이고 하단에 ‘다시 시도’(주요, 강조색은 이것 하나)·‘홈으로’(테두리)를 둔다.
// design: DEV-473 디자인 제안 보드 1번(PM 승인 2026-11-24)
import { useEffect } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import { Button } from "./Button";
import { Screen } from "./content";
import { Icon } from "./Icon";
import { SCREEN_ERROR_TEXT, devErrorLine } from "./screenErrorText";
import { T } from "./Text";
import { tokens } from "./tokens";
import { focusRing, safe, showFocus } from "./web";

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
};

export function ScreenError({
  error,
  retry,
  home,
  support,
  aboveTabs = false,
}: ScreenErrorProps) {
  // 개발 빌드(__DEV__)에서만 메시지 한 줄. 그릴 때 읽는다(테스트는 전역 __DEV__를 바꿔 본다)
  const devLine = devErrorLine(
    error,
    typeof __DEV__ !== "undefined" && !!__DEV__,
  );
  // 앱: 안내가 뜨면 스크린 리더가 제목을 읽는다. 웹은 아래 role="alert"가 읽힌다
  useEffect(() => {
    if (Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(SCREEN_ERROR_TEXT.title);
  }, []);
  return (
    <Screen>
      {/* 작은 화면·큰 글자에서도 본문이 하단 버튼과 겹치지 않게 본문만 스크롤한다 */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <View
          testID="screen-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={styles.body}
        >
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
      </ScrollView>
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
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  body: {
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
