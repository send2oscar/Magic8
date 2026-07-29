import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CreditCard, LoaderCircle, PlusCircle, ShieldCheck } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { toast } from "sonner";

type CreditPurchasePanelProps = {
  onCreditsChanged?: () => Promise<unknown> | unknown;
};

function formatUsdFromCents(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)} USD`;
}

export function CreditPurchasePanel({ onCreditsChanged }: CreditPurchasePanelProps) {
  const utils = trpc.useUtils();
  const packages = trpc.payments.packages.useQuery(undefined, { refetchOnWindowFocus: false });
  const createOrder = trpc.payments.createPaypalOrder.useMutation();
  const captureOrder = trpc.payments.capturePaypalOrder.useMutation();
  const cancelOrder = trpc.payments.cancelPaypalOrder.useMutation();
  const handledOrderId = useRef<string | null>(null);

  const clearReturnParameters = () => {
    const current = new URL(window.location.href);
    current.searchParams.delete("paypal");
    current.searchParams.delete("token");
    current.searchParams.delete("PayerID");
    window.history.replaceState({}, "", `${current.pathname}${current.search}${current.hash}`);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get("paypal");
    const orderId = params.get("token");
    if (!flow || !orderId || handledOrderId.current === orderId) return;
    handledOrderId.current = orderId;

    if (flow === "cancel") {
      cancelOrder.mutate({ orderId }, {
        onSettled: clearReturnParameters,
        onSuccess: () => toast.message("PayPal checkout was cancelled. No credits were added."),
        onError: (error) => toast.error(error.message || "The cancelled PayPal checkout could not be recorded."),
      });
      return;
    }

    if (flow === "return") {
      toast.message("Confirming your PayPal payment…");
      captureOrder.mutate({ orderId }, {
        onSuccess: async (result) => {
          await Promise.all([utils.payments.packages.invalidate(), onCreditsChanged?.()]);
          const wording = result.status === "already_completed" ? "was already added" : "has been added";
          toast.success(`${result.creditAmount} credits ${wording} to your balance.`);
          clearReturnParameters();
        },
        onError: (error) => {
          toast.error(error.message || "PayPal could not confirm this checkout. No credits were added.");
          clearReturnParameters();
        },
      });
    }
  }, [cancelOrder, captureOrder, onCreditsChanged, utils.payments.packages]);

  const startCheckout = async (packageId: number) => {
    try {
      const checkout = await createOrder.mutateAsync({ packageId });
      toast.message(`Opening PayPal Sandbox for ${checkout.creditAmount} credits.`);
      window.location.assign(checkout.approvalUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PayPal Sandbox could not start checkout.";
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
          <p className="mt-2 text-sm text-muted-foreground">Purchase an administrator-configured package through PayPal Sandbox. Credits are added only after the server confirms payment.</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded border border-secondary/50 bg-secondary/10 px-2 py-1 text-xs font-semibold text-secondary"><ShieldCheck className="h-3.5 w-3.5" /> SANDBOX</span>
      </div>

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
