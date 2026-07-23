// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Gallery from "./Gallery";

const mocks = vi.hoisted(() => ({
  invalidateGallery: vi.fn(),
  removeGalleryEntry: vi.fn(),
  setLocation: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, loading: false }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ gallery: { list: { invalidate: mocks.invalidateGallery } } }),
    gallery: {
      list: {
        useQuery: () => ({
          data: [{ id: 42, shirtStyle: "Classic White", status: "success", sourceImageUrl: "/source.jpg", resultImageUrl: "/result.jpg", createdAt: new Date(), completedAt: new Date(), creditsDeducted: 1 }],
          isLoading: false,
          isError: false,
          refetch: vi.fn(),
        }),
      },
      remove: {
        useMutation: ({ onSuccess }: { onSuccess?: () => Promise<void> | void }) => ({
          isPending: false,
          mutate: (input: { historyId: number }) => {
            mocks.removeGalleryEntry(input);
            void onSuccess?.();
          },
        }),
      },
    },
  },
}));

vi.mock("wouter", () => ({ useLocation: () => ["/gallery", mocks.setLocation] }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <div>{children}</div> : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
  AlertDialogCancel: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open?: boolean }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("lucide-react", () => ({ ArrowLeft: () => null, CircleAlert: () => null, Download: () => null, Images: () => null, LoaderCircle: () => null, Maximize2: () => null, Shirt: () => null, Trash2: () => null }));

describe("Gallery actions", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    cleanup();
    mocks.invalidateGallery.mockReset();
    mocks.removeGalleryEntry.mockReset();
    vi.unstubAllGlobals();
  });

  it("confirms and removes the selected Gallery history item, then refreshes the list", async () => {
    render(<Gallery />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Classic White generation" }));
    expect(screen.getByRole("heading", { name: "Delete this Gallery item?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "DELETE PERMANENTLY" }));

    await waitFor(() => expect(mocks.removeGalleryEntry).toHaveBeenCalledWith({ historyId: 42 }));
    await waitFor(() => expect(mocks.invalidateGallery).toHaveBeenCalledTimes(1));
  });

  it("opens an enlarged image preview and exposes stable download links", () => {
    render(<Gallery />);

    const inlineDownload = screen.getByRole("link", { name: "Download Generated image" });
    expect(inlineDownload.getAttribute("href")).toBe("/result.jpg");
    expect(inlineDownload.getAttribute("download")).toBe("shirt-changer-42-generated.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Preview Generated image" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Generated image preview" })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Your generated try-on result" }).at(-1)?.getAttribute("src")).toBe("/result.jpg");
    expect(screen.getAllByRole("link", { name: "Download Generated image" })).toHaveLength(2);
  });
});
