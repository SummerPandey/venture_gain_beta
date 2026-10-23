// Vercel serverless function: saves the signed-in user's Google Health refresh token.
//
// Called by the app right after the Connect flow (the callback page hands the token over
// via sessionStorage) and by the paste box in Settings → Connections. The token is checked
// against Google before it's stored, so a mangled paste fails here with a clear message
// instead of later as a silent "not connected".

import { authenticateUser } from './_auth.js'
import { getAccessToken, GoogleHealthNotConnectedError, saveRefreshToken } from './_googleHealth.js'
import { UpstreamTimeoutError } from './_http.js'

interface Req {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

// Google refresh tokens look like "1//0…": URL-safe base64 plus "/", no whitespace.
const TOKEN_SHAPE = /^1\/\/[A-Za-z0-9_\-/]{20,500}$/

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  const user = await authenticateUser(req, res)
  if (!user) return

  const raw = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken
  // Pasting from a wrapped <pre> can pick up line breaks or spaces mid-token.
  const refreshToken = typeof raw === 'string' ? raw.replace(/\s+/g, '') : ''
  if (!TOKEN_SHAPE.test(refreshToken)) {
    res.status(400).json({ error: "That doesn't look like a Google refresh token (it should start with 1//)" })
    return
  }

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: 'Google Health is not configured on the server' })
    return
  }

  try {
    await getAccessToken(clientId, clientSecret, refreshToken)
  } catch (e) {
    if (e instanceof GoogleHealthNotConnectedError) {
      res.status(400).json({ error: 'Google rejected this token — it may be mistyped, expired or already replaced. Run Connect again.' })
    } else if (e instanceof UpstreamTimeoutError) {
      res.status(504).json({ error: 'Google took too long to respond — try again' })
    } else {
      console.error('google-health-token verify:', e)
      res.status(502).json({ error: 'Could not check the token with Google — try again' })
    }
    return
  }

  try {
    await saveRefreshToken(user.id, user.token, refreshToken)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Could not save the token' })
    return
  }
  res.status(200).json({ ok: true })
}
