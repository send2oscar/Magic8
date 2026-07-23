import { describe, expect, it } from "vitest";

import {
  createPhotoStorageKey,
  getPhotoMimeType,
  normalizePhotoStorageFilename,
} from "./photoStorageKey";

describe("photo storage-key normalization", () => {
  it("creates an ASCII-only key for a Chinese filename while retaining a supported image extension", () => {
    const key = createPhotoStorageKey(42, 1_784_826_400_000, "夏日穿搭照片.JPEG");

    expect(key).toBe("photos/42/1784826400000-photo.jpeg");
    expect(key).toMatch(/^[\x20-\x7E]+$/);
    expect(getPhotoMimeType("夏日穿搭照片.JPEG")).toBe("image/jpeg");
  });

  it("strips client path fragments and normalizes accented and punctuation-heavy names", () => {
    expect(normalizePhotoStorageFilename("C:\\fakepath\\Jérôme's look (final).PNG")).toBe(
      "Jerome-s-look-final.png"
    );
    expect(createPhotoStorageKey("user/7", 123, "C:\\fakepath\\Jérôme's look (final).PNG")).toBe(
      "photos/user-7/123-Jerome-s-look-final.png"
    );
  });

  it("uses a stable ASCII fallback when a filename has no usable ASCII characters", () => {
    expect(normalizePhotoStorageFilename("写真")).toBe("photo");
    expect(normalizePhotoStorageFilename("照片.影像")).toBe("photo");
  });
});
