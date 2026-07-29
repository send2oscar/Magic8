import { describe, expect, it } from "vitest";

const PAYPAL_SANDBOX_OAUTH_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token";

describe("PayPal Sandbox credentials", () => {
  it("obtains a server-side OAuth token without creating an order", async () => {
    const clientId = process.env.VITE_PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    expect(clientId, "VITE_PAYPAL_CLIENT_ID must be configured").toBeTruthy();
    expect(clientSecret, "PAYPAL_CLIENT_SECRET must be configured").toBeTruthy();

    const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(PAYPAL_SANDBOX_OAUTH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    expect(response.ok, `PayPal Sandbox OAuth returned HTTP ${response.status}`).toBe(true);
    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    expect(payload.access_token).toEqual(expect.any(String));
    expect(payload.expires_in).toEqual(expect.any(Number));
  }, 20_000);
});
