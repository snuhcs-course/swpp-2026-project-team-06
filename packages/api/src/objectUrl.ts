// 서버에서 받은 사진(Blob)을 <Image>가 읽을 주소로(웹). 네이티브는 objectUrl.native.ts(data URL)가 대신한다(DEV-33).
/** blob: 주소. 다 쓰면 URL.revokeObjectURL로 지운다(PrivatePhoto가 한다) */
export function blobUrl(blob: Blob): Promise<string> {
  return Promise.resolve(URL.createObjectURL(blob));
}
