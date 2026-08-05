// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditPurchasePanel } from "./CreditPurchasePanel";

const mocks = vi.hoisted(() => ({
  createMutate: vi.fn(),
  captureMutate: vi.fn(),
  captureMutateAsync: vi.fn(),
  cancelMutate: vi.fn(),
  openWindow: vi.fn(),
  invalidatePackages: vi.fn(),
  onCreditsChanged: vi.fn(),
  toastError: vi.fn(),
  toastMessage: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ payments: { packages: { invalidate: mocks.invalidatePackages } } }),
    payments: {
      packages: {
        useQuery: () => ({
          data: [
            { id: 4, credits: 1, priceCents: 10 },
            { id: 1, credits: 100, priceCents: 1000 },
            { id: 2, credits: 500, priceCents: 5000 },
            { id: 3, credits: 1000, priceCents: 10000 },
          ],
          isLoading: false,
          isError: false,
        }),
      },
      createPaypalOrder: { useMutation: () => ({ mutateAsync: mocks.createMutate, isPending: false }) },
      capturePaypalOrder: { useMutation: () => ({ mutate: mocks.captureMutate, mutateAsync: mocks.captureMutateAsync, isPending: false }) },
      cancelPaypalOrder: { useMutation: () => ({ mutate: mocks.cancelMutate, isPending: false }) },
    },
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("lucide-react", () => ({ CreditCard: () => null, LoaderCircle: () => null, PlusCircle: () => null, ShieldCheck: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, message: mocks.toastMessage, success: mocks.toastSuccess } }));

