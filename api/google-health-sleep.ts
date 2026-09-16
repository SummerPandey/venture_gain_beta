// Vercel serverless function: server-side proxy to the Google Health API for sleep data.
//
// Sleep is a "session" data type (variable start/end, can span midnight), unlike steps
// which rolls up cleanly by calendar day via dailyRollUp. Google's filter docs explicitly
// exclude sleep from the generic `interval.civil_start_time` filter — it requires the
// sleep-specific `sleep.interval.civil_end_time` instead (a plain civil date, so no
// timezone math needed: it's already "the session that ended on this calendar date").
// Requires the googlehealth.sleep.readonly scope in addition to
// activity_and_fitness.readonly — reconnect via /api/google-health-callback if the
// existing GOOGLE_HEALTH_REFRESH_TOKEN predates adding that scope.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SLEEP_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints'

interface Req { method?: string; query?: Record<string, string | string[] | undefined> }
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

interface SleepDataPoint {
  sleep?: {
    interval?: { endTime?: string }
    metadata?: { mainSleep?: boolean }
    summary?: { minutesAsleep?: string }
  }
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

/** Among sessions ending on the requested date, prefer Google's own `mainSleep` flag
 *  (the longest session with stages — at most one per day); otherwise take the longest
 *  by minutesAsleep. Naps that aren't the main sleep are ignored either way. */
function pickMainSleep(points: SleepDataPoint[]): SleepDataPoint | undefined {
  const mainSleeps = points.filter(p => p.sleep?.metadata?.mainSleep)
  const candidates = mainSleeps.length > 0 ? mainSleeps : points
  return candidates
    .slice()
    .sort((a, b) => Number(b.sleep?.summary?.minutesAsleep ?? 0) - Number(a.sleep?.summary?.minutesAsleep ?? 0))[0]
}

function nextDateStr(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: 'date query param must be YYYY-MM-DD' })
    return
  }

  const filter = `sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDateStr(date)}"`

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    const url = `${SLEEP_URL}?${new URLSearchParams({ filter, pageSize: '25' }).toString()}`
    const upstream = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    const data = await upstream.json()
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: data.error?.message ?? 'Google Health request failed' })
      return
    }

    const points: SleepDataPoint[] = data.dataPoints ?? []
    const best = pickMainSleep(points)
    const minutesAsleep = Number(best?.sleep?.summary?.minutesAsleep ?? 0)
    res.status(200).json({ hours: Math.round((minutesAsleep / 60) * 10) / 10 })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Google Health request failed' })
  }
}
