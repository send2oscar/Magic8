// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AdminPanel from "./AdminPanel";

const fullTryOnError = `Try-on backend traceback:\n${"diagnostic detail ".repeat(60)}END-OF-TRY-ON-ERROR`;
const fullQwenError = `Qwen workstation traceback:\n${"Qwen diagnostic detail ".repeat(60)}END-OF-QWEN-ERROR`;

const mocks = vi.hoisted(() => ({
  invalidateSession: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ admin: { session: { invalidate: mocks.invalidateSession } } }),
    admin: {
      session: { useQuery: () => ({ data: { authenticated: true, configured: true }, isLoading: false }) },
      listUsers: { useQuery: () => ({ data: [{ id: 7, name: "Oscar", email: "oscar@example.com", lastSignedIn: new Date() }], isLoading: false, isError: false }) },
      userProfile: { useQuery: () => ({ data: { id: 7, name: "Oscar", email: "oscar@example.com", role: "admin", credits: 100, createdAt: new Date(), lastSignedIn: new Date() }, isLoading: false, isError: false }) },
      userGallery: { useQuery: () => ({ data: [], isLoading: false, isError: false }) },
      userTaskErrors: {
        useQuery: () => ({
          data: [
            { historyId: 501, shirtStyle: "classic-white", status: "failed", createdAt: new Date(), completedAt: new Date(), taskId: null, bridgeStatus: null, attemptCount: null, progressKey: null, progressLabel: null, progressDetail: null, fullError: fullTryOnError },
            { historyId: 502, shirtStyle: "qwen-image-edit-rapid", status: "failed", createdAt: new Date(), completedAt: new Date(), taskId: 88, bridgeStatus: "failed", attemptCount: 2, progressKey: "failed", progressLabel: "Workstation rejected the request", progressDetail: "upstream timeout", fullError: fullQwenError },
          ],
          isLoading: false,
          isError: false,
        }),
      },
      logout: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/admin", mocks.setLocation] }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("lucide-react", () => ({ CircleAlert: () => null, FileWarning: () => null, GalleryHorizontalEnd: () => null, LoaderCircle: () => null, LogOut: () => null, ShieldCheck: () => null, UserRound: () => null, Users: () => null }));

describe("Admin Workspace diagnostics", () => {
  afterEach(() => {
    cleanup();
    mocks.invalidateSession.mockReset();
    mocks.setLocation.mockReset();
  });

  it("shows full raw error logs for both standard try-on and Qwen image-generation failures", async () => {
    render(<AdminPanel />);

    await waitFor(() => expect(screen.getByText("FULL IMAGE-GENERATION ERROR LOGS")).toBeTruthy());
    expect(screen.queryByText("FULL XXX TASK ERROR LOGS")).toBeNull();
    expect(screen.getByText("Classic White")).toBeTruthy();
    expect(screen.getByText("Qwen Image Edit")).toBeTruthy();
    expect(screen.getByText(/END-OF-TRY-ON-ERROR/).textContent).toBe(fullTryOnError);
    expect(screen.getByText(/END-OF-QWEN-ERROR/).textContent).toBe(fullQwenError);
    expect(screen.getAllByText("Full raw error")).toHaveLength(2);
  });
});
