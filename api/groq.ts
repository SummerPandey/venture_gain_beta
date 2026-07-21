// Vercel serverless function: server-side proxy to the Groq API.
// The Groq key lives only in the GROQ_API_KEY env var (server-side, NOT VITE_*),
// so it never ships to the browser. The client posts the same request body it
// used to send to Groq directly; we just attach the secret and forward it.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

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

  const key = process.env.GROQ_API_KEY
  if (!key) {
    res.status(500).json({ error: 'GROQ_API_KEY is not configured on the server' })
    return
  }

  try {
    const upstream = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {}),
    })
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'Upstream request to Groq failed' })
  }
}
