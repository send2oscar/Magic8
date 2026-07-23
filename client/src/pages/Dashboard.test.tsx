// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  processDashboardQwen: vi.fn(),
  refetchCredits: vi.fn(),
  refetchPhotos: vi.fn(),
  setLocation: vi.fn(),
  defaultPromptData: { prompt: "Change the shirt to yellow." } as { prompt: string } | null,
  liveStatusData: null as unknown,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    credits: {
      getBalance: { useQuery: () => ({ data: { balance: 5 }, refetch: mocks.refetchCredits }) },
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
      list: { useQuery: () => ({ data: [{ id: "neon-pink", name: "Neon Pink", color: "#ff00aa" }] }) },
    },
    tryOn: {
      process: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
    },
    comfyuiPoc: {
      defaultPrompt: { useQuery: () => ({ data: mocks.defaultPromptData, isLoading: false }) },
      processDashboardQwen: { useMutation: () => ({ mutateAsync: mocks.processDashboardQwen }) },
      getLiveStatus: { useQuery: () => ({ data: mocks.liveStatusData }) },
    },
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { name: "Test User" }, logout: vi.fn(), isAuthenticated: true, loading: false }),
}));

vi.mock("wouter", () => ({ useLocation: () => ["/dashboard", mocks.setLocation] }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <>{children}</> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("lucide-react", () => ({ Zap: () => null, Upload: () => null, LogOut: () => null, Shirt: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
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
    mocks.processDashboardQwen.mockReset();
    mocks.refetchCredits.mockReset();
    mocks.refetchPhotos.mockReset();
    mocks.setLocation.mockReset();
    mocks.defaultPromptData = { prompt: "Change the shirt to yellow." };
    mocks.liveStatusData = null;
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    mocks.refetchPhotos.mockResolvedValue({ data: [{ id: 7, photoKey: "photos/1/test.jpg", photoUrl: "https://storage.example.test/photos/1/test.jpg" }] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ photoKey: "photos/1/test.jpg" }) }));
    vi.stubGlobal("btoa", (value: string) => value);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("keeps the live task log visible at finalizing progress and then returns the button to a retryable state", async () => {
    const request = deferred<never>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(screen.getByRole("button", { name: "FINALIZING: 92% complete" }).textContent).toContain("FINALIZING • 92%");
    expect(screen.getByText("LIVE TASK LOG")).toBeTruthy();
    expect(screen.getByText("Waiting for server task")).toBeTruthy();
    expect(screen.getByText(/The AI provider is still working/)).toBeTruthy();

    const safeMessage = "We couldn't complete the AI try-on this time. Your credit has been returned. Please try again in a moment.";
    await act(async () => { request.reject(new Error(safeMessage)); await Promise.resolve(); });
    const retryButton = screen.getByRole("button", { name: "Try on now" });
    expect(retryButton.textContent).toContain("TRY ON NOW");
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    expect(mocks.toastError).toHaveBeenCalledWith(safeMessage);
  });

  it("renders server-confirmed stages instead of only a local waiting indicator", async () => {
    const request = deferred<never>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    mocks.liveStatusData = {
      phase: "executing",
      label: "AI shirt generation in progress",
      events: [{ id: 1, label: "AI shirt generation in progress", at: 1 }],
    };
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    expect(screen.getByText("AI shirt generation in progress")).toBeTruthy();
    await act(async () => { request.reject(new Error("Unable to finish")); await Promise.resolve(); });
  });

  it("shows completion and then restores Try On Now after a successful generation", async () => {
    const request = deferred<{ resultImageUrl: string; shirtApplied: string; creditsRemaining: number }>();
    mocks.mutateAsync.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await act(async () => {
      request.resolve({ resultImageUrl: "https://storage.example.test/generated/result.png", shirtApplied: "Neon Pink", creditsRemaining: 4 });
      await Promise.resolve();
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(screen.getByText("TRY-ON RESULT")).toBeTruthy();
    const retryButton = screen.getByRole("button", { name: "Try on now" });
    expect(retryButton.textContent).toContain("TRY ON NOW");
    expect(retryButton.hasAttribute("disabled")).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Try-on completed!");
  });

  it("starts the fixed Qwen workflow when XXX is selected without calling the regular try-on mutation", async () => {
    const request = deferred<{ success: true; resultImageUrl: string; shirtApplied: string }>();
    mocks.processDashboardQwen.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();

    fireEvent.click(screen.getByText("XXX"));
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(mocks.processDashboardQwen).toHaveBeenCalledWith(expect.objectContaining({
      photoId: 7,
      positivePrompt: "Change the shirt to yellow.",
      taskId: expect.any(String),
    })));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Qwen ComfyUI is processing your image")).toBeTruthy();
    await act(async () => {
      request.resolve({ success: true, resultImageUrl: "https://storage.example.test/generated/result.png", shirtApplied: "XXX" });
      await Promise.resolve();
    });
  });

  it("shows the server safety message when an XXX prompt is rejected", async () => {
    mocks.processDashboardQwen.mockRejectedValue(new Error("Use a non-explicit apparel-editing prompt that keeps the person and background unchanged."));
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();
    fireEvent.change(screen.getByLabelText(/positive prompt/i), { target: { value: "Remove the subject's clothing." } });
    fireEvent.click(screen.getByText("XXX"));
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Use a non-explicit apparel-editing prompt that keeps the person and background unchanged."));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("shows the automatically saved XXX result and lets the user open the private gallery", async () => {
    mocks.processDashboardQwen.mockResolvedValue({
      success: true,
      resultImageUrl: "https://storage.example.test/generated/xxx-result.png",
      shirtApplied: "XXX",
    });
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt();
    fireEvent.click(screen.getByText("XXX"));
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(screen.getByText("TRY-ON RESULT")).toBeTruthy());
    expect(screen.getByText(/saved automatically to your private gallery/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "VIEW GALLERY" }));
    expect(mocks.setLocation).toHaveBeenCalledWith("/gallery");
  });
});
