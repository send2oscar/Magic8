/* @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetchCredits: vi.fn(),
  refetchPhotos: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    credits: {
      getBalance: {
        useQuery: () => ({ data: { balance: 5 }, refetch: mocks.refetchCredits }),
      },
    },
    photos: {
      list: {
        useQuery: () => ({
          data: [{ id: 7, photoKey: "photos/1/test.jpg", photoUrl: "https://storage.example.test/photos/1/test.jpg" }],
          refetch: mocks.refetchPhotos,
        }),
      },
    },
    shirts: {
      list: {
        useQuery: () => ({ data: [{ id: "neon-pink", name: "Neon Pink", color: "#ff00aa" }] }),
      },
    },
    tryOn: {
      process: {
        useMutation: () => ({ mutateAsync: mocks.mutateAsync }),
      },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Test User" }, logout: vi.fn(), isAuthenticated: true, loading: false }),
}));

vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", vi.fn()] }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("lucide-react", () => ({
  Zap: () => null,
  Upload: () => null,
  LogOut: () => null,
  Shirt: () => null,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function selectOwnedPhotoAndShirt() {
  const file = new File(["photo"], "person.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  const fileInput = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!fileInput) throw new Error("Expected a file input");

  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText("Selected upload")).toBeTruthy());
  fireEvent.click(screen.getByText("Neon Pink"));
}

describe("Dashboard Try On Now lifecycle", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.mutateAsync.mockReset();
    mocks.refetchCredits.mockReset();
    mocks.refetchPhotos.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.refetchPhotos.mockResolvedValue({
      data: [{ id: 7, photoKey: "photos/1/test.jpg", photoUrl: "https://storage.example.test/photos/1/test.jpg" }],
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ photoKey: "photos/1/test.jpg" }),
    }));
    vi.stubGlobal("btoa", (value: string) => value);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("shows finalizing progress, surfaces a timeout, and returns the button to a retryable state", async () => {
    const request = deferred<never>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await act(async () => undefined);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(screen.getByRole("button", { name: "FINALIZING: 92% complete" }).textContent).toContain("FINALIZING • 92%");

    await act(async () => {
      request.reject(new Error("Image generation timed out after 75 seconds."));
      await Promise.resolve();
    });

    const retryButton = screen.getByRole("button", { name: "Try on now" });
    expect(retryButton.textContent).toContain("TRY ON NOW");
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith("Image generation timed out after 75 seconds.");
  });

  it("surfaces a provider failure and returns the button to a retryable state", async () => {
    const request = deferred<never>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByRole("button", { name: "FINALIZING: 92% complete" }).textContent).toContain("FINALIZING • 92%");

    const providerMessage = "Image generation request failed: provider temporarily unavailable.";
    await act(async () => {
      request.reject(new Error(providerMessage));
      await Promise.resolve();
    });

    const retryButton = screen.getByRole("button", { name: "Try on now" });
    expect(retryButton.textContent).toContain("TRY ON NOW");
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith(providerMessage);
  });

  it("shows completion and then restores Try On Now after a successful generation", async () => {
    const request = deferred<{ resultImageUrl: string; shirtApplied: string; creditsRemaining: number }>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await act(async () => {
      request.resolve({
        resultImageUrl: "https://storage.example.test/generated/result.png",
        shirtApplied: "Neon Pink",
        creditsRemaining: 4,
      });
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
    });

    expect(screen.getByText("TRY-ON RESULT")).toBeTruthy();
    const retryButton = screen.getByRole("button", { name: "Try on now" });
    expect(retryButton.textContent).toContain("TRY ON NOW");
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Try-on completed!");
  });
});
