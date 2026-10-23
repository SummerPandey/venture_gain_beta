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

import { requireUser } from './_auth.js'
import { getAccessToken, googleFetch, parseDay, sendGoogleError } from './_googleHealth.js'

const SLEEP_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers?: Record<string, string | string[] | undefined>
}
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

/** Below this, an unflagged session is treated as a nap rather than the night's sleep. */
const MIN_FALLBACK_MINUTES = 180

/** Among sessions ending on the requested date, prefer Google's own `mainSleep` flag
 *  (the longest session with stages — at most one per day); otherwise take the longest
 *  session of at least MIN_FALLBACK_MINUTES, so an afternoon nap is never reported as the
 *  night's sleep. */
function pickMainSleep(points: SleepDataPoint[]): SleepDataPoint | undefined {
  const mainSleeps = points.filter(p => p.sleep?.metadata?.mainSleep)
  const candidates = mainSleeps.length > 0
    ? mainSleeps
    : points.filter(p => Number(p.sleep?.summary?.minutesAsleep ?? 0) >= MIN_FALLBACK_MINUTES)
  return candidates
    .slice()
    .sort((a, b) => Number(b.sleep?.summary?.minutesAsleep ?? 0) - Number(a.sleep?.summary?.minutesAsleep ?? 0))[0]
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!(await requireUser(req, res))) return

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_HEALTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    res.status(428).json({ error: 'Google Health not connected' })
    return
  }

  const day = parseDay(req.query?.date)
  if (!day) {
    res.status(400).json({ error: 'date query param must be a valid YYYY-MM-DD date' })
    return
  }

  const filter = `sleep.interval.civil_end_time >= "${day.iso}" AND sleep.interval.civil_end_time < "${day.nextIso}"`

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    const url = `${SLEEP_URL}?${new URLSearchParams({ filter, pageSize: '25' }).toString()}`
    const { ok, status, data } = await googleFetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!ok) {
      res.status(status).json({ error: data?.error?.message ?? 'Google Health request failed' })
      return
    }

    const points: SleepDataPoint[] = data?.dataPoints ?? []
    const best = pickMainSleep(points)
    const minutesAsleep = Number(best?.sleep?.summary?.minutesAsleep ?? 0)
    res.status(200).json({ hours: Math.round((minutesAsleep / 60) * 10) / 10 })
  } catch (e) {
    sendGoogleError(res, e, 'google-health-sleep')
  }
}
