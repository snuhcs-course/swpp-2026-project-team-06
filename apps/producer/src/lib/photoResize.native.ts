// 앱(iOS·Android)은 사진 보관함 picker가 quality 0.8로 압축해 준다(sourceFiles.native.ts). 크기 줄이기는 웹만 한다(DEV-341).
import type { UploadFile } from "@farmclub/api";
import type { PickedFile } from "./sourceFiles";

export type ShrunkPhoto = { file: UploadFile; preview: Blob | null };

export async function shrinkPhoto(file: PickedFile): Promise<ShrunkPhoto> {
  return { file, preview: null };
}
