/**
 * Network helpers. Every outbound `fetch` in this plugin goes through
 * `fetchWithTimeout` so a hung connection can't leave the UI stuck forever
 * (e.g. the search modal frozen on "Searching…"). A bare `fetch` has no
 * timeout — it waits on the OS socket indefinitely.
 */

/** Default request budget for the small JSON API calls (Open Library / Google Books). */
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000

/**
 * `fetch` with a wall-clock timeout. Aborts the request after `timeoutMs`
 * and rejects with an `AbortError` — callers already treat any thrown
 * fetch error as a failed-network outcome. The timer is always cleared
 * (success, HTTP error, or abort) so it can't fire against a settled request.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** True when an error is the `AbortError` a timed-out `fetchWithTimeout` throws. */
export function isAbortError(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError'
}
