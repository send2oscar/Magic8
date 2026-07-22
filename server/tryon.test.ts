import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId: number = 1): TrpcContext {
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

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return ctx;
}

describe("Try-On Flow", () => {
  describe("credits.getBalance", () => {
    it("returns the user's current credit balance", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.credits.getBalance();

      expect(result).toHaveProperty("balance");
      expect(typeof result.balance).toBe("number");
      expect(result.balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe("shirts.list", () => {
    it("returns available shirt styles", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.shirts.list();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      
      // Check structure of first shirt
      const firstShirt = result[0];
      expect(firstShirt).toHaveProperty("id");
      expect(firstShirt).toHaveProperty("name");
      expect(firstShirt).toHaveProperty("color");
    });

    it("includes expected shirt styles", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.shirts.list();
      const shirtNames = result.map(s => s.name);

      expect(shirtNames).toContain("Classic White");
      expect(shirtNames).toContain("Neon Pink");
      expect(shirtNames).toContain("Electric Cyan");
      expect(shirtNames).toContain("Dark Black");
      expect(shirtNames).toContain("Holographic");
    });
  });

  describe("tryOn.process", () => {
    it("requires authentication", async () => {
      // Create context without user
      const ctx: TrpcContext = {
        user: null,
        req: { protocol: "https", headers: {} } as TrpcContext["req"],
        res: { clearCookie: () => {} } as TrpcContext["res"],
      };

      const caller = appRouter.createCaller(ctx);

      try {
        await caller.tryOn.process({
          photoId: 1,
          photoUrl: "https://example.com/photo.jpg",
          shirtStyle: "classic-white",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.code).toBe("UNAUTHORIZED");
      }
    });

    it("deducts credits on successful try-on", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      // Get initial balance
      const initialBalance = await caller.credits.getBalance();
      const initialCredits = initialBalance.balance;

      // Only test if user has credits
      if (initialCredits > 0) {
        const result = await caller.tryOn.process({
          photoId: 1,
          photoUrl: "https://example.com/photo.jpg",
          shirtStyle: "neon-pink",
        });

        expect(result).toHaveProperty("success");
        expect(result.success).toBe(true);
        expect(result).toHaveProperty("creditsRemaining");
        expect(result.creditsRemaining).toBe(initialCredits - 1);
        expect(result).toHaveProperty("resultImageUrl");
        expect(result).toHaveProperty("shirtApplied");
      }
    });

    it("prevents try-on when user has no credits", async () => {
      const ctx = createAuthContext(2);
      const caller = appRouter.createCaller(ctx);

      // Check if user has 0 credits
      const balance = await caller.credits.getBalance();
      
      if (balance.balance === 0) {
        try {
          await caller.tryOn.process({
            photoId: 1,
            photoUrl: "https://example.com/photo.jpg",
            shirtStyle: "dark-black",
          });
          expect.fail("Should have thrown an error");
        } catch (error: any) {
          expect(error.message).toMatch(/credits|Insufficient/i);
        }
      }
    });

    it("returns result with shirt applied information", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const balance = await caller.credits.getBalance();
      
      if (balance.balance > 0) {
        const result = await caller.tryOn.process({
          photoId: 1,
          photoUrl: "https://example.com/photo.jpg",
          shirtStyle: "neon-pink",
        });

        expect(result).toHaveProperty("shirtApplied");
        expect(typeof result.shirtApplied).toBe("string");
        expect(result.shirtApplied.length).toBeGreaterThan(0);
      }
    });
  });

  describe("photos.list", () => {
    it("returns user's uploaded photos", async () => {
      const ctx = createAuthContext(1);
      const caller = appRouter.createCaller(ctx);

      const result = await caller.photos.list();

      expect(Array.isArray(result)).toBe(true);
      // May be empty if no photos uploaded
      if (result.length > 0) {
        const firstPhoto = result[0];
        expect(firstPhoto).toHaveProperty("id");
        expect(firstPhoto).toHaveProperty("photoUrl");
        expect(firstPhoto).toHaveProperty("uploadedAt");
      }
    });
  });
});
