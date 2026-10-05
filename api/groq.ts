// Vercel serverless function: server-side proxy to the Groq API.
// The Groq key lives only in the GROQ_API_KEY env var (server-side, NOT VITE_*),
// so it never ships to the browser. The client posts the same request body it
// used to send to Groq directly; we just attach the secret and forward it.

import { requireUser } from './_auth.js'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Only the model the app uses, with a hard output cap, so a leaked session can't
// be used to burn quota on arbitrary models or huge completions.
const ALLOWED_MODELS = new Set(['openai/gpt-oss-120b'])
const MAX_TOKENS_CAP = 4096

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

  const body = (req.body ?? {}) as { model?: string; messages?: unknown; temperature?: unknown; max_tokens?: unknown }
  if (!body.model || !ALLOWED_MODELS.has(body.model) || !Array.isArray(body.messages)) {
    res.status(400).json({ error: 'Unsupported model or missing messages' })
    return
  }
  const maxTokens = typeof body.max_tokens === 'number' ? Math.min(body.max_tokens, MAX_TOKENS_CAP) : MAX_TOKENS_CAP

  const key = process.env.GROQ_API_KEY
  if (!key) {
    res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' })
    return
  }

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
        max_tokens: maxTokens,
      }),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'Upstream request to Groq failed' })
  }
}
