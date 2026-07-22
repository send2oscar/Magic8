import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getUserCredits: vi.fn(),
  deductCredits: vi.fn(),
  addCredits: vi.fn(),
  saveUserPhoto: vi.fn(),
  getUserPhotos: vi.fn(),
  saveTryOnHistory: vi.fn(),
  getTryOnHistory: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  generateImage: vi.fn(),
}));

vi.mock("./db", () => ({
  getUserCredits: mocks.getUserCredits,
  deductCredits: mocks.deductCredits,
  addCredits: mocks.addCredits,
  saveUserPhoto: mocks.saveUserPhoto,
  getUserPhotos: mocks.getUserPhotos,
  saveTryOnHistory: mocks.saveTryOnHistory,
  getTryOnHistory: mocks.getTryOnHistory,
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
  storageGetSignedUrl: mocks.storageGetSignedUrl,
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: mocks.generateImage,
}));

import { appRouter } from "./routers";

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("tryOn.process source image resolution", () => {
  const photoKey = "photos/1/source.jpg";
  const signedStorageUrl = "https://storage.example.test/photos/1/source.jpg?signature=test";

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserCredits.mockResolvedValue(10);
    mocks.deductCredits.mockResolvedValue(true);
    mocks.addCredits.mockResolvedValue(true);
    mocks.saveTryOnHistory.mockResolvedValue({ id: 1 });
    mocks.getUserPhotos.mockResolvedValue([
      {
        id: 17,
        userId: 1,
        photoUrl: "/manus-storage/photos/1/source.jpg",
        photoKey,
        uploadedAt: new Date(),
      },
    ]);
    mocks.storageGetSignedUrl.mockResolvedValue(signedStorageUrl);
    mocks.generateImage.mockResolvedValue({ url: "/manus-storage/generated/result.png" });
  });

  it("uses a signed HTTPS storage URL rather than the client-provided relative path", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.tryOn.process({
      photoId: 17,
      photoUrl: "/manus-storage/photos/1/source.jpg",
      shirtStyle: "neon-pink",
    });

    expect(mocks.storageGetSignedUrl).toHaveBeenCalledWith(photoKey);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        originalImages: [
          expect.objectContaining({
            url: signedStorageUrl,
            mimeType: "image/jpeg",
          }),
        ],
      }),
    );
    expect(mocks.generateImage.mock.calls[0]?.[0].originalImages?.[0]?.url).not.toContain("localhost");
    expect(result).toMatchObject({
      success: true,
      resultImageUrl: "/manus-storage/generated/result.png",
      creditsRemaining: 9,
      shirtApplied: "Neon Pink",
    });
  });
});
