// Vercel serverless function: server-side proxy to the Gemini API.
// The Gemini key lives only in the GEMINI_API_KEY env var (server-side, NOT
// VITE_*), so it never ships to the browser. Used for vision tasks (food/
// workout photo scanning) since Groq no longer hosts a vision model on the
// free/developer tier.

import { requireUser } from './_auth.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
// Only the model the app uses — also stops `model` from being used to inject
// arbitrary paths into the upstream URL.
const ALLOWED_MODELS = new Set(['gemini-flash-lite-latest'])
// Hard output cap; also keeps callers from enabling tools, grounding, thinking
// budgets or safety overrides, since only contents + temperature are forwarded.
const MAX_OUTPUT_TOKENS = 8192

// Minimal request/response shapes — avoids a build-time @vercel/node dependency.
interface Req {
  method?: string
  body?: unknown
  headers?: Record<string, string | string[] | undefined>
}
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  if (!(await requireUser(req, res))) return

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' })
    return
  }

  const { model, contents, generationConfig } = (req.body ?? {}) as {
    model?: string
    contents?: unknown
    generationConfig?: { temperature?: unknown }
  }
  if (!model || !ALLOWED_MODELS.has(model) || !Array.isArray(contents)) {
    res.status(400).json({ error: 'Unsupported model or missing contents' })
    return
  }
  const temperature = generationConfig?.temperature
  const body = {
    contents,
    generationConfig: {
      ...(typeof temperature === 'number' ? { temperature } : {}),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
  }

  try {
    const upstream = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'Upstream request to Gemini failed' })
  }
}
