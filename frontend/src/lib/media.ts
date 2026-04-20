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

export const compressImageBlob = async (blob: Blob, maxWidth = 1536, maxHeight = 1536, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;
      
      // 不超过尺寸限制，且本身也是 JPEG 则不压缩（直接返回）
      // 如果要绝对控制体积，这里还是画一遍较妥
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }
      
      // 如果原始图片是透明背景（如 PNG），转 JPG 会变成黑色底。
      // 所以我们先填充白色底。
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (newBlob) => {
          if (newBlob) {
            resolve(newBlob);
          } else {
            resolve(blob);
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob); // 降级返回原图
    };
    img.src = url;
  });
};
