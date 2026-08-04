// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImagePreviewMagnifier } from "./ImagePreviewMagnifier";

const imageRect = {
  bottom: 300,
  height: 300,
  left: 0,
  right: 200,
  top: 0,
  width: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

afterEach(() => cleanup());

describe("ImagePreviewMagnifier", () => {
  it("shows a lens only while inspecting the preview image and supports keyboard toggling", () => {
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue(imageRect);
    render(<ImagePreviewMagnifier src="/photo.jpg" alt="Preview result" />);

    const image = screen.getByRole("img", { name: "Preview result" });
    expect(screen.queryByTestId("image-preview-magnifier-lens")).toBeNull();

    fireEvent.pointerMove(image, { clientX: 100, clientY: 150, pointerType: "mouse" });
    expect(screen.getByTestId("image-preview-magnifier-lens")).toBeTruthy();

    fireEvent.pointerLeave(image, { pointerType: "mouse" });
    expect(screen.queryByTestId("image-preview-magnifier-lens")).toBeNull();

    fireEvent.keyDown(image, { key: "Enter" });
    expect(screen.getByTestId("image-preview-magnifier-lens")).toBeTruthy();
  });

  it("toggles the lens for touch users", () => {
    vi.spyOn(HTMLImageElement.prototype, "getBoundingClientRect").mockReturnValue(imageRect);
    render(<ImagePreviewMagnifier src="/photo.jpg" alt="Touch preview" />);

    const image = screen.getByRole("img", { name: "Touch preview" });
    fireEvent.pointerDown(image, { clientX: 70, clientY: 95, pointerType: "touch" });
    expect(screen.getByTestId("image-preview-magnifier-lens")).toBeTruthy();

    fireEvent.pointerDown(image, { clientX: 70, clientY: 95, pointerType: "touch" });
    expect(screen.queryByTestId("image-preview-magnifier-lens")).toBeNull();
  });
});
