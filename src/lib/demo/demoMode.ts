// No-login demo mode. Turned on by the "Try the demo" button or by opening the app with
// ?demo in the URL (a link that can be shared). In demo mode the app never talks to the real
// Supabase project or the /api proxies: supabase.ts swaps in demoClient, and /api calls are
// answered by installDemoFetch below. Nothing a demo visitor does can reach real data,
// the paid AI keys, or the Fitbit account.

const FLAG_KEY = 'vg:demo'

function readFlag(): boolean {
  try { return localStorage.getItem(FLAG_KEY) === '1' } catch { return false }
}

/** Decided once at startup; entering or leaving demo mode reloads the page. */
export const IS_DEMO: boolean = (() => {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.has('demo')) {
    try { localStorage.setItem(FLAG_KEY, '1') } catch { /* storage blocked: demo lasts this page load */ }
    params.delete('demo')
    const qs = params.toString()
    history.replaceState(history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    return true
  }
  return readFlag()
})()

export function enterDemo(): void {
  try { localStorage.setItem(FLAG_KEY, '1') } catch { /* fall through to the URL flag */ }
  window.location.assign('/?demo')
}

export function exitDemo(): void {
  try {
    localStorage.removeItem(FLAG_KEY)
    localStorage.removeItem('vg:demoStore')
  } catch { /* nothing stored */ }
  window.location.assign('/')
}
