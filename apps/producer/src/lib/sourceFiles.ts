// 원본 자료 파일 고르기 — 웹(<input type="file">). 앱은 sourceFiles.native.ts(사진만, DEV-33).
import type { NativeFile } from "@farmclub/api";

/** 웹은 File, 앱은 사진 보관함에서 고른 {uri, name, type, size} */
export type PickedFile = File | (NativeFile & { size: number });

export function chooseSourceFiles(images = false): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const el = document.createElement("input");
    el.type = "file";
    el.multiple = true;
    el.accept = images
      ? ".jpg,.jpeg,.png,.webp,.heic"
      : ".jpg,.jpeg,.png,.webp,.heic,.pdf,.txt";
    el.onchange = () => resolve(Array.from(el.files ?? []));
    el.oncancel = () => resolve([]);
    el.click();
  });
}
