import { useEffect, useState } from "react";
import { Image, Platform, Pressable, Text, View, type TextStyle } from "react-native";
import type { StoryModule } from "./ModuleStory";
import { ViewablePhoto } from "./PrivatePhotos";
import { SOURCE_STORY_THEME as theme, type SourceStoryDesign, type SourceStoryMedia, type SourceStorySection } from "./sourceStoryDesign";
import { tokens } from "./tokens";
import { sourceCountSupplement, sourceMediaPresentation, sourceOptionParts, sourceTextPresentation, type TextPresentation } from "./sourceStoryPresentation";

const webType = Platform.OS === "web" ? { wordBreak: "keep-all", overflowWrap: "anywhere" } as TextStyle : {};
const body: TextStyle = { fontFamily: tokens.fontFamily, fontSize: 17, lineHeight: 30, letterSpacing: -0.25, ...webType };
const icons = {
  intro: require("../assets/source/headings/composition.display.webp"),
  composition: require("../assets/source/headings/composition.display.webp"),
  taste: require("../assets/source/headings/taste.display.webp"),
  production: require("../assets/source/headings/production.display.webp"),
  packing: require("../assets/source/headings/packing.display.webp"),
  storage: require("../assets/source/headings/storage.display.webp"),
  faq: require("../assets/source/headings/faq.display.webp"),
  farm: require("../assets/source/headings/farm.display.webp"),
  updates: require("../assets/source/headings/updates.display.webp"),
};
const titles = { intro: "상품 소개", composition: "받으실 구성", taste: "맛과 크기", production: "재배와 선별", packing: "포장과 배송", storage: "보관 방법", faq: "구매 전 확인", farm: "농가 이야기", updates: "농가 소식" };

/** Keep the complete source region visible; even small source images stay at native width. */
function SourceMedia({ id, media, mediaUrl, hideCaption }: { id: string; media: SourceStoryMedia; mediaUrl: (uri: string) => string; hideCaption: boolean }) {
  const uri = mediaUrl(media.uri);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setFailed(false); setExpanded(false); }, [uri]);
  if (media.kind === "comparison" && !expanded) return <Pressable
    testID={`source-guide-toggle-${id}`} accessibilityRole="button" accessibilityState={{ expanded: false }}
    onPress={() => setExpanded(true)} style={{ padding: 20, gap: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.paper }}>
    <Text style={[body, { color: theme.ink, fontWeight: "700" }]}>크기 비교 그림 보기 ↗</Text>
    <Text style={[body, { fontSize: 14, lineHeight: 22, color: theme.muted }]}>원문 그림으로 크기를 비교해 보세요</Text>
  </Pressable>;
  const image = <Image source={{ uri }} accessibilityLabel={media.alt} resizeMode="contain"
    onError={() => setFailed(true)}
    style={{ width: "100%", aspectRatio: media.width / media.height }} />;
  return <View testID={`source-guided-media-${id}`} style={{ width: "100%", maxWidth: media.width, alignSelf: "center", gap: 10, backgroundColor: theme.paper }}>
    {failed ? <View style={{ minHeight: 96, padding: 20, backgroundColor: theme.cream, justifyContent: "center" }}>
      <Text style={[body, { color: theme.ink }]}>사진을 불러올 수 없어요</Text>
      <Text style={[body, { color: theme.muted }]}>{media.alt}</Text>
    </View> : media.kind === "comparison" ? <ViewablePhoto uri={uri}>{image}</ViewablePhoto> : image}
    {media.caption && !hideCaption ? <Text style={[body, { color: theme.ink, paddingHorizontal: 20 }]}>{media.caption}</Text> : null}
    {media.kind === "comparison" ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: true }} onPress={() => setExpanded(false)} style={{ padding: 12, minHeight: 48 }}><Text style={[body, { fontSize: 14, color: theme.muted, textAlign: "center" }]}>크기 비교 그림 접기</Text></Pressable> : null}
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

