// 채팅방 주의·제재 안내 띠와 ‘채팅 이용 안내’ 시트(DEV-475, FEAT-12 AC-12-19·20, M-25).
// 1:1·운영팀 방(ChatThread)과 소식방(NewsRoom)이 머리 아래에 붙인다. 띠는 스크롤 밖이라 대화를 올려도,
// 키보드가 올라와도 남는다. 보드: docs/design/proposals/DEV-475/ (DEV-473 보드 2번 A안)
import { useState } from "react";
import { Platform, Pressable, View, useWindowDimensions } from "react-native";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { T } from "./Text";
import { Sheet } from "./bars";
import { tokens } from "./tokens";
import { useKeyboardShown } from "./keyboard";
import { focusRing, showFocus } from "./web";
import {
  CHAT_NOTICE_BAND,
  CHAT_NOTICE_COMPACT,
  CHAT_NOTICE_SUPPORT_LABEL,
  CHAT_NOTICE_TITLE,
  chatNoticeCompact,
  chatNoticeLines,
  type ChatNoticeSide,
} from "./chatNoticeCopy";

/** 방이 넘기는 값. onSupport는 운영팀 대화방을 연다. 운영팀 방 자신은 null(버튼 없음) */
export type ChatNoticeConfig = { onSupport: (() => void) | null };

export function ChatNotice({
  side,
  onSupport,
}: ChatNoticeConfig & { side: ChatNoticeSide }) {
  const [open, setOpen] = useState(false);
  const keyboardShown = useKeyboardShown();
  const { height } = useWindowDimensions();
  // 운영팀 방(onSupport null)은 늘 한 줄(DEV-473 보드 2번), 다른 방은 작은 화면 + 키보드일 때만
  const compact = chatNoticeCompact(keyboardShown, height, !onSupport);
  return (
    <>
      <Pressable
        testID="chat-notice"
        accessibilityRole="button"
        // 접힌 한 줄이어도 화면 읽기는 전체 문구를 읽는다
        accessibilityLabel={`${CHAT_NOTICE_BAND} ${CHAT_NOTICE_TITLE} 보기`}
        onPress={() => setOpen(true)}
        // 터치 48(N-02): 앱의 접힌 한 줄(높이 33)은 hitSlop으로, 웹(hitSlop 없음)과 접지 않은 띠는 minHeight로.
        // 넓은 창에서 두 줄 문구가 한 줄에 들어가도(높이 36) 48을 지킨다
        hitSlop={compact ? { top: 8, bottom: 8 } : undefined}
        style={(state) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingLeft: 16,
            paddingRight: 12,
            paddingVertical: 8,
            minHeight: compact && Platform.OS !== "web" ? undefined : 48,
            backgroundColor: tokens.color.surface,
            borderBottomWidth: 1,
            borderBottomColor: tokens.color.border,
            opacity: state.pressed ? 0.7 : 1,
          },
          showFocus(state as { focused?: boolean }) && focusRing,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          {compact ? (
            <T variant="caption" numberOfLines={1}>
              {CHAT_NOTICE_COMPACT}
            </T>
          ) : (
            <T variant="sub">{CHAT_NOTICE_BAND}</T>
          )}
        </View>
        <Icon name="chevron" size={compact ? 16 : 20} color={tokens.color.textMuted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <ChatNoticeSheetBody side={side} onSupport={onSupport} onClose={() => setOpen(false)} />
      </Sheet>
    </>
  );
}

/** 시트 안쪽(제목·줄·버튼). 시트(Modal) 없이도 그려 보도록 따로 둔다(scripts/test-chat-notice.mjs) */
export function ChatNoticeSheetBody({
  side,
  onSupport,
  onClose,
}: ChatNoticeConfig & { side: ChatNoticeSide; onClose: () => void }) {
  const lines = chatNoticeLines(side, !onSupport);
  return (
    <>
      <T variant="heading" accessibilityRole="header">
        {CHAT_NOTICE_TITLE}
      </T>
      <View testID="chat-notice-lines" style={{ gap: 6 }}>
        {lines.map((line) => (
          <View key={line} style={{ flexDirection: "row", gap: 8 }}>
            <T>•</T>
            <T style={{ flex: 1, minWidth: 0 }}>{line}</T>
          </View>
        ))}
      </View>
      <View style={{ gap: 8 }}>
        {onSupport ? (
          <Button
            label={CHAT_NOTICE_SUPPORT_LABEL}
            variant="outline"
            onPress={() => {
              onClose();
              onSupport();
            }}
          />
        ) : null}
        <Button label="확인" onPress={onClose} />
      </View>
    </>
  );
}
