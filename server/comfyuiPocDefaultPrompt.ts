const REMOTE_DEFAULT_PROMPT_URL = "http://www.oscarngan.com/defaultPrompt.txt";
const MAX_REMOTE_PROMPT_BYTES = 4_096;
const MAX_REMOTE_PROMPT_CHARS = 2_000;
// The owner-controlled HTTP source can take several seconds to establish its
// first connection from a fresh application instance. Keep the UI responsive
// because this query is asynchronous, while allowing one realistic visit-time
// fetch to finish rather than returning an avoidable empty fallback.
const REMOTE_PROMPT_TIMEOUT_MS = 12_000;

export type ComfyUiPocDefaultPrompt =
  | { available: true; prompt: string }
  | { available: false; prompt: "" };

type FetchLike = typeof fetch;

function unavailable(): ComfyUiPocDefaultPrompt {
  return { available: false, prompt: "" };
}

export function isSafeRemotePrompt(prompt: string): boolean {
  // Prompt content is intentionally unrestricted at the owner's request.
  // Operational safeguards such as length limits remain in the caller.
  void prompt;
  return true;
}

async function readTextWithinLimit(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REMOTE_PROMPT_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_REMOTE_PROMPT_BYTES) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

/**
 * Fetches the owner-controlled text file for each POC page visit. The URL is
 * fixed server-side and redirects are refused so the owner can change the POC
 * field's default without deployment. Prompt wording is not keyword-filtered.
 */
export async function getComfyUiPocDefaultPrompt(fetchImpl: FetchLike = fetch): Promise<ComfyUiPocDefaultPrompt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_PROMPT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(REMOTE_DEFAULT_PROMPT_URL, {
      method: "GET",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { accept: "text/plain" },
    });
    if (!response.ok) return unavailable();

    const rawText = await readTextWithinLimit(response);
    const prompt = rawText?.replace(/\s+/g, " ").trim() ?? "";
    if (!prompt || prompt.length > MAX_REMOTE_PROMPT_CHARS) {
      return unavailable();
    }
    return { available: true, prompt };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timeout);
  }
}
