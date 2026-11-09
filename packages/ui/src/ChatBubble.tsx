import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "./Icon";
import { T } from "./Text";
import { tokens } from "./tokens";

/** 상대 아바타 지름(Figma 1:38·7:78). 묶음 뒤 말풍선은 같은 폭을 비워 둬 왼쪽 선을 맞춘다 */
export const BUBBLE_AVATAR = 36;
/** 내 말풍선 배경(옅은 주황) */
const MINE_BG = "#FFF2E9";

type Props = {
  /** farm = 상대(흰색, 왼쪽) · me = 나(옅은 주황, 오른쪽) · ai = AI 안내(얇은 회색 테두리 + 'AI 안내' 라벨, 왼쪽) */
  kind: "farm" | "me" | "ai";
  quote?: { senderType: string; body: string };
  /** 인용 블록 머리글. 없으면 보낸 사람 종류로 '농가에게 답장' 등 */
  quoteLabel?: string;
  edited?: boolean;
  text: string;
  /** 보낸 시각. 묶음 마지막 말풍선 옆에만 보인다 */
  time?: string;
  /** 상대 이름. 묶음 첫 말풍선 위에만 보인다 */
  sender?: string;
  /** 상대 아바타. 주면 상대 말풍선 왼쪽에 아바타 칸을 두고 묶음 첫 말풍선에만 그린다 */
  avatar?: ReactNode;
  /** 묶음의 첫 말풍선(아바타·이름·AI 라벨·꼬리 모서리) */
  first?: boolean;
  /** 묶음의 마지막 말풍선(시각) */
  last?: boolean;
  /** AI 근거 요약 */
  basis?: string;
  /** 말풍선 아래 보조 줄(넘긴 이유, 연락처 가림 안내 등) */
  note?: string;
  /** 내 질문의 전달 상태 줄(DEV-208). 넘김 아이콘 16 + 메타 글자 */
  status?: string;
  /** 말풍선 옆, 시각 위에 붙는 작은 표시(읽음, 하트, '농가만 봐요') */
  side?: ReactNode;
  /** 말풍선 줄 아래(예: '답변 확인 요청' 글자 버튼) */
  footer?: ReactNode;
  /** 말풍선 아래 사진·영상. 시각은 이 묶음의 맨 아래 옆에 붙는다 */
  children?: ReactNode;
};

