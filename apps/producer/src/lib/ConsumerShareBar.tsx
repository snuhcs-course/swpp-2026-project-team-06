// SCR-22 현황 머리 아래 고정 막대 '소비자에게 우리 농가 공유하기'(DEV-331, Figma v6 시안 D 689:6985).
// DEV-326의 닫을 수 있는 큰 카드를 바꿨다: 닫으면 링크를 다시 찾기 어렵고, 복사는 단골에게 보내는 버튼이라 계속 쓴다(PM 11/15).
// 오른쪽 'farmclub.kr' 버튼은 페이지를 열지 않고 내 농가 링크만 복사한다(PM 11/15). 링크는 설정 › 농가 프로필·공유 링크의
// '복사'와 같은 공유 링크(shareUrl, 서버가 절대 주소로 줌 — 카카오톡 미리보기용 /s/farms/:id). 승인 농가만 값이 있다.
import type { MyFarm } from "@farmclub/api";
import { Icon, T, tokens } from "@farmclub/ui";
import { Pressable, View } from "react-native";

import { useSession } from "./session";
import { copyText } from "./views";

/** 연주황 면은 생산자 기준표 accent 옅은 배경(apps/producer/spec.md DEV-294), 테두리는 Figma C3·D 값 */
const TINT = "#FDECE2";
const TINT_BORDER = "#F6D9C4";

export function ConsumerShareBar({ farm }: { farm: MyFarm }) {
  const { toast } = useSession();
  const link = farm.shareUrl;
  // 복사할 링크가 없으면 띄우지 않는다. 호출부(현황)가 여백까지 빼려고 먼저 거르지만, 여기서도 타입을 좁힌다
  if (!link) return null;
  const copy = async () => {
    const ok = await copyText(link);
    toast(ok ? "링크를 복사했어요" : "복사하지 못했어요", {
      tone: ok ? "success" : "error",
    });
  };
  // 막대 전체가 복사 버튼이다: 오른쪽 알약은 눈에 보이는 버튼이고, 누르는 영역은 막대 전체(높이 48)라
  // 작은 버튼을 정확히 누르지 않아도 된다(웹은 hitSlop이 먹지 않는다).
  return (
    <Pressable
      testID="consumer-share-bar"
      accessibilityRole="button"
      accessibilityLabel="소비자에게 우리 농가 공유하기, farmclub.kr 링크 복사"
      onPress={() => void copy()}
      style={{
        minHeight: tokens.touchTarget.min,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 14,
        paddingRight: 6,
        borderRadius: tokens.radius.sm,
        backgroundColor: TINT,
        borderWidth: 1,
        borderColor: TINT_BORDER,
      }}
    >
      {({ pressed }) => (
        <>
          {/* 한 줄 고정(numberOfLines)을 두지 않는다: 대체 글꼴·큰 글자 설정에서 잘리지 않고 두 줄로 내려가며 막대가 함께 늘어난다 */}
          <T variant="sub" weight="semibold" style={{ flex: 1 }}>
            소비자에게 우리 농가 공유하기
          </T>
          <View
            style={{
              minHeight: 32,
              paddingVertical: 4,
              paddingLeft: 12,
              paddingRight: 10,
              borderRadius: tokens.radius.full,
              backgroundColor: pressed ? tokens.color.accentPressed : tokens.color.accent,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
            }}
          >
            <T variant="sub" weight="semibold" color={tokens.color.onAccent}>
              farmclub.kr
            </T>
            <Icon name="copy" size={16} color={tokens.color.onAccent} />
          </View>
        </>
      )}
    </Pressable>
  );
}
