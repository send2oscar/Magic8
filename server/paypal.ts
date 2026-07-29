import { formatUsdFromCents } from "./creditPolicy";

const PAYPAL_SANDBOX_API_BASE = "https://api-m.sandbox.paypal.com";

export class PayPalRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PayPalRequestError";
  }
}

type PayPalLink = { href?: unknown; rel?: unknown };
type PayPalOrderResponse = {
  id?: unknown;
  status?: unknown;
  links?: PayPalLink[];
  purchase_units?: Array<{
    payments?: { captures?: Array<{
      id?: unknown;
      status?: unknown;
      amount?: { currency_code?: unknown; value?: unknown };
    }> };
  }>;
};

function getPayPalCredentials() {
  const clientId = process.env.VITE_PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new PayPalRequestError("PayPal Sandbox is not configured. An administrator must add the Sandbox credentials before checkout can begin.");
  }
  return { clientId, clientSecret };
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

async function getSandboxAccessToken(fetcher: typeof fetch = fetch) {
  const { clientId, clientSecret } = getPayPalCredentials();
  const authorization = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetcher(`${PAYPAL_SANDBOX_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
  });
  const body = await response.json().catch(() => null) as { access_token?: unknown; error_description?: unknown } | null;
  const token = asNonEmptyString(body?.access_token);
  if (!response.ok || !token) {
    throw new PayPalRequestError("PayPal Sandbox credentials could not be verified. Check the configured Client ID and Client Secret.", response.status);
  }
  return token;
}

async function sandboxApiRequest(path: string, init: RequestInit, fetcher: typeof fetch = fetch) {
  const token = await getSandboxAccessToken(fetcher);
  const response = await fetcher(`${PAYPAL_SANDBOX_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null) as PayPalOrderResponse | null;
  if (!response.ok || !body) {
    throw new PayPalRequestError("PayPal Sandbox could not complete this checkout request. Please try again.", response.status);
  }
  return body;
}

function assertHttpsHttpUrl(value: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PayPalRequestError(`${label} is not a valid application URL.`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PayPalRequestError(`${label} must use HTTP or HTTPS.`);
  }
  return parsed.toString();
}

export async function createSandboxPaypalOrder(input: {
  amountCents: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  userId: number;
  packageId: number;
}) {
  const amount = formatUsdFromCents(input.amountCents);
  const returnUrl = assertHttpsHttpUrl(input.returnUrl, "PayPal return URL");
  const cancelUrl = assertHttpsHttpUrl(input.cancelUrl, "PayPal cancel URL");
  const body = await sandboxApiRequest("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `package-${input.packageId}`,
        custom_id: `user-${input.userId}`,
        description: input.description.slice(0, 127),
        amount: { currency_code: "USD", value: amount },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: returnUrl,
            cancel_url: cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  });
  const orderId = asNonEmptyString(body.id);
  const approvalUrl = body.links?.find((link) => link.rel === "payer-action" || link.rel === "approve");
  const approvalHref = asNonEmptyString(approvalUrl?.href);
  if (!orderId || !approvalHref) {
    throw new PayPalRequestError("PayPal Sandbox did not return an approval link for this order.");
  }
  return { orderId, approvalUrl: approvalHref };
}

export async function captureSandboxPaypalOrder(orderId: string) {
  if (!/^[A-Z0-9-]{8,127}$/i.test(orderId)) {
    throw new PayPalRequestError("The PayPal order reference is invalid.");
  }
  const body = await sandboxApiRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: "{}",
  });
  const capture = body.purchase_units?.[0]?.payments?.captures?.[0];
  const captureId = asNonEmptyString(capture?.id);
  const status = asNonEmptyString(capture?.status);
  const currency = asNonEmptyString(capture?.amount?.currency_code);
  const rawValue = asNonEmptyString(capture?.amount?.value);
  if (body.status !== "COMPLETED" || status !== "COMPLETED" || currency !== "USD" || !rawValue || !captureId) {
    throw new PayPalRequestError("PayPal did not confirm a completed USD capture for this order.");
  }
  const parsedCents = Math.round(Number(rawValue) * 100);
  if (!Number.isSafeInteger(parsedCents) || parsedCents <= 0 || Math.abs(Number(rawValue) * 100 - parsedCents) > 0.000001) {
    throw new PayPalRequestError("PayPal returned an invalid capture amount.");
  }
  return { captureId, capturedAmountCents: parsedCents };
}
