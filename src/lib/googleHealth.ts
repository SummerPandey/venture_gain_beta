import { apiHeaders } from './apiAuth'

const CALLBACK_PATH = '/api/google-health-callback'
// Every readonly scope this app might reasonably want from a Fitbit/Google Health
// account, requested together so a single reconnect covers steps, sleep, AND
// whatever gets built next (heart rate, resting HR, weight, body fat, HRV all live
// under health_metrics_and_measurements) — no separate reconnect-for-a-new-scope later.
const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
].join(' ')

/** Google's consent screen for connecting a Fitbit/Google Health account. Redirects back
 *  to /api/google-health-callback, which exchanges the code for a refresh token and shows
 *  it once for manual setup — see the setup checklist. `prompt=consent` forces Google to
 *  reissue a refresh token every time (needed since re-connecting is a recurring step while
 *  the OAuth app stays in "Testing" mode, where refresh tokens expire after ~7 days — and
 *  also needed once now, to upgrade an existing token to cover all three scopes). */
export function getGoogleHealthAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_HEALTH_CLIENT_ID ?? ''
  const redirectUri = `${window.location.origin}${CALLBACK_PATH}`
  // CSRF protection: the callback only accepts a `state` matching this one-shot cookie.
  // getRandomValues (unlike randomUUID) also works on plain-http LAN dev origins.
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('')
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `gh_oauth_state=${state}; Path=${CALLBACK_PATH}; Max-Age=600; SameSite=Lax${secure}`
  const params = new URLSearchParams({
    state,
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: HEALTH_SCOPES,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export class GoogleHealthNotConnectedError extends Error {}
/** The caller's Supabase session is missing/expired, so the proxy rejected it. */
export class SessionExpiredError extends Error {}

// A stalled mobile connection would otherwise leave sync status on 'loading'
// until remount; on timeout the caller's catch moves it to 'error'.
const HEALTH_TIMEOUT_MS = 20000

/** GET one of the /api/google-health-* proxies and return `data[field]` as a
 *  number. 428 → not connected, 401 → session expired, timeout/non-2xx/bad
 *  shape → Error, so callers never see undefined/NaN. */
async function fetchHealthNumber(path: string, date: string, field: string, label: string): Promise<number> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)
  try {
    let res: Response
    try {
      res = await fetch(`${path}?date=${encodeURIComponent(date)}`, { headers: await apiHeaders(), signal: controller.signal })
    } catch {
      throw new Error(controller.signal.aborted ? `${label} fetch timed out` : `${label} fetch failed (network)`)
    }
    if (res.status === 428) throw new GoogleHealthNotConnectedError('Google Health not connected')
    if (res.status === 401) throw new SessionExpiredError('Session expired — please sign in again')
    if (!res.ok) throw new Error(`${label} fetch failed (${res.status})`)
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null
    const value = data?.[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} fetch returned an unexpected response`)
    return value
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches a day's step total via the server-side /api/google-health-steps proxy.
 *  `date` must be local YYYY-MM-DD (use getToday()) — the server has no notion of the
 *  caller's timezone. Throws GoogleHealthNotConnectedError when no refresh token is
 *  configured server-side yet, so callers can show a "Connect" prompt instead of a
 *  generic error. */
export function fetchSteps(date: string): Promise<number> {
  return fetchHealthNumber('/api/google-health-steps', date, 'steps', 'Steps')
}

/** Fetches the main sleep session ending on `date` (local YYYY-MM-DD) via the
 *  server-side /api/google-health-sleep proxy, in hours. Same connection/error
 *  semantics as fetchSteps. */
export function fetchSleepHours(date: string): Promise<number> {
  return fetchHealthNumber('/api/google-health-sleep', date, 'hours', 'Sleep')
}

/** Fetches minutes spent today in Fitbit's cardio heart-rate zone via the server-side
 *  /api/google-health-cardio proxy. Same connection/error semantics as fetchSteps. */
export function fetchCardioMinutes(date: string): Promise<number> {
  return fetchHealthNumber('/api/google-health-cardio', date, 'minutes', 'Cardio')
}

/** Fetches total calories burned today (BMR + activity) via the server-side
 *  /api/google-health-calories proxy. Same connection/error semantics as fetchSteps. */
export function fetchCaloriesBurned(date: string): Promise<number> {
  return fetchHealthNumber('/api/google-health-calories', date, 'kcal', 'Calories')
}

/** Where /api/google-health-callback leaves a fresh token for the app to pick up. */
const PENDING_TOKEN_KEY = 'vg:pendingGoogleToken'

export function readPendingGoogleToken(): string | null {
  try { return sessionStorage.getItem(PENDING_TOKEN_KEY) } catch { return null }
}

export function clearPendingGoogleToken(): void {
  try { sessionStorage.removeItem(PENDING_TOKEN_KEY) } catch { /* storage blocked — nothing to clear */ }
}

/** Saves a refresh token for the signed-in account via /api/google-health-token, which
 *  checks it with Google first. Throws an Error whose message is safe to show. */
export async function saveGoogleHealthToken(refreshToken: string): Promise<void> {
  let res: Response
  try {
    res = await fetch('/api/google-health-token', {
      method: 'POST',
      headers: await apiHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ refreshToken }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
  } catch {
    throw new Error("Couldn't reach the server — check your connection and try again.")
  }
  if (res.status === 401) throw new SessionExpiredError('Session expired — please sign in again')
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(typeof data?.error === 'string' ? data.error : `Couldn't save the token (${res.status})`)
  }
}
