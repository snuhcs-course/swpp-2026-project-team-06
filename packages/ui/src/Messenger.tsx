import type { ReactNode } from "react";
import { Image, Pressable, View } from "react-native";
import { useState } from "react";
import { T } from "./Text";
import { Badge, IconButton } from "./bars";
import { tokens } from "./tokens";
import { focusRing } from "./web";

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
export function messageTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value),
    now = new Date();
  if (!Number.isFinite(date.getTime())) return "";
  return date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
export function ConversationRow({
  name,
  photo,
  preview,
  at,
  unread = 0,
  status,
  onPress,
}: {
  name: string;
  photo?: string | null;
  preview: string;
  at?: string | null;
  unread?: number;
  status?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${preview}${unread ? `, 안 읽음 ${unread}` : ""}`}
      onPress={onPress}
      style={({ pressed, ...state }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 20,
          paddingHorizontal: 20,
          backgroundColor: pressed ? tokens.color.surface : "transparent",
        },
        (state as { focused?: boolean }).focused && focusRing,
      ]}
    >
      <ProfileAvatar uri={photo} name={name} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <T
            weight={unread ? "bold" : "semibold"}
            numberOfLines={1}
            style={{ flex: 1, minWidth: 0 }}
          >
            {name}
          </T>
          <T variant="caption" muted style={{ flexShrink: 0 }}>
            {messageTime(at)}
          </T>
        </View>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <T
            variant="sub"
            muted
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
}: {
  name: string;
  photo?: string | null;
  subtitle: string;
  onBack: () => void;
  onProfile?: () => void;
  right?: ReactNode;
}) {
  const profile = (
    <>
      <ProfileAvatar name={name} uri={photo} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T weight="semibold" numberOfLines={1}>
          {name}
        </T>
        <T variant="caption" muted>
          {subtitle}
        </T>
      </View>
    </>
  );
  return (
    <View
      style={{
        minHeight: 76,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    >
      <IconButton icon="back" label="뒤로" onPress={onBack} />
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
            gap: 12,
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
