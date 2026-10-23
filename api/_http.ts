// Shared fetch/validation helpers for the serverless proxies (the leading underscore keeps
// Vercel from exposing this file as a route).

/** Thrown by fetchWithTimeout when the upstream doesn't answer in time. */
export class UpstreamTimeoutError extends Error {}

/** fetch with a hard deadline, so a stalled upstream returns our own JSON error instead of
 *  pinning the function until the platform kills it with a non-JSON gateway page. */
export async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  } catch (e) {
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
      throw new UpstreamTimeoutError(`Upstream did not respond within ${Math.round(ms / 1000)}s`)
    }
    throw e
  }
}

/** Reads an upstream body as JSON without throwing on HTML/empty error pages, so the real
 *  status code (429, 503, …) can still be forwarded and retried on by the client. */
export async function readJson(upstream: Response): Promise<{ data: any; isJson: boolean }> {
  const text = await upstream.text()
  try {
    return { data: JSON.parse(text), isJson: true }
  } catch {
    return { data: null, isJson: false }
  }
}

/** Groq and Gemini both accept temperatures in [0, 2]; anything else is dropped or clamped
 *  rather than forwarded for an upstream 400. */
export function clampTemperature(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(2, Math.max(0, value))
}
