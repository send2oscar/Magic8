import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ADMIN_SESSION_COOKIE } from "./adminAuth";
import { appRouter } from "./routers";

function context(cookieHeader = ""): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: cookieHeader ? { cookie: cookieHeader } : {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("dedicated admin credentials", () => {
  it("validates the configured credentials and a resulting signed session", async () => {
    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    expect(username).toBeTruthy();
    expect(password).toBeTruthy();
    expect(process.env.ADMIN_SESSION_SECRET).toBeTruthy();

    const loginContext = context();
    const loginCaller = appRouter.createCaller(loginContext);
    await expect(loginCaller.admin.login({ username: username!, password: password! })).resolves.toEqual({ success: true });
    const [name, token, options] = (loginContext.res.cookie as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe(ADMIN_SESSION_COOKIE);
    expect(options).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict" });
    await expect(appRouter.createCaller(context(`${name}=${token}`)).admin.session()).resolves.toEqual({ authenticated: true, configured: true });
  });

  it("rejects an incorrect administrator password without setting a cookie", async () => {
    const loginContext = context();
    await expect(appRouter.createCaller(loginContext).admin.login({ username: process.env.ADMIN_USERNAME!, password: "not-the-admin-password" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(loginContext.res.cookie).not.toHaveBeenCalled();
  });
});
