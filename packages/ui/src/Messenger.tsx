import type { ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { useState } from "react";
import { T } from "./Text";
import { Badge, IconButton } from "./bars";
import { Icon } from "./Icon";
import { tokens } from "./tokens";
import { focusRing } from "./web";
import { relative, seoulDay } from "./format";

export function ProfileAvatar({
  uri,
  name,
  size = 48,
}: {
  uri?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: "hidden",
        flexShrink: 0,
        backgroundColor: tokens.color.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {uri && failed !== uri ? (
        <Image
          source={{ uri }}
          accessibilityLabel={`${name} 프로필`}
          style={{ width: size, height: size }}
          onError={() => setFailed(uri)}
        />
      ) : (
        <T weight="semibold" muted>
          {name.trim().slice(0, 1) || "농"}
        </T>
      )}
    </View>
  );
}
/** 목록 시각: 오늘이면 "오전 8:30", 어제면 "어제", 그 밖에는 "10월 2일"(한국 날짜, DEV-223·DEV-295) */
export function messageTime(value?: string | null, now: Date = new Date()) {
  if (!value) return "";
  if (!Number.isFinite(new Date(value).getTime())) return "";
  return relative(value, seoulDay(now.toISOString()));
}
export function ConversationRow({
  name,
  photo,
  preview,
  at,
  unread = 0,
  status,
  onPress,
  testID,
  avatar,
  media,
  tag,
  tagLabel,
}: {
  name: string;
  /** 이름 옆 작은 태그(예: 'AI 답변 확인' 깃발 칩, DEV-296) */
  tag?: ReactNode;
  /** 태그의 접근성 글자(줄 이름에 덧붙인다) */
  tagLabel?: string;
  photo?: string | null;
  /** 사진 대신 보일 그림(예: farmclub 문의 대화방의 로고, DEV-111) */
  avatar?: ReactNode;
  /** 마지막 메시지가 사진·영상이면 미리보기 앞 사진 표시 글자(예: '사진'). DEV-295 */
  media?: string;
  preview: string;
  at?: string | null;
  unread?: number;
  status?: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}${tagLabel ? `, ${tagLabel}` : ""}, ${[media, preview].filter(Boolean).join(" ")}${unread ? `, 안 읽음 ${unread}` : ""}`}
      onPress={onPress}
      testID={testID}
      style={({ pressed, ...state }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 72,
          paddingVertical: 12,
          paddingHorizontal: tokens.space.gutter,
          backgroundColor: pressed ? tokens.color.surface : "transparent",
        },
        (state as { focused?: boolean }).focused && focusRing,
      ]}
    >
      {avatar ?? <ProfileAvatar uri={photo} name={name} />}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T
            weight={unread ? "bold" : "semibold"}
            numberOfLines={1}
            style={tag ? { flexShrink: 1, minWidth: 0 } : { flex: 1, minWidth: 0 }}
          >
            {name}
          </T>
          {tag ? <View style={{ flex: 1, minWidth: 0, alignItems: "flex-start" }}>{tag}</View> : null}
          <T variant="caption" muted style={{ flexShrink: 0 }}>
            {messageTime(at)}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {media ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0 }}>
              <Icon name="photo" size={16} color={tokens.color.textMuted} />
              <T variant="sub" muted>
                {media}
              </T>
            </View>
          ) : null}
          <T
            variant="sub"
            muted={!unread}
            numberOfLines={1}
            style={{ flex: 1, minWidth: 0 }}
          >
            {preview}
          </T>
          {unread > 0 ? <Badge count={unread} /> : null}
        </View>
        {status ? (
          <T variant="caption" muted>
            {status}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}
export function ConversationHeader({
  name,
  photo,
  subtitle,
  onBack,
  onProfile,
  right,
  height = tokens.height.header,
  avatar,
}: {
  name: string;
  photo?: string | null;
  avatar?: ReactNode;
  /** 이름 아래 한 줄(예: '팔로워 128명'). 없으면 이름만 */
  subtitle?: string;
  onBack: () => void;
  onProfile?: () => void;
  right?: ReactNode;
  height?: number;
}) {
  const profile = (
    <>
      {avatar ?? <ProfileAvatar name={name} uri={photo} size={40} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <T weight="bold" numberOfLines={1}>
          {name}
        </T>
        {subtitle ? (
          <T variant="caption" muted numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
    </>
  );
  return (
    <View
      style={{
        minHeight: height,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <IconButton
        icon="back"
        label="뒤로"
        onPress={onBack}
        testID="header-back"
      />
      {onProfile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 농가 보기`}
          onPress={onProfile}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          {profile}
        </Pressable>
      ) : (
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          {profile}
        </View>
      )}
      {right}
    </View>
  );
}

/**
 * 채팅 목록 머리의 밑줄 탭(DEV-295, Figma 7:75·7:90). 큰 알약 버튼 대신 왼쪽 정렬 글자 탭 + 건수.
 * 건수가 없거나 0이면 숫자를 그리지 않는다. 접근성 이름은 탭 이름만(건수는 각 행이 읽는다).
 */
export function ChatTabs<K extends string>({
  value,
  onChange,
  tabs,
}: {
  value: K;
  onChange: (value: K) => void;
  tabs: { key: K; label: string; count?: number; testID?: string }[];
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        gap: tokens.space.lg,
        paddingHorizontal: tokens.space.gutter,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            aria-selected={selected}
            onPress={() => onChange(tab.key)}
            testID={tab.testID}
            style={({ ...state }) => [
              {
                height: tokens.touchTarget.min,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderBottomWidth: 2,
                borderBottomColor: selected ? tokens.color.text : "transparent",
                marginBottom: -1,
              },
              (state as { focused?: boolean }).focused && focusRing,
            ]}
          >
            <T weight={selected ? "bold" : "regular"} muted={!selected} numberOfLines={1}>
              {tab.label}
            </T>
            {tab.count ? (
              <T
                weight="bold"
                color={selected ? tokens.color.accent : tokens.color.textMuted}
              >
                {tab.count > 99 ? "99+" : tab.count}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
