import { Image, View, type ImageSourcePropType } from "react-native";
import { T } from "./Text";
import { StoryImage } from "./DetailStory";
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
const illustrations: Record<string, ImageSourcePropType> = {
  "hand-citrus-small":
    require("../assets/source/outline-small.png") as ImageSourcePropType,
  "hand-citrus-medium":
    require("../assets/source/outline-medium.png") as ImageSourcePropType,
  "hand-citrus-large":
    require("../assets/source/outline-large.png") as ImageSourcePropType,
};
export function ModuleStory({
  content,
  mediaUrl = (uri: string) => uri,
}: {
  content: {
    modules: {
      id: string;
      texts: { fieldKey: string; value: string }[];
      photos: { uri: string; alt: string }[];
      illustrationId?: string | null;
    }[];
  };
  mediaUrl?: (uri: string) => string;
}) {
  return (
    <View style={{ gap: 24, paddingVertical: 24 }}>
      {SOURCE_MODULES.map(([id, title]) => {
        const module = content.modules.find((m) => m.id === id);
        if (
          !module ||
          (!module.texts.length &&
            !module.photos.length &&
            !module.illustrationId)
        )
          return null;
        return (
          <View key={id} style={{ gap: 14 }}>
            <View
              style={{
                marginHorizontal: 20,
                paddingTop: 16,
                borderTopWidth: 1,
                borderColor: tokens.color.border,
              }}
            >
              <T variant="title" accessibilityRole="header">
                {title}
              </T>
            </View>
            {module.texts.map((text, i) => (
              <View
                key={`${text.fieldKey}-${i}`}
                style={{ paddingHorizontal: 24 }}
              >
                <T style={{ lineHeight: 27 }}>{text.value}</T>
              </View>
            ))}
            {module.photos.map((photo) => (
              <StoryImage
                key={photo.uri}
                uri={mediaUrl(photo.uri)}
                alt={photo.alt}
              />
            ))}
            {module.illustrationId && illustrations[module.illustrationId] ? (
              <View style={{ paddingHorizontal: 24, gap: 8 }}>
                <Image
                  source={illustrations[module.illustrationId]}
                  accessibilityLabel="설명용 감귤 크기 일러스트"
                  resizeMode="contain"
                  style={{ width: "100%", height: 230 }}
                />
                <T variant="caption">
                  설명용 일러스트 · 기준 손 길이 18cm (손끝~손목, 비교용 가정).
                  실제 상품 치수가 아니에요.
                </T>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
