import {
  Image,
  View,
  type ImageSourcePropType,
  type TextStyle,
} from "react-native";
import { T } from "./Text";
import { SourcePhoto } from "./SourcePhoto";
import { IllustrationBackdrop } from "./IllustrationBackdrop";
import { tokens } from "./tokens";
export const SOURCE_MODULES = [
  ["hero", "상품 소개"],
  ["summary", "한눈에 보기"],
  ["composition", "상품 구성"],
  ["pieceCount", "수량 안내"],
  ["taste", "맛과 향"],
  ["specification", "규격"],
  ["sizePhoto", "크기 참고"],
  ["crossSectionPhoto", "속 모습"],
  ["qualityEvidence", "품질 확인"],
  ["productionProcess", "재배와 선별"],
  ["packagePhoto", "포장 모습"],
  ["delivery", "배송 안내"],
  ["storage", "보관 방법"],
  ["appearanceFaq", "생김새 안내"],
  ["support", "문의 안내"],
  ["farmStory", "농가 이야기"],
  ["farmPhotos", "농가 사진"],
  ["farmUpdates", "농가 소식"],
] as const;

type Module = {
  id: string;
  texts: { fieldKey: string; value: string }[];
  photos: { uri: string; alt: string }[];
  illustrationId?: string | null;
};
const illustrations: Record<string, ImageSourcePropType> = {
  "hand-citrus-small": require("../assets/source/outline-small.png"),
  "hand-citrus-medium": require("../assets/source/outline-medium.png"),
  "hand-citrus-large": require("../assets/source/outline-large.png"),
};
const groups = [
  {
    id: "composition",
    title: "받으실 구성",
    modules: ["composition", "pieceCount"],
    icon: require("../assets/source/headings/composition.png"),
  },
  {
    id: "taste",
    title: "맛과 크기",
    modules: ["taste", "specification", "sizePhoto", "crossSectionPhoto"],
    icon: require("../assets/source/headings/taste.png"),
  },
  {
    id: "production",
    title: "품질과 생산 과정",
    modules: ["qualityEvidence", "productionProcess"],
    icon: require("../assets/source/headings/production.png"),
  },
  {
    id: "packing",
    title: "포장과 배송",
    modules: ["packagePhoto", "delivery"],
    icon: require("../assets/source/headings/packing.png"),
  },
  {
    id: "storage",
    title: "보관 방법",
    modules: ["storage"],
    icon: require("../assets/source/headings/storage.png"),
  },
  {
    id: "faq",
    title: "구매 전 확인",
    modules: ["appearanceFaq", "support"],
    icon: require("../assets/source/headings/faq.png"),
  },
  {
    id: "farm",
    title: "농가 이야기",
    modules: ["farmStory", "farmPhotos"],
    icon: require("../assets/source/headings/farm.png"),
  },
  {
    id: "updates",
    title: "농가 소식",
    modules: ["farmUpdates"],
    icon: require("../assets/source/headings/updates.png"),
  },
];
const bodyStyle: TextStyle = { fontSize: 17, lineHeight: 28, color: "#242424" };
const hasContent = (module: Module) =>
  module.texts.some((text) => text.value.trim()) ||
  module.photos.length > 0 ||
  !!(module.illustrationId && illustrations[module.illustrationId]);

function Illustration({ id, inset = 22 }: { id: string; inset?: number }) {
  return (
    <View
      testID="source-size-panel"
      style={{
        gap: 8,
        marginTop: 16,
        marginHorizontal: -inset,
        paddingHorizontal: 24,
        paddingVertical: 28,
        overflow: "hidden",
      }}
    >
      <IllustrationBackdrop />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, aspectRatio: 1 }}>
          <Image
            source={illustrations[id]}
            accessibilityLabel="설명용 감귤 크기 일러스트"
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
          />
        </View>
        <View style={{ width: 70, gap: 4 }}>
          <T variant="caption" color={tokens.color.onAccent} center>
            기준 손 길이
          </T>
          <T center style={{ fontSize: 25, lineHeight: 35, color: tokens.color.onAccent }}>
            18cm
          </T>
          <T variant="caption" color={tokens.color.onAccent} center>
            {"손끝~손목\n비교용 가정"}
          </T>
        </View>
      </View>
      <T variant="caption" color={tokens.color.onAccent} center>
        크기 설명용 일러스트 · 실제 규격 아님
      </T>
    </View>
  );
}

