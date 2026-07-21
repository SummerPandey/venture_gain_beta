// Vercel serverless function: server-side proxy to the Gemini API.
// The Gemini key lives only in the GEMINI_API_KEY env var (server-side, NOT
// VITE_*), so it never ships to the browser. Used for vision tasks (food/
// workout photo scanning) since Groq no longer hosts a vision model on the
// free/developer tier.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// Minimal request/response shapes — avoids a build-time @vercel/node dependency.
interface Req { method?: string; body?: unknown }
interface Res {
  status(code: number): Res
  json(body: unknown): void
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const key = process.env.GEMINI_API_KEY
  if (!key) {
    res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server' })
    return
  }

  const { model, ...body } = (req.body ?? {}) as { model?: string }
  if (!model) {
    res.status(400).json({ error: 'model is required' })
    return
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
