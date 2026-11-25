import assert from "node:assert/strict";
import { test } from "node:test";
import { getSourceStoryDesign, SOURCE_STORY_THEME } from "../packages/ui/src/sourceStoryDesign.ts";

const textModule = (id = "hero", value = "Saved source paragraph") => ({
  id,
  texts: [{ fieldKey: "body", value }],
  photos: [],
});
const media = (overrides = {}) => ({
  uri: "/assets/source-region.png",
  alt: "Source photograph crop",
  width: 640,
  height: 480,
  kind: "photo",
  sourceId: "source-123",
  sourceSha256: "a".repeat(64),
  sourceRegionId: "region-1",
  ...overrides,
});
const section = (overrides = {}) => ({
  id: "intro",
  group: "intro",
  layout: "hero",
  tone: "paper",
  moduleIds: ["hero"],
  mediaIds: [],
  ...overrides,
});
const plan = (overrides = {}) => ({
  version: 1,
  theme: "citrus-warm",
  sections: [section()],
  media: {},
  ...overrides,
});
const accepted = (modules = [textModule()], candidate = plan()) => {
  const result = getSourceStoryDesign(modules, candidate);
  assert.ok(result, "expected the valid reference plan to be accepted");
  return result;
};

test("AC-SRC-7 DEV-464: every nonempty supplied module is assigned exactly once", () => {
  const modules = [textModule("hero", "Saved intro"), textModule("summary", "Saved detail")];
  const result = accepted(modules, plan({ sections: [
    section(),
    section({ id: "detail", moduleIds: ["summary"] }),
  ] }));
  assert.deepEqual(result.sections.flatMap((item) => item.moduleIds), ["hero", "summary"]);
});

test("AC-SRC-7 DEV-464: validating preserves raw supplied text and arrays", () => {
  const modules = [textModule("hero", "  Keep spaces,\nline breaks, and punctuation!  ")];
  const before = structuredClone(modules);
  accepted(modules);
  assert.deepEqual(modules, before);
});

test("AC-SRC-7 DEV-464: empty modules may be omitted but nonempty photo-only modules remain required", () => {
  const empty = { id: "summary", texts: [{ fieldKey: "body", value: "  " }], photos: [] };
  assert.ok(getSourceStoryDesign([textModule(), empty], plan()));
  const photoOnly = { id: "sizePhoto", texts: [], photos: [{ uri: "/x.png", alt: "Saved photo" }] };
  assert.equal(getSourceStoryDesign([textModule(), photoOnly], plan()), null);
  const photoPlan = plan({ sections: [section({ mediaIds: [], moduleIds: ["hero"] }),
    section({ id: "photo", group: "taste", layout: "figure", moduleIds: ["sizePhoto"] })] });
  assert.ok(getSourceStoryDesign([textModule(), photoOnly], photoPlan));
});

test("AC-SRC-7 DEV-464: empty inputs cannot resurrect a demo-only media plan", () => {
  const candidate = plan({ sections: [section({ moduleIds: [], mediaIds: ["m1"] })], media: { m1: media() } });
  assert.equal(getSourceStoryDesign([], candidate), null);
  assert.equal(getSourceStoryDesign([{ id: "hero", texts: [], photos: [], illustrationId: null }], plan()), null);
});

test("AC-SRC-7 DEV-464: invalid opt-in plans fail closed to the existing rendering path", () => {
  const base = plan();
  for (const bad of [null, [], { ...base, version: 2 }, { ...base, theme: "custom" },
    { ...base, extra: true }, { ...base, sections: [] }, { ...base, sections: new Array(25).fill(section()) }]) {
    assert.equal(getSourceStoryDesign([textModule()], bad), null);
  }
});

test("AC-SRC-7 DEV-464: unknown, repeated, or missing module references are rejected", () => {
  assert.equal(getSourceStoryDesign([textModule()], plan({ sections: [section({ moduleIds: ["hero", "other"] })] })), null);
  assert.equal(getSourceStoryDesign([textModule()], plan({ sections: [section(), section({ id: "second" })] })), null);
  assert.equal(getSourceStoryDesign([textModule()], plan({ sections: [section({ moduleIds: [] })] })), null);
  assert.equal(getSourceStoryDesign([textModule("mystery")], plan()), null);
  assert.equal(getSourceStoryDesign([textModule(), textModule()], plan()), null);
});

