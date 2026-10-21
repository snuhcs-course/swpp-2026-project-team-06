// DEV-109: 탭 화면 오른쪽 위 도움말(?) 버튼과 처음 쓰는 생산자를 위한 안내 시트.
// 현황(SCR-22)에서만 처음 한 번 자동으로 열고, 본 기록은 앱별 localStorage에 남긴다.
import { readStore, writeStore } from "@farmclub/api";
import {
  Button,
  Icon,
  IconButton,
  Sheet,
  T,
  tokens,
  type IconName,
} from "@farmclub/ui";
import { useState } from "react";
import { View } from "react-native";
import { useSession } from "./session";

const HELP_GUIDE_SEEN = "help-guide-seen";

const STEPS: { title: string; body: string; icon: IconName }[] = [
  {
    title: "farmclub에 오신 걸 환영해요",
    body: "처음이라 낯설 수 있어요. 자주 쓰는 기능을 하나씩 짧게 알려 드릴게요.",
    icon: "citrus",
  },
  {
    title: "새 상품 등록하기",
    body: "상품 탭 오른쪽 아래 '새 상품' 버튼을 눌러 시작해요. 안내에 따라 빈칸을 채우고 게시를 요청하면, 운영자 확인을 거쳐 판매가 시작돼요.",
    icon: "box",
  },
  {
    title: "AI가 판매페이지 초안을 써 드려요",
    body: "평소 쓰던 홍보 문구나 사진, 자료를 넣으면 AI가 상품 정보와 판매페이지 초안을 채워 드려요. 마음에 들지 않는 부분만 고친 뒤 게시를 요청하시면 돼요.",
    icon: "pencil",
  },
  {
    title: "채팅방 둘러보기",
    body: "채팅 탭의 '소식방'에는 농가 소식을 올리고, '1:1 채팅'에서는 소비자의 질문과 주문 문의에 답해요.",
    icon: "news",
  },
  {
    title: "반복되는 질문은 AI가 먼저 답해요",
    body: "1:1 채팅에서 'AI 자동 안내'가 켜져 있으면 자주 묻는 질문에 AI가 먼저 답해요. 직접 답하고 싶을 때는 '직접 응대로 전환'을 누르세요. 자세한 설정은 환경설정 › AI 응답 설정에서 바꿀 수 있어요.",
    icon: "chat",
  },
  {
    title: "궁금한 게 있으면 언제든지",
    body: "모르는 게 있으면 운영자에게 편하게 문의해 주세요. 이 안내는 화면 오른쪽 위 ? 버튼을 누르면 다시 볼 수 있어요.",
    icon: "question",
  },
];

/** 탭 화면 헤더 오른쪽에 둔다. autoOpen이면 아직 안내를 본 적 없을 때 바로 연다 */
export function HelpButton({ autoOpen = false }: { autoOpen?: boolean }) {
  const { user } = useSession();
  // 승인 전 사용자는 관문이 곧 다른 화면으로 보내므로 자동으로 열지 않는다.
  const [open, setOpen] = useState(
    () =>
      autoOpen &&
      user?.farmStatus === "APPROVED" &&
      readStore(HELP_GUIDE_SEEN) === null,
  );
  return (
    <>
      <IconButton
        icon="question"
        label="도움말"
        onPress={() => setOpen(true)}
      />
      {open ? (
        <HelpGuideSheet
          onClose={() => {
            writeStore(HELP_GUIDE_SEEN, "1");
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

// 닫으면 언마운트되므로 다시 열면 첫 단계부터 시작한다.
function HelpGuideSheet({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  return (
    <Sheet visible onClose={onClose} title="farmclub 사용 안내">
      <View
        style={{
          padding: tokens.space.md,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.md,
          gap: 8,
        }}
      >
        <Icon name={step.icon} color={tokens.color.accent} />
        <T variant="heading" accessibilityRole="header">
          {step.title}
        </T>
        <T>{step.body}</T>
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
        }}
      >
        {STEPS.map((s, i) => (
          <View
            key={s.title}
            style={{
              width: i === index ? 16 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor:
                i === index ? tokens.color.accent : tokens.color.border,
            }}
          />
        ))}
        <T variant="sub" muted style={{ marginLeft: 4 }}>
          {index + 1} / {STEPS.length}
        </T>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {index > 0 ? (
          <Button
            label="이전"
            variant="secondary"
            size="producer"
            style={{ flex: 1 }}
            onPress={() => setIndex(index - 1)}
          />
        ) : null}
        <Button
          label={last ? "시작하기" : "다음"}
          size="producer"
          style={{ flex: 1 }}
          onPress={() => (last ? onClose() : setIndex(index + 1))}
        />
      </View>
    </Sheet>
  );
}
