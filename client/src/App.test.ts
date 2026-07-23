import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");

describe("application routes", () => {
  it("does not expose the retired standalone ComfyUI POC route", () => {
    expect(appSource).not.toContain('path={"/poc/comfyui"}');
    expect(appSource).not.toContain("POCComfyUI");
  });

  it("keeps the Dashboard route available", () => {
    expect(appSource).toContain('path={"/dashboard"} component={Dashboard}');
  });
});
