export const MAX_IN_FLIGHT_TRY_ON_PROGRESS = 92;

/**
 * Advances a client-side progress estimate without presenting completion before
 * the image-generation request has actually returned.
 */
export function advanceTryOnProgress(currentProgress: number): number {
  if (currentProgress < 40) {
    return Math.min(40, currentProgress + 8);
  }

  if (currentProgress < 70) {
    return Math.min(70, currentProgress + 4);
  }

  return Math.min(MAX_IN_FLIGHT_TRY_ON_PROGRESS, currentProgress + 2);
}

export function getTryOnProgressLabel(progress: number): string {
  if (progress >= 92) return "FINALIZING";
  if (progress >= 70) return "RENDERING";
  if (progress >= 40) return "APPLYING SHIRT";
  return "PREPARING IMAGE";
}
