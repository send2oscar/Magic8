import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getUserCredits: vi.fn(),
  chargeAndCompleteTryOn: vi.fn(),
  getCreditCostForRoute: vi.fn(),
  getActiveCreditPackages: vi.fn(),
  getCreditPackageById: vi.fn(),
  getCreditPolicy: vi.fn(),
  createPaypalPaymentRecord: vi.fn(),
  getPaypalPaymentForUser: vi.fn(),
  fulfillPaypalPayment: vi.fn(),
  markPaypalPaymentStatus: vi.fn(),
  getAdminCreditPackages: vi.fn(),
  getAdminPaypalPayments: vi.fn(),
  saveAdminCreditPackage: vi.fn(),
  updateCreditPolicy: vi.fn(),
  createPaypalOrder: vi.fn(),
  capturePaypalOrder: vi.fn(),
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
  chargeAndCompleteTryOn: mocks.chargeAndCompleteTryOn,
  getCreditCostForRoute: mocks.getCreditCostForRoute,
  getActiveCreditPackages: mocks.getActiveCreditPackages,
  getCreditPackageById: mocks.getCreditPackageById,
  getCreditPolicy: mocks.getCreditPolicy,
  createPaypalPaymentRecord: mocks.createPaypalPaymentRecord,
  getPaypalPaymentForUser: mocks.getPaypalPaymentForUser,
  fulfillPaypalPayment: mocks.fulfillPaypalPayment,
  markPaypalPaymentStatus: mocks.markPaypalPaymentStatus,
  getAdminCreditPackages: mocks.getAdminCreditPackages,
  getAdminPaypalPayments: mocks.getAdminPaypalPayments,
  saveAdminCreditPackage: mocks.saveAdminCreditPackage,
  updateCreditPolicy: mocks.updateCreditPolicy,
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

