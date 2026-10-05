import { supabase } from './supabase'

/** Headers for calls to our own /api proxies: they all require the caller's
 *  Supabase session token (see api/_auth.ts). */
export async function apiHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { ...extra, Authorization: `Bearer ${session.access_token}` } : extra
}
