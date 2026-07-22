import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("./Dashboard.tsx", import.meta.url), "utf8");

describe("Dashboard upload preview layout", () => {
  it("uses the same bounded, contained frame for selected and demo photos", () => {
    expect(dashboardSource.match(/aspect-square/g)).toHaveLength(2);
    expect(dashboardSource.match(/max-w-\[500px\]/g)).toHaveLength(2);
    expect(dashboardSource.match(/object-contain/g)).toHaveLength(2);
    expect(dashboardSource).not.toContain("object-cover");
  });

  it("does not depend on dynamic aspect-ratio state for a fixed preview viewport", () => {
    expect(dashboardSource).not.toContain("aspectRatio");
  });
});