vi.mock("./paypal", () => ({
  PayPalRequestError: class PayPalRequestError extends Error {},
  PayPalCapturePendingError: class PayPalCapturePendingError extends Error {},
  createPaypalOrder: mocks.createPaypalOrder,
  capturePaypalOrder: mocks.capturePaypalOrder,
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
    req: { protocol: "https", headers: { origin: "https://app.example.test", host: "app.example.test" } } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function configureSuccessfulTryOn() {
  mocks.getUserCredits.mockResolvedValue(5);
  mocks.getCreditCostForRoute.mockResolvedValue(1);
  mocks.chargeAndCompleteTryOn.mockResolvedValue("charged");
  mocks.saveTryOnHistory.mockResolvedValue({ insertId: 1 });
  mocks.updateTryOnTaskStages.mockResolvedValue(true);
  mocks.getUserPhotos.mockResolvedValue([
    {
      id: 1,
      userId: 1,
      photoUrl: "/manus-storage/photos/1/source.jpg",
      photoKey: "photos/1/source.jpg",
      uploadedAt: new Date(),
    },
  ]);
  mocks.createTryOnSourceUrl.mockReturnValue(
    "https://app.example.test/api/try-on-source?key=photos%2F1%2Fsource.jpg&expires=123&signature=safe-token",
  );
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

    it("charges one credit only after a generated result is successfully finalized", async () => {
      const caller = appRouter.createCaller(createAuthContext());

      const result = await caller.tryOn.process({
        photoId: 1,
        shirtStyle: "neon-pink",
      });

      expect(mocks.chargeAndCompleteTryOn).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        historyId: 1,
        creditCost: 1,
        resultImageUrl: "/manus-storage/generated/result.png",
      }));
      expect(result).toMatchObject({
        success: true,
        creditsRemaining: 5,
        resultImageUrl: "/manus-storage/generated/result.png",
        shirtApplied: "Neon Pink",
      });
      expect(mocks.updateTryOnTaskStages).toHaveBeenCalledWith(
        1,
        expect.arrayContaining([
          expect.objectContaining({
            key: "route_selected",
            detail: "route=standard-image-generation; shirtStyle=neon-pink",
          }),
        ]),
      );
    });

    it("accepts the tuple-shaped MySQL insert result used by the deployed database", async () => {
      mocks.saveTryOnHistory.mockResolvedValue([{ insertId: 41 }, []]);
      const caller = appRouter.createCaller(createAuthContext());

      await expect(caller.tryOn.process({
        photoId: 1,
        shirtStyle: "neon-pink",
      })).resolves.toMatchObject({ success: true, creditsRemaining: 5 });

      expect(mocks.updateTryOnTaskStages).toHaveBeenCalledWith(
        41,
        expect.arrayContaining([expect.objectContaining({ key: "task_created" })]),
      );
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
      expect(mocks.chargeAndCompleteTryOn).not.toHaveBeenCalled();
    });

    it("does not charge or refund credits when image generation fails", async () => {
      mocks.generateImage.mockRejectedValue(new Error("Image provider unavailable"));
      const caller = appRouter.createCaller(createAuthContext());

      await expect(
        caller.tryOn.process({
          photoId: 1,
          shirtStyle: "electric-cyan",
        }),
      ).rejects.toThrow("We couldn't complete the AI try-on this time");
      expect(mocks.chargeAndCompleteTryOn).not.toHaveBeenCalled();
    });

    it("rejects an unowned photo before creating history or charging a credit", async () => {
      mocks.getUserPhotos.mockResolvedValue([]);
      const caller = appRouter.createCaller(createAuthContext());

      await expect(
        caller.tryOn.process({
          photoId: 999,
          shirtStyle: "neon-pink",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });

      expect(mocks.saveTryOnHistory).not.toHaveBeenCalled();
      expect(mocks.chargeAndCompleteTryOn).not.toHaveBeenCalled();
      expect(mocks.generateImage).not.toHaveBeenCalled();
    });
  });

  describe("tryOn.activeTask", () => {
    it("returns only the signed-in user's safe active task diagnostics", async () => {
      mocks.getActiveTryOnTask.mockResolvedValue({
        id: 41,
        shirtStyle: "neon-pink",
        createdAt: new Date("2026-07-22T00:00:00.000Z"),
        stages: [{ key: "image_generation", label: "AI shirt generation in progress", state: "active", timestamp: 1 }],
      });

      const caller = appRouter.createCaller(createAuthContext(1));
      await expect(caller.tryOn.activeTask()).resolves.toMatchObject({
        id: 41,
        stages: [{ key: "image_generation" }],
      });
      expect(mocks.getActiveTryOnTask).toHaveBeenCalledWith(1);
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

  describe("PayPal credit checkout", () => {
    it("requires authentication before exposing purchasable credit packages", async () => {
      const caller = appRouter.createCaller({
        user: null,
        req: { protocol: "https", headers: { origin: "https://app.example.test" } } as TrpcContext["req"],
        res: { clearCookie: () => {} } as TrpcContext["res"],
      });

      await expect(caller.payments.packages()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("creates an order and payment record with the server-calculated package amount", async () => {
      mocks.getCreditPackageById.mockResolvedValue({ id: 4, credits: 100, status: "active", sortOrder: 0 });
      mocks.getCreditPolicy.mockResolvedValue({ id: 1, standardTryOnCredits: 1, xxxTryOnCredits: 10, priceCentsPerTenCredits: 100 });
      mocks.createPaypalOrder.mockResolvedValue({ orderId: "ORDER-12345678", approvalUrl: "https://www.paypal.com/checkoutnow?token=ORDER-12345678" });
      mocks.createPaypalPaymentRecord.mockResolvedValue({ id: 8, orderId: "ORDER-12345678", status: "created" });

      const result = await appRouter.createCaller(createAuthContext(7)).payments.createPaypalOrder({ packageId: 4 });

      expect(mocks.createPaypalOrder).toHaveBeenCalledWith(expect.objectContaining({
        amountCents: 1000,
        description: "100 application credits",
        userId: 7,
        packageId: 4,
        returnUrl: "https://app.example.test/dashboard?paypal=return&paypalTab=1",
        cancelUrl: "https://app.example.test/dashboard?paypal=cancel&paypalTab=1",
      }));
      expect(mocks.createPaypalPaymentRecord).toHaveBeenCalledWith({
        userId: 7,
        packageId: 4,
        orderId: "ORDER-12345678",
        creditAmount: 100,
        expectedAmountCents: 1000,
      });
      expect(result).toMatchObject({ orderId: "ORDER-12345678", creditAmount: 100, amountCents: 1000, amountUsd: "10.00" });
    });

    it("returns a client-readable non-5xx tRPC error when PayPal cannot start checkout", async () => {
      mocks.getCreditPackageById.mockResolvedValue({ id: 4, credits: 100, status: "active", sortOrder: 0 });
      mocks.getCreditPolicy.mockResolvedValue({ id: 1, standardTryOnCredits: 1, xxxTryOnCredits: 10, priceCentsPerTenCredits: 100 });
      mocks.createPaypalOrder.mockRejectedValue(new Error("PayPal API was unavailable."));

      await expect(appRouter.createCaller(createAuthContext(7)).payments.createPaypalOrder({ packageId: 4 }))
        .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: "PayPal could not start checkout. Please try again." });
    });

    it("rejects a checkout request whose Origin does not match the application host", async () => {
      const context = createAuthContext(7);
      context.req = {
        protocol: "https",
        headers: { origin: "https://untrusted.example.test", host: "app.example.test" },
      } as TrpcContext["req"];

      await expect(appRouter.createCaller(context).payments.createPaypalOrder({ packageId: 4 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mocks.createPaypalOrder).not.toHaveBeenCalled();
    });

    it("captures a user-owned payment once and returns an idempotent result on the repeated return-page request", async () => {
      mocks.getPaypalPaymentForUser
        .mockResolvedValueOnce({ orderId: "ORDER-12345678", status: "created", creditAmount: 100 })
        .mockResolvedValueOnce({ orderId: "ORDER-12345678", status: "completed", creditAmount: 100 });
      mocks.capturePaypalOrder.mockResolvedValue({ captureId: "CAPTURE-12345678", capturedAmountCents: 1000 });
      mocks.fulfillPaypalPayment.mockResolvedValue({ status: "completed", creditAmount: 100 });
      const caller = appRouter.createCaller(createAuthContext(7));

      await expect(caller.payments.capturePaypalOrder({ orderId: "ORDER-12345678" })).resolves.toEqual({ status: "completed", creditAmount: 100 });
      await expect(caller.payments.capturePaypalOrder({ orderId: "ORDER-12345678" })).resolves.toEqual({ status: "already_completed", creditAmount: 100 });

      expect(mocks.capturePaypalOrder).toHaveBeenCalledTimes(1);
      expect(mocks.fulfillPaypalPayment).toHaveBeenCalledTimes(1);
      expect(mocks.fulfillPaypalPayment).toHaveBeenCalledWith({
        userId: 7,
        orderId: "ORDER-12345678",
        captureId: "CAPTURE-12345678",
        capturedAmountCents: 1000,
      });
    });

    it("does not expose PayPal payment records to a normal signed-in user", async () => {
      await expect(appRouter.createCaller(createAuthContext(7)).admin.paypalPayments()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.getAdminPaypalPayments).not.toHaveBeenCalled();
    });
  });
});
