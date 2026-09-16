// Vercel serverless function: server-side proxy to the Google Health API for step data.
//
// Exchanges the long-lived GOOGLE_HEALTH_REFRESH_TOKEN (obtained once via
// /api/google-health-callback) for a short-lived access token, then reads one day's step
// total. Returns 428 when no refresh token is configured yet, so the client can show a
// "Connect" prompt instead of a generic error.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const STEPS_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp'

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Google token refresh failed')
  }
  return data.access_token as string
}

/** The `end` of a CivilTimeInterval is exclusive, so a single day is [date, date+1). */
function nextDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + 1)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_HEALTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    res.status(428).json({ error: 'Google Health not connected' })
    return
  }

  const dateParam = req.query?.date
  const date = typeof dateParam === 'string' ? dateParam : ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) {
    res.status(400).json({ error: 'date query param must be YYYY-MM-DD' })
    return
  }
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const start = { date: { year, month, day } }
  const end = { date: nextDay(year, month, day) }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    const upstream = await fetch(STEPS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: { start, end }, windowSizeDays: 1 }),
    })
    const data = await upstream.json()
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data.error?.message ?? 'Google Health request failed' })
      return
    }
    // countSum is an int64, serialized by Google as a JSON string.
    interface RollupPoint { steps?: { countSum?: string } }
    const points: RollupPoint[] = data.rollupDataPoints ?? []
    const steps = points.reduce((sum, p) => sum + Number(p.steps?.countSum ?? 0), 0)
    res.status(200).json({ steps: Math.round(steps) })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Google Health request failed' })
  }
}
