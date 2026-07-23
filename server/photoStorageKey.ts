const FALLBACK_PHOTO_BASENAME = "photo";
const SAFE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/i;

function getBasename(filename: string): string {
  return filename.replace(/\\/g, "/").split("/").pop() || FALLBACK_PHOTO_BASENAME;
}

function getSafeExtension(filename: string): string {
  const match = getBasename(filename).match(/(\.[^.]*)$/);
  const extension = match?.[1] ?? "";

  return SAFE_EXTENSION_PATTERN.test(extension) ? extension.toLowerCase() : "";
}

/**
 * Converts a user-controlled filename into an ASCII-only object-name component.
 * The storage presign endpoint rejects non-ASCII paths, so the display filename
 * must never be used directly as an object key.
 */
export function normalizePhotoStorageFilename(filename: string): string {
  const basename = getBasename(filename);
  const extension = getSafeExtension(basename);
  const nameWithoutExtension = extension ? basename.slice(0, -extension.length) : basename;
  const normalizedBase = nameWithoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${normalizedBase || FALLBACK_PHOTO_BASENAME}${extension}`;
}

export function createPhotoStorageKey(userId: number | string, timestamp: number, filename: string): string {
  const safeUserId = String(userId).replace(/[^A-Za-z0-9_-]/g, "-") || "user";
  const safeTimestamp = Number.isFinite(timestamp) ? Math.trunc(timestamp) : Date.now();

  return `photos/${safeUserId}/${safeTimestamp}-${normalizePhotoStorageFilename(filename)}`;
}

export function getPhotoMimeType(filename: string): string {
  switch (getSafeExtension(filename)) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
