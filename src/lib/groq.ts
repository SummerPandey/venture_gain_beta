// Calls go through our own serverless proxy (/api/groq) which holds the Groq
// key server-side — the secret is never exposed in the client bundle.
const GROQ_URL = '/api/groq'
// llama-3.3-70b-versatile was removed from Groq's catalog; gpt-oss-120b is the closest replacement.
const GROQ_MODEL = 'openai/gpt-oss-120b'

function headers() {
  return { 'Content-Type': 'application/json' }
}

/**
 * Parse JSON out of an LLM response that may be wrapped in markdown fences or
 * prose, contain stray characters (e.g. a rogue ")" before "]"), trailing
 * commas, or be cut off mid-structure. Returns the parsed value, or null if
 * it can't be recovered. Used everywhere we ask the model for JSON, because
 * llama reliably emits small artifacts once the output has several sets.
 */
export function parseAIJson<T = unknown>(raw: string): T | null {
  if (!raw) return null
  let s = raw.replace(/```json|```/g, '').trim()

  // Narrow to the outermost JSON span (drop any prose before/after)
  const firstObj = s.indexOf('{')
  const firstArr = s.indexOf('[')
  const start = firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr)
  if (start === -1) return null
  s = s.slice(start)

  const direct = tryParse<T>(s)
  if (direct !== undefined) return direct

  const repaired = tryParse<T>(repairJson(s))
  return repaired === undefined ? null : repaired
}

function tryParse<T>(s: string): T | undefined {
  try { return JSON.parse(s) as T } catch { return undefined }
}

/** Best-effort cleanup of common LLM JSON artifacts: stray parens, trailing
 *  commas, stray closers, and unclosed strings/brackets from truncation. */
function repairJson(input: string): string {
  let out = ''
  const stack: string[] = []
  let inString = false
  let escaped = false

  for (const ch of input) {
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '(' || ch === ')') continue          // drop stray parens
    if (ch === '{' || ch === '[') { stack.push(ch); out += ch; continue }
    if (ch === '}' || ch === ']') {
      if (stack.length === 0) continue               // drop stray closer
      out = out.replace(/[\s,]+$/, '')               // strip trailing comma
      stack.pop()
      out += ch
      continue
    }
    out += ch
  }

  if (inString) out += '"'                           // close truncated string
  out = out.replace(/[\s,]+$/, '')
  while (stack.length) out += stack.pop() === '{' ? '}' : ']'  // close truncation
  return out
}

/** Plain text prompt → response string */
export async function groqText(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = [
    ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
    { role: 'user', content: prompt },
  ]
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ model: GROQ_MODEL, messages, temperature: 0.1 }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

/** Multi-turn chat — pass full history each time.
 *  Pass a low temperature for JSON-producing prompts (e.g. workout logging);
 *  the default 0.7 suits free-form conversational replies. */
export async function groqChat(
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  opts: { temperature?: number } = {},
): Promise<string> {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...history],
      temperature: opts.temperature ?? 0.7,
    }),
  })
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? "Sorry, I couldn't reach the AI right now."
}
