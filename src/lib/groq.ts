// Calls go through our own serverless proxy (/api/groq) which holds the Groq
// key server-side — the secret is never exposed in the client bundle.
const GROQ_URL = '/api/groq'
// llama-3.3-70b-versatile was removed from Groq's catalog; gpt-oss-120b is the closest replacement.
const GROQ_MODEL = 'openai/gpt-oss-120b'

import { apiHeaders } from './apiAuth'

function headers() {
  return apiHeaders({ 'Content-Type': 'application/json' })
}

// A stalled mobile connection would otherwise leave the UI "thinking" for
// minutes. 30s leaves room for long gpt-oss replies; callers already catch.
const GROQ_TIMEOUT_MS = 30000

/** Thrown for any failed AI proxy call. `message` is always safe to show the
 *  user (never a raw parser/network string). */
export class AIRequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}

/** Map a failed proxy response to a user-facing message. */
export function aiErrorMessage(status: number, serverMessage?: string): string {
  if (status === 401) return 'Session expired \u2014 please sign in again.'
  if (status === 403) return 'This account isn\u2019t allowed to use the AI.'
  if (status === 413) return 'That was too large to send \u2014 try something smaller.'
  if (status === 429) return 'The AI is busy right now \u2014 try again in a moment.'
  if (status === 503) return 'The AI is overloaded \u2014 try again in a moment.'
  if (status === 504) return 'The AI took too long \u2014 try again.'
  return serverMessage || `AI request failed (${status}) \u2014 try again.`
}

/** fetch() + timeout + safe JSON body parsing, shared by the Groq and Gemini
 *  clients. Network failures, timeouts, non-JSON bodies (e.g. Vercel's HTML
 *  504 page) and non-2xx statuses all become an AIRequestError. */
export async function aiFetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ status: number; data: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  let text: string
  try {
    res = await fetch(url, { ...init, signal: controller.signal })
    text = await res.text()
  } catch (err) {
    if (controller.signal.aborted) throw new AIRequestError('Taking too long \u2014 check your connection and try again.')
    console.error('[ai] network error:', err)
    throw new AIRequestError('Can\u2019t reach the server \u2014 check your connection and try again.')
  } finally {
    clearTimeout(timer)
  }
  let data: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
  try { data = text ? JSON.parse(text) : null } catch { /* non-JSON body */ }
  if (!res.ok) {
    const serverMessage = typeof data?.error === 'string' ? data.error : data?.error?.message
    throw new AIRequestError(aiErrorMessage(res.status, serverMessage), res.status)
  }
  if (data === null || typeof data !== 'object') throw new AIRequestError('Got an unreadable reply from the server \u2014 try again.', res.status)
  return { status: res.status, data }
}

async function groqPost(body: unknown) {
  // Headers come from a (normally instant) Supabase session read; the timeout
  // in aiFetchJson covers the network round-trip itself.
  const h = await headers()
  const { data } = await aiFetchJson(GROQ_URL, { method: 'POST', headers: h, body: JSON.stringify(body) }, GROQ_TIMEOUT_MS)
  return data
}

function groqContent(data: { choices?: Array<{ message?: { content?: unknown } }> }): string {
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new AIRequestError('The AI sent an empty reply \u2014 try again.')
  return content
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
  const s = raw.replace(/```json|```/g, '').trim()

  // Narrow to the outermost JSON span (drop any prose before/after). Prose can
  // contain a stray bracket ("Logged [2x] sets: {...}"), so try each '{' / '['
  // in turn rather than locking onto the first one.
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch !== '{' && ch !== '[') continue
    const candidate = s.slice(i)
    const direct = tryParse<T>(candidate)
    if (direct !== undefined) return direct
    const repaired = tryParse<T>(repairJson(candidate))
    if (repaired !== undefined) return repaired
  }
  return null
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
  const data = await groqPost({ model: GROQ_MODEL, messages, temperature: 0.1 })
  return groqContent(data)
}

/** Multi-turn chat — pass full history each time.
 *  Pass a low temperature for JSON-producing prompts (e.g. workout logging);
 *  the default 0.7 suits free-form conversational replies. */
export async function groqChat(
  history: Array<{ role: string; content: string }>,
  systemPrompt: string,
  opts: { temperature?: number } = {},
): Promise<string> {
  const data = await groqPost({
    model: GROQ_MODEL,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
    temperature: opts.temperature ?? 0.7,
  })
  return groqContent(data)
}
