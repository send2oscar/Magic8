import { describe, expect, it } from "vitest";

const PAYPAL_SANDBOX_OAUTH_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token";
const PAYPAL_LIVE_OAUTH_URL = "https://api-m.paypal.com/v1/oauth2/token";

// Try both Live and Sandbox endpoints to find the correct one
async function getPayPalOAuthToken(
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; url: string }> {
  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const headers = {
    Accept: "application/json",
    Authorization: `Basic ${authorization}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const body = "grant_type=client_credentials";

  // Try Live first
  let response = await fetch(PAYPAL_LIVE_OAUTH_URL, {
    method: "POST",
    headers,
    body,
  });

  if (response.ok) {
    return { token: PAYPAL_LIVE_OAUTH_URL, url: PAYPAL_LIVE_OAUTH_URL };
  }

  // Fall back to Sandbox
  response = await fetch(PAYPAL_SANDBOX_OAUTH_URL, {
    method: "POST",
    headers,
    body,
  });

  if (response.ok) {
    return { token: PAYPAL_SANDBOX_OAUTH_URL, url: PAYPAL_SANDBOX_OAUTH_URL };
  }

  // Both failed; return Live as the attempted URL for error reporting
  return { token: "", url: PAYPAL_LIVE_OAUTH_URL };
}

describe("PayPal Credentials (Live or Sandbox)", () => {
  it("obtains a server-side OAuth token without creating an order", async () => {
    const clientId = process.env.VITE_PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

    expect(clientId, "VITE_PAYPAL_CLIENT_ID must be configured").toBeTruthy();
    expect(clientSecret, "PAYPAL_CLIENT_SECRET must be configured").toBeTruthy();

    const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const headers = {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };
    const body = "grant_type=client_credentials";

    // Try Live first
    let response = await fetch(PAYPAL_LIVE_OAUTH_URL, {
      method: "POST",
      headers,
      body,
    });
    let oauthUrl = PAYPAL_LIVE_OAUTH_URL;

    // If Live fails, try Sandbox
    if (!response.ok) {
      response = await fetch(PAYPAL_SANDBOX_OAUTH_URL, {
        method: "POST",
        headers,
        body,
      });
      oauthUrl = PAYPAL_SANDBOX_OAUTH_URL;
    }

    expect(response.ok, `PayPal OAuth (${oauthUrl}) returned HTTP ${response.status}`).toBe(true);
    const payload = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
    expect(payload.access_token).toEqual(expect.any(String));
    expect(payload.expires_in).toEqual(expect.any(Number));
  }, 20_000);
});
