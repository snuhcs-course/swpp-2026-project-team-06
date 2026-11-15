// SCR-22 현황 맨 위 소비자 페이지 안내(DEV-326, 11/15 생산자 피드백: 소비자 페이지에 어떻게 들어가는지 모름).
// 디자인: PM이 고른 Figma C3(주황 계열 내 농가 카드, 도메인은 오른쪽 버튼에만).
// 오른쪽 'farmclub.kr' 버튼은 페이지를 열지 않고 내 농가 링크만 복사한다(PM 11/15). 링크는 설정 › 농가 프로필·공유 링크의
// '복사'와 같은 공유 링크(shareUrl, 서버가 절대 주소로 줌 — 카카오톡 미리보기용 /s/farms/:id). 승인 농가만 값이 있다.
import type { MyFarm } from "@farmclub/api";
import { Icon, Photo, T, tokens } from "@farmclub/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { useSession } from "./session";
import { copyText } from "./views";

/** 연주황 면은 생산자 기준표 accent 옅은 배경(apps/producer/spec.md DEV-294), 테두리는 Figma C3 값. 라벨 글자는 대비를 위해 accentPressed */
const TINT = "#FDECE2";
const TINT_BORDER = "#F6D9C4";

/** 닫았는지는 이 기기(브라우저)·농가별로 기억한다. 저장소를 못 쓰면(네이티브 앱 포함) 앱을 다시 실행하기 전까지만 닫힌다 */
const keyFor = (farmId: string) =>
  `farmclub-producer:consumer-page-card-closed:${farmId}`;
function closedBefore(farmId: string) {
  try {
    return globalThis.localStorage?.getItem(keyFor(farmId)) === "1";
  } catch {
    return false;
  }
}

export function ConsumerPageCard({ farm }: { farm: MyFarm }) {
  const { toast } = useSession();
  const [closed, setClosed] = useState(() => closedBefore(farm.farmId));
  if (closed) return null;
  const close = () => {
    setClosed(true);
    try {
      globalThis.localStorage?.setItem(keyFor(farm.farmId), "1");
    } catch {
      // 이번 화면에서만 닫힌다
    }
  };
  const link = farm.shareUrl;
  const copy = async () => {
    if (!link) return;
    const ok = await copyText(link);
    toast(ok ? "링크를 복사했어요" : "복사하지 못했어요", {
      tone: ok ? "success" : "error",
    });
  };
  return (
    <View
      testID="consumer-page-card"
      style={{
        padding: tokens.space.md,
        gap: 12,
        borderRadius: tokens.radius.md,
        backgroundColor: TINT,
        borderWidth: 1,
        borderColor: TINT_BORDER,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <T variant="sub" weight="semibold" color={tokens.color.accentPressed}>
          소비자가 보는 내 농가
        </T>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="소비자 페이지 안내 닫기"
          onPress={close}
          hitSlop={14}
        >
          <Icon name="close" size={20} color={tokens.color.textMuted} />
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Photo
          uri={farm.photo}
          width={56}
          height={56}
          radius={12}
          kind="farm"
          alt={farm.name}
          style={{ backgroundColor: tokens.color.background }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="body" weight="semibold" numberOfLines={1}>
            {farm.name}
          </T>
          {farm.region ? (
            <T variant="sub" muted numberOfLines={1}>
              {farm.region}
            </T>
          ) : null}
        </View>
        {/* 공유 링크가 없으면(설정 화면처럼) 복사 버튼을 두지 않는다 */}
        {link ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="farmclub.kr 내 농가 링크 복사"
            onPress={() => void copy()}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingLeft: 14,
              paddingRight: 12,
              borderRadius: tokens.radius.full,
              backgroundColor: pressed
                ? tokens.color.accentPressed
                : tokens.color.accent,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            })}
          >
            <T variant="body" weight="semibold" color={tokens.color.onAccent}>
              farmclub.kr
            </T>
            <Icon name="copy" size={18} color={tokens.color.onAccent} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
