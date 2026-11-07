export const MAX_IMAGES = 20;
export const MAX_BYTES = 5_000_000;
const FORMATS = new Set(['image/png', 'image/jpeg', 'image/gif']);

// Read files synchronously: clipboardData is protected after the paste event.
// Never inspect text/HTML or dereference copied image URLs.
export function imageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.items)
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  return files.length ? files : Array.from(data.files).filter((file) => file.type.startsWith('image/'));
}

export function validateImages(files: File[], available: number): string | null {
  if (files.length > available) return `LinkedIn allows ${MAX_IMAGES} images per post. Remove an image before adding more.`;
  if (files.some((file) => !FORMATS.has(file.type))) return 'Use PNG, JPEG, or GIF images. Save other formats as PNG first.';
  if (files.some((file) => file.size === 0)) return 'That clipboard image is empty. Copy the image again.';
  if (files.some((file) => file.size > MAX_BYTES)) return 'Each image must be 5 MB or smaller. Use a smaller image and paste again.';
  return null;
}
