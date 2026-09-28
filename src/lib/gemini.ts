// Calls go through our own serverless proxy (/api/gemini) which holds the
// Gemini key server-side — the secret is never exposed in the client bundle.
//
// Used for vision tasks (food/workout photo scanning) since Groq deprecated
// its vision models on the free/developer tier.
const GEMINI_URL = '/api/gemini'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function callGemini(base64: string, mimeType: string, prompt: string) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Flash-lite tier — the pro tier has zero free-tier quota on this project (429s
      // on every request), and gemini-flash-latest is currently overloaded (constant
      // 503s from Google, verified independently of this app). Flash-lite still reads
      // labels/estimates portions fine and responds reliably on the free tier.
      model: 'gemini-flash-lite-latest',
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64 } },
        ],
      }],
      generationConfig: { temperature: 0.1 },
    }),
  })
  const data = await res.json()
  return { ok: res.ok, status: res.status, data }
}

/**
 * Image (base64) + text prompt → response string.
 * Flash is a shared free-tier model that occasionally returns 503 "model
 * overloaded" under load — that's transient, so retry once before surfacing
 * it as an error.
 */
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  let result = await callGemini(base64, mimeType, prompt)
  if (!result.ok && result.status === 503) {
    await sleep(1500)
    result = await callGemini(base64, mimeType, prompt)
  }
  if (!result.ok) {
    throw new Error(result.data.error?.message || `Gemini request failed (${result.status})`)
  }
  return result.data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
