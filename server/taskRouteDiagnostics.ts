export interface StoredTaskRouteDiagnostic {
  processingRoute: string;
  detail: string;
}

/** Extract the newest persisted route_selected stage without trusting unrelated metadata fields. */
export function getStoredTaskRouteDiagnostic(serialized: string | null): StoredTaskRouteDiagnostic | null {
  if (!serialized) return null;

  try {
    const parsed = JSON.parse(serialized) as { taskStages?: unknown };
    if (!Array.isArray(parsed.taskStages)) return null;

    for (const stage of [...parsed.taskStages].reverse()) {
      if (typeof stage !== "object" || stage === null) continue;
      const candidate = stage as { key?: unknown; detail?: unknown };
      if (candidate.key !== "route_selected" || typeof candidate.detail !== "string") continue;

      const routeMatch = candidate.detail.match(/(?:^|;\s*)route=([^;]+)/);
      const processingRoute = routeMatch?.[1]?.trim();
      if (!processingRoute) return null;

      return { processingRoute, detail: candidate.detail };
    }

    return null;
  } catch {
    return null;
  }
}
