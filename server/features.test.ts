import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// Mock authenticated user context
function createAuthContext(user: User): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// Mock unauthenticated context
function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Credit System", () => {
  it("should return credit balance for authenticated user", async () => {
    const user: User = {
      id: 1,
      openId: "test-user-123",
      name: "Test User",
      email: "test@example.com",
      loginMethod: "manus",
      role: "user",
      credits: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createAuthContext(user);
    const caller = appRouter.createCaller(ctx);

    // Should be able to get credit balance
    const result = await caller.credits.getBalance();
    expect(result).toHaveProperty("balance");
    expect(typeof result.balance).toBe("number");
  });

  it("user with 0 credits should not be able to try on", async () => {
    const userWithNoCredits: User = {
      id: 2,
      openId: "no-credits-user",
      name: "No Credits User",
      email: "nocredits@example.com",
      loginMethod: "manus",
      role: "user",
      credits: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createAuthContext(userWithNoCredits);
    const caller = appRouter.createCaller(ctx);

    // Attempting to try on with 0 credits should fail
    try {
      await caller.tryOn.process({
        photoId: 1,
        photoUrl: "https://example.com/photo.jpg",
        shirtStyle: "classic-white",
      });
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.message).toContain("Insufficient credits");
    }
  });
});

describe("Upload Protection", () => {
  it("unauthenticated user should not be able to upload photos", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Attempting to upload without authentication should fail
    try {
      await caller.photos.upload({
        file: new Blob(["test"], { type: "image/jpeg" }),
        filename: "test.jpg",
      });
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  it("authenticated user should be able to call upload procedure", async () => {
    const authenticatedUser: User = {
      id: 4,
      openId: "upload-test-user",
      name: "Upload Test User",
      email: "uploadtest@example.com",
      loginMethod: "manus",
      role: "user",
      credits: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };

    const ctx = createAuthContext(authenticatedUser);
    const caller = appRouter.createCaller(ctx);

    // Authenticated user should be able to call the upload procedure
    // (it may fail on S3 storage, but not on auth)
    try {
      await caller.photos.upload({
        file: new Blob(["test"], { type: "image/jpeg" }),
        filename: "test.jpg",
      });
    } catch (error: any) {
      // Should not fail on authorization
      expect(error.code).not.toBe("UNAUTHORIZED");
    }
  });

  it("unauthenticated user should not be able to access credit balance", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Attempting to get credits without authentication should fail
    try {
      await caller.credits.getBalance();
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });

  it("unauthenticated user should not be able to try on", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    // Attempting to try on without authentication should fail
    try {
      await caller.tryOn.process({
        photoId: 1,
        photoUrl: "https://example.com/photo.jpg",
        shirtStyle: "classic-white",
      });
      // If we get here, the test should fail
      expect(true).toBe(false);
    } catch (error: any) {
      expect(error.code).toBe("UNAUTHORIZED");
    }
  });
});

describe("Shirt Selection", () => {
  it("should return all available shirt styles", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const shirts = await caller.shirts.list();

    expect(shirts).toHaveLength(5);
    expect(shirts[0].name).toBe("Classic White");
    expect(shirts[1].name).toBe("Neon Pink");
    expect(shirts[2].name).toBe("Electric Cyan");
    expect(shirts[3].name).toBe("Dark Black");
    expect(shirts[4].name).toBe("Holographic");
  });

  it("each shirt should have required properties", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const shirts = await caller.shirts.list();

    shirts.forEach((shirt) => {
      expect(shirt).toHaveProperty("id");
      expect(shirt).toHaveProperty("name");
      expect(shirt).toHaveProperty("color");
      expect(typeof shirt.id).toBe("string");
      expect(typeof shirt.name).toBe("string");
      expect(typeof shirt.color).toBe("string");
    });
  });
});
