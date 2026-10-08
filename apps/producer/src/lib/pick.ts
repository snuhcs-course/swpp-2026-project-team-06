import { sharedMockUrl, uploadMockMedia } from "@farmclub/api";
// 웹 파일 고르기. 사진은 600px로 줄여 data URL로 만든다(Mock은 localStorage에 저장하므로 작게).
// 영상은 첫 장면을 사진처럼 저장한다(Mock 한계). 정책: 사진 장당 10MB, 영상 1개 60초·100MB(SCR-27).
export type Picked =
  | { name: string; ok: true; uri: string; video: boolean }
  | { name: string; ok: false; reason: string };

const MB = 1024 * 1024;

function chooseFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve([]);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

function drawToDataUrl(
  src: CanvasImageSource,
  w: number,
  h: number,
  imageWidth?: number,
) {
  const max = 600;
  const scale = imageWidth
    ? Math.min(1, imageWidth / w, 16000 / h)
    : Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")?.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

function readImage(file: File, imageWidth?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(
        drawToDataUrl(img, img.naturalWidth, img.naturalHeight, imageWidth),
      );
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

function readVideo(file: File): Promise<{ duration: number; frame: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(0.1, v.duration / 2);
    };
    v.onseeked = () => {
      resolve({
        duration: v.duration,
        frame: drawToDataUrl(v, v.videoWidth, v.videoHeight),
      });
      URL.revokeObjectURL(url);
    };
    v.onerror = reject;
    v.src = url;
  });
}

const mmss = (s: number) =>
  s >= 60
    ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초`
    : `${Math.round(s)}초`;

export async function pickMedia({
  multiple = true,
  video = false,
  imageWidth,
}: { multiple?: boolean; video?: boolean; imageWidth?: number } = {}): Promise<
  Picked[]
> {
  const files = await chooseFiles(
    video ? "image/*,video/*" : "image/*",
    multiple,
  );
  const out: Picked[] = [];
  for (const f of files) {
    const isVideo = f.type.startsWith("video/");
    try {
      if (isVideo) {
        if (f.size > 100 * MB) {
          out.push({
            name: f.name,
            ok: false,
            reason: `${f.name} · ${Math.round(f.size / MB)}MB라 100MB를 넘어요`,
          });
          continue;
        }
        const r = await readVideo(f);
        if (r.duration > 60)
          out.push({
            name: f.name,
            ok: false,
            reason: `${f.name} · ${mmss(r.duration)}라 60초를 넘어요`,
          });
        else
          out.push({
            name: f.name,
            ok: true,
            uri: sharedMockUrl
              ? await uploadMockMedia(
                  await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = reject;
                    reader.readAsDataURL(f);
                  }),
                )
              : r.frame,
            video: true,
          });
      } else if (f.type.startsWith("image/")) {
        if (f.size > 10 * MB) {
          out.push({
            name: f.name,
            ok: false,
            reason: `${f.name} · ${Math.round(f.size / MB)}MB라 장당 10MB를 넘어요`,
          });
          continue;
        }
        out.push({
          name: f.name,
          ok: true,
          uri: await uploadMockMedia(await readImage(f, imageWidth)),
          video: false,
        });
      } else {
        out.push({
          name: f.name,
          ok: false,
          reason: `${f.name} · 사진이나 영상만 올릴 수 있어요`,
        });
      }
    } catch {
      out.push({
        name: f.name,
        ok: false,
        reason: `${f.name} · 파일을 읽지 못했어요`,
      });
    }
  }
  return out;
}