describe("CreditPurchasePanel", () => {
  beforeEach(() => {
    mocks.createMutate.mockReset();
    mocks.captureMutate.mockReset();
    mocks.captureMutateAsync.mockReset().mockResolvedValue({ status: "already_completed", creditAmount: 100 });
    mocks.cancelMutate.mockReset();
    mocks.openWindow.mockReset();
    mocks.invalidatePackages.mockReset().mockResolvedValue(undefined);
    mocks.onCreditsChanged.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastMessage.mockReset();
    mocks.toastSuccess.mockReset();
    Object.defineProperty(window, "open", { configurable: true, writable: true, value: mocks.openWindow });
    window.history.replaceState({}, "", "/dashboard");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/dashboard");
  });

  it("shows the server-priced fixed packages", () => {
    render(<CreditPurchasePanel />);

    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
    expect(screen.getByText("1000")).toBeTruthy();
    expect(screen.getByText("$0.10 USD")).toBeTruthy();
    expect(screen.getByText("$10.00 USD")).toBeTruthy();
    expect(screen.getByText("$50.00 USD")).toBeTruthy();
    expect(screen.getByText("$100.00 USD")).toBeTruthy();
    expect(screen.getByText("PAYPAL LIVE")).toBeTruthy();
    expect(screen.queryByText(/sandbox/i)).toBeNull();
  });

  it("shows the typed checkout-start failure instead of a generic response parsing error", async () => {
    mocks.openWindow.mockReturnValue({
      closed: false,
      close: vi.fn(),
      location: { replace: vi.fn() },
      opener: {},
    });
    mocks.createMutate.mockRejectedValue(new Error("PayPal Live credentials could not be verified."));
    render(<CreditPurchasePanel />);

    await act(async () => {
      screen.getAllByRole("button", { name: "BUY PACKAGE" })[0]?.click();
    });

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("PayPal Live credentials could not be verified."));
  });

  it("opens a separate PayPal tab and navigates only that tab to the approval URL", async () => {
    const replace = vi.fn();
    const paymentTab = {
      closed: false,
      close: vi.fn(),
      location: { replace },
      opener: {},
    };
    mocks.openWindow.mockReturnValue(paymentTab);
    mocks.createMutate.mockResolvedValue({
      approvalUrl: "https://www.paypal.com/checkoutnow?token=ORDER-12345678",
      creditAmount: 100,
    });
    render(<CreditPurchasePanel />);

    await act(async () => {
      screen.getAllByRole("button", { name: "BUY PACKAGE" })[1]?.click();
    });

    expect(mocks.openWindow).toHaveBeenCalledWith("", expect.stringMatching(/^shirt-changer-paypal-checkout-/));
    expect(mocks.createMutate).toHaveBeenCalledWith({ packageId: 1 });
    expect(replace).toHaveBeenCalledWith("https://www.paypal.com/checkoutnow?token=ORDER-12345678");
    expect(mocks.toastMessage).toHaveBeenCalledWith("Opening PayPal checkout for 100 credits in a new tab.");
  });

  it("does not create an order when the browser blocks the new PayPal tab", async () => {
    mocks.openWindow.mockReturnValue(null);
    render(<CreditPurchasePanel />);

    await act(async () => {
      screen.getAllByRole("button", { name: "BUY PACKAGE" })[0]?.click();
    });

    expect(mocks.createMutate).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith("Your browser blocked the PayPal tab. Please allow pop-ups for this site and try again.");
  });

  it("refreshes the originating Dashboard only after receiving a verified cross-tab completion result", async () => {
    render(<CreditPurchasePanel onCreditsChanged={mocks.onCreditsChanged} />);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "shirt-changer:paypal-checkout-result",
      newValue: JSON.stringify({
        type: "shirt-changer/paypal-checkout-result",
        orderId: "ORDER-12345678",
        outcome: "completed",
        creditAmount: 100,
        verified: true,
      }),
    }));

    await waitFor(() => expect(mocks.onCreditsChanged).toHaveBeenCalledTimes(1));
    expect(mocks.invalidatePackages).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("100 credits was already added to your balance.");
  });

  it("keeps the originating credit state unchanged for cancelled and failed cross-tab results", async () => {
    render(<CreditPurchasePanel onCreditsChanged={mocks.onCreditsChanged} />);

    window.dispatchEvent(new StorageEvent("storage", {
      key: "shirt-changer:paypal-checkout-result",
      newValue: JSON.stringify({
        type: "shirt-changer/paypal-checkout-result",
        orderId: "ORDER-87654321",
        outcome: "cancelled",
      }),
    }));
    await waitFor(() => expect(mocks.toastMessage).toHaveBeenCalledWith("PayPal checkout was cancelled. No credits were added."));

    window.dispatchEvent(new StorageEvent("storage", {
      key: "shirt-changer:paypal-checkout-result",
      newValue: JSON.stringify({
        type: "shirt-changer/paypal-checkout-result",
        orderId: "ORDER-ABCDEFGH",
        outcome: "failed",
        message: "PayPal could not confirm this checkout. No credits were added.",
      }),
    }));
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("PayPal could not confirm this checkout. No credits were added."));
    expect(mocks.onCreditsChanged).not.toHaveBeenCalled();
    expect(mocks.invalidatePackages).not.toHaveBeenCalled();
  });

  it("publishes a cancelled return-page result to the originating Dashboard", async () => {
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState({}, "", "/dashboard?paypal=cancel&paypalTab=1&token=ORDER-12345678");
    mocks.cancelMutate.mockImplementation((_input, options) => {
      void options.onSuccess();
    });

    await act(async () => {
      render(<CreditPurchasePanel />);
    });

    await waitFor(() => expect(mocks.cancelMutate).toHaveBeenCalledWith(
      { orderId: "ORDER-12345678" },
      expect.any(Object),
    ));
    expect(storageSetItem).toHaveBeenCalledWith("shirt-changer:paypal-checkout-result", expect.stringContaining('"outcome":"cancelled"'));
  });

  it("publishes a failed return-page result without refreshing credits", async () => {
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState({}, "", "/dashboard?paypal=return&paypalTab=1&token=ORDER-12345678");
    mocks.captureMutate.mockImplementation((_input, options) => {
      void options.onError(new Error("PayPal could not confirm this checkout. No credits were added."));
    });

    await act(async () => {
      render(<CreditPurchasePanel onCreditsChanged={mocks.onCreditsChanged} />);
    });

    await waitFor(() => expect(mocks.captureMutate).toHaveBeenCalledWith(
      { orderId: "ORDER-12345678" },
      expect.any(Object),
    ));
    expect(mocks.onCreditsChanged).not.toHaveBeenCalled();
    expect(storageSetItem).toHaveBeenCalledWith("shirt-changer:paypal-checkout-result", expect.stringContaining('"outcome":"failed"'));
  });

  it("captures a returned PayPal order once and refreshes the visible credit state", async () => {
    const storageSetItem = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState({}, "", "/dashboard?paypal=return&paypalTab=1&token=ORDER-12345678");
    mocks.captureMutate.mockImplementation((_input, options) => {
      void options.onSuccess({ status: "completed", creditAmount: 100 });
    });

    await act(async () => {
      render(<CreditPurchasePanel onCreditsChanged={mocks.onCreditsChanged} />);
    });

    await waitFor(() => expect(mocks.captureMutate).toHaveBeenCalledWith(
      { orderId: "ORDER-12345678" },
      expect.any(Object),
    ));
    await waitFor(() => expect(mocks.onCreditsChanged).toHaveBeenCalledTimes(1));
    expect(mocks.invalidatePackages).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("100 credits has been added to your balance.");
    expect(storageSetItem).toHaveBeenCalledWith("shirt-changer:paypal-checkout-result", expect.stringContaining('"verified":true'));
  });
});
