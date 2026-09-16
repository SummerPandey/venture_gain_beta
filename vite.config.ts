import { defineConfig, loadEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Dev-only: mirror the production /api/groq serverless function so `npm run dev`
 * keeps working. The key is read from .env.local (server-side, NOT VITE_*) and
 * used here in the Node dev server — it is never sent to the browser.
 */
function devGroqProxy(key: string): Plugin {
  return {
    name: 'dev-groq-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/groq', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        if (!key) { res.statusCode = 500; res.end(JSON.stringify({ error: 'GROQ_API_KEY missing from .env.local' })); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const upstream = await fetch(GROQ_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
              body,
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'Upstream request to Groq failed' }))
          }
        })
      })
    },
  }
}

/**
 * Dev-only: mirror the production /api/gemini serverless function so `npm run
 * dev` keeps working. Used for vision tasks (photo scanning) since Groq no
 * longer hosts a vision model on the free/developer tier.
 */
function devGeminiProxy(key: string): Plugin {
  return {
    name: 'dev-gemini-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/gemini', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        if (!key) { res.statusCode = 500; res.end(JSON.stringify({ error: 'GEMINI_API_KEY missing from .env.local' })); return }
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          try {
            const { model, ...rest } = JSON.parse(body)
            const upstream = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
              method: 'POST',
              headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
              body: JSON.stringify(rest),
            })
            const text = await upstream.text()
            res.statusCode = upstream.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch {
            res.statusCode = 502
            res.end(JSON.stringify({ error: 'Upstream request to Gemini failed' }))
          }
        })
      })
    },
  }
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_STEPS_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp'

interface GoogleHealthEnv {
  clientId: string
  clientSecret: string
  refreshToken: string
}

/**
 * Dev-only: mirror the production /api/google-health-steps serverless function so
 * `npm run dev` keeps working. Refreshes an access token from GOOGLE_HEALTH_REFRESH_TOKEN,
 * then reads one day's step total from the Google Health API.
 */
/** The `end` of a CivilTimeInterval is exclusive, so a single day is [date, date+1). */
function nextDay(year: number, month: number, day: number): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + 1)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

function devGoogleHealthStepsProxy({ clientId, clientSecret, refreshToken }: GoogleHealthEnv): Plugin {
  return {
    name: 'dev-google-health-steps-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/google-health-steps', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return }
        res.setHeader('Content-Type', 'application/json')
        if (!clientId || !clientSecret || !refreshToken) { res.statusCode = 428; res.end(JSON.stringify({ error: 'Google Health not connected' })); return }

        const params = new URLSearchParams(req.url?.split('?')[1] ?? '')
        const date = params.get('date') ?? ''
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
        if (!match) { res.statusCode = 400; res.end(JSON.stringify({ error: 'date query param must be YYYY-MM-DD' })); return }
        const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
        const start = { date: { year, month, day } }
        const end = { date: nextDay(year, month, day) }
        ;(async () => {
          try {
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
            })
            const tokenData = await tokenRes.json()
            if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error_description ?? tokenData.error ?? 'Google token refresh failed')

            const upstream = await fetch(GOOGLE_STEPS_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokenData.access_token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ range: { start, end }, windowSizeDays: 1 }),
            })
            const data = await upstream.json()
            if (!upstream.ok) { res.statusCode = upstream.status; res.end(JSON.stringify({ error: data.error?.message ?? 'Google Health request failed' })); return }

            // countSum is an int64, serialized by Google as a JSON string.
            const points: { steps?: { countSum?: string } }[] = data.rollupDataPoints ?? []
            const steps = points.reduce((sum, p) => sum + Number(p.steps?.countSum ?? 0), 0)
            res.statusCode = 200
            res.end(JSON.stringify({ steps: Math.round(steps) }))
          } catch (e) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Google Health request failed' }))
          }
        })()
      })
    },
  }
}

const GOOGLE_SLEEP_URL = 'https://health.googleapis.com/v4/users/me/dataTypes/sleep/dataPoints'

interface DevSleepDataPoint {
  sleep?: {
    metadata?: { mainSleep?: boolean }
    summary?: { minutesAsleep?: string }
  }
}