test("AC-SRC-7 DEV-464: section group must match each referenced source module", () => {
  assert.equal(getSourceStoryDesign([textModule("composition")], plan({
    sections: [section({ group: "intro", moduleIds: ["composition"] })],
  })), null);
  assert.equal(getSourceStoryDesign([textModule("composition")], plan({
    sections: [section({ group: "composition", layout: "options", moduleIds: ["composition"] })],
  }))?.sections[0].group, "composition");
});

test("AC-SRC-9 DEV-464: unknown and duplicate section or media IDs are rejected", () => {
  assert.equal(getSourceStoryDesign([textModule()], plan({ sections: [section(), section()] })), null);
  const m = media();
  assert.equal(getSourceStoryDesign([textModule()], plan({
    sections: [section({ mediaIds: ["m1", "m1"] })], media: { m1: m },
  })), null);
  assert.equal(getSourceStoryDesign([textModule()], plan({
    sections: [section()], media: { m1: m },
  })), null);
  assert.equal(getSourceStoryDesign([textModule()], plan({
    sections: [section({ mediaIds: ["missing"] })], media: {},
  })), null);
});

test("AC-SRC-9 DEV-464: media requires source identity, digest, region, and bounded native dimensions", () => {
  const invalid = [
    { sourceId: " " }, { sourceRegionId: "" }, { sourceSha256: "A".repeat(64) },
    { sourceSha256: "a".repeat(63) }, { width: 0 }, { height: -1 }, { width: 2.5 },
    { width: Number.POSITIVE_INFINITY }, { width: 40_000_001, height: 1 },
    { kind: "illustration" }, { unknown: "metadata" }, { caption: "\u0001" },
  ];
  for (const change of invalid) {
    const candidate = plan({
      sections: [section({ mediaIds: ["m1"] })],
      media: { m1: media(change) },
    });
    assert.equal(getSourceStoryDesign([textModule()], candidate), null, JSON.stringify(change));
  }
  const valid = plan({ sections: [section({ mediaIds: ["m1"] })], media: { m1: media({ width: 2000, height: 20000 }) } });
  assert.ok(getSourceStoryDesign([textModule()], valid));
});

test("AC-SRC-9 DEV-464: unsafe media schemes, controls, backslashes, and traversal are rejected", () => {
  const uris = [
    "javascript:alert(1)", "data:image/png;base64,AA", "file:///etc/passwd", "//evil.example/x.png",
    "/assets/../secret.png", "/assets/%2e%2e/secret.png", "/assets/%252e%252e/secret.png",
    "/assets/%5c..%5csecret.png", "/assets/a\\b.png", "/assets/a\nhttps://evil.example/x.png",
    " https://evil.example/a.png", "https://user:pass@evil.example/a.png",
  ];
  for (const uri of uris) {
    assert.equal(getSourceStoryDesign([textModule()], plan({
      sections: [section({ mediaIds: ["m1"] })], media: { m1: media({ uri }) },
    })), null, uri);
  }
  for (const uri of ["https://images.example/crop.png", "/assets/source-region.png"]) {
    assert.ok(getSourceStoryDesign([textModule()], plan({
      sections: [section({ mediaIds: ["m1"] })], media: { m1: media({ uri }) },
    })), uri);
  }
});

test("AC-SRC-9 DEV-464: media references preserve comparison kind, native aspect, and caption", () => {
  const photo = media({ width: 480, height: 320, caption: "Approximate visual comparison" });
  const result = accepted([textModule()], plan({
    sections: [section({ mediaIds: ["comparison"] })],
    media: { comparison: { ...photo, kind: "comparison" } },
  }));
  assert.equal(result.media.comparison.kind, "comparison");
  assert.equal(result.media.comparison.width / result.media.comparison.height, 1.5);
  assert.equal(result.media.comparison.caption, "Approximate visual comparison");
});

