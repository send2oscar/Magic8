import { describe, expect, it } from "vitest";
import {
  assertValidCreditPolicy,
  assertValidPackageCredits,
  calculatePackagePriceCents,
  formatUsdFromCents,
} from "./creditPolicy";

describe("credit policy calculations", () => {
  it("calculates the approved package prices from an administrator policy", () => {
    expect(calculatePackagePriceCents(1, 100)).toBe(10);
    expect(calculatePackagePriceCents(100, 100)).toBe(1000);
    expect(calculatePackagePriceCents(500, 100)).toBe(5000);
    expect(calculatePackagePriceCents(1000, 100)).toBe(10000);
    expect(formatUsdFromCents(10)).toBe("0.10");
    expect(formatUsdFromCents(1000)).toBe("10.00");
  });

  it("keeps the 1-credit package fixed at USD 0.10", () => {
    expect(calculatePackagePriceCents(1, 250)).toBe(10);
    expect(() => assertValidPackageCredits(2)).toThrow(/either 1 credit or divisible by 10/);
  });

  it("rejects package sizes that would require fractional-cent checkout amounts", () => {
    expect(() => assertValidPackageCredits(101)).toThrow(/either 1 credit or divisible by 10/);
  });

  it("requires positive integer administrator settings", () => {
    expect(() => assertValidCreditPolicy({
      standardTryOnCredits: 0,
      xxxTryOnCredits: 10,
      priceCentsPerTenCredits: 100,
    })).toThrow(/standard try-on/);
  });
});
