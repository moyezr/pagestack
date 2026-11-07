// Decode only on paste and downsample in the browser's image decoder. Keep the
// original File untouched for LinkedIn/downloads, and close decoded bitmaps.
export async function makePreview(file: File, signal: AbortSignal): Promise<string | null> {
  if (signal.aborted) return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: 160, resizeQuality: 'low' });
    if (signal.aborted) return null;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return signal.aborted ? null : URL.createObjectURL(blob);
  } catch {
    // A thumbnail failure must not discard the user's original image.
    return null;
  } finally { bitmap?.close(); }
}