/** 채팅 말풍선: 채팅 글자 토큰 · 안쪽 12/16 · 최대 폭 272 · 묶음 첫 말풍선만 꼬리 쪽 모서리 4 */
export function ChatBubble({
  kind,
  quote,
  quoteLabel,
  edited,
  text,
  time,
  sender,
  avatar,
  first = true,
  last = true,
  basis,
  note,
  status,
  side,
  footer,
  children,
}: Props) {
  const mine = kind === "me";
  const withAvatar = !mine && kind !== "ai" && avatar !== undefined;
  const meta =
    side || (last && time) ? (
      <View
        style={{
          flexShrink: 0,
          alignItems: mine ? "flex-end" : "flex-start",
          gap: 2,
        }}
      >
        {side}
        {last && time ? (
          <T variant="caption" muted>
            {time}
          </T>
        ) : null}
      </View>
    ) : null;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: mine ? "flex-end" : "flex-start",
        gap: tokens.space.sm,
      }}
    >
      {withAvatar ? (
        <View style={{ width: BUBBLE_AVATAR, flexShrink: 0 }}>
          {first ? avatar : null}
        </View>
      ) : null}
      <View
        style={{
          flexShrink: 1,
          minWidth: 0,
          alignItems: mine ? "flex-end" : "flex-start",
          gap: tokens.space.xs,
        }}
      >
        {first && kind === "ai" ? (
          <AiBadge />
        ) : first && sender && !mine ? (
          <T variant="caption" weight="semibold" numberOfLines={1}>
            {sender}
          </T>
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 6,
            maxWidth: "100%",
          }}
        >
          {mine ? meta : null}
          <View
            style={{
              flexShrink: 1,
              minWidth: 0,
              gap: tokens.space.xs,
              alignItems: mine ? "flex-end" : "flex-start",
            }}
          >
            {text || basis || quote ? (
              <View
                style={{
                  maxWidth: 272,
                  paddingVertical: 12,
                  paddingHorizontal: tokens.space.md,
                  borderRadius: tokens.radius.md,
                  ...(first
                    ? mine
                      ? { borderTopRightRadius: tokens.radius.bubbleTail }
                      : { borderTopLeftRadius: tokens.radius.bubbleTail }
                    : null),
                  backgroundColor: mine ? MINE_BG : tokens.color.background,
                  borderWidth: kind === "ai" ? 1 : 0,
                  borderColor: tokens.color.border,
                }}
              >
                {quote ? (
                  <View
                    testID="bubble-quote"
                    style={{
                      borderLeftWidth: 2,
                      borderLeftColor: tokens.color.accent,
                      paddingLeft: tokens.space.sm,
                      marginBottom: tokens.space.sm,
                      gap: 2,
                    }}
                  >
                    <T variant="caption" muted weight="semibold">
                      {quoteLabel ?? `${senderLabel(quote.senderType)}에게 답장`}
                    </T>
                    <T variant="caption" muted numberOfLines={2}>
                      {quote.body || "사진"}
                    </T>
                  </View>
                ) : null}
                {text ? <T variant="chat">{text}</T> : null}
                {basis ? (
                  <T variant="caption" muted style={{ marginTop: 4 }}>
                    근거: {basis}
                  </T>
                ) : null}
              </View>
            ) : null}
            {children}
          </View>
          {!mine ? meta : null}
        </View>
        {edited ? (
          <T variant="caption" muted style={{ fontStyle: "italic" }}>
            수정됨
          </T>
        ) : null}
        {footer}
        {status ? (
          <View
            testID="chat-forward-status"
            accessibilityRole="text"
            style={{ flexDirection: "row", alignItems: "center", gap: 4, maxWidth: 300 }}
          >
            <Icon name="forward" size={16} strokeWidth={2} color={tokens.color.text} />
            <T variant="caption">{status}</T>
          </View>
        ) : null}
        {note ? (
          <T variant="caption" muted style={{ maxWidth: 300 }}>
            {note}
          </T>
        ) : null}
      </View>
    </View>
  );
}

function senderLabel(type: string) {
  return type === "PRODUCER" ? "농가" : type === "AI" ? "AI 안내" : type === "OPERATOR" ? "farmclub" : "소비자";
}

/** AI 안내 라벨: 회색 면 작은 칩(Figma 1:38) */
export function AiBadge() {
  return (
    <View
      style={{
        height: 20,
        paddingHorizontal: 6,
        borderRadius: 4,
        backgroundColor: tokens.color.border,
        justifyContent: "center",
      }}
    >
      <T variant="caption" weight="semibold">
        AI 안내
      </T>
    </View>
  );
}

/** 날짜 알약 "10월 7일 화요일"(Figma 1:38). 대화 가운데 회색 면 */
export function DayPill({ label }: { label: string }) {
  return (
    <View
      style={{
        alignSelf: "center",
        paddingHorizontal: 12,
        paddingVertical: 2,
        marginVertical: tokens.space.sm,
        borderRadius: tokens.radius.full,
        backgroundColor: tokens.color.border,
      }}
    >
      <T variant="caption" muted>
        {label}
      </T>
    </View>
  );
}

/** 대화 맨 위 가운데 회색 시스템 문구 한 줄(예: 'AI 안내가 꺼져 있어요 · 농가가 직접 답해요') */
export function SystemLine({ text, testID }: { text: string; testID?: string }) {
  return (
    <View testID={testID} style={{ paddingHorizontal: tokens.space.md }}>
      <T variant="caption" muted center>
        {text}
      </T>
    </View>
  );
}
