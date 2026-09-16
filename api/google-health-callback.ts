// Vercel serverless function: OAuth callback for the Google Health API.
//
// Exchanges the authorization code Google redirects back with for a refresh token, then
// displays it once so it can be copied into GOOGLE_HEALTH_REFRESH_TOKEN. There's no
// per-user database table for this — it's a single-user app — so unlike GROQ_API_KEY /
// GEMINI_API_KEY (set once, forever), this one has to be re-copied in periodically:
// Google expires refresh tokens after ~7 days for OAuth apps still in "Testing" mode in
// Google Cloud Console, so re-running the "Connect" flow is a recurring maintenance step,
// not a one-time setup.

const TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers: { host?: string }
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): Res
  end(body?: string): void
}

function page(body: string): string {
  return `<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 16px; color: #333;">${body}</body>`
}

export default async function handler(req: Req, res: Res) {
  const error = req.query?.error
  if (error) {
    res.status(400).setHeader('Content-Type', 'text/html').end(page(`<h2>Connection cancelled</h2><p>Google returned: ${String(error)}</p>`))
    return
  }

  const code = req.query?.code
  if (typeof code !== 'string') {
    res.status(400).setHeader('Content-Type', 'text/html').end(page('<h2>Missing authorization code</h2>'))
    return
  }

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.status(500).setHeader('Content-Type', 'text/html').end(page('<h2>Not configured</h2><p>GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET are missing on the server.</p>'))
    return
  }

  const redirectUri = `https://${req.headers.host}/api/google-health-callback`

  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok || !data.refresh_token) {
      res.status(502).setHeader('Content-Type', 'text/html').end(page(`<h2>Token exchange failed</h2><pre style="white-space:pre-wrap;">${JSON.stringify(data, null, 2)}</pre>`))
      return
    }

    const expiresDays = data.refresh_token_expires_in ? Math.round(data.refresh_token_expires_in / 86400) : null

    res.status(200).setHeader('Content-Type', 'text/html').end(page(`
      <h2>Connected</h2>
      <p>Copy this into <code>GOOGLE_HEALTH_REFRESH_TOKEN</code> — in <code>.env.local</code> for local dev, and in Vercel's project env vars for production (then redeploy):</p>
      <pre style="background:#f4f4f4; padding:12px; border-radius:8px; word-break:break-all; white-space:pre-wrap;">${data.refresh_token}</pre>
      <p style="color:#888; font-size:13px;">This token is shown once and isn't stored anywhere by this app — copy it now.${expiresDays ? ` It expires in ~${expiresDays} day(s) while this Google Cloud OAuth app is in "Testing" mode — re-run the Connect flow when steps stop updating.` : ''}</p>
    `))
  } catch {
    res.status(502).setHeader('Content-Type', 'text/html').end(page('<h2>Request to Google failed</h2>'))
  }
}
