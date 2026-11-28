import type { StoryModule } from "./ModuleStory";

export type SourceStoryMedia = {
  uri: string; alt: string; width: number; height: number;
  kind: "photo" | "comparison";
  sourceId: string; sourceSha256: string; sourceRegionId: string; caption?: string;
  captionRef?: { moduleId: string; textIndex: number };
  afterTextRef?: { moduleId: string; textIndex: number };
  treatment?: "full" | "inset" | "mark";
  sourceRef?: { uri: string; pages: number[] };
};
export type SourceStorySection = {
  id: string;
  group: "intro" | "composition" | "taste" | "production" | "packing" | "storage" | "faq" | "farm" | "updates";
  layout: "hero" | "options" | "editorial" | "figure" | "prose";
  tone: "paper" | "cream" | "accent";
  moduleIds: string[]; mediaIds: string[]; title?: string;
};
export type SourceStoryDesign = {
  version: 1; theme: "citrus-warm";
  sections: SourceStorySection[]; media: Record<string, SourceStoryMedia>;
};

/** Bounded, source-inspired palette. Small text uses ink/muted on light surfaces,
 * or accentInk on orange; accent itself is a surface, never small text. */
export const SOURCE_STORY_THEME = {
  ink: "#29251F", muted: "#65584A", accent: "#C34C08",
  accentInk: "#FFFFFF", paper: "#FFFCF6", cream: "#F4E8D5", border: "#D9C8AF",
} as const;

