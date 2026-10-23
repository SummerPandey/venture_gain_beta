// Vercel serverless function: server-side proxy to the Groq API.
// The Groq key lives only in the GROQ_API_KEY env var (server-side, NOT VITE_*),
// so it never ships to the browser. The client posts the same request body it
// used to send to Groq directly; we just attach the secret and forward it.

import { requireUser } from './_auth.js'
import { clampTemperature, fetchWithTimeout, readJson, UpstreamTimeoutError } from './_http.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Only the model the app uses, with a hard output cap, so a leaked session can't
// be used to burn quota on arbitrary models or huge completions.
const ALLOWED_MODELS = new Set(['openai/gpt-oss-120b'])
const MAX_TOKENS_CAP = 4096
// Generous for a chat history; anything bigger is a runaway client, not a real turn.
const MAX_BODY_CHARS = 200_000
// Below the client's 30s abort so it gets our JSON error rather than a bare abort.
const UPSTREAM_TIMEOUT_MS = 25_000

// Minimal request/response shapes — avoids a build-time @vercel/node dependency.
interface Req {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
  setHeader?(name: string, value: string): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!(await requireUser(req, res))) return

  const body = (req.body ?? {}) as { model?: string; messages?: unknown; temperature?: unknown; max_tokens?: unknown }
  const messagesValid = Array.isArray(body.messages) && body.messages.length > 0 && body.messages.every(m =>
    !!m && typeof m === 'object' && !Array.isArray(m) && typeof (m as { role?: unknown }).role === 'string')
  if (!body.model || !ALLOWED_MODELS.has(body.model) || !messagesValid) {
    res.status(400).json({ error: { message: 'Unsupported model or missing messages' } })
    return
  }
  if (JSON.stringify(body.messages).length > MAX_BODY_CHARS) {
    res.status(413).json({ error: { message: 'Message is too long' } })
    return
  }
  const maxTokens = typeof body.max_tokens === 'number' && Number.isFinite(body.max_tokens)
    ? Math.min(Math.max(1, Math.floor(body.max_tokens)), MAX_TOKENS_CAP)
    : MAX_TOKENS_CAP

  const key = process.env.GROQ_API_KEY
  if (!key) {
    console.error('groq: GROQ_API_KEY missing')
    res.status(500).json({ error: { message: 'Server misconfigured' } })
    return
  }

  try {
    const upstream = await fetchWithTimeout(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: clampTemperature(body.temperature),
        max_tokens: maxTokens,
      }),
    }, UPSTREAM_TIMEOUT_MS)
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) res.setHeader?.('Retry-After', retryAfter)
    const { data, isJson } = await readJson(upstream)
    // Keep the real status (429, 503, ...) even when the gateway sent an HTML page.
    res.status(upstream.status).json(isJson ? data : { error: { message: `Groq returned a non-JSON response (${upstream.status})` } })
  } catch (e) {
    if (e instanceof UpstreamTimeoutError) {
      res.status(504).json({ error: { message: 'Groq took too long to respond' } })
      return
    }
    res.status(502).json({ error: { message: 'Upstream request to Groq failed' } })
  }
}
