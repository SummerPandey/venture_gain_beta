// Calls go through our own serverless proxy (/api/gemini) which holds the
// Gemini key server-side — the secret is never exposed in the client bundle.
//
// Used for vision tasks (food/workout photo scanning) since Groq deprecated
// its vision models on the free/developer tier.
import { apiHeaders } from './apiAuth'
import { AIRequestError, aiFetchJson } from './groq'

const GEMINI_URL = '/api/gemini'
// Per attempt. Vision calls on flash-lite usually answer in a few seconds; this
// only exists so a stalled mobile connection fails instead of spinning forever.
const GEMINI_TIMEOUT_MS = 45000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function callGemini(base64: string, mimeType: string, prompt: string) {
  return aiFetchJson(GEMINI_URL, {
    method: 'POST',
    headers: await apiHeaders({ 'Content-Type': 'application/json' }),
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
  }, GEMINI_TIMEOUT_MS)
}

/**
 * Image (base64) + text prompt → response string.
 * Flash-lite is a shared free-tier model that occasionally returns 503 "model
 * overloaded" under load — that's transient, so retry a few times with
 * backoff before surfacing it as an error. All failures throw an
 * AIRequestError whose message is safe to show in the scan card.
 */
export async function geminiVision(base64: string, mimeType: string, prompt: string): Promise<string> {
  const delaysMs = [1500, 3000, 5000]
  let data
  for (let attempt = 0; ; attempt++) {
    try {
      data = (await callGemini(base64, mimeType, prompt)).data
      break
    } catch (err) {
      const retryable = err instanceof AIRequestError && err.status === 503
      if (!retryable || attempt >= delaysMs.length) throw err
      await sleep(delaysMs[attempt])
    }
  }
  const blockReason = data.promptFeedback?.blockReason
  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text
  if (typeof text === 'string' && text.trim()) return text
  if (blockReason || candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'RECITATION') {
    throw new AIRequestError('This photo couldn’t be analysed — try a different photo.')
  }
  throw new AIRequestError('The AI couldn’t read this photo — try again or retake it.')
}
