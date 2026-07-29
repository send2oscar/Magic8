import { describe, expect, it, vi } from "vitest";
import { captureSandboxPaypalOrder, createSandboxPaypalOrder, PayPalRequestError } from "./paypal";

describe("PayPal Sandbox order creation", () => {
  it("creates an approved USD order with an exact server-calculated amount", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "sandbox-token" }) } as Response;
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "ORDER-12345678", links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER-12345678" }] }),
      } as Response;
    });
    const previousId = process.env.VITE_PAYPAL_CLIENT_ID;
    const previousSecret = process.env.PAYPAL_CLIENT_SECRET;
    process.env.VITE_PAYPAL_CLIENT_ID = "sandbox-client";
    process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(createSandboxPaypalOrder({
        amountCents: 1000,
        description: "100 credits",
        returnUrl: "https://app.example/dashboard?paypal=return",
        cancelUrl: "https://app.example/dashboard?paypal=cancel",
        userId: 9,
        packageId: 4,
      })).resolves.toMatchObject({ orderId: "ORDER-12345678" });

      const orderCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders"));
      expect(JSON.parse(String(orderCall?.init?.body))).toMatchObject({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: "USD", value: "10.00" } }],
      });
    } finally {
      process.env.VITE_PAYPAL_CLIENT_ID = previousId;
      process.env.PAYPAL_CLIENT_SECRET = previousSecret;
      vi.unstubAllGlobals();
    }
  });

  it("rejects a non-HTTP return URL before creating an order", async () => {
    await expect(createSandboxPaypalOrder({
      amountCents: 1000,
      description: "100 credits",
      returnUrl: "javascript:alert(1)",
      cancelUrl: "https://app.example/dashboard?paypal=cancel",
      userId: 9,
      packageId: 4,
    })).rejects.toBeInstanceOf(PayPalRequestError);
  });

  it("accepts only a completed USD capture and returns exact integer cents", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith("/v1/oauth2/token")) {
        return { ok: true, status: 200, json: async () => ({ access_token: "sandbox-token" }) } as Response;
      }
      return {
        ok: true,
        status: 201,
        json: async () => ({
          id: "ORDER-12345678",
          status: "COMPLETED",
          purchase_units: [{ payments: { captures: [{ id: "CAPTURE-12345678", status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } }] } }],
        }),
      } as Response;
    });
    const previousId = process.env.VITE_PAYPAL_CLIENT_ID;
    const previousSecret = process.env.PAYPAL_CLIENT_SECRET;
    process.env.VITE_PAYPAL_CLIENT_ID = "sandbox-client";
    process.env.PAYPAL_CLIENT_SECRET = "sandbox-secret";
    vi.stubGlobal("fetch", fetchMock);

    try {
      await expect(captureSandboxPaypalOrder("ORDER-12345678")).resolves.toEqual({ captureId: "CAPTURE-12345678", capturedAmountCents: 1000 });
      const captureCall = calls.find((call) => call.url.endsWith("/v2/checkout/orders/ORDER-12345678/capture"));
      expect(captureCall?.init).toMatchObject({ method: "POST", body: "{}" });
    } finally {
      process.env.VITE_PAYPAL_CLIENT_ID = previousId;
      process.env.PAYPAL_CLIENT_SECRET = previousSecret;
      vi.unstubAllGlobals();
    }
  });
});
