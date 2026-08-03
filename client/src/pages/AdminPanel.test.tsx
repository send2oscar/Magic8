// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPanel from "./AdminPanel";

const fullTryOnError = `Try-on backend traceback:\n${"diagnostic detail ".repeat(60)}END-OF-TRY-ON-ERROR`;
const fullQwenError = `Qwen workstation traceback:\n${"Qwen diagnostic detail ".repeat(60)}END-OF-QWEN-ERROR`;

const mocks = vi.hoisted(() => ({
  invalidateSession: vi.fn(),
  setLocation: vi.fn(),
  invalidateCreditPolicy: vi.fn(),
  invalidateCreditPackages: vi.fn(),
  invalidatePaypalPayments: vi.fn(),
  invalidatePurchasePackages: vi.fn(),
  updateCreditPolicy: vi.fn(),
  saveCreditPackage: vi.fn(),
  policyData: { id: 1, standardTryOnCredits: 1, xxxTryOnCredits: 10, priceCentsPerTenCredits: 100, updatedAt: new Date() },
  packageData: [
    { id: 1, credits: 100, priceCents: 1000, status: "active", sortOrder: 0 },
    { id: 2, credits: 500, priceCents: 5000, status: "active", sortOrder: 1 },
  ],
  paymentData: [],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        session: { invalidate: mocks.invalidateSession },
        creditPolicy: { invalidate: mocks.invalidateCreditPolicy },
        creditPackages: { invalidate: mocks.invalidateCreditPackages },
        paypalPayments: { invalidate: mocks.invalidatePaypalPayments },
      },
      payments: { packages: { invalidate: mocks.invalidatePurchasePackages } },
    }),
    admin: {
      session: { useQuery: () => ({ data: { authenticated: true, configured: true }, isLoading: false }) },
      listUsers: { useQuery: () => ({ data: [{ id: 7, name: "Oscar", email: "oscar@example.com", lastSignedIn: new Date() }], isLoading: false, isError: false }) },
      userProfile: { useQuery: () => ({ data: { id: 7, name: "Oscar", email: "oscar@example.com", role: "admin", credits: 100, createdAt: new Date(), lastSignedIn: new Date() }, isLoading: false, isError: false }) },
      userGallery: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      userTaskDiagnostics: {
        useQuery: () => ({
          data: [
            { historyId: 499, shirtStyle: "neon-pink", status: "pending", createdAt: new Date(), completedAt: null, taskId: null, bridgeStatus: null, processingRoute: "standard-image-generation", routeDetail: "route=standard-image-generation; shirtStyle=neon-pink" },
            { historyId: 500, shirtStyle: "qwen-image-edit-rapid", status: "pending", createdAt: new Date(), completedAt: null, taskId: null, bridgeStatus: null, processingRoute: "local-comfyui-qwen", routeDetail: "route=local-comfyui-qwen; shirtStyle=qwen-image-edit-rapid" },
          ],
          isLoading: false,
          isError: false,
        }),
      },
      userTaskErrors: {
        useQuery: () => ({
          data: [
            { historyId: 501, shirtStyle: "classic-white", status: "failed", createdAt: new Date(), completedAt: new Date(), taskId: null, bridgeStatus: null, attemptCount: null, progressKey: null, progressLabel: null, progressDetail: null, processingRoute: "standard-image-generation", routeDetail: "route=standard-image-generation; shirtStyle=classic-white", fullError: fullTryOnError },
            { historyId: 502, shirtStyle: "qwen-image-edit-rapid", status: "failed", createdAt: new Date(), completedAt: new Date(), taskId: 88, bridgeStatus: "failed", attemptCount: 2, progressKey: "failed", progressLabel: "Workstation rejected the request", progressDetail: "upstream timeout", processingRoute: "local-comfyui-qwen", routeDetail: "route=local-comfyui-qwen; shirtStyle=qwen-image-edit-rapid", fullError: fullQwenError },
          ],
          isLoading: false,
          isError: false,
        }),
      },
      creditPolicy: { useQuery: () => ({ data: mocks.policyData, isLoading: false, isError: false }) },
      creditPackages: { useQuery: () => ({ data: mocks.packageData, isLoading: false, isError: false }) },
      paypalPayments: { useQuery: () => ({ data: mocks.paymentData, isLoading: false, isError: false }) },
      updateCreditPolicy: { useMutation: () => ({ isPending: false, mutateAsync: mocks.updateCreditPolicy }) },
      saveCreditPackage: { useMutation: () => ({ isPending: false, mutateAsync: mocks.saveCreditPackage }) },
      logout: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin", mocks.setLocation] }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("lucide-react", () => ({ CircleAlert: () => null, CircleDollarSign: () => null, FileWarning: () => null, GalleryHorizontalEnd: () => null, LoaderCircle: () => null, LogOut: () => null, Plus: () => null, ReceiptText: () => null, Settings2: () => null, ShieldCheck: () => null, UserRound: () => null, Users: () => null }));

describe("Admin Workspace diagnostics", () => {
  afterEach(() => {
    cleanup();
    mocks.invalidateSession.mockReset();
    mocks.setLocation.mockReset();
  });

  it("separates site-wide settings from individual-user administration", async () => {
    render(<AdminPanel />);

    expect(screen.getByText("APPLIES TO ALL USERS")).toBeTruthy();
    expect(screen.getAllByText("GENERAL SETTINGS").length).toBeGreaterThan(0);
    expect(screen.getByText("CREDIT POLICY")).toBeTruthy();
    expect(screen.queryByText("RECENT PROCESSING ROUTES")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /user management/i }));
    await waitFor(() => expect(screen.getByText("RECENT PROCESSING ROUTES")).toBeTruthy());
    expect(screen.queryByText("CREDIT POLICY")).toBeNull();
  });

  it("shows full raw error logs for both standard try-on and Qwen image-generation failures", async () => {
    render(<AdminPanel />);

    fireEvent.click(screen.getByRole("button", { name: /user management/i }));

    await waitFor(() => expect(screen.getByText("FULL IMAGE-GENERATION ERROR LOGS")).toBeTruthy());
    expect(screen.getByText("RECENT PROCESSING ROUTES")).toBeTruthy();
    expect(screen.queryByText("FULL XXX TASK ERROR LOGS")).toBeNull();
    expect(screen.getByText("Classic White")).toBeTruthy();
    expect(screen.getAllByText("Qwen Image Edit").length).toBeGreaterThan(0);
    expect(screen.getByText(/END-OF-TRY-ON-ERROR/).textContent).toBe(fullTryOnError);
    expect(screen.getByText(/END-OF-QWEN-ERROR/).textContent).toBe(fullQwenError);
    expect(screen.getAllByText("Full raw error")).toHaveLength(2);
    expect(screen.getAllByText("Standard Cloud Image Generation").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Local ComfyUI (Qwen)").length).toBeGreaterThan(0);
    expect(screen.getByText("route=standard-image-generation; shirtStyle=neon-pink")).toBeTruthy();
    expect(screen.getByText("route=local-comfyui-qwen; shirtStyle=qwen-image-edit-rapid")).toBeTruthy();
  });
});