test("AC-SRC-11 DEV-464: bounded source-story palette has readable text contrast on its actual surfaces", () => {
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  for (const background of [SOURCE_STORY_THEME.paper, SOURCE_STORY_THEME.cream]) {
    assert.ok(contrast(SOURCE_STORY_THEME.ink, background) >= 4.5);
    assert.ok(contrast(SOURCE_STORY_THEME.muted, background) >= 4.5);
  }
  assert.ok(contrast(SOURCE_STORY_THEME.accentInk, SOURCE_STORY_THEME.accent) >= 4.5);
  assert.deepEqual(Object.keys(SOURCE_STORY_THEME).sort(), ["accent", "accentInk", "border", "cream", "ink", "muted", "paper"]);
});

test("AC-SRC-11 DEV-464: design schema enforces section and media caps without losing bounded content", () => {
  const ids = ["hero", "summary", "composition", "pieceCount", "taste", "specification", "sizePhoto", "crossSectionPhoto",
    "qualityEvidence", "productionProcess", "packagePhoto", "delivery", "storage", "appearanceFaq", "support",
    "farmStory", "farmPhotos", "farmUpdates"];
  const modules = ids.map((id, i) => textModule(id, `Text ${i}`));
  const sections = modules.map((m, i) => section({ id: `section_${i}`, group: groupFor(m.id), moduleIds: [m.id] }));
  const extraMedia = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`cap_${i}`, media()]));
  const capSections = [...sections, ...Object.keys(extraMedia).map((id, i) => section({
    id: `media_section_${i}`, moduleIds: [], mediaIds: [id],
  }))];
  assert.equal(capSections.length, 24);
  assert.ok(getSourceStoryDesign(modules, plan({ sections: capSections, media: extraMedia })));
  assert.equal(getSourceStoryDesign(modules, plan({ sections: [...capSections,
    section({ id: "overflow", moduleIds: [], mediaIds: ["overflow"] }),
  ], media: { ...extraMedia, overflow: media() } })), null);
  const mediaMap = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`media_${i}`, media()]));
  const mediaSections = [section({ mediaIds: Object.keys(mediaMap) })];
  assert.ok(getSourceStoryDesign([textModule()], plan({ sections: mediaSections, media: mediaMap })));
});

function groupFor(id) {
  if (["hero", "summary"].includes(id)) return "intro";
  if (["composition", "pieceCount"].includes(id)) return "composition";
  if (["taste", "specification", "sizePhoto", "crossSectionPhoto"].includes(id)) return "taste";
  if (["qualityEvidence", "productionProcess"].includes(id)) return "production";
  if (["packagePhoto", "delivery"].includes(id)) return "packing";
  if (id === "storage") return "storage";
  if (["appearanceFaq", "support"].includes(id)) return "faq";
  if (["farmStory", "farmPhotos"].includes(id)) return "farm";
  return "updates";
}

test("AC-SRC-7 DEV-464: caption binds one saved text to its photo in the same section", () => {
  const modules = [textModule("delivery", "Exact saved caption")];
  const candidate = plan({ sections: [section({ group: "packing", moduleIds: ["delivery"], mediaIds: ["m1"] })], media: { m1: media({ captionRef: { moduleId: "delivery", textIndex: 0 }, sourceRef: { uri: "/source.pdf", pages: [13, 14] } }) } });
  assert.ok(getSourceStoryDesign(modules, candidate));
  assert.equal(candidate.media.m1.caption, undefined);
  assert.equal(modules[0].texts[0].value, "Exact saved caption");
  for (const captionRef of [{ moduleId: "missing", textIndex: 0 }, { moduleId: "delivery", textIndex: 1 }, { moduleId: "delivery", textIndex: -1 }, { moduleId: "delivery", textIndex: 0.5 }, { moduleId: "delivery", textIndex: 0, extra: true }]) {
    const bad = structuredClone(candidate); bad.media.m1.captionRef = captionRef;
    assert.equal(getSourceStoryDesign(modules, bad), null);
  }
  for (const change of [{ kind: "comparison" }, { caption: "Competing caption" }]) {
    const bad = structuredClone(candidate); Object.assign(bad.media.m1, change);
    assert.equal(getSourceStoryDesign(modules, bad), null);
  }
  const misplaced = structuredClone(candidate); misplaced.sections.unshift(section()); misplaced.sections[1].moduleIds = [];
  assert.equal(getSourceStoryDesign([textModule(), ...modules], misplaced), null);
});

