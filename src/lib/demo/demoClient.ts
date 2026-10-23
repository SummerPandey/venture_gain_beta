// A small in-browser stand-in for the Supabase client, covering exactly the calls this app
// makes: from(table) with select / insert / upsert / delete, the eq / gte / lte filters,
// order / range / limit, maybeSingle, and the auth methods AuthContext and apiAuth use.
// Rows live in memory and are mirrored to localStorage so a demo survives a reload; the
// store re-seeds itself each new day so the sample data always ends "today".

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEMO_DAYS, DEMO_PROFILE } from './demoSeed'
import { exitDemo } from './demoMode'

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

const STORE_KEY = 'vg:demoStore'
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000de0'
const DEMO_USER = {
  id: DEMO_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@venturegain.app',
  app_metadata: {},
  user_metadata: { demo: true },
  created_at: '2019-03-23T00:00:00.000Z',
}
const DEMO_SESSION = { access_token: 'demo', token_type: 'bearer', expires_in: 3600, refresh_token: 'demo', user: DEMO_USER }

function localDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function seed(): Tables {
  const daily_logs: Row[] = []
  const workout_entries: Row[] = []
  for (const day of DEMO_DAYS) {
    const log_date = localDate(day.offset)
    daily_logs.push({ ...structuredClone(day.row), user_id: DEMO_USER_ID, log_date })
    for (const e of day.entries ?? []) workout_entries.push({ ...structuredClone(e), user_id: DEMO_USER_ID, log_date })
  }
  return {
    user_profiles: [{ ...structuredClone(DEMO_PROFILE), user_id: DEMO_USER_ID }],
    daily_logs,
    workout_entries,
  }
}

function load(): Tables {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as { day?: string; tables?: Tables } | null
    if (saved?.day === localDate(0) && saved.tables) return saved.tables
  } catch { /* corrupt or blocked storage: start fresh */ }
  return seed()
}

const tables: Tables = load()
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ day: localDate(0), tables })) } catch { /* in-memory only */ }
}

// ── Query builder ──

type Filter = { col: string; op: 'eq' | 'gte' | 'lte'; value: unknown }
type Result = { data: unknown; error: null; count?: number }

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(({ col, op, value }) => {
    const v = row[col] as string | number
    if (op === 'eq') return v === value
    if (v === undefined || v === null) return false
    return op === 'gte' ? v >= (value as string | number) : v <= (value as string | number)
  })
}

function project(row: Row, cols: string | null): Row {
  if (!cols || cols.trim() === '*') return structuredClone(row)
  const out: Row = {}
  for (const c of cols.split(',').map(s => s.trim()).filter(Boolean)) out[c] = structuredClone(row[c] ?? null)
  return out
}

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' | 'delete' = 'select'
  private cols: string | null = '*'
  private returning = false
  private payload: Row[] = []
  private conflict: string[] = []
  private filters: Filter[] = []
  private orderBy: { col: string; asc: boolean } | null = null
  private slice: [number, number] | null = null
  private single = false

  constructor(private table: string) {}

  select(cols = '*') {
    if (this.op === 'select') this.cols = cols
    else { this.returning = true; this.cols = cols }
    return this
  }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = ([] as Row[]).concat(rows); this.cols = null; return this }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.op = 'upsert'
    this.payload = ([] as Row[]).concat(rows)
    this.conflict = (opts?.onConflict ?? 'id').split(',').map(s => s.trim())
    this.cols = null
    return this
  }
  delete() { this.op = 'delete'; this.cols = null; return this }
  eq(col: string, value: unknown) { this.filters.push({ col, op: 'eq', value }); return this }
  gte(col: string, value: unknown) { this.filters.push({ col, op: 'gte', value }); return this }
  lte(col: string, value: unknown) { this.filters.push({ col, op: 'lte', value }); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this }
  range(from: number, to: number) { this.slice = [from, to + 1]; return this }
  limit(n: number) { this.slice = [this.slice?.[0] ?? 0, (this.slice?.[0] ?? 0) + n]; return this }
  maybeSingle() { this.single = true; return this }

  private run(): Result {
    const rows = (tables[this.table] ??= [])
    if (this.op === 'insert') {
      rows.push(...this.payload.map(r => structuredClone(r)))
      persist()
      return { data: this.returning ? this.payload.map(r => project(r, this.cols)) : null, error: null }
    }
    if (this.op === 'upsert') {
      for (const incoming of this.payload) {
        const existing = rows.find(r => this.conflict.every(k => r[k] === incoming[k]))
        if (existing) Object.assign(existing, structuredClone(incoming))
        else rows.push(structuredClone(incoming))
      }
      persist()
      return { data: this.returning ? this.payload.map(r => project(r, this.cols)) : null, error: null }
    }
    if (this.op === 'delete') {
      const removed = rows.filter(r => matches(r, this.filters))
      tables[this.table] = rows.filter(r => !matches(r, this.filters))
      persist()
      return { data: this.returning ? removed.map(r => project(r, this.cols)) : null, error: null }
    }
    let found = rows.filter(r => matches(r, this.filters))
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      found = [...found].sort((a, b) => {
        const x = a[col] as string | number, y = b[col] as string | number
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    if (this.slice) found = found.slice(this.slice[0], this.slice[1])
    const data = found.map(r => project(r, this.cols))
    return this.single ? { data: data[0] ?? null, error: null } : { data, error: null }
  }

  then<A = Result, B = never>(onOk?: ((v: Result) => A | PromiseLike<A>) | null, onErr?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    // A short delay so loading states behave like they do against the network.
    return new Promise<Result>(resolve => setTimeout(() => resolve(this.run()), 60)).then(onOk, onErr)
  }
}

// ── Auth ──

type AuthListener = (event: string, session: typeof DEMO_SESSION | null) => void
const listeners = new Set<AuthListener>()
const demoError = { name: 'AuthApiError', message: 'You are in the demo. Exit the demo to sign in.', status: 400 }

export function createDemoClient(): SupabaseClient {
  const client = {
    from: (table: string) => new Query(table),
    auth: {
      getSession: async () => ({ data: { session: DEMO_SESSION }, error: null }),
      getUser: async () => ({ data: { user: DEMO_USER }, error: null }),
      onAuthStateChange: (cb: AuthListener) => {
        listeners.add(cb)
        setTimeout(() => cb('INITIAL_SESSION', DEMO_SESSION), 0)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      signInWithPassword: async () => ({ data: { user: null, session: null }, error: demoError }),
      signUp: async () => ({ data: { user: null, session: null }, error: demoError }),
      signOut: async () => { exitDemo(); return { error: null } },
    },
  }
  return client as unknown as SupabaseClient
}