function pickMainSleep(points: DevSleepDataPoint[]): DevSleepDataPoint | undefined {
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

/**
 * Dev-only: mirror the production /api/google-health-sleep serverless function so
 * `npm run dev` keeps working. Sleep is a session type, not a daily rollup — queries
 * dataPoints.list over a window around the date and picks the main sleep session.
 */
function devGoogleHealthSleepProxy({ clientId, clientSecret, refreshToken }: GoogleHealthEnv): Plugin {
  return {
    name: 'dev-google-health-sleep-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/google-health-sleep', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' })); return }
        res.setHeader('Content-Type', 'application/json')
        if (!clientId || !clientSecret || !refreshToken) { res.statusCode = 428; res.end(JSON.stringify({ error: 'Google Health not connected' })); return }

        const params = new URLSearchParams(req.url?.split('?')[1] ?? '')
        const date = params.get('date') ?? ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'date query param must be YYYY-MM-DD' })); return }

        const filter = `sleep.interval.civil_end_time >= "${date}" AND sleep.interval.civil_end_time < "${nextDateStr(date)}"`
        ;(async () => {
          try {
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
            })
            const tokenData = await tokenRes.json()
            if (!tokenRes.ok || !tokenData.access_token) throw new Error(tokenData.error_description ?? tokenData.error ?? 'Google token refresh failed')

            const url = `${GOOGLE_SLEEP_URL}?${new URLSearchParams({ filter, pageSize: '25' }).toString()}`
            const upstream = await fetch(url, { headers: { Authorization: `Bearer ${tokenData.access_token}` } })
            const data = await upstream.json()
            if (!upstream.ok) { res.statusCode = upstream.status; res.end(JSON.stringify({ error: data.error?.message ?? 'Google Health request failed' })); return }

            const points: DevSleepDataPoint[] = data.dataPoints ?? []
            const best = pickMainSleep(points)
            const minutesAsleep = Number(best?.sleep?.summary?.minutesAsleep ?? 0)
            res.statusCode = 200
            res.end(JSON.stringify({ hours: Math.round((minutesAsleep / 60) * 10) / 10 }))
          } catch (e) {
            res.statusCode = 502
            res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Google Health request failed' }))
          }
        })()
      })
    },
  }
}

/**
 * Dev-only: mirror the production /api/google-health-callback serverless function so the
 * "Connect Fitbit" OAuth flow can be completed against `npm run dev` too.
 */
function devGoogleHealthCallbackProxy({ clientId, clientSecret }: Pick<GoogleHealthEnv, 'clientId' | 'clientSecret'>): Plugin {
  return {
    name: 'dev-google-health-callback-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/google-health-callback', (req, res) => {
        res.setHeader('Content-Type', 'text/html')
        const params = new URLSearchParams(req.url?.split('?')[1] ?? '')
        const error = params.get('error')
        if (error) { res.statusCode = 400; res.end(`<p>Google denied the request: ${error}</p>`); return }
        const code = params.get('code')
        if (!code) { res.statusCode = 400; res.end('<p>Missing authorization code</p>'); return }
        if (!clientId || !clientSecret) { res.statusCode = 500; res.end('<p>GOOGLE_HEALTH_CLIENT_ID / GOOGLE_HEALTH_CLIENT_SECRET missing from .env.local</p>'); return }

        const redirectUri = `http://${req.headers.host}/api/google-health-callback`
        ;(async () => {
          try {
            const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
            })
            const data = await tokenRes.json()
            if (!tokenRes.ok || !data.refresh_token) { res.statusCode = 502; res.end(`<pre>${JSON.stringify(data, null, 2)}</pre>`); return }
            res.statusCode = 200
            res.end(`<pre style="white-space:pre-wrap;word-break:break-all;">${data.refresh_token}</pre><p>Copy into GOOGLE_HEALTH_REFRESH_TOKEN in .env.local, then restart npm run dev.</p>`)
          } catch {
            res.statusCode = 502
            res.end('<p>Token exchange with Google failed.</p>')
          }
        })()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // empty prefix → load ALL vars (incl. non-VITE server-side secrets) for the
  // dev proxy; only VITE_* are ever exposed to client code by Vite.
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      react(),
      tailwindcss(),
      devGroqProxy(env.GROQ_API_KEY),
      devGeminiProxy(env.GEMINI_API_KEY),
      devGoogleHealthStepsProxy({
        clientId: env.GOOGLE_HEALTH_CLIENT_ID,
        clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
        refreshToken: env.GOOGLE_HEALTH_REFRESH_TOKEN,
      }),
      devGoogleHealthSleepProxy({
        clientId: env.GOOGLE_HEALTH_CLIENT_ID,
        clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
        refreshToken: env.GOOGLE_HEALTH_REFRESH_TOKEN,
      }),
      devGoogleHealthCallbackProxy({
        clientId: env.GOOGLE_HEALTH_CLIENT_ID,
        clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
