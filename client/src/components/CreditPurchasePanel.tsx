import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CreditCard, LoaderCircle, PlusCircle, ShieldCheck } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { toast } from "sonner";

type CreditPurchasePanelProps = {
  onCreditsChanged?: () => Promise<unknown> | unknown;
};

type PayPalCheckoutOutcome = "completed" | "already_completed" | "cancelled" | "pending" | "failed";

type PayPalCheckoutResult = {
  type: "shirt-changer/paypal-checkout-result";
  orderId: string;
  outcome: PayPalCheckoutOutcome;
  creditAmount?: number;
  message?: string;
  verified?: boolean;
};

const PAYPAL_CHECKOUT_RESULT_TYPE = "shirt-changer/paypal-checkout-result";
const PAYPAL_CHECKOUT_CHANNEL = "shirt-changer-paypal-checkout";
const PAYPAL_CHECKOUT_STORAGE_KEY = "shirt-changer:paypal-checkout-result";
const PAYPAL_POPUP_NAME_PREFIX = "shirt-changer-paypal-checkout-";
const PAYPAL_CHECKOUT_OUTCOMES: PayPalCheckoutOutcome[] = ["completed", "already_completed", "cancelled", "pending", "failed"];

function formatUsdFromCents(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)} USD`;
}

function isPayPalCheckoutResult(value: unknown): value is PayPalCheckoutResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const creditAmount = candidate.creditAmount;
  if (candidate.type !== PAYPAL_CHECKOUT_RESULT_TYPE) return false;
  if (typeof candidate.orderId !== "string" || !/^[A-Z0-9-]{8,127}$/i.test(candidate.orderId)) return false;
  if (typeof candidate.outcome !== "string" || !PAYPAL_CHECKOUT_OUTCOMES.includes(candidate.outcome as PayPalCheckoutOutcome)) return false;
  if (creditAmount !== undefined && (typeof creditAmount !== "number" || !Number.isSafeInteger(creditAmount) || creditAmount < 0)) return false;
  if (candidate.message !== undefined && typeof candidate.message !== "string") return false;
  if (candidate.verified !== undefined && typeof candidate.verified !== "boolean") return false;
  if ((candidate.outcome === "completed" || candidate.outcome === "already_completed")
    && (candidate.verified !== true || typeof creditAmount !== "number" || !Number.isSafeInteger(creditAmount) || creditAmount <= 0)) return false;
  return true;
}

function publishPayPalCheckoutResult(result: PayPalCheckoutResult) {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(PAYPAL_CHECKOUT_CHANNEL);
      channel.postMessage(result);
      channel.close();
    }
  } catch {
    // Local storage below provides a same-origin fallback when BroadcastChannel is unavailable.
  }

  try {
    window.localStorage.setItem(PAYPAL_CHECKOUT_STORAGE_KEY, JSON.stringify(result));
    window.localStorage.removeItem(PAYPAL_CHECKOUT_STORAGE_KEY);
  } catch {
    // The originating page can still receive the BroadcastChannel notification when storage is blocked.
  }
}

function closePaymentTabSoon() {
  if (!window.name.startsWith(PAYPAL_POPUP_NAME_PREFIX)) return;
  window.setTimeout(() => window.close(), 350);
}

export function CreditPurchasePanel({ onCreditsChanged }: CreditPurchasePanelProps) {
  const utils = trpc.useUtils();
  const packages = trpc.payments.packages.useQuery(undefined, { refetchOnWindowFocus: false });
  const createOrder = trpc.payments.createPaypalOrder.useMutation();
  const captureOrder = trpc.payments.capturePaypalOrder.useMutation();
  const cancelOrder = trpc.payments.cancelPaypalOrder.useMutation();
  const handledOrderId = useRef<string | null>(null);
  const handledExternalOrderIds = useRef(new Set<string>());
  const isPaymentReturnTab = useRef(new URLSearchParams(window.location.search).get("paypalTab") === "1");
  const [pendingCapture, setPendingCapture] = React.useState<{ orderId: string; message: string } | null>(null);

  const clearReturnParameters = () => {
    const current = new URL(window.location.href);
    current.searchParams.delete("paypal");
    current.searchParams.delete("paypalTab");
    current.searchParams.delete("token");
    current.searchParams.delete("PayerID");
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
  };

  const refreshVisibleCreditState = React.useCallback(async () => {
    await Promise.all([utils.payments.packages.invalidate(), onCreditsChanged?.()]);
  }, [onCreditsChanged, utils.payments.packages]);

  const reportToOriginatingPage = (result: PayPalCheckoutResult) => {
    if (!isPaymentReturnTab.current) return;
    publishPayPalCheckoutResult(result);
  };

  useEffect(() => {
    const handleExternalCheckoutResult = async (value: unknown) => {
      if (isPaymentReturnTab.current || !isPayPalCheckoutResult(value) || handledExternalOrderIds.current.has(value.orderId)) return;
      handledExternalOrderIds.current.add(value.orderId);

      if (value.outcome === "completed" || value.outcome === "already_completed") {
        try {
          const confirmation = await captureOrder.mutateAsync({ orderId: value.orderId });
          if (confirmation.status === "pending") {
            const message = confirmation.message;
            setPendingCapture({ orderId: value.orderId, message });
            toast.error(message);
            return;
          }
          await refreshVisibleCreditState();
          setPendingCapture(null);
          const wording = confirmation.status === "already_completed" ? "was already added" : "has been added";
          toast.success(`${confirmation.creditAmount} credits ${wording} to your balance.`);
        } catch {
          toast.error("Your PayPal payment is complete, but the visible credit balance could not refresh. Please refresh this page.");
          return;
        }
        return;
      }

      if (value.outcome === "pending") {
        const message = value.message || "PayPal has not completed this capture yet. No credits were added.";
        setPendingCapture({ orderId: value.orderId, message });
        toast.error(message);
        return;
      }

      if (value.outcome === "cancelled") {
        toast.message("PayPal checkout was cancelled. No credits were added.");
        return;
      }

      toast.error(value.message || "PayPal could not confirm this checkout. No credits were added.");
    };

    const handleBroadcastMessage = (event: MessageEvent<unknown>) => {
      void handleExternalCheckoutResult(event.data);
    };
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key !== PAYPAL_CHECKOUT_STORAGE_KEY || !event.newValue) return;
      try {
        void handleExternalCheckoutResult(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed same-origin storage values.
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(PAYPAL_CHECKOUT_CHANNEL);
        channel.addEventListener("message", handleBroadcastMessage);
      }
    } catch {
      channel = null;
    }
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      channel?.removeEventListener("message", handleBroadcastMessage);
      channel?.close();
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [captureOrder, refreshVisibleCreditState]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get("paypal");
    const orderId = params.get("token");
    if (!flow || !orderId || handledOrderId.current === orderId) return;
    handledOrderId.current = orderId;

    if (flow === "cancel") {
      cancelOrder.mutate({ orderId }, {
        onSettled: clearReturnParameters,
        onSuccess: () => {
          toast.message("PayPal checkout was cancelled. No credits were added.");
          reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId, outcome: "cancelled" });
          closePaymentTabSoon();
        },
        onError: (error) => {
          const message = error.message || "The cancelled PayPal checkout could not be recorded.";
          toast.error(message);
          reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId, outcome: "failed", message });
        },
      });
      return;
    }

    if (flow === "return") {
      toast.message("Confirming your PayPal payment…");
      captureOrder.mutate({ orderId }, {
        onSuccess: async (result) => {
          if (result.status === "pending") {
            setPendingCapture({ orderId, message: result.message });
            toast.error(result.message);
            reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId, outcome: "pending", message: result.message });
            clearReturnParameters();
            return;
          }
          try {
            await refreshVisibleCreditState();
          } catch {
            toast.error("Your PayPal payment is complete, but the visible credit balance could not refresh. Please refresh this page.");
          }
          const wording = result.status === "already_completed" ? "was already added" : "has been added";
          toast.success(`${result.creditAmount} credits ${wording} to your balance.`);
          reportToOriginatingPage({
            type: PAYPAL_CHECKOUT_RESULT_TYPE,
            orderId,
            outcome: result.status,
            creditAmount: result.creditAmount,
            verified: true,
          });
          clearReturnParameters();
          closePaymentTabSoon();
        },
        onError: (error) => {
          const message = error.message || "PayPal could not confirm this checkout. No credits were added.";
          toast.error(message);
          reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId, outcome: "failed", message });
          clearReturnParameters();
        },
      });
    }
  }, [cancelOrder, captureOrder, refreshVisibleCreditState]);

  const retryPendingCapture = () => {
    if (!pendingCapture) return;
    captureOrder.mutate({ orderId: pendingCapture.orderId }, {
      onSuccess: async (result) => {
        if (result.status === "pending") {
          setPendingCapture({ orderId: pendingCapture.orderId, message: result.message });
          toast.error(result.message);
          reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId: pendingCapture.orderId, outcome: "pending", message: result.message });
          return;
        }
        setPendingCapture(null);
        try {
          await refreshVisibleCreditState();
        } catch {
          toast.error("Your PayPal payment is complete, but the visible credit balance could not refresh. Please refresh this page.");
        }
        const wording = result.status === "already_completed" ? "was already added" : "has been added";
        toast.success(`${result.creditAmount} credits ${wording} to your balance.`);
        reportToOriginatingPage({
          type: PAYPAL_CHECKOUT_RESULT_TYPE,
          orderId: pendingCapture.orderId,
          outcome: result.status,
          creditAmount: result.creditAmount,
          verified: true,
        });
        closePaymentTabSoon();
      },
      onError: (error) => {
        const message = error.message || "PayPal could not confirm this checkout. No credits were added.";
        setPendingCapture(null);
        toast.error(message);
        reportToOriginatingPage({ type: PAYPAL_CHECKOUT_RESULT_TYPE, orderId: pendingCapture.orderId, outcome: "failed", message });
      },
    });
  };

  const startCheckout = async (packageId: number) => {
    const checkoutWindow = window.open("", `${PAYPAL_POPUP_NAME_PREFIX}${Date.now()}`);
    if (!checkoutWindow) {
      toast.error("Your browser blocked the PayPal tab. Please allow pop-ups for this site and try again.");
      return;
    }

    try {
      // The payment page is opened during the click gesture, then detached before it navigates to PayPal.
      checkoutWindow.opener = null;
      const checkout = await createOrder.mutateAsync({ packageId });
      if (checkoutWindow.closed) {
        throw new Error("The PayPal tab was closed before checkout could begin. Please try again.");
      }
      checkoutWindow.location.replace(checkout.approvalUrl);
      toast.message(`Opening PayPal checkout for ${checkout.creditAmount} credits in a new tab.`);
    } catch (error) {
      checkoutWindow.close();
      const message = error instanceof Error ? error.message : "PayPal could not start checkout.";
      toast.error(message);
    }
  };

  const isWorking = createOrder.isPending || captureOrder.isPending || cancelOrder.isPending;

  return (
    <Card className="hud-frame bg-card/50 p-6 backdrop-blur" aria-labelledby="credit-purchase-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-secondary" />
            <h2 id="credit-purchase-heading" className="text-2xl font-bold neon-cyan">ADD CREDITS</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Purchase an administrator-configured package through PayPal. Checkout opens in a new tab, and credits are added only after the server confirms a completed payment.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded border border-secondary/50 bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary"><ShieldCheck className="h-3.5 w-3.5" /> PAYPAL LIVE</span>
      </div>

      {pendingCapture ? (
        <div role="alert" className="mt-5 rounded border border-accent/50 bg-accent/10 p-4 text-sm text-foreground">
          <p className="whitespace-pre-wrap break-words font-medium">{pendingCapture.message}</p>
          <p className="mt-2 text-xs text-muted-foreground">After the PayPal account issue is resolved, retry confirmation. Credits remain unavailable until PayPal returns a completed capture.</p>
          <Button type="button" variant="outline" onClick={retryPendingCapture} disabled={captureOrder.isPending} className="mt-3 border-accent/60 text-accent">
            {captureOrder.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            RETRY PAYPAL CONFIRMATION
          </Button>
        </div>
      ) : null}

      {packages.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="h-5 w-5 animate-spin text-accent" /> Loading credit packages…</div>
      ) : packages.isError ? (
        <p className="mt-5 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Credit packages are temporarily unavailable. Please try again later.</p>
      ) : packages.data?.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {packages.data.map((creditPackage) => (
            <article key={creditPackage.id} className="rounded border border-accent/30 bg-background/35 p-4">
              <p className="text-2xl font-bold text-foreground">{creditPackage.credits}</p>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">CREDITS</p>
              <p className="mt-3 text-lg font-bold text-secondary">{formatUsdFromCents(creditPackage.priceCents)}</p>
              <Button
                type="button"
                className="mt-4 w-full bg-secondary font-bold text-background"
                onClick={() => void startCheckout(creditPackage.id)}
                disabled={isWorking}
              >
                {createOrder.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                BUY PACKAGE
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-5 rounded border border-accent/30 bg-background/35 p-3 text-sm text-muted-foreground">No credit packages are active. Please contact an administrator.</p>
      )}
    </Card>
  );
}
