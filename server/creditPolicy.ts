export const CREDITS_PER_PRICE_UNIT = 10;

export const INITIAL_CREDIT_POLICY = {
  standardTryOnCredits: 1,
  xxxTryOnCredits: 10,
  priceCentsPerTenCredits: 100,
} as const;

export type EditableCreditPolicy = {
  standardTryOnCredits: number;
  xxxTryOnCredits: number;
  priceCentsPerTenCredits: number;
};

function isPositiveSafeInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function assertValidCreditPolicy(policy: EditableCreditPolicy) {
  if (!isPositiveSafeInteger(policy.standardTryOnCredits)) {
    throw new Error("The standard try-on credit deduction must be a positive whole number.");
  }
  if (!isPositiveSafeInteger(policy.xxxTryOnCredits)) {
    throw new Error("The XXX try-on credit deduction must be a positive whole number.");
  }
  if (!isPositiveSafeInteger(policy.priceCentsPerTenCredits)) {
    throw new Error("The USD price per 10 credits must be a positive whole number of cents.");
  }
}

export function assertValidPackageCredits(credits: number) {
  if (!isPositiveSafeInteger(credits)) {
    throw new Error("A credit package must contain a positive whole number of credits.");
  }
  if (credits % CREDITS_PER_PRICE_UNIT !== 0) {
    throw new Error(`A credit package must be divisible by ${CREDITS_PER_PRICE_UNIT} so its USD price is exact.`);
  }
}

export function calculatePackagePriceCents(credits: number, priceCentsPerTenCredits: number) {
  assertValidPackageCredits(credits);
  if (!isPositiveSafeInteger(priceCentsPerTenCredits)) {
    throw new Error("The USD price per 10 credits must be a positive whole number of cents.");
  }
  const cents = (credits / CREDITS_PER_PRICE_UNIT) * priceCentsPerTenCredits;
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("The calculated package price is outside the supported range.");
  }
  return cents;
}

export function formatUsdFromCents(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("USD cents must be a non-negative whole number.");
  return (cents / 100).toFixed(2);
}
