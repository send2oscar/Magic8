import { describe, expect, it } from "vitest";
import { describe, expect, it } from "vitest";
import {
  advanceTryOnProgress,
  getTryOnProgressLabel,
  MAX_IN_FLIGHT_TRY_ON_PROGRESS,
} from "./tryOnProgress";

describe("Try-on progress feedback", () => {
  it("advances through staged progress increments", () => {
    expect(advanceTryOnProgress(8)).toBe(16);
    expect(advanceTryOnProgress(40)).toBe(44);
    expect(advanceTryOnProgress(70)).toBe(72);
  });

  it("never reports completion before the server responds", () => {
    expect(advanceTryOnProgress(91)).toBe(MAX_IN_FLIGHT_TRY_ON_PROGRESS);
    expect(advanceTryOnProgress(MAX_IN_FLIGHT_TRY_ON_PROGRESS)).toBe(MAX_IN_FLIGHT_TRY_ON_PROGRESS);
  });

  it("uses helpful labels for each generation stage", () => {
    expect(getTryOnProgressLabel(8)).toBe("PREPARING IMAGE");
    expect(getTryOnProgressLabel(40)).toBe("APPLYING SHIRT");
    expect(getTryOnProgressLabel(70)).toBe("RENDERING");
    expect(getTryOnProgressLabel(92)).toBe("FINALIZING");
  });
});
