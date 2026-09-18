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
  const params = new URLSearchParams({
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

/** Fetches a day's step total via the server-side /api/google-health-steps proxy.
 *  `date` must be local YYYY-MM-DD (use getToday()) — the server has no notion of the
 *  caller's timezone. Throws GoogleHealthNotConnectedError when no refresh token is
 *  configured server-side yet, so callers can show a "Connect" prompt instead of a
 *  generic error. */
export async function fetchSteps(date: string): Promise<number> {
  const res = await fetch(`/api/google-health-steps?date=${date}`)
  if (res.status === 428) throw new GoogleHealthNotConnectedError('Google Health not connected')
  if (!res.ok) throw new Error(`Steps fetch failed (${res.status})`)
  const data = (await res.json()) as { steps: number }
  return data.steps
}

/** Fetches the main sleep session ending on `date` (local YYYY-MM-DD) via the
 *  server-side /api/google-health-sleep proxy, in hours. Same connection/error
 *  semantics as fetchSteps. */
export async function fetchSleepHours(date: string): Promise<number> {
  const res = await fetch(`/api/google-health-sleep?date=${date}`)
  if (res.status === 428) throw new GoogleHealthNotConnectedError('Google Health not connected')
  if (!res.ok) throw new Error(`Sleep fetch failed (${res.status})`)
  const data = (await res.json()) as { hours: number }
  return data.hours
}
