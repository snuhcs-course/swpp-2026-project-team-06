import type { StoryModule } from "./ModuleStory";
import type { SourceStoryDesign } from "./sourceStoryDesign";

export type TextPresentation = { ref: string; value: string; duplicateOf: string | null };
const canonical = (value: string) => value.trim().replace(/\s+/g, " ");

/** Only exact full-paragraph repeats; never merge similar claims, ranges or option rows. */
export function sourceTextPresentation(modules: readonly StoryModule[], protectedRefs: ReadonlySet<string> = new Set()): Map<string, TextPresentation> {
  const result = new Map<string, TextPresentation>(), first = new Map<string, string>();
  for (const module of modules) for (const [index, text] of module.texts.entries()) {
    const ref = `${module.id}:${index}`, key = canonical(text.value);
    const mergeable = !protectedRefs.has(ref) && key.length >= 32 && !["composition", "pieceCount", "specification"].includes(module.id);
    const duplicateOf = mergeable ? first.get(key) ?? null : null;
    result.set(ref, { ref, value: text.value, duplicateOf });
    if (mergeable && !duplicateOf) first.set(key, ref);
  }
  return result;
}

/** Source substrings only; unstructured or ambiguous copy stays readable prose. */
export function sourceOptionParts(value: string) {
  const lines = value.split(/\r?\n/), heading = lines[0];
  if (heading.length > 90) return null;
  const weight = /\d+(?:\.\d+)?\s*(?:kg|g|ml|l|개|팩|세트|병|포)\s*$/i.exec(heading);
  if (!weight || !heading.slice(0, weight.index).trim()) return null;
  if (/[~〜–—/\-]\s*$/.test(heading.slice(0, weight.index)) || [...heading.matchAll(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l|개|팩|세트|병|포)/gi)].length > 1) return null;
  if (lines.length > 1 && lines.slice(1).some(line => line.trim() && !/^\s*[^:：]{1,18}[:：]/.test(line))) return null;
  return { prefix: heading.slice(0, weight.index), weight: weight[0], rows: lines.slice(1) };
}

/** A common count can join a single option; qualifiers/notes never become option facts. */
export function sourceCountSupplement(value: string) {
  return /^\s*\(?\s*\d+(?:\s*[~–-]\s*\d+)?\s*(?:과|개|팩|병|포)\s*(?:내외|이내|내|이상|이하)?\s*\)?\s*$/.test(value);
}

/** Use one occurrence of a source region, preserving its first contextual placement. */
export function sourceMediaPresentation(design: SourceStoryDesign): Map<string, boolean> {
  const first = new Set<string>(), result = new Map<string, boolean>();
  for (const section of design.sections) for (const id of section.mediaIds) {
    const media = design.media[id];
    const key = `${media.sourceId}:${media.sourceSha256}:${media.sourceRegionId}`;
    result.set(id, !first.has(key)); first.add(key);
  }
  return result;
}
