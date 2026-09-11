import sharp, { type Metadata } from "sharp";

export const MAX_THEME_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_THEME_IMAGE_DIMENSION = 8_000;
export const MAX_THEME_IMAGE_PIXELS = 25_000_000;

const advertisedMimeByFormat: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export interface NormalizedThemeImage {
  bytes: Buffer;
  mimeType: "image/webp";
  width: number;
  height: number;
}

/**
 * Decode and normalize an uploaded image before it is persisted. Sharp's
 * decoder is intentionally used both for magic-byte validation and for the
 * decompression-pixel limit; the output is always a metadata-free WebP.
 */
export async function normalizeThemeImage(
  input: Buffer,
  advertisedMime: string,
): Promise<NormalizedThemeImage> {
  if (!Buffer.isBuffer(input) || input.length === 0) {
    throw new Error("Image de thème vide.");
  }
  if (input.length > MAX_THEME_IMAGE_BYTES) {
    throw new Error("Image de thème trop volumineuse (8 Mo maximum).");
  }

  const mimeType = advertisedMime.split(";", 1)[0].trim().toLowerCase();
  if (!Object.values(advertisedMimeByFormat).includes(mimeType)) {
    throw new Error("Format d’image refusé. Utilisez JPEG, PNG ou WebP.");
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_THEME_IMAGE_PIXELS,
    }).metadata();
  } catch {
    throw new Error("L’image de thème est invalide ou corrompue.");
  }

  const format = metadata.format ?? "";
  if (format === "gif" || format === "svg" || !advertisedMimeByFormat[format]) {
    throw new Error("Format d’image refusé. Utilisez JPEG, PNG ou WebP.");
  }
  if (advertisedMimeByFormat[format] !== mimeType) {
    throw new Error("Le type MIME ne correspond pas au contenu de l’image.");
  }

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_THEME_IMAGE_DIMENSION ||
    height > MAX_THEME_IMAGE_DIMENSION ||
    width * height > MAX_THEME_IMAGE_PIXELS
  ) {
    throw new Error("Les dimensions de l’image de thème sont trop grandes.");
  }

  try {
    const bytes = await sharp(input, {
      failOn: "error",
      limitInputPixels: MAX_THEME_IMAGE_PIXELS,
    })
      .rotate()
      .webp({ quality: 88, effort: 4 })
      .toBuffer();
    if (bytes.length > MAX_THEME_IMAGE_BYTES) {
      throw new Error("L’image traitée est trop volumineuse (8 Mo maximum).");
    }
    return { bytes, mimeType: "image/webp", width, height };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "L’image traitée est trop volumineuse (8 Mo maximum)."
    ) {
      throw error;
    }
    throw new Error("Impossible de traiter l’image de thème.");
  }
}