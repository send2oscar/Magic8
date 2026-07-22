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
  getUserGallery: vi.fn(),
  getAdminUsers: vi.fn(),
  getAdminUserProfile: vi.fn(),
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
  updateTryOnHistory: mocks.updateTryOnHistory,
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

import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `user-${userId}`,
    email: `user${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function configureSuccessfulTryOn() {
  mocks.getUserCredits.mockResolvedValue(5);
  mocks.deductCredits.mockResolvedValue(true);
  mocks.addCredits.mockResolvedValue(true);
  mocks.saveTryOnHistory.mockResolvedValue({ id: 1 });
  mocks.getUserPhotos.mockResolvedValue([
    {
      id: 1,
      userId: 1,
      photoUrl: "/manus-storage/photos/1/source.jpg",
      photoKey: "photos/1/source.jpg",
      uploadedAt: new Date(),
    },
  ]);
  mocks.storageGetSignedUrl.mockResolvedValue("https://storage.example.test/photos/1/source.jpg?signature=test");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
    headers: new Headers({ "content-type": "image/jpeg" }),
  }));
  mocks.generateImage.mockResolvedValue({ url: "/manus-storage/generated/result.png" });
}

describe("Try-On Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSuccessfulTryOn();
  });

  describe("credits.getBalance", () => {
    it("returns the user's current credit balance", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      await expect(caller.credits.getBalance()).resolves.toEqual({ balance: 5 });
    });
  });

  describe("shirts.list", () => {
    it("returns all supported shirt styles", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.shirts.list();

      expect(result.map(style => style.name)).toEqual([
        "Classic White",
        "Neon Pink",
        "Electric Cyan",
        "Dark Black",
        "Holographic",
      ]);
    });
  });

  describe("tryOn.process", () => {
    it("requires authentication", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: () => {} } as TrpcContext["res"],
      });

      await expect(
        caller.tryOn.process({
          photoId: 1,
          shirtStyle: "classic-white",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("deducts one credit and returns a generated result for an owned photo", async () => {
      const caller = appRouter.createCaller(createAuthContext());

      const result = await caller.tryOn.process({
        photoId: 1,
        shirtStyle: "neon-pink",
      });

      expect(mocks.deductCredits).toHaveBeenCalledWith(1, 1);
      expect(result).toMatchObject({
        success: true,
        creditsRemaining: 4,
        resultImageUrl: "/manus-storage/generated/result.png",
        shirtApplied: "Neon Pink",
      });
    });

    it("prevents try-on when there are no credits", async () => {
      mocks.getUserCredits.mockResolvedValue(0);
      const caller = appRouter.createCaller(createAuthContext());

      await expect(
        caller.tryOn.process({
          photoId: 1,
          shirtStyle: "dark-black",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.deductCredits).not.toHaveBeenCalled();
    });

    it("refunds the deducted credit when image generation fails", async () => {
      mocks.generateImage.mockRejectedValue(new Error("Image provider unavailable"));
      const caller = appRouter.createCaller(createAuthContext());

      await expect(
        caller.tryOn.process({
          photoId: 1,
          shirtStyle: "electric-cyan",
        }),
      ).rejects.toThrow("We couldn't complete the AI try-on this time");
      expect(mocks.addCredits).toHaveBeenCalledWith(1, 1);
    });

    it("rejects an unowned photo before creating history or deducting a credit", async () => {
      mocks.getUserPhotos.mockResolvedValue([]);
      const caller = appRouter.createCaller(createAuthContext());

      await expect(
        caller.tryOn.process({
          photoId: 999,
          shirtStyle: "neon-pink",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mocks.saveTryOnHistory).not.toHaveBeenCalled();
      expect(mocks.deductCredits).not.toHaveBeenCalled();
      expect(mocks.generateImage).not.toHaveBeenCalled();
    });
  });

  describe("photos.list", () => {
    it("returns the authenticated user's uploaded photos", async () => {
      const caller = appRouter.createCaller(createAuthContext());
      const result = await caller.photos.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        photoUrl: "/manus-storage/photos/1/source.jpg",
      });
    });
  });
});
