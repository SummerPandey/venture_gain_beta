// Vercel serverless function: server-side proxy to the Google Health API for Fitbit's
// heart-rate-verified cardio zone minutes — minutes spent today in the CARDIO heart-rate
// zone specifically (not the broader "active zone minutes" total, which also includes
// fat-burn and peak zones). Same dailyRollUp shape as steps; same scope
// (activity_and_fitness.readonly) already covers this data type.

import { requireUser } from './_auth.js'
import { getAccessToken, googleFetch, parseDay, sendGoogleError } from './_googleHealth.js'

const CARDIO_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/active-zone-minutes/dataPoints:dailyRollUp'

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
  // The `end` of a CivilTimeInterval is exclusive, so a single day is [date, date+1).
  const start = { date: day.date }
  const end = { date: day.next }

  try {
    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken)
    const { ok, status, data } = await googleFetch(CARDIO_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: { start, end }, windowSizeDays: 1 }),
    })
    if (!ok) {
      res.status(status).json({ error: data?.error?.message ?? 'Google Health request failed' })
      return
    }
    // sumInCardioHeartZone is an int64, serialized by Google as a JSON string.
    interface RollupPoint { activeZoneMinutes?: { sumInCardioHeartZone?: string } }
    const points: RollupPoint[] = data?.rollupDataPoints ?? []
    const minutes = points.reduce((sum, p) => sum + Number(p.activeZoneMinutes?.sumInCardioHeartZone ?? 0), 0)
    res.status(200).json({ minutes: Math.round(minutes) })
  } catch (e) {
    sendGoogleError(res, e, 'google-health-cardio')
  }
}
