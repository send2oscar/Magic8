// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreditPurchasePanel } from "./CreditPurchasePanel";

const mocks = vi.hoisted(() => ({
  captureMutate: vi.fn(),
  cancelMutate: vi.fn(),
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
      createPaypalOrder: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      capturePaypalOrder: { useMutation: () => ({ mutate: mocks.captureMutate, isPending: false }) },
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
    mocks.captureMutate.mockReset();
    mocks.cancelMutate.mockReset();
    mocks.invalidatePackages.mockReset().mockResolvedValue(undefined);
    mocks.onCreditsChanged.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastMessage.mockReset();
    mocks.toastSuccess.mockReset();
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
  });

  it("captures a returned PayPal order once and refreshes the visible credit state", async () => {
    window.history.replaceState({}, "", "/dashboard?paypal=return&token=ORDER-12345678");
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
  });
});
