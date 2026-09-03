// Calls go through our own serverless proxy (/api/gemini) which holds the
// Gemini key server-side — the secret is never exposed in the client bundle.
//
// Used for vision tasks (food/workout photo scanning) since Groq deprecated
// its vision models on the free/developer tier.
const GEMINI_URL = '/api/gemini'

/** Image (base64) + text prompt → response string */
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Pro tier — meaningfully better at reading fine label/screenshot text and
      // estimating food portions than gemini-flash-latest. Vision scans are a
      // manual, occasional action (not chat), so the extra latency is worth it.
      model: 'gemini-pro-latest',
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
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
