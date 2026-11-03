// 서버에서 받은 사진(Blob)을 <Image>가 읽을 주소로(iOS·Android). blob: 주소는 네이티브 Image가 읽지 못해 data URL로 바꾼다(DEV-33).
export function blobUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
