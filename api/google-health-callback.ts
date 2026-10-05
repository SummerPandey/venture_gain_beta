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

// Hosts allowed as the OAuth redirect target. Never trust the raw Host header:
// it must match one of these (and Google also only accepts registered URIs).
const ALLOWED_HOSTS = new Set(['venture-gain.vercel.app', 'localhost:5173', 'localhost:3000'])
const STATE_COOKIE = 'gh_oauth_state'

interface Req {
  method?: string
  query?: Record<string, string | string[] | undefined>
  headers: { host?: string; cookie?: string }
}
interface Res {
  status(code: number): Res
  setHeader(name: string, value: string): Res
  end(body?: string): void
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return undefined
}

function page(body: string): string {
  return `<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 16px; color: #333;">${body}</body>`
}

export default async function handler(req: Req, res: Res) {
  // The page may show a refresh token: never cache it or leak the URL via Referer.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  // One-shot state cookie: clear it whatever happens.
  res.setHeader('Set-Cookie', `${STATE_COOKIE}=; Path=/api/google-health-callback; Max-Age=0; Secure; SameSite=Lax`)

  const error = req.query?.error
  if (error) {
    res.status(400).setHeader('Content-Type', 'text/html').end(page(`<h2>Connection cancelled</h2><p>Google returned: ${escapeHtml(String(error))}</p>`))
    return
  }

  // CSRF protection: the state Google echoes back must match the cookie the app set
  // right before redirecting to the consent screen.
  const state = req.query?.state
  const expectedState = readCookie(req.headers.cookie, STATE_COOKIE)
  if (typeof state !== 'string' || !expectedState || state !== expectedState) {
    res.status(400).setHeader('Content-Type', 'text/html').end(page('<h2>Invalid or expired request</h2><p>Start the Connect flow again from the app.</p>'))
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

  const host = req.headers.host ?? ''
  if (!ALLOWED_HOSTS.has(host)) {
    res.status(400).setHeader('Content-Type', 'text/html').end(page('<h2>Unknown host</h2>'))
    return
  }
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const redirectUri = `${protocol}://${host}/api/google-health-callback`

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
      res.status(502).setHeader('Content-Type', 'text/html').end(page(`<h2>Token exchange failed</h2><pre style="white-space:pre-wrap;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>`))
      return
    }

    const expiresDays = data.refresh_token_expires_in ? Math.round(data.refresh_token_expires_in / 86400) : null

    res.status(200).setHeader('Content-Type', 'text/html').end(page(`
      <h2>Connected</h2>
      <p>Copy this into <code>GOOGLE_HEALTH_REFRESH_TOKEN</code> — in <code>.env.local</code> for local dev, and in Vercel's project env vars for production (then redeploy):</p>
      <pre style="background:#f4f4f4; padding:12px; border-radius:8px; word-break:break-all; white-space:pre-wrap;">${escapeHtml(String(data.refresh_token))}</pre>
      <p style="color:#888; font-size:13px;">This token is shown once and isn't stored anywhere by this app — copy it now.${expiresDays ? ` It expires in ~${expiresDays} day(s) while this Google Cloud OAuth app is in "Testing" mode — re-run the Connect flow when steps stop updating.` : ''}</p>
    `))
  } catch {
    res.status(502).setHeader('Content-Type', 'text/html').end(page('<h2>Request to Google failed</h2>'))
  }
}
