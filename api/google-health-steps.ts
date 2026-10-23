// Vercel serverless function: server-side proxy to the Google Health API for step data.
//
// Exchanges the long-lived GOOGLE_HEALTH_REFRESH_TOKEN (obtained once via
// /api/google-health-callback) for a short-lived access token, then reads one day's step
// total. Returns 428 when no refresh token is configured yet, so the client can show a
// "Connect" prompt instead of a generic error.

import { authenticateUser } from './_auth.js'
import { getAccessToken, googleFetch, parseDay, resolveRefreshToken, sendGoogleError } from './_googleHealth.js'

const STEPS_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = await authenticateUser(req, res)
  if (!user) return

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  const refreshToken = await resolveRefreshToken(user.token)
  if (!clientId || !clientSecret || !refreshToken) {
    res.status(428).json({ error: 'Google Health not connected' })
    return
  }

  const day = parseDay(req.query?.date)
  if (!day) {
    res.status(400).json({ error: 'date query param must be a valid YYYY-MM-DD date' })
    return
  }
  // The `end` of a CivilTimeInterval is exclusive, so a single day is [date, date+1).
  const start = { date: day.date }
  const end = { date: day.next }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    const { ok, status, data } = await googleFetch(STEPS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: { start, end }, windowSizeDays: 1 }),
    })
    if (!ok) {
      res.status(status).json({ error: data?.error?.message ?? 'Google Health request failed' })
      return
    }
    // countSum is an int64, serialized by Google as a JSON string.
    interface RollupPoint { steps?: { countSum?: string } }
    const points: RollupPoint[] = data?.rollupDataPoints ?? []
    const steps = points.reduce((sum, p) => sum + Number(p.steps?.countSum ?? 0), 0)
    res.status(200).json({ steps: Math.round(steps) })
  } catch (e) {
    sendGoogleError(res, e, 'google-health-steps')
  }
}
