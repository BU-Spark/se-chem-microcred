const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_OUTPUT_DIMENSION = 512;

export function badgeImageOutputDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) throw new Error('The selected image has invalid dimensions.');
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function prepareBadgeImage(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image smaller than 8 MB.');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The selected image could not be read.'));
      element.src = sourceUrl;
    });
    const canvas = document.createElement('canvas');
    const output = badgeImageOutputDimensions(image.naturalWidth, image.naturalHeight);
    canvas.width = output.width;
    canvas.height = output.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image processing is unavailable in this browser.');
    context.drawImage(image, 0, 0, output.width, output.height);
    return canvas.toDataURL('image/webp', 0.82);
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
