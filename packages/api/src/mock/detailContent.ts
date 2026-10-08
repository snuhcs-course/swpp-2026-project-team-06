import type { DetailContent, DetailBlock, DetailDraft } from "../types";
import { invalid } from "./router";

function validImage(uri: unknown): uri is string {
  if (typeof uri !== "string") return false;
  return (
    /^https:\/\/[^\s]+$/.test(uri) ||
    /^\/(?!\/)[^\s]+$/.test(uri) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s]+$/.test(uri) ||
    /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(uri)
  );
}
export function validateDetail(value: unknown): DetailContent {
  const fail = (): never =>
    invalid({ detailContent: "상세의 글·사진을 확인해 주세요 (최대 30개)" });
  if (
    !value ||
    typeof value !== "object" ||
    !("blocks" in value) ||
    !Array.isArray(value.blocks) ||
    value.blocks.length > 30
  )
    return fail();
  const ids = new Set<string>();
  const blocks: DetailBlock[] = value.blocks.map((b: unknown) => {
    if (!b || typeof b !== "object") return fail();
    const x = b as Record<string, unknown>;
    if (typeof x.id !== "string" || !x.id || x.id.length > 100 || ids.has(x.id))
      return fail();
    ids.add(x.id);
    if (
      x.type === "text" &&
      typeof x.title === "string" &&
      typeof x.body === "string" &&
      x.title.length <= 100 &&
      x.body.length <= 3000 &&
      (x.title.trim() || x.body.trim())
    )
      return { id: x.id, type: "text", title: x.title, body: x.body };
    if (
      x.type === "image" &&
      validImage(x.uri) &&
      typeof x.alt === "string" &&
      x.alt.length <= 200
    )
      return { id: x.id, type: "image", uri: x.uri, alt: x.alt };
    return fail();
  });
  return { blocks };
}
// Deterministic fixture composer, not an LLM. Only supplied facts/photos are used.
export function detailDraft(
  body: Record<string, unknown>,
  name: string,
  description: string,
  photos: string[],
  facts: string[],
): DetailDraft {
  if (
    typeof body.inputText !== "string" ||
    body.inputText.length > 3000 ||
    !Array.isArray(body.photos) ||
    body.photos.length > 10 ||
    !body.photos.every(validImage)
  )
    invalid({ inputText: "글 3,000자, 사진 10개 이내로 입력해 주세요" });
  const text = body.inputText as string;
  const images = (body.photos as string[]).length
    ? (body.photos as string[])
    : photos.slice(0, 10);
  const clean = (v: string) =>
    v
      .split(/\n|(?<=[.!?])\s+/)
      .filter(
        (line) =>
          !/\d[\d,]*\s*원|\d{1,2}월|\d{4}-\d{2}-\d{2}|무료배송/.test(line),
      )
      .join("\n")
      .trim();
  const blocks: DetailBlock[] = [];
  const addText = (title: string, content: string) => {
    if (content.trim())
      blocks.push({
        id: `detail-${blocks.length}`,
        type: "text",
        title: title.slice(0, 100),
        body: content.slice(0, 3000),
      });
  };
  addText(name, clean(description));
  images.forEach((uri, i) => {
    blocks.push({
      id: `detail-${blocks.length}`,
      type: "image",
      uri,
      alt: `${name} 사진 ${i + 1}`.slice(0, 200),
    });
    if (i === 0) addText("전하고 싶은 이야기", clean(text));
  });
  if (!images.length) addText("전하고 싶은 이야기", clean(text));
  addText("한눈에 살펴보기", facts.filter(Boolean).join("\n"));
  if (!blocks.length) invalid({ inputText: "소개 글이나 사진을 넣어 주세요" });
  return { content: validateDetail({ blocks }), mode: "mock" };
}
