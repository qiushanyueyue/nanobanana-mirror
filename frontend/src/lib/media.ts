export const fileToDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const fileToBase64 = async (file: Blob): Promise<string> => {
  const dataUrl = await fileToDataUrl(file);
  return dataUrl.split(',')[1] ?? '';
};

export const base64ToBlob = (base64: string, mimeType = 'image/jpeg'): Blob => {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);

  for (let index = 0; index < byteString.length; index += 1) {
    bytes[index] = byteString.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

export const downloadBlob = (blob: Blob, fileName: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
};

export const copyBlobToClipboard = async (blob: Blob): Promise<void> => {
  if ('ClipboardItem' in window && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      return;
    } catch {
      // 某些浏览器对图片写入剪贴板支持不稳定，失败后降级为复制 data URL。
    }
  }

  const dataUrl = await fileToDataUrl(blob);
  await navigator.clipboard.writeText(dataUrl);
};
