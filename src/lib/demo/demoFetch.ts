// Demo mode only: answers this app's own /api/* calls locally, so a demo visitor never hits
// the real proxies (paid AI keys, the Fitbit account). Every other request passes through.

import { demoGeminiResponse, demoGroqResponse } from './demoAi'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Fitbit numbers that look alive but stay stable for a given day.
function dayNumber(date: string | null, min: number, max: number): number {
  let h = 0
  for (const c of date ?? '') h = (h * 31 + c.charCodeAt(0)) >>> 0
  return min + (h % (max - min + 1))
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export function installDemoFetch(): void {
  const realFetch = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init)

    const date = url.searchParams.get('date')
    let body: unknown = null
    try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { /* not JSON */ }

    switch (url.pathname) {
      case '/api/google-health-steps':    await wait(250); return json({ steps: dayNumber(date, 6200, 11800) })
      case '/api/google-health-cardio':   await wait(250); return json({ minutes: dayNumber(date, 18, 46) })
      case '/api/google-health-calories': await wait(250); return json({ kcal: dayNumber(date, 2150, 2780) })
      case '/api/google-health-sleep':    await wait(250); return json({ hours: dayNumber(date, 66, 82) / 10 })
      case '/api/google-health-token':    await wait(400); return json({ ok: true })
      case '/api/groq':                   await wait(900); return json(demoGroqResponse(body))
      case '/api/gemini':                 await wait(1400); return json(demoGeminiResponse(body))
      default:                            return json({ error: 'Not available in the demo' }, 404)
    }
  }
}
