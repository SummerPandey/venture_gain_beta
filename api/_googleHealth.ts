// Shared helpers for the /api/google-health-* proxies (the leading underscore keeps Vercel
// from exposing this file as a route).

import { fetchWithTimeout, readJson, UpstreamTimeoutError } from './_http.js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_TIMEOUT_MS = 8000

/** The refresh token is missing, expired (≈7 days in Testing mode) or revoked. Handlers map
 *  this to 428 so the client shows its Connect prompt instead of a generic error. */
export class GoogleHealthNotConnectedError extends Error {}

// Access tokens last about an hour. The client fires steps/calories/cardio/sleep together,
// so a warm instance reuses one token and concurrent refreshes share a single request.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()
const inFlight = new Map<string, Promise<string>>()

async function refreshAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  }, GOOGLE_TIMEOUT_MS)
  const { data } = await readJson(res)
  if (data?.error === 'invalid_grant') {
    throw new GoogleHealthNotConnectedError('Google Health not connected')
  }
  if (!res.ok || !data?.access_token) {
    throw new Error(data?.error_description ?? data?.error ?? `Google token refresh failed (${res.status})`)
  }
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 3600
  // Refresh a minute early so a token never expires mid-request.
  tokenCache.set(refreshToken, { token: data.access_token, expiresAt: Date.now() + (expiresIn - 60) * 1000 })
  return data.access_token as string
}

export async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const cached = tokenCache.get(refreshToken)
  if (cached && cached.expiresAt > Date.now()) return cached.token
  let pending = inFlight.get(refreshToken)
  if (!pending) {
    pending = refreshAccessToken(clientId, clientSecret, refreshToken)
      .finally(() => inFlight.delete(refreshToken))
    inFlight.set(refreshToken, pending)
  }
  return pending
}

export interface CivilDate { year: number; month: number; day: number }

/** Parses a real calendar YYYY-MM-DD (rejecting 2026-02-30, 2026-13-01, …) and returns it with
 *  the following day, since a CivilTimeInterval's `end` is exclusive. Null when invalid. */
export function parseDay(value: unknown): { date: CivilDate; next: CivilDate; iso: string; nextIso: string } | null {
  const match = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null
  if (!match) return null
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1970 || year > 9998) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) return null
  d.setUTCDate(d.getUTCDate() + 1)
  const next = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
  return { date: { year, month, day }, next, iso: value as string, nextIso: d.toISOString().slice(0, 10) }
}

/** Calls a Google Health endpoint with a timeout, without throwing on non-JSON error bodies. */
export async function googleFetch(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const upstream = await fetchWithTimeout(url, init, GOOGLE_TIMEOUT_MS)
  const { data } = await readJson(upstream)
  return { ok: upstream.ok, status: upstream.status, data }
}

interface ErrRes {
  status(code: number): ErrRes
  json(body: unknown): void
}

/** Maps a thrown error to the JSON response the client understands. */
export function sendGoogleError(res: ErrRes, e: unknown, label: string): void {
  if (e instanceof GoogleHealthNotConnectedError) {
    res.status(428).json({ error: 'Google Health not connected' })
    return
  }
  if (e instanceof UpstreamTimeoutError) {
    res.status(504).json({ error: 'Google Health took too long to respond' })
    return
  }
  console.error(`${label}:`, e)
  res.status(502).json({ error: 'Google Health request failed' })
}