test("AC-SRC-9 DEV-464: captions cannot be stolen across sections or repeated on two photos", () => {
  const modules = [textModule(), textModule("delivery", "Caption")];
  const candidate = plan({ sections: [section({ mediaIds: ["m1"] }), section({ id: "packing", group: "packing", moduleIds: ["delivery"] })], media: { m1: media({ captionRef: { moduleId: "delivery", textIndex: 0 } }) } });
  assert.equal(getSourceStoryDesign(modules, candidate), null);
  candidate.sections[0].mediaIds = []; candidate.sections[1].mediaIds = ["m1", "m2"];
  candidate.media.m2 = media({ sourceRegionId: "other", captionRef: { moduleId: "delivery", textIndex: 0 } });
  assert.equal(getSourceStoryDesign(modules, candidate), null);
  candidate.media.m2.captionRef = undefined;
  assert.ok(getSourceStoryDesign(modules, candidate));
});

test("AC-SRC-9 DEV-464: source page links reject unsafe URIs and invalid page lists", () => {
  for (const sourceRef of [{ uri: "javascript:alert(1)", pages: [1] }, { uri: "/source.pdf#page=3", pages: [1] }, { uri: "/source.pdf", pages: [] }, { uri: "/source.pdf", pages: [0] }, { uri: "/source.pdf", pages: [1.5] }, { uri: "/source.pdf", pages: [1, 1] }, { uri: "/source.pdf", pages: [1, 2, 3, 4, 5] }]) {
    assert.equal(getSourceStoryDesign([textModule()], plan({ sections: [section({ mediaIds: ["m1"] })], media: { m1: media({ sourceRef }) } })), null);
  }
});

test("AC-SRC-9 DEV-464: narrative visual anchors and bounded photo treatments preserve module identity", () => {
  const modules=[textModule("farmStory", "A farm story paragraph")];
  const candidate=plan({sections:[section({group:"farm",layout:"editorial",moduleIds:["farmStory"],mediaIds:["m1"]})],media:{m1:media({afterTextRef:{moduleId:"farmStory",textIndex:0},treatment:"inset"})}});
  assert.ok(getSourceStoryDesign(modules,candidate));
  for(const change of [{afterTextRef:{moduleId:"farmStory",textIndex:1}},{afterTextRef:{moduleId:"farmStory",textIndex:-1}},{afterTextRef:{moduleId:"farmStory",textIndex:0,extra:true}},{afterTextRef:{moduleId:"missing",textIndex:0}},{treatment:"free-css"},{kind:"comparison"}]){
    const bad=structuredClone(candidate);Object.assign(bad.media.m1,change);assert.equal(getSourceStoryDesign(modules,bad),null);
  }
  for(const treatment of ["full","inset","mark"]){const good=structuredClone(candidate);good.media.m1.treatment=treatment;assert.ok(getSourceStoryDesign(modules,good));}
});

test("AC-SRC-7 DEV-464: visual anchors cannot depend on hidden caption text or another section", () => {
  const modules=[textModule("farmStory","Farm narrative"),textModule("delivery","Source caption")];
  const candidate=plan({sections:[section({id:"farm",group:"farm",moduleIds:["farmStory"],mediaIds:[]}),section({id:"packing",group:"packing",moduleIds:["delivery"],mediaIds:["m1"]})],media:{m1:media({afterTextRef:{moduleId:"farmStory",textIndex:0}})}});
  assert.equal(getSourceStoryDesign(modules,candidate),null);
  candidate.media.m1.afterTextRef={moduleId:"delivery",textIndex:0};candidate.media.m1.captionRef={moduleId:"delivery",textIndex:0};
  assert.equal(getSourceStoryDesign(modules,candidate),null);
});
