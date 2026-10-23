// Vercel serverless function: OAuth callback for the Google Health API.
//
// Exchanges the authorization code Google redirects back with for a refresh token, then
// hands it to the app: an inline script puts it in sessionStorage (same origin, same tab)
// and returns to "/", where the signed-in app saves it via /api/google-health-token. The
// token is also shown on the page as a fallback for pasting into Settings → Connections.
// Google expires refresh tokens after ~7 days for OAuth apps still in "Testing" mode, so
// reconnecting is still periodic — it just no longer needs a Vercel edit or redeploy.

import { randomBytes } from 'node:crypto'
import { fetchWithTimeout, readJson } from './_http.js'

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
    if (k !== name) continue
    // A hand-edited or tampered cookie must fall through to the normal "invalid request"
    // page, not throw a URIError and a bare 500.
    try { return decodeURIComponent(v.join('=')) } catch { return undefined }
  }
  return undefined
}

// A full document (charset + viewport) so phones lay it out at device width and the em
// dashes/apostrophes don't garble. Relative link back: works without trusting Host.
function page(body: string, head = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VentureGain: Google Health</title>${head}</head>` +
    `<body style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 48px auto; padding: 0 16px; color: #6B4423; background: #F5E6D3; line-height: 1.5;">${body}` +
    `<p style="margin-top: 32px;"><a href="/" style="color: #8B5A3E; font-weight: 600;">Back to VentureGain</a></p></body></html>`
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
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').end(page(`<h2>Connection cancelled</h2><p>Google returned: ${escapeHtml(String(error))}</p>`))
    return
  }

  // CSRF protection: the state Google echoes back must match the cookie the app set
  // right before redirecting to the consent screen.
  const state = req.query?.state
  const expectedState = readCookie(req.headers.cookie, STATE_COOKIE)
  if (typeof state !== 'string' || !expectedState || state !== expectedState) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').end(page('<h2>Invalid or expired request</h2><p>Start the Connect flow again from the app.</p>'))
    return
  }

  const code = req.query?.code
  if (typeof code !== 'string') {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').end(page('<h2>Missing authorization code</h2>'))
    return
  }

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8').end(page('<h2>Not configured</h2><p>GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET are missing on the server.</p>'))
    return
  }

  const host = req.headers.host ?? ''
  if (!ALLOWED_HOSTS.has(host)) {
    res.status(400).setHeader('Content-Type', 'text/html; charset=utf-8').end(page('<h2>Unknown host</h2>'))
    return
  }
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const redirectUri = `${protocol}://${host}/api/google-health-callback`

  try {
    const tokenRes = await fetchWithTimeout(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    }, 10_000)
    const { data } = await readJson(tokenRes)
    if (!tokenRes.ok || !data?.refresh_token) {
      // Never echo the whole response: a 200 without refresh_token still carries an access_token.
      const reason = data?.error === 'invalid_grant'
        ? '<p>This link was already used or has expired. If you just connected, you are done; otherwise start Connect again from the app.</p>'
        : data?.refresh_token === undefined && tokenRes.ok
          ? '<p>Google did not return a refresh token. Start Connect again from the app.</p>'
          : `<pre style="white-space:pre-wrap; word-break:break-all; overflow-wrap:anywhere; font-size:13px;">${escapeHtml(String(data?.error ?? `HTTP ${tokenRes.status}`))}${data?.error_description ? `: ${escapeHtml(String(data.error_description))}` : ''}</pre>`
      res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').end(page(`<h2>Token exchange failed</h2>${reason}`))
      return
    }

    const expiresDays = data.refresh_token_expires_in ? Math.round(data.refresh_token_expires_in / 86400) : null

    // Hand-off script: only this nonce may run (CSP below). JSON.stringify plus escaping
    // "<" keeps the token from closing the <script> tag, whatever Google sends.
    const nonce = randomBytes(16).toString('base64')
    const tokenJs = JSON.stringify(String(data.refresh_token)).replace(/</g, '\\u003c')
    res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`)
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').end(page(`
      <h2>Connected</h2>
      <p id="status">Saving to VentureGain and taking you back…</p>
      <details style="margin-top:20px;">
        <summary style="cursor:pointer; color:#8B5A3E;">Not redirected? Copy the token manually</summary>
        <p style="font-size:14px;">Paste it into <b>Settings → Connections → Paste a token</b> in the app:</p>
        <pre style="background:#fff; padding:12px; border-radius:8px; word-break:break-all; white-space:pre-wrap; user-select:all; -webkit-user-select:all;">${escapeHtml(String(data.refresh_token))}</pre>
      </details>
      <p style="color:#8B5A3E; font-size:14px;">While this Google Cloud OAuth app is in "Testing" mode the connection expires${expiresDays ? ` in ~${expiresDays} day(s)` : ' after about 7 days'} — reconnect from Settings when steps stop updating.</p>
    `, `<script nonce="${nonce}">
      try {
        sessionStorage.setItem('vg:pendingGoogleToken', ${tokenJs});
        location.replace('/');
      } catch (e) {
        document.addEventListener('DOMContentLoaded', function () {
          document.getElementById('status').textContent = 'Could not hand the token to the app automatically — copy it below.';
        });
      }
    </script>`))
  } catch {
    res.status(502).setHeader('Content-Type', 'text/html; charset=utf-8').end(page('<h2>Request to Google failed</h2>'))
  }
}
