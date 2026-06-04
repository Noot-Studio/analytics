const AVATAR_SIZE = 256;
const WEBP_QUALITY = 0.9;

/**
 * Center-crops and downscales an image file to a square WebP, keeping
 * avatar uploads small before they're sent to the server.
 */
export const downscaleImage = async (
  file: File,
  size: number = AVATAR_SIZE
): Promise<File> => {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable");
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  const blob = await canvas.convertToBlob({
    quality: WEBP_QUALITY,
    type: "image/webp",
  });
  return new File([blob], "avatar.webp", { type: "image/webp" });
};