function SavedModule({ module, section, mediaUrl, presentation, supplement }: { module: StoryModule; section: SourceStorySection; mediaUrl: (uri: string) => string; presentation: Map<string, TextPresentation>; supplement?: StoryModule }) {
  const accent = section.tone === "accent";
  const options = section.layout === "options" && module.id === "composition";
  const hero = section.layout === "hero" && module.id === "hero";
  const values = module.texts.map((text, index) => ({ text, index, parts: options ? sourceOptionParts(text.value) : null })).filter(({ text, index }) => text.value.trim() && !presentation.get(`${module.id}:${index}`)?.duplicateOf);
  return <View testID={`source-module-${module.id}`} style={{ gap: 18 }}>
    <View style={options ? { flexDirection: "row", flexWrap: "wrap", gap: 12 } : { gap: hero ? 18 : 20 }}>
      {values.map(({ text, index, parts }) => <View key={`${text.fieldKey}-${index}`} testID={options ? `source-option-card-${index}` : undefined} style={options ? {
        flexBasis: parts ? "46%" : "100%", flexGrow: 1, minWidth: 142, padding: 16, borderWidth: 1, borderColor: theme.border,
        backgroundColor: theme.paper, borderRadius: 16, borderTopWidth: 4, borderTopColor: theme.accent,
      } : undefined}>
        <Text nativeID={`sg-text-${module.id}-${index}`}
          accessibilityRole={hero && (text.fieldKey === "name" || index === 0) ? "header" : "text"}
          style={[body, { color: accent ? theme.accentInk : theme.ink },
            hero && (text.fieldKey === "name" || index === 0) ? { fontSize: 34, lineHeight: 44, fontWeight: "800", letterSpacing: -1.1 } : null]}>
          {parts ? <><Text style={{ fontSize: 16, lineHeight: 29, fontWeight: "600" }}>{parts.prefix}</Text><Text style={{ fontSize: 28, lineHeight: 38, fontWeight: "800", color: theme.accent }}>{parts.weight}</Text>{parts.rows.map((row, i) => <Text key={i} style={{ fontSize: 16, lineHeight: 29, fontWeight: "400" }}>{"\n"}{row}</Text>)}</> : text.value}
        </Text>
        {supplement ? <SavedModule module={supplement} section={{ ...section, layout: "prose" }} mediaUrl={mediaUrl} presentation={presentation} /> : null}
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
  const orderedModules = sections.flatMap(s => s.moduleIds.map(id => moduleMap.get(id)).filter((m): m is StoryModule => !!m));
  const presentation = sourceTextPresentation(orderedModules);
  const mediaPresentation = sourceMediaPresentation({ ...design, sections });
  const renderedText = new Set(orderedModules.flatMap(m => m.texts.map(t => t.value.trim().replace(/\s+/g, " "))));
  return <View testID="source-guided-story" style={{ width: "100%", maxWidth: 480, alignSelf: "center", backgroundColor: theme.paper }}>
    {sections.filter(s => s.mediaIds.some(id => mediaPresentation.get(id)) || s.moduleIds.some(id => {
      const m = moduleMap.get(id);
      return m && (m.photos.length || m.texts.some((t, i) => t.value.trim() && !presentation.get(`${id}:${i}`)?.duplicateOf));
    })).map((section) => {
      const accent = section.tone === "accent";
      const hero = section.layout === "hero";
      const figure = section.layout === "figure";
      const backgroundColor = accent ? theme.accent : section.tone === "cream" ? theme.cream : theme.paper;
      const media = section.mediaIds.filter(id => mediaPresentation.get(id)).map(id => <SourceMedia key={id} id={id} media={design.media[id]} mediaUrl={mediaUrl} hideCaption={!!design.media[id].caption && renderedText.has(design.media[id].caption!.trim().replace(/\s+/g, " "))} />);
      const composition = section.layout === "options" ? moduleMap.get("composition") : undefined;
      const count = section.moduleIds.includes("pieceCount") ? moduleMap.get("pieceCount") : undefined;
      const supplement = composition?.texts.length === 1 && sourceOptionParts(composition.texts[0].value) && count && !count.photos.length && count.texts.length > 0 && count.texts.every(t => sourceCountSupplement(t.value)) ? count : undefined;
      return <View key={section.id} testID={`source-guided-section-${section.id}`} style={{ backgroundColor }}>
        {hero ? media : null}
        <View style={{ paddingHorizontal: 24, paddingTop: hero ? 32 : 42, paddingBottom: hero ? 40 : 42, gap: 26 }}>
          {!hero || section.title ? <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Image source={icons[section.group]} accessible={false} style={{ width: 34, height: 34 }} resizeMode="contain" />
            <Text accessibilityRole="header" style={[body, { flexShrink: 1, fontSize: 25, lineHeight: 34, fontWeight: "800", letterSpacing: -0.7, color: accent ? theme.accentInk : theme.ink }]}>{section.title ?? titles[section.group]}</Text>
            <View testID="source-heading-divider" accessible={false} style={{ flex: 1, minWidth: 24, height: 1, backgroundColor: accent ? theme.accentInk : "#B8B3AA", opacity: 0.8 }} />
          </View> : null}
          {!hero && !figure ? media : null}
          {figure && media.length ? <View style={{ marginHorizontal: -16, paddingVertical: 14, backgroundColor: theme.paper }}>{media}</View> : null}
          {section.moduleIds.map(id => {
            const module = moduleMap.get(id);
            if (supplement && id === "pieceCount") return null;
            return module ? <SavedModule key={id} module={module} section={section} mediaUrl={mediaUrl} presentation={presentation} supplement={id === "composition" ? supplement : undefined} /> : null;
          })}
        </View>
      </View>;
    })}
  </View>;
}
