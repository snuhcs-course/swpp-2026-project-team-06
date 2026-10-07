import { attachmentAccess } from "./conversations";
import { nextId, nowIso } from "./db";
import { invalid, notFound, register } from "./router";
// Mock strips metadata too. Production image decoding belongs to DEV-4.
function image(raw: string) {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  if (!match) invalid({ file: "JPEG·PNG·WebP 사진을 골라 주세요" });
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  } catch {
    invalid({ file: "사진을 읽을 수 없어요" });
  }
  if (bytes.length > 10 * 1024 * 1024)
    invalid({ file: "사진 한 장은 10MB까지예요" });
  const u32 = (i: number) => new DataView(bytes.buffer).getUint32(i),
    text = (i: number, n: number) =>
      String.fromCharCode(...bytes.slice(i, i + n));
  const chunks: Uint8Array[] = [];
  let mime = "";
  if (bytes[0] === 255 && bytes[1] === 216) {
    mime = "image/jpeg";
    chunks.push(bytes.slice(0, 2));
    let i = 2;
    while (i < bytes.length) {
      if (bytes[i] !== 255) invalid({ file: "손상된 JPEG예요" });
      const marker = bytes[i + 1];
      if (marker === 218) {
        chunks.push(bytes.slice(i));
        break;
      }
      const n = (bytes[i + 2] << 8) | bytes[i + 3];
      if (n < 2 || i + n + 2 > bytes.length)
        invalid({ file: "손상된 JPEG예요" });
      if (!(marker >= 224 && marker <= 239) && marker !== 254)
        chunks.push(bytes.slice(i, i + n + 2));
      i += n + 2;
    }
  } else if (bytes.length > 24 && text(1, 3) === "PNG" && bytes[0] === 137) {
    mime = "image/png";
    chunks.push(bytes.slice(0, 8));
    let i = 8;
    while (i + 12 <= bytes.length) {
      const n = u32(i),
        t = text(i + 4, 4);
      if (i + n + 12 > bytes.length) invalid({ file: "손상된 PNG예요" });
      if (["IHDR", "PLTE", "IDAT", "IEND", "tRNS"].includes(t))
        chunks.push(bytes.slice(i, i + n + 12));
      i += n + 12;
    }
  } else if (
    bytes.length > 20 &&
    text(0, 4) === "RIFF" &&
    text(8, 4) === "WEBP"
  ) {
    mime = "image/webp";
    chunks.push(bytes.slice(0, 12));
    let i = 12;
    while (i + 8 <= bytes.length) {
      const n = new DataView(bytes.buffer).getUint32(i + 4, true),
        t = text(i, 4),
        end = i + 8 + n + (n % 2);
      if (end > bytes.length) invalid({ file: "손상된 WebP예요" });
      if (t !== "EXIF" && t !== "XMP ") {
        const chunk = bytes.slice(i, end);
        if (t === "VP8X") chunk[8] &= ~12;
        chunks.push(chunk);
      }
      i = end;
    }
  }
  if (!mime || mime !== match[1])
    invalid({ file: "파일 내용과 사진 형식이 일치하지 않아요" });
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  chunks.forEach((c) => {
    out.set(c, at);
    at += c.length;
  });
  if (mime === "image/webp")
    new DataView(out.buffer).setUint32(4, out.length - 8, true);
  let binary = "";
  for (let i = 0; i < out.length; i += 8192)
    binary += String.fromCharCode(...out.slice(i, i + 8192));
  return {
    mimeType: mime,
    size: out.length,
    dataUrl: `data:${mime};base64,${btoa(binary)}`,
  };
}
register({
  "POST /api/messaging/attachments": (ctx) => {
    const orderId = ctx.body.orderId as string | undefined,
      threadId = ctx.body.threadId as string | undefined;
    attachmentAccess(ctx, orderId, threadId);
    const data = image(String(ctx.body.dataUrl ?? ""));
    for (const [id, a] of Object.entries(ctx.db.attachments))
      if (!a.bound && Date.now() - Date.parse(a.createdAt) > 86400000)
        delete ctx.db.attachments[id];
    const a = {
      attachmentId: nextId("attachment"),
      ...data,
      ownerId: ctx.me().userId,
      orderId,
      threadId,
      bound: false,
      createdAt: nowIso(),
    };
    ctx.db.attachments[a.attachmentId] = a;
    return { attachmentId: a.attachmentId, mimeType: a.mimeType, size: a.size };
  },
  "GET /api/messaging/attachments/:attachmentId": (ctx) => {
    const a = ctx.db.attachments[ctx.params.attachmentId];
    if (!a) notFound();
    if (!a.bound) {
      if (
        a.ownerId !== ctx.me().userId ||
        Date.now() - Date.parse(a.createdAt) > 86400000
      )
        notFound();
    } else attachmentAccess(ctx, a.orderId, a.threadId);
    return { dataUrl: a.dataUrl };
  },
});
