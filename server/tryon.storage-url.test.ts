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
  updateTryOnHistory: vi.fn(),
  updateTryOnTaskStages: vi.fn(),
  getActiveTryOnTask: vi.fn(),
  getUserGallery: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminUserProfile: vi.fn(),
  storagePut: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  createTryOnSourceUrl: vi.fn(),
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
  updateTryOnHistory: mocks.updateTryOnHistory,
  updateTryOnTaskStages: mocks.updateTryOnTaskStages,
  getActiveTryOnTask: mocks.getActiveTryOnTask,
  getUserGallery: mocks.getUserGallery,
  getAdminUsers: mocks.getAdminUsers,
  getAdminUserProfile: mocks.getAdminUserProfile,
}));

vi.mock("./storage", () => ({
  storagePut: mocks.storagePut,
  storageGetSignedUrl: mocks.storageGetSignedUrl,
}));

vi.mock("./_core/imageGeneration", () => ({
  generateImage: mocks.generateImage,
}));

vi.mock("./tryOnSource", () => ({
  createTryOnSourceUrl: mocks.createTryOnSourceUrl,
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
    mocks.saveTryOnHistory.mockResolvedValue({ insertId: 1 });
    mocks.updateTryOnTaskStages.mockResolvedValue(true);
    mocks.getUserPhotos.mockResolvedValue([
      {
        id: 17,
        userId: 1,
        photoUrl: "/manus-storage/photos/1/source.jpg",
        photoKey,
        uploadedAt: new Date(),
      },
    ]);
    mocks.createTryOnSourceUrl.mockReturnValue("https://app.example.test/api/try-on-source?key=photos%2F1%2Fsource.jpg&expires=123&signature=safe-token");
    mocks.generateImage.mockResolvedValue({ url: "/manus-storage/generated/result.png" });
  });

  it("sends the provider a short-lived application relay URL rather than a storage signed URL or inline bytes", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.tryOn.process({
      photoId: 17,
      shirtStyle: "neon-pink",
    });

    expect(mocks.createTryOnSourceUrl).toHaveBeenCalledWith(expect.any(Object), photoKey);
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        originalImages: [
          expect.objectContaining({
            url: "https://app.example.test/api/try-on-source?key=photos%2F1%2Fsource.jpg&expires=123&signature=safe-token",
            mimeType: "image/jpeg",
          }),
        ],
      }),
    );
    expect(mocks.generateImage.mock.calls[0]?.[0].originalImages?.[0]).not.toHaveProperty("b64Json");
    expect(result).toMatchObject({
      success: true,
      resultImageUrl: "/manus-storage/generated/result.png",
      creditsRemaining: 9,
      shirtApplied: "Neon Pink",
    });
  });
});