function ModuleBody({
  module,
  mediaUrl,
  inset = 22,
}: {
  module: Module;
  mediaUrl: (uri: string) => string;
  inset?: number;
}) {
  const subheading = [
    "pieceCount",
    "specification",
    "sizePhoto",
    "crossSectionPhoto",
    "qualityEvidence",
    "productionProcess",
    "delivery",
    "appearanceFaq",
    "support",
  ].includes(module.id)
    ? SOURCE_MODULES.find(([id]) => id === module.id)?.[1]
    : null;
  return (
    <View testID={`source-module-${module.id}`} style={{ gap: 14 }}>
      {subheading ? (
        <T
          accessibilityRole="header"
          weight="semibold"
          style={{ fontSize: 18, lineHeight: 26, color: "#555" }}
        >
          {subheading}
        </T>
      ) : null}
      {module.texts
        .filter((text) => text.value.trim())
        .map((text, i) => (
          <T
            key={`${text.fieldKey}-${i}`}
            style={[
              bodyStyle,
              module.id === "composition" && {
                fontSize: 20,
                lineHeight: 32,
                fontWeight: "600",
              },
              module.id === "taste" && { fontSize: 19, lineHeight: 31 },
              module.id === "farmStory" && { fontSize: 20, lineHeight: 32 },
            ]}
          >
            {text.value}
          </T>
        ))}
      {module.photos.map((photo, i) => (
        <SourcePhoto
          key={`${photo.uri}-${i}`}
          uri={mediaUrl(photo.uri)}
          alt={photo.alt}
        />
      ))}
      {module.illustrationId && illustrations[module.illustrationId] ? (
        <Illustration id={module.illustrationId} inset={inset} />
      ) : null}
    </View>
  );
}

export function ModuleStory({
  content,
  mediaUrl = (uri: string) => uri,
}: {
  content: { modules: Module[] };
  mediaUrl?: (uri: string) => string;
}) {
  const filled = content.modules.filter(hasContent);
  if (!filled.length) return null;
  const hero = filled.find((module) => module.id === "hero");
  const summary = filled.find((module) => module.id === "summary");
  return (
    <View
      testID="source-detail"
      style={{ backgroundColor: "#fff", paddingBottom: 24 }}
    >
      {hero || summary ? (
        <View
          testID="source-cover"
          style={{ paddingTop: 12, paddingBottom: 18 }}
        >
          {hero?.photos.map((photo, i) => (
            <SourcePhoto
              key={`${photo.uri}-${i}`}
              uri={mediaUrl(photo.uri)}
              alt={photo.alt}
            />
          ))}
          <View style={{ paddingHorizontal: 24, paddingTop: 24, gap: 16 }}>
            {hero?.texts
              .filter((text) => text.value.trim())
              .map((text, i) => (
                <T
                  key={`${text.fieldKey}-${i}`}
                  center
                  accessibilityRole={
                    text.fieldKey === "name" ? "header" : "text"
                  }
                  style={
                    text.fieldKey === "name"
                      ? {
                          fontSize: 38,
                          lineHeight: 46,
                          fontWeight: "600",
                          letterSpacing: -1.8,
                          color: "#484848",
                        }
                      : bodyStyle
                  }
                >
                  {text.value}
                </T>
              ))}
            {hero?.illustrationId && illustrations[hero.illustrationId] ? (
              <Illustration id={hero.illustrationId} inset={24} />
            ) : null}
            {summary ? (
              <View
                style={{
                  borderTopWidth: 1,
                  borderColor: "#bdbdbd",
                  paddingTop: 20,
                }}
              >
                <ModuleBody module={summary} mediaUrl={mediaUrl} inset={24} />
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
      {groups.map((group) => {
        const modules = group.modules.flatMap((id) =>
          filled.filter((module) => module.id === id),
        );
        if (!modules.length) return null;
        return (
          <View
            key={group.id}
            testID={`source-section-${group.id}`}
            style={{ paddingHorizontal: 22, paddingVertical: 28, gap: 22 }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {group.icon ? (
                <Image
                  testID={`source-heading-icon-${group.id}`}
                  source={group.icon}
                  accessible={false}
                  aria-hidden
                  resizeMode="contain"
                  style={{ width: 36, height: 36 }}
                />
              ) : null}
              <T
                accessibilityRole="header"
                style={{
                  fontSize: 26,
                  lineHeight: 35,
                  fontWeight: "600",
                  color: "#555",
                  letterSpacing: -0.8,
                  flexShrink: 1,
                }}
              >
                {group.title}
              </T>
              <View
                style={{
                  height: 1,
                  minWidth: 12,
                  flexGrow: 1,
                  backgroundColor: "#bbb",
                }}
              />
            </View>
            {modules.map((module) => (
              <ModuleBody key={module.id} module={module} mediaUrl={mediaUrl} />
            ))}
          </View>
        );
      })}
    </View>
  );
}
