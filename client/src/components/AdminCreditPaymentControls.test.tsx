// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCreditPaymentControls } from "./AdminCreditPaymentControls";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  packageData: [{ id: 1, credits: 100, status: "active", sortOrder: 0, priceCents: 1000 }],
  paymentData: [{ id: 9, username: "Ada Lovelace", email: "ada@example.test", creditAmount: 100, expectedAmountCents: 1000, status: "completed", orderId: "ORDER-123", createdAt: new Date("2026-07-29T00:00:00.000Z"), capturedAt: new Date("2026-07-29T00:01:00.000Z") }],
  policyData: { standardTryOnCredits: 1, xxxTryOnCredits: 10, priceCentsPerTenCredits: 100, updatedAt: new Date("2026-07-29T00:00:00.000Z") },
  savePackage: vi.fn(),
  savePolicy: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        creditPolicy: { invalidate: mocks.invalidate },
        creditPackages: { invalidate: mocks.invalidate },
        paypalPayments: { invalidate: mocks.invalidate },
      },
      payments: { packages: { invalidate: mocks.invalidate } },
    }),
    admin: {
      creditPolicy: { useQuery: () => ({ data: mocks.policyData, isLoading: false, isError: false }) },
      creditPackages: { useQuery: () => ({ data: mocks.packageData, isLoading: false, isError: false }) },
      paypalPayments: { useQuery: () => ({ data: mocks.paymentData, isLoading: false, isError: false }) },
      updateCreditPolicy: { useMutation: () => ({ mutateAsync: mocks.savePolicy, isPending: false }) },
      saveCreditPackage: { useMutation: () => ({ mutateAsync: mocks.savePackage, isPending: false }) },
    },
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("lucide-react", () => ({ CircleDollarSign: () => null, LoaderCircle: () => null, Plus: () => null, ReceiptText: () => null, Settings2: () => null }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));

describe("AdminCreditPaymentControls", () => {
  beforeEach(() => {
    mocks.invalidate.mockReset().mockResolvedValue(undefined);
    mocks.savePackage.mockReset().mockResolvedValue(undefined);
    mocks.savePolicy.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  afterEach(cleanup);

  it("shows editable policy and required PayPal payment information", async () => {
    render(<AdminCreditPaymentControls />);

    await waitFor(() => expect((screen.getByLabelText("Non-XXX credit deduction") as HTMLInputElement).value).toBe("1"));
    expect((screen.getByLabelText("XXX credit deduction") as HTMLInputElement).value).toBe("10");
    expect((screen.getByLabelText("USD price per 10 credits") as HTMLInputElement).value).toBe("1.00");
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("100")).toBeTruthy();
    expect(screen.getByText("completed")).toBeTruthy();
    expect(screen.getByText("ORDER-123")).toBeTruthy();
  });

  it("saves administrator credit policy values as integer cents and credit deductions", async () => {
    render(<AdminCreditPaymentControls />);

    const standardInput = await screen.findByLabelText("Non-XXX credit deduction");
    fireEvent.change(standardInput, { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("XXX credit deduction"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("USD price per 10 credits"), { target: { value: "1.50" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE CREDIT POLICY" }));

    await waitFor(() => expect(mocks.savePolicy).toHaveBeenCalledWith({
      standardTryOnCredits: 2,
      xxxTryOnCredits: 12,
      priceCentsPerTenCredits: 150,
    }));
  });
});
