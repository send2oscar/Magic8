// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Register from "./Register";

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  startLogin: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("@/const", () => ({
  startLogin: mocks.startLogin,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/register", mocks.setLocation],
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <section {...props}>{children}</section>,
}));

describe("Register", () => {
  beforeEach(() => {
    mocks.setLocation.mockReset();
    mocks.startLogin.mockReset();
    mocks.useAuth.mockReset();
  });

  it("redirects authenticated users after render without a render-phase navigation warning", async () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(<Register />);

    await waitFor(() => expect(mocks.setLocation).toHaveBeenCalledWith("/dashboard"));
    expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("Cannot update a component");

    errorSpy.mockRestore();
  });

  it("keeps the Manus sign-up action available to unauthenticated users", () => {
    mocks.useAuth.mockReturnValue({ isAuthenticated: false });

    render(<Register />);
    fireEvent.click(screen.getByRole("button", { name: "SIGN UP WITH MANUS" }));

    expect(mocks.startLogin).toHaveBeenCalledOnce();
  });
});
