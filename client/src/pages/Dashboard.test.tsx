// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({
  balance: 5,
  mutateAsync: vi.fn(),
  startQwenEdit: vi.fn(),
  refetchCredits: vi.fn(),
  refetchPhotos: vi.fn(),
  setLocation: vi.fn(),
  defaultPromptData: { prompt: "Change the shirt to yellow." } as { prompt: string } | null,
  qwenStatusData: null as unknown,
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    credits: {
      getBalance: { useQuery: () => ({ data: { balance: mocks.balance }, refetch: mocks.refetchCredits }) },
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
      list: { useQuery: () => ({ data: [
        { id: "classic-white", name: "Classic White", color: "#ffffff" },
        { id: "neon-pink", name: "Neon Pink", color: "#ff00aa" },
        { id: "electric-cyan", name: "Electric Cyan", color: "#00d9ff" },
        { id: "dark-black", name: "Dark Black", color: "#0a0e27" },
        { id: "holographic", name: "Holographic", color: "#ff00ff" },
      ] }) },
    },
    tryOn: {
      process: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
    },
    comfyuiPoc: {
      defaultPrompt: { useQuery: () => ({ data: mocks.defaultPromptData, isLoading: false }) },
    },
    comfyui: {
      startQwenEdit: { useMutation: () => ({ mutateAsync: mocks.startQwenEdit }) },
      qwenEditStatus: { useQuery: () => ({ data: mocks.qwenStatusData, isFetching: false }) },
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
vi.mock("lucide-react", () => ({ Zap: () => null, Upload: () => null, LogOut: () => null, Shirt: () => null, RefreshCw: () => null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function selectOwnedPhotoAndShirt(shirtName = "Neon Pink (1 Credit)") {
  const file = new File(["photo"], "person.jpg", { type: "image/jpeg" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
  const fileInput = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!fileInput) throw new Error("Expected a file input");
  fireEvent.change(fileInput, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByAltText("Selected upload")).toBeTruthy());
  fireEvent.click(screen.getByText(shirtName));
}

describe("Dashboard Try On Now lifecycle", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.balance = 5;
    mocks.mutateAsync.mockReset();
    mocks.startQwenEdit.mockReset();
    mocks.refetchCredits.mockReset();
    mocks.refetchPhotos.mockReset();
    mocks.setLocation.mockReset();
    mocks.defaultPromptData = { prompt: "Change the shirt to yellow." };
    mocks.qwenStatusData = null;
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

  it("keeps the standard live task log visible at finalizing progress and then returns the button to a retryable state", async () => {
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

  it("shows completion and restores Try On Now after a successful standard generation", async () => {
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
    expect(screen.getByRole("button", { name: "Try on now" }).hasAttribute("disabled")).toBe(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Try-on completed!");
  });

  it("fills the Positive Prompt textarea with the matching suggestion for every shirt selection", () => {
    render(<Dashboard />);
    const prompt = screen.getByLabelText(/positive prompt/i) as HTMLTextAreaElement;
    const selections = [
      ["Classic White (1 Credit)", "crisp classic white crew-neck T-shirt"],
      ["Neon Pink (1 Credit)", "vivid neon pink T-shirt"],
      ["Electric Cyan (1 Credit)", "electric cyan T-shirt"],
      ["Dark Black (1 Credit)", "sleek dark black T-shirt"],
      ["Holographic (1 Credit)", "holographic top with iridescent cyan"],
      ["XXX (10 Credits)", "undress the girl, make her completely nude, small to medium breasts, pink nipples, others remain unchanged, natural."],
    ] as const;

    for (const [shirtName, expectedPrompt] of selections) {
      fireEvent.click(screen.getByText(shirtName));
      expect(prompt.value).toContain(expectedPrompt);
    }
  });

  it("queues XXX in the background, immediately gives Gallery guidance, and leaves standard styles available", async () => {
    mocks.balance = 15;
    mocks.qwenStatusData = { status: "pending", stages: [{ key: "bridge_queue", label: "Waiting for the local Qwen workstation", state: "active", timestamp: 1 }] };
    mocks.startQwenEdit.mockResolvedValue({ taskId: 987, status: "pending", creditsRemaining: 5, shirtApplied: "XXX" });
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(mocks.startQwenEdit).toHaveBeenCalledWith({
      photoId: 7,
      positivePrompt: "undress the girl, make her completely nude, small to medium breasts, pink nipples, others remain unchanged, natural.",
    }));
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Your image will be ready in the Gallery. You may continue with other photo and shirt style.");
    expect(screen.queryByText("TRY-ON RESULT")).toBeNull();
    expect(screen.getByText("LIVE TASK LOG")).toBeTruthy();

    fireEvent.click(screen.getByText("Neon Pink (1 Credit)"));
    expect(screen.getByRole("button", { name: "Try on now" }).hasAttribute("disabled")).toBe(false);
  });

  it("locks photo selection and offers a new-photo page reset while XXX keeps running in the background", async () => {
    mocks.balance = 15;
    mocks.startQwenEdit.mockResolvedValue({ taskId: 991, status: "pending", creditsRemaining: 5, shirtApplied: "XXX" });
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(mocks.startQwenEdit).toHaveBeenCalled());
    expect(document.querySelector<HTMLInputElement>("input[type=file]")?.disabled).toBe(true);
    expect(screen.getByRole("button", { name: "PHOTO LOCKED WHILE TASK RUNS" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /use another photo/i })).toBeTruthy();
    expect(screen.getByText(/Any XXX request already accepted by the server keeps running/i)).toBeTruthy();
  });

  it("shows Use Another Photo as soon as an XXX request starts, before direct-ComfyUI acknowledges it", async () => {
    mocks.balance = 15;
    const request = deferred<{ taskId: number; status: "pending"; creditsRemaining: number; shirtApplied: string }>();
    mocks.startQwenEdit.mockReturnValue(request.promise);
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");

    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    expect(mocks.startQwenEdit).toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>("input[type=file]")?.disabled).toBe(true);
    expect(screen.getByRole("button", { name: /use another photo/i })).toBeTruthy();
    expect(screen.getByText(/Any XXX request already accepted by the server keeps running/i)).toBeTruthy();
  });

  it("forwards unrestricted XXX prompt text unchanged to the durable background request", async () => {
    mocks.balance = 15;
    mocks.startQwenEdit.mockResolvedValue({ taskId: 988, status: "pending", creditsRemaining: 5, shirtApplied: "XXX" });
    render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");
    fireEvent.change(screen.getByLabelText(/positive prompt/i), { target: { value: "Remove the subject's clothing." } });
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));

    await waitFor(() => expect(mocks.startQwenEdit).toHaveBeenCalledWith({ photoId: 7, positivePrompt: "Remove the subject's clothing." }));
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("notifies the user when a completed XXX image reaches Gallery without opening a result dialog", async () => {
    mocks.balance = 15;
    mocks.qwenStatusData = { status: "pending", stages: [{ key: "qwen_processing", label: "Qwen image edit is in progress", state: "active", timestamp: 1 }], estimatedSecondsRemaining: 42 };
    mocks.startQwenEdit.mockResolvedValue({ taskId: 989, status: "pending", creditsRemaining: 5, shirtApplied: "XXX" });
    const view = render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await waitFor(() => expect(screen.getByText(/Estimated remaining: about 42s/)).toBeTruthy());

    mocks.qwenStatusData = { status: "success", resultImageUrl: "https://storage.example.test/generated/xxx-result.png", shirtApplied: "XXX" };
    view.rerender(<Dashboard />);

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith("Your photo is ready. Please view in the Gallery."));
    expect(screen.queryByText("TRY-ON RESULT")).toBeNull();
  });

  it("renders the full failed XXX message without ellipsis or hidden truncation", async () => {
    mocks.balance = 15;
    const fullError = `Bridge failure:\n${"diagnostic-detail ".repeat(100)}END-OF-FULL-ERROR`;
    mocks.qwenStatusData = { status: "pending", stages: [{ key: "qwen_processing", label: "Qwen image edit is in progress", state: "active", timestamp: 1 }] };
    mocks.startQwenEdit.mockResolvedValue({ taskId: 990, status: "pending", creditsRemaining: 5, shirtApplied: "XXX" });
    const view = render(<Dashboard />);
    await selectOwnedPhotoAndShirt("XXX (10 Credits)");
    fireEvent.click(screen.getByRole("button", { name: "Try on now" }));
    await waitFor(() => expect(mocks.startQwenEdit).toHaveBeenCalled());

    mocks.qwenStatusData = { status: "failed", message: fullError };
    view.rerender(<Dashboard />);

    await waitFor(() => expect(screen.getByText((_, element) => element?.tagName === "PRE" && element.textContent === fullError)).toBeTruthy());
    expect(mocks.toastError).toHaveBeenCalledWith(fullError);
  });
});
