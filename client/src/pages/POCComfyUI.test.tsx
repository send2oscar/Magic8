// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POCComfyUI } from "./POCComfyUI";

type MutationOptions = {
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
};

const mocks = vi.hoisted(() => ({
  mutationOptions: null as MutationOptions | null,
  mutate: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    comfyuiPoc: {
      processImage: {
        useMutation: (options: MutationOptions) => {
          mocks.mutationOptions = options;
          return { mutate: mocks.mutate };
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/ui/input", () => ({
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => <input ref={ref} {...props} />),
}));
vi.mock("@/components/ui/label", () => ({ Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label> }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} /> }));
vi.mock("@/components/ui/spinner", () => ({ Spinner: () => <span>Loading</span> }));

describe("POCComfyUI diagnostics", () => {
  beforeEach(() => {
    mocks.mutationOptions = null;
    mocks.mutate.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders safe returned diagnostics and the correctly typed result image after a successful POC request", async () => {
    render(<POCComfyUI />);
    expect(mocks.mutationOptions?.onSuccess).toBeTypeOf("function");

    await act(async () => {
      mocks.mutationOptions?.onSuccess?.({
        success: true,
        promptId: "remote-prompt-123",
        outputBase64: "cG9jLWltYWdl",
        outputMimeType: "image/png",
        message: "ComfyUI completed the POC image edit.",
        diagnostics: [
          { key: "upload", label: "ComfyUI stored the source image and returned an input filename." },
          { key: "queued", label: "ComfyUI validated the workflow and queued the edit request." },
          { key: "polling", label: "Waiting for the remote ComfyUI worker to finish the Qwen edit." },
          { key: "output", label: "ComfyUI completed the workflow and reported its output nodes." },
          { key: "download", label: "Downloading the named result image from ComfyUI." },
        ],
      });
    });

    expect(screen.getByText(/ComfyUI stored the source image and returned an input filename\./)).toBeTruthy();
    expect(screen.getByText(/ComfyUI validated the workflow and queued the edit request\./)).toBeTruthy();
    expect(screen.getByText(/Waiting for the remote ComfyUI worker to finish the Qwen edit\./)).toBeTruthy();
    expect(screen.getByText(/ComfyUI completed the workflow and reported its output nodes\./)).toBeTruthy();
    expect(screen.getByText(/Downloading the named result image from ComfyUI\./)).toBeTruthy();
    expect(screen.getByText("remote-prompt-123")).toBeTruthy();
    expect(screen.getByAltText("Processed result").getAttribute("src")).toBe("data:image/png;base64,cG9jLWltYWdl");
    expect(mocks.toastSuccess).toHaveBeenCalledWith("ComfyUI POC completed successfully.");
  });
});
