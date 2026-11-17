// 판매페이지 작업 사진을 올리기 전에 줄인다(웹, DEV-341). 앱은 photoResize.native.ts.
// 서버도 긴 변 1600px JPEG로 다시 저장하므로(DEV-328) 원본(최대 20MB)을 그대로 보낼 필요가 없다.
// pick.ts readImage와 같은 방식(<img> → canvas → JPEG). 브라우저가 EXIF 방향을 적용해 그린다.
// 읽지 못하는 형식(Chrome의 HEIC 등)은 원본을 그대로 보내 서버가 변환한다.
import type { UploadFile } from "@farmclub/api";
import type { PickedFile } from "./sourceFiles";

const UPLOAD_MAX_EDGE = 1600;
const QUALITY = 0.9; // 서버가 한 번 더 JPEG(82)로 저장하므로 여기서는 높게 둔다

export type ShrunkPhoto = { file: UploadFile; preview: Blob | null };

function decode(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    img.src = url;
  });
}

/** 긴 변이 1600px를 넘으면 1600px JPEG로 줄인다. preview는 바로 화면에 보일 수 있는 Blob(받아 오기 생략용). */
export async function shrinkPhoto(file: PickedFile): Promise<ShrunkPhoto> {
  if (!(file instanceof Blob) || typeof document === "undefined")
    return { file, preview: null };
  let img: HTMLImageElement;
  try {
    img = await decode(file);
  } catch {
    return { file, preview: null };
  }
  const w = img.naturalWidth,
    h = img.naturalHeight;
  const scale = Math.min(1, UPLOAD_MAX_EDGE / Math.max(w, h));
  // 투명이 있을 수 있는 형식(PNG·WebP 등)은 작아도 흰 바탕 JPEG로 바꿔, 미리보기가 서버의 RGB 사본과 같게 한다
  if (scale === 1 && file.type === "image/jpeg") return { file, preview: file };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const context = canvas.getContext("2d");
  if (!context) return { file, preview: null };
  // JPEG에는 투명이 없다. 흰 바탕을 먼저 깔아 투명 PNG·WebP가 검게 되지 않게 한다
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return { file, preview: null };
  const name = (file instanceof File ? file.name : "photo").replace(/\.[^.]*$/, "") + ".jpg";
  return { file: new File([blob], name, { type: "image/jpeg" }), preview: blob };
}
