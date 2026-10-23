// Vercel serverless function: server-side proxy to the Gemini API.
// The Gemini key lives only in the GEMINI_API_KEY env var (server-side, NOT
// VITE_*), so it never ships to the browser. Used for vision tasks (food/
// workout photo scanning) since Groq no longer hosts a vision model on the
// free/developer tier.

import { requireUser } from './_auth.js'
import { clampTemperature, fetchWithTimeout, readJson, UpstreamTimeoutError } from './_http.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
// Only the model the app uses — also stops `model` from being used to inject
// arbitrary paths into the upstream URL.
const ALLOWED_MODELS = new Set(['gemini-flash-lite-latest'])
// Hard output cap; also keeps callers from enabling tools, grounding, thinking
// budgets or safety overrides, since only contents + temperature are forwarded.
const MAX_OUTPUT_TOKENS = 8192
// Vercel caps request bodies at ~4.5MB anyway; a compressed scan photo is well under this.
const MAX_BODY_CHARS = 4_000_000
// Leaves room for the client's 503 retries and our JSON error before the platform limit.
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

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    console.error('gemini: GEMINI_API_KEY missing')
    res.status(500).json({ error: { message: 'Server misconfigured' } })
    return
  }

  const { model, contents, generationConfig } = (req.body ?? {}) as {
    model?: string
    contents?: unknown
    generationConfig?: { temperature?: unknown }
  }
  // Error bodies use Gemini's own { error: { message } } shape, which src/lib/gemini.ts reads.
  const contentsValid = Array.isArray(contents) && contents.length > 0 &&
    contents.every(c => !!c && typeof c === 'object' && !Array.isArray(c))
  if (!model || !ALLOWED_MODELS.has(model) || !contentsValid) {
    res.status(400).json({ error: { message: 'Unsupported model or missing contents' } })
    return
  }
  if (JSON.stringify(contents).length > MAX_BODY_CHARS) {
    res.status(413).json({ error: { message: 'Photo is too large to scan' } })
    return
  }
  const temperature = clampTemperature(generationConfig?.temperature)
  const body = {
    contents,
    generationConfig: {
      ...(temperature !== undefined ? { temperature } : {}),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  }

  try {
    const upstream = await fetchWithTimeout(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, UPSTREAM_TIMEOUT_MS)
    const retryAfter = upstream.headers.get('retry-after')
    if (retryAfter) res.setHeader?.('Retry-After', retryAfter)
    const { data, isJson } = await readJson(upstream)
    // Keep the real status even for an HTML/empty error page, so the client's 503 retry still fires.
    res.status(upstream.status).json(isJson ? data : { error: { message: `Gemini returned a non-JSON response (${upstream.status})` } })
  } catch (e) {
    if (e instanceof UpstreamTimeoutError) {
      res.status(504).json({ error: { message: 'Gemini took too long to respond' } })
      return
    }
    res.status(502).json({ error: { message: 'Upstream request to Gemini failed' } })
  }
}
