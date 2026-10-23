// Shared auth guard for the serverless proxies (the leading underscore keeps Vercel
// from exposing this file as a route).
//
// Every /api endpoint spends a paid quota (Groq, Gemini) or reads Summer's health data
// (Google Health), so callers must present a valid Supabase session JWT. We verify it by
// asking Supabase's /auth/v1/user endpoint — no extra dependency or JWT secret needed.
// If ALLOWED_USER_IDS and/or ALLOWED_USER_EMAILS are set (comma-separated), only those
// accounts get through; otherwise any signed-in user does. Prefer ids: they can't be
// claimed by signing up with an address that has no account yet (email matches also
// require a confirmed address). A variable that is set but parses to an empty list is
// treated as a misconfiguration and fails closed, never as "no restriction".

import { fetchWithTimeout } from './_http.js'

interface AuthReq { headers?: Record<string, string | string[] | undefined> }
interface AuthRes {
  status(code: number): AuthRes
  json(body: unknown): void
}

export async function requireUser(req: AuthReq, res: AuthRes): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    console.error('requireUser: SUPABASE_URL / SUPABASE_ANON_KEY missing')
    res.status(500).json({ error: 'Server misconfigured' })
    return false
  }

  const header = req.headers?.authorization
  const auth = Array.isArray(header) ? header[0] : header
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Not signed in' })
    return false
  }

  const list = (name: string) => (process.env[name] ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  const allowedIds = list('ALLOWED_USER_IDS')
  const allowedEmails = list('ALLOWED_USER_EMAILS')
  const setButEmpty = (name: string, parsed: string[]) => process.env[name] !== undefined && parsed.length === 0
  if (setButEmpty('ALLOWED_USER_IDS', allowedIds) || setButEmpty('ALLOWED_USER_EMAILS', allowedEmails)) {
    console.error('requireUser: ALLOWED_USER_IDS / ALLOWED_USER_EMAILS is set but empty')
    res.status(500).json({ error: 'Server misconfigured' })
    return false
  }

  let id: string | undefined
  let email: string | undefined
  try {
    const userRes = await fetchWithTimeout(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    }, 8000)
    if (userRes.status === 401 || userRes.status === 403) {
      res.status(401).json({ error: 'Invalid or expired session' })
      return false
    }
    if (!userRes.ok) {
      // A Supabase outage or rate limit is not a dead session: let the client retry.
      res.status(503).json({ error: 'Auth service temporarily unavailable' })
      return false
    }
    const user = (await userRes.json()) as { id?: string; email?: string; email_confirmed_at?: string | null }
    id = user.id
    email = user.email_confirmed_at ? user.email?.toLowerCase() : undefined
  } catch {
    res.status(502).json({ error: 'Could not verify session' })
    return false
  }

  const restricted = allowedIds.length > 0 || allowedEmails.length > 0
  const permitted = (!!id && allowedIds.includes(id.toLowerCase())) || (!!email && allowedEmails.includes(email))
  if (restricted && !permitted) {
    res.status(403).json({ error: 'This account is not allowed to use this endpoint' })
    return false
  }
  return true
}