const moduleGroups: Record<string, SourceStorySection["group"]> = {
  hero: "intro", summary: "intro", composition: "composition", pieceCount: "composition",
  taste: "taste", specification: "taste", sizePhoto: "taste", crossSectionPhoto: "taste",
  qualityEvidence: "production", productionProcess: "production", packagePhoto: "packing",
  delivery: "packing", storage: "storage", appearanceFaq: "faq", support: "faq",
  farmStory: "farm", farmPhotos: "farm", farmUpdates: "updates",
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const string = (v: unknown, max = 500): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const id = (v: unknown): v is string => string(v, 80) && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(v);
function safeUri(v: unknown): v is string {
  if (!string(v, 2048)) return false;
  let decoded = v;
  try {
    for (let i = 0; i < 4; i++) {
      if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return false;
      if (decoded.split(/[/?#]/).some(part => part === "." || part === "..")) return false;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      if (i === 3) return false;
      decoded = next;
    }
    if (decoded.startsWith("/")) return true;
    const url = new URL(decoded);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
const contentful = (m: StoryModule) => m.texts.some(t => t.value.trim()) || m.photos.length > 0 || !!m.illustrationId;

/** Explicit local opt-in only. Invalid plans leave ModuleStory on its established path. */
export function getSourceStoryDesign(modules: readonly StoryModule[], candidate: unknown): SourceStoryDesign | null {
  if (!object(candidate) || !keys(candidate, ["version", "theme", "sections", "media"]) ||
      candidate.version !== 1 || candidate.theme !== "citrus-warm" ||
      !Array.isArray(candidate.sections) || !candidate.sections.length || candidate.sections.length > 24 ||
      !object(candidate.media) || Object.keys(candidate.media).length > 20) return null;
  const supplied = new Map<string, StoryModule>();
  for (const m of modules) {
    if (m.illustrationId || !id(m.id) || !Object.prototype.hasOwnProperty.call(moduleGroups, m.id) || supplied.has(m.id)) return null;
    supplied.set(m.id, m);
  }
  if (!modules.some(contentful)) return null;
  for (const [key, m] of Object.entries(candidate.media)) {
    if (!id(key) || !object(m) || !keys(m, ["uri", "alt", "width", "height", "kind", "sourceId", "sourceSha256", "sourceRegionId", "caption", "captionRef", "sourceRef", "afterTextRef", "treatment"]) ||
        !safeUri(m.uri) || !string(m.alt) || !string(m.sourceId, 200) || !string(m.sourceRegionId, 200) ||
        typeof m.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(m.sourceSha256) ||
        !["photo", "comparison"].includes(m.kind as string) ||
        typeof m.width !== "number" || !Number.isSafeInteger(m.width) || m.width <= 0 ||
        typeof m.height !== "number" || !Number.isSafeInteger(m.height) || m.height <= 0 || m.width * m.height > 40_000_000 ||
        (m.caption !== undefined && !string(m.caption, 1000))) return null;
  }
  const usedCaptions = new Set<string>();
  for (const m of Object.values(candidate.media)) {
    if (!object(m)) return null;
    if (m.captionRef !== undefined) {
      const ref = m.captionRef;
      if (m.kind !== "photo" || m.caption !== undefined || !object(ref) || !keys(ref, ["moduleId", "textIndex"]) ||
          !id(ref.moduleId) || !Number.isSafeInteger(ref.textIndex) || (ref.textIndex as number) < 0) return null;
      const module = supplied.get(ref.moduleId), key = `${ref.moduleId}:${ref.textIndex}`;
      if (!module?.texts[ref.textIndex as number]?.value.trim() || usedCaptions.has(key)) return null;
      usedCaptions.add(key);
    }
    if (m.treatment !== undefined && (m.kind !== "photo" || !["full", "inset", "mark"].includes(m.treatment as string))) return null;
    if (m.afterTextRef !== undefined) {
      const ref = m.afterTextRef;
      if (m.kind !== "photo" || !object(ref) || !keys(ref, ["moduleId", "textIndex"]) || !id(ref.moduleId) ||
          ["composition", "pieceCount", "specification"].includes(ref.moduleId) || !Number.isSafeInteger(ref.textIndex) || (ref.textIndex as number) < 0 ||
          !supplied.get(ref.moduleId)?.texts[ref.textIndex as number]?.value.trim()) return null;
    }
    if (m.sourceRef !== undefined) {
      const ref = m.sourceRef;
      if (!object(ref) || !keys(ref, ["uri", "pages"]) || !safeUri(ref.uri) || (ref.uri as string).includes("#") ||
          !Array.isArray(ref.pages) || !ref.pages.length || ref.pages.length > 4 ||
          ref.pages.some(p => !Number.isSafeInteger(p) || p < 1 || p > 10000) || new Set(ref.pages).size !== ref.pages.length) return null;
    }
  }
  for (const m of Object.values(candidate.media) as SourceStoryMedia[]) {
    if (m.afterTextRef && usedCaptions.has(`${m.afterTextRef.moduleId}:${m.afterTextRef.textIndex}`)) return null;
  }
  const sections = new Set<string>(), usedModules = new Set<string>(), usedMedia = new Set<string>();
  for (const s of candidate.sections) {
    if (!object(s) || !keys(s, ["id", "group", "layout", "tone", "moduleIds", "mediaIds", "title"]) ||
        !id(s.id) || sections.has(s.id) || !Object.values(moduleGroups).includes(s.group as SourceStorySection["group"]) ||
        !["hero", "options", "editorial", "figure", "prose"].includes(s.layout as string) ||
        !["paper", "cream", "accent"].includes(s.tone as string) ||
        !Array.isArray(s.moduleIds) || s.moduleIds.length > 18 || !Array.isArray(s.mediaIds) || s.mediaIds.length > 20 ||
        (!s.moduleIds.length && !s.mediaIds.length) || (s.title !== undefined && !string(s.title, 200))) return null;
    sections.add(s.id);
    for (const moduleId of s.moduleIds) {
      if (!id(moduleId) || !supplied.has(moduleId) || usedModules.has(moduleId) || moduleGroups[moduleId] !== s.group) return null;
      usedModules.add(moduleId);
    }
    for (const mediaId of s.mediaIds) {
      if (!id(mediaId) || !Object.prototype.hasOwnProperty.call(candidate.media, mediaId) || usedMedia.has(mediaId)) return null;
      const ref = (candidate.media[mediaId] as SourceStoryMedia).captionRef;
      if (ref && !s.moduleIds.includes(ref.moduleId)) return null;
      const anchor = (candidate.media[mediaId] as SourceStoryMedia).afterTextRef;
      if (anchor && !s.moduleIds.includes(anchor.moduleId)) return null;
      usedMedia.add(mediaId);
    }
  }
  if (modules.some(m => contentful(m) && !usedModules.has(m.id)) || usedMedia.size !== Object.keys(candidate.media).length) return null;
  return candidate as SourceStoryDesign;
}
