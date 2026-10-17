export function chooseSourceFiles(images = false): Promise<File[]> {
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
