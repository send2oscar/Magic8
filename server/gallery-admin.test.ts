import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  getUserCredits: vi.fn(), deductCredits: vi.fn(), addCredits: vi.fn(), saveUserPhoto: vi.fn(), getUserPhotos: vi.fn(), saveTryOnHistory: vi.fn(), getTryOnHistory: vi.fn(), updateTryOnHistory: vi.fn(), updateTryOnTaskStages: vi.fn(), getActiveTryOnTask: vi.fn(), getUserGallery: vi.fn(), deleteUserGalleryEntry: vi.fn(), getAdminUsers: vi.fn(), getAdminUserProfile: vi.fn(),
}));

vi.mock("./db", () => ({
  getUserCredits: mocks.getUserCredits, deductCredits: mocks.deductCredits, addCredits: mocks.addCredits, saveUserPhoto: mocks.saveUserPhoto, getUserPhotos: mocks.getUserPhotos, saveTryOnHistory: mocks.saveTryOnHistory, getTryOnHistory: mocks.getTryOnHistory, updateTryOnHistory: mocks.updateTryOnHistory, updateTryOnTaskStages: mocks.updateTryOnTaskStages, getActiveTryOnTask: mocks.getActiveTryOnTask, getUserGallery: mocks.getUserGallery, deleteUserGalleryEntry: mocks.deleteUserGalleryEntry, getAdminUsers: mocks.getAdminUsers, getAdminUserProfile: mocks.getAdminUserProfile,
}));

import { appRouter } from "./routers";

function context(userId: number | null, cookieHeader = ""): TrpcContext {
  return {
    user: userId === null ? null : { id: userId, openId: `user-${userId}`, name: `User ${userId}`, email: `user${userId}@example.com`, loginMethod: "manus", role: "user", credits: 5, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: cookieHeader ? { cookie: cookieHeader } : {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("private gallery and administrator access", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries only the signed-in user's private gallery", async () => {
    mocks.getUserGallery.mockResolvedValue([{ id: 101, userId: 1 }]);
    await expect(appRouter.createCaller(context(1)).gallery.list()).resolves.toEqual([{ id: 101, userId: 1 }]);
    expect(mocks.getUserGallery).toHaveBeenCalledWith(1);
    expect(mocks.getUserGallery).not.toHaveBeenCalledWith(2);
  });

  it("rejects an unauthenticated gallery request", async () => {
    await expect(appRouter.createCaller(context(null)).gallery.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("removes only the signed-in user's selected Gallery item", async () => {
    mocks.deleteUserGalleryEntry.mockResolvedValue(true);

    await expect(appRouter.createCaller(context(1)).gallery.remove({ historyId: 101 })).resolves.toEqual({ success: true });
    expect(mocks.deleteUserGalleryEntry).toHaveBeenCalledWith(1, 101);
  });

  it("does not reveal ownership details when an item cannot be deleted", async () => {
    mocks.deleteUserGalleryEntry.mockResolvedValue(false);

    await expect(appRouter.createCaller(context(1)).gallery.remove({ historyId: 202 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.deleteUserGalleryEntry).toHaveBeenCalledWith(1, 202);
  });

  it("rejects administrator data without the dedicated password session", async () => {
    await expect(appRouter.createCaller(context(null)).admin.listUsers()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getAdminUsers).not.toHaveBeenCalled();
  });

  it("allows the dedicated administrator session to review a selected user profile and gallery", async () => {
    const loginContext = context(null);
    await appRouter.createCaller(loginContext).admin.login({ username: process.env.ADMIN_USERNAME!, password: process.env.ADMIN_PASSWORD! });
    const [cookieName, token] = (loginContext.res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    const caller = appRouter.createCaller(context(null, `${cookieName}=${token}`));
    mocks.getAdminUsers.mockResolvedValue([{ id: 2, name: "User 2" }]);
    mocks.getAdminUserProfile.mockResolvedValue({ id: 2, name: "User 2" });
    mocks.getUserGallery.mockResolvedValue([{ id: 202, userId: 2 }]);
    await expect(caller.admin.listUsers()).resolves.toEqual([{ id: 2, name: "User 2" }]);
    await expect(caller.admin.userProfile({ userId: 2 })).resolves.toEqual({ id: 2, name: "User 2" });
    await expect(caller.admin.userGallery({ userId: 2 })).resolves.toEqual([{ id: 202, userId: 2 }]);
    expect(mocks.getUserGallery).toHaveBeenLastCalledWith(2);
  });
});
