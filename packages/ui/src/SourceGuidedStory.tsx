import { useEffect, useState } from "react";
import { Image, Text, View, type TextStyle } from "react-native";
import type { StoryModule } from "./ModuleStory";
import { ViewablePhoto } from "./PrivatePhotos";
import { SOURCE_STORY_THEME as theme, type SourceStoryDesign, type SourceStoryMedia, type SourceStorySection } from "./sourceStoryDesign";
import { tokens } from "./tokens";

const body: TextStyle = { fontFamily: tokens.fontFamily, fontSize: 16, lineHeight: 28, letterSpacing: -0.2 };
const titles = { intro: "상품 소개", composition: "받으실 구성", taste: "맛과 크기", production: "재배와 선별", packing: "포장과 배송", storage: "보관 방법", faq: "구매 전 확인", farm: "농가 이야기", updates: "농가 소식" };

/** Keep the complete source region visible; even small source images stay at native width. */
function SourceMedia({ id, media, mediaUrl }: { id: string; media: SourceStoryMedia; mediaUrl: (uri: string) => string }) {
  const uri = mediaUrl(media.uri);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  const image = <Image source={{ uri }} accessibilityLabel={media.alt} resizeMode="contain"
    onError={() => setFailed(true)}
    style={{ width: "100%", aspectRatio: media.width / media.height }} />;
  return <View testID={`source-guided-media-${id}`} style={{ width: "100%", maxWidth: media.width, alignSelf: "center", gap: 10, backgroundColor: theme.paper }}>
    {failed ? <View style={{ minHeight: 96, padding: 20, backgroundColor: theme.cream, justifyContent: "center" }}>
      <Text style={[body, { color: theme.ink }]}>사진을 불러올 수 없어요</Text>
      <Text style={[body, { color: theme.muted }]}>{media.alt}</Text>
    </View> : media.kind === "comparison" ? <ViewablePhoto uri={uri}>{image}</ViewablePhoto> : image}
    {media.caption ? <Text style={[body, { color: theme.ink, paddingHorizontal: 20 }]}>{media.caption}</Text> : null}
    {!failed && media.kind === "comparison" ? <Text style={[body, { color: theme.muted, paddingHorizontal: 20, textAlign: "center" }]}>사진을 누르면 크게 볼 수 있어요</Text> : null}
  </View>;
}

/** Existing saved photos remain visible, with honest load failure and native bounds. */
function SavedPhoto({ uri, alt }: { uri: string; alt: string }) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false); setSize(null);
    Image.getSize(uri, (width, height) => { if (alive) setSize({ width, height }); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [uri]);
  if (failed) return <Text style={[body, { color: theme.muted, backgroundColor: theme.paper, padding: 12 }]}>사진을 불러올 수 없어요 · {alt}</Text>;
  if (!size) return <Text style={[body, { color: theme.muted, backgroundColor: theme.paper, padding: 12 }]}>사진 불러오는 중…</Text>;
  return <Image source={{ uri }} accessibilityLabel={alt} resizeMode="contain" onError={() => setFailed(true)}
    style={{ width: "100%", maxWidth: size.width, aspectRatio: size.width / size.height, alignSelf: "center" }} />;
}

function SavedModule({ module, section, mediaUrl }: { module: StoryModule; section: SourceStorySection; mediaUrl: (uri: string) => string }) {
  const accent = section.tone === "accent";
  const options = section.layout === "options" && module.id === "composition";
  const hero = section.layout === "hero" && module.id === "hero";
  return <View testID={`source-module-${module.id}`} style={{ gap: 20 }}>
    <View style={options ? { flexDirection: "row", flexWrap: "wrap", gap: 12 } : { gap: hero ? 20 : 16 }}>
      {module.texts.map((text, index) => !text.value.trim() ? null : <View key={`${text.fieldKey}-${index}`} style={options ? {
        flexBasis: "46%", flexGrow: 1, padding: 18, borderWidth: 1, borderColor: accent ? theme.accentInk : theme.border,
        backgroundColor: accent ? theme.accent : theme.paper, borderRadius: 2,
      } : undefined}>
        <Text nativeID={`sg-text-${module.id}-${index}`}
          accessibilityRole={hero && (text.fieldKey === "name" || index === 0) ? "header" : "text"}
          style={[body, { color: accent ? theme.accentInk : theme.ink },
            hero && (text.fieldKey === "name" || index === 0) ? { fontSize: 32, lineHeight: 42, fontWeight: "700", letterSpacing: -1 } : null,
            options ? { fontWeight: "600", lineHeight: 27 } : null]}>{text.value}</Text>
      </View>)}
    </View>
    {module.photos.map((photo, index) => <SavedPhoto key={`${photo.uri}-${index}`} uri={mediaUrl(photo.uri)} alt={photo.alt} />)}
  </View>;
}

/** Read-only, explicitly supplied local plan. This is deliberately not a page builder or API adapter. */
export function SourceGuidedStory({ content, design, mediaUrl = uri => uri }: {
  content: { modules: StoryModule[]; hiddenSectionIds?: string[] };
  design: SourceStoryDesign;
  mediaUrl?: (uri: string) => string;
}) {
  const hidden = content.hiddenSectionIds ?? [];
  const moduleMap = new Map(content.modules.map(module => [module.id, module]));
  const sections = design.sections.filter(section => !hidden.includes(section.group) && (
    section.mediaIds.length || section.moduleIds.some(id => {
      const module = moduleMap.get(id);
      return module && (module.texts.some(text => text.value.trim()) || module.photos.length || module.illustrationId);
    })
  ));
  if (!sections.length) return null;
  return <View testID="source-guided-story" style={{ width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: theme.paper }}>
    {sections.map((section, index) => {
      const accent = section.tone === "accent";
      const hero = section.layout === "hero";
      const figure = section.layout === "figure";
      const backgroundColor = accent ? theme.accent : section.tone === "cream" ? theme.cream : theme.paper;
      const media = section.mediaIds.map(id => <SourceMedia key={id} id={id} media={design.media[id]} mediaUrl={mediaUrl} />);
      return <View key={section.id} testID={`source-guided-section-${section.id}`} style={{ backgroundColor }}>
        {hero ? media : null}
        <View style={{ paddingHorizontal: 24, paddingTop: hero ? 32 : 42, paddingBottom: hero ? 40 : 42, gap: 26 }}>
          {!hero || section.title ? <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 28, height: 3, backgroundColor: accent ? theme.accentInk : theme.accent }} />
              <Text style={[body, { color: accent ? theme.accentInk : theme.muted, fontWeight: "600" }]}>{String(index + 1).padStart(2, "0")}</Text>
            </View>
            <Text accessibilityRole="header" style={[body, { fontSize: 26, lineHeight: 35, fontWeight: "700", letterSpacing: -0.8, color: accent ? theme.accentInk : theme.ink }]}>{section.title ?? titles[section.group]}</Text>
          </View> : null}
          {!hero && !figure ? media : null}
          {figure ? <View style={{ marginHorizontal: -16, paddingVertical: 14, backgroundColor: theme.paper }}>{media}</View> : null}
          {section.moduleIds.map(id => {
            const module = moduleMap.get(id);
            return module ? <SavedModule key={id} module={module} section={section} mediaUrl={mediaUrl} /> : null;
          })}
        </View>
      </View>;
    })}
  </View>;
}
