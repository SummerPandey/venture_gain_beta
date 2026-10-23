import { useState, useEffect, useRef } from 'react'
import type { SleepState } from '@/types'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { fetchSleepHours, GoogleHealthNotConnectedError } from '@/lib/googleHealth'

const SLEEP_HOURS_MAX = 12
const SLEEP_MINUTES_MAX = 59
const SLEEP_MINUTES_STEP = 15
// Highest minute value on the stepper grid (45 for a 15-minute step)
const SLEEP_MINUTES_GRID_MAX = Math.floor(SLEEP_MINUTES_MAX / SLEEP_MINUTES_STEP) * SLEEP_MINUTES_STEP
const ENERGY_MAX = 10
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const EMPTY_STATE: SleepState = { sleepHours: 0, sleepMinutes: 0, energyLevel: 0 }

export interface SleepChartEntry { day: string; sleep: number; energy: number }

type PendingSave = { userId: string; date: string; fields: Record<string, unknown> }

/** Clamp an untrusted (DB / typed) value into [0, max]; non-finite values become 0. */
function clampNum(v: unknown, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.min(max, Math.max(0, n))
}

/** Returns true when the write succeeded. */
async function upsertDay(userId: string, date: string, fields: Record<string, unknown>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('daily_logs')
      .upsert(
        { user_id: userId, log_date: date, ...fields, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,log_date' }
      )
    if (error) { console.error('[sleep] upsert error:', error); return false }
    return true
  } catch (e) {
    console.error('[sleep] upsert error:', e)
    return false
  }
}

export function useSleep() {
  const { user } = useAuth()
  const [state, setState] = useState<SleepState>(EMPTY_STATE)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [sleepStatus, setSleepStatus] = useState<'loading' | 'connected' | 'not_connected' | 'error'>('loading')
  const [fitbitSynced, setFitbitSynced] = useState(false)
  const userModified = useRef(false)
  // Bumped on every manual edit — lets an in-flight load detect that it's stale.
  const editGen = useRef(0)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])
  const pendingSleep = useRef<PendingSave | null>(null)
  const [weeklyChartData, setWeeklyChartData] = useState<SleepChartEntry[]>([])
  const totalSleepHours = state.sleepHours + state.sleepMinutes / 60
  // Date this hook's data was successfully loaded for — used to detect a midnight
  // rollover while the PWA stays resident in memory (it never remounts on reopen).
  // Only set after a successful load, so a failed load is retried on next focus.
  const loadedDate = useRef<string>('')

  /** Writes the pending save (if any) to the user/date it was captured for. */
  const flushPending = async (): Promise<boolean> => {
    const p = pendingSleep.current
    if (!p) return true
    const ok = await upsertDay(p.userId, p.date, p.fields)
    // Only clear if nothing newer replaced it while the write was in flight
    if (ok && pendingSleep.current === p) pendingSleep.current = null
    setSaveError(!ok)
    return ok
  }

  /** Pulls last night's sleep from the Google Health proxy (Fitbit/Google Fit data) and
   *  fills it in — but only if nothing's logged for today yet and the user hasn't already
   *  started manually editing this session, so a real Fitbit sync never clobbers a
   *  deliberate manual entry or correction. */
  const refreshFitbitSleep = () => {
    const userId = userRef.current?.id
    if (!userId) return
    const date = getToday()
    setSleepStatus(prev => (prev === 'connected' ? prev : 'loading'))
    fetchSleepHours(date)
      .then(hours => {
        if (userRef.current?.id !== userId || getToday() !== date) return
        setSleepStatus('connected')
        const cur = stateRef.current
        if (userModified.current || cur.sleepHours !== 0 || cur.sleepMinutes !== 0) return
        const safeHours = clampNum(hours, SLEEP_HOURS_MAX + 1)
        if (safeHours <= 0) return
        const wholeHours = Math.min(SLEEP_HOURS_MAX, Math.floor(safeHours))
        const minutes = Math.min(SLEEP_MINUTES_MAX, Math.round((safeHours - Math.floor(safeHours)) * 60))
        setState(s => ({ ...s, sleepHours: wholeHours, sleepMinutes: minutes }))
        setFitbitSynced(true)
        upsertDay(userId, date, { sleep_hours: wholeHours, sleep_minutes: minutes }).catch(() => {})
      })
      .catch(e => {
        if (userRef.current?.id !== userId) return
        setSleepStatus(e instanceof GoogleHealthNotConnectedError ? 'not_connected' : 'error')
      })
  }

  // Load today + last 7 days — .limit(1) avoids duplicate-row crash
  const loadAll = (userId: string, opts: { syncFitbit?: boolean } = {}) => {
    const date = getToday()
    const isRollover = loadedDate.current !== '' && loadedDate.current !== date
    const genAtStart = editGen.current

    const since = new Date()
    since.setDate(since.getDate() - 6)
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

    return supabase
      .from('daily_logs')
      .select('log_date, sleep_hours, sleep_minutes, energy_level')
      .eq('user_id', userId)
      .gte('log_date', sinceStr)
      .order('log_date')
      .then(({ data, error }) => {
        // Ignore responses for a user who is no longer signed in
        if (userRef.current?.id !== userId) return
        if (error || !data) {
          // Don't mark as loaded: auto-save stays off so we never overwrite the
          // saved row with zeros. loadedDate stays stale, so the next focus retries.
          console.error('[sleep] load error:', error)
          setLoadError(true)
          return
        }
        setLoadError(false)
        loadedDate.current = date
        setWeeklyChartData(data.map(row => ({
          day: DAY_LABELS[new Date(row.log_date + 'T12:00:00').getDay()],
          sleep: Math.round((clampNum(row.sleep_hours, SLEEP_HOURS_MAX) + clampNum(row.sleep_minutes, SLEEP_MINUTES_MAX) / 60) * 10) / 10,
          energy: clampNum(row.energy_level, ENERGY_MAX),
        })))
        // If the user edited while this request was in flight, keep their edit —
        // it's newer than what the DB returned and the auto-save will persist it.
        if (editGen.current === genAtStart) {
          userModified.current = false
          // Get today's most recent row. A missing row means a fresh day, so
          // reset to zero rather than leaving yesterday's values in memory.
          const todayRows = data.filter(r => r.log_date === date)
          const todayRow = todayRows[todayRows.length - 1]
          setState({
            sleepHours: Math.trunc(clampNum(todayRow?.sleep_hours, SLEEP_HOURS_MAX)),
            sleepMinutes: Math.trunc(clampNum(todayRow?.sleep_minutes, SLEEP_MINUTES_MAX)),
            energyLevel: clampNum(todayRow?.energy_level, ENERGY_MAX),
          })
        }
        // A new day hasn't been synced yet — drop yesterday's "Synced from Fitbit" label
        if (isRollover) setFitbitSynced(false)
        setLoaded(true)
        if (opts.syncFitbit) refreshFitbitSleep()
      }, err => {
        if (userRef.current?.id !== userId) return
        console.error('[sleep] load error:', err)
        setLoadError(true)
      })
  }

  useEffect(() => {
    // New (or no) user: drop everything from the previous session so nothing leaks
    // across accounts. Flush a pending save to the user it was captured for.
    if (pendingSleep.current && pendingSleep.current.userId !== user?.id) {
      const p = pendingSleep.current
      pendingSleep.current = null
      upsertDay(p.userId, p.date, p.fields)
    }
    setState(EMPTY_STATE)
    setWeeklyChartData([])
    setFitbitSynced(false)
    setSleepStatus('loading')
    setLoadError(false)
    setSaveError(false)
    userModified.current = false
    loadedDate.current = ''
    if (!user) { setLoaded(true); return }
    setLoaded(false)
    loadAll(user.id, { syncFitbit: true })
  }, [user?.id])

  // Reload when the app returns to the foreground on a new calendar day (or after a
  // failed load), so the previous day's energy/sleep don't carry over into today.
  // Also retry a failed save when the device comes back online.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const u = userRef.current
      if (!u) return
      if (pendingSleep.current) flushPending()
      if (getToday() !== loadedDate.current) loadAll(u.id, { syncFitbit: true })
    }
    const onOnline = () => { if (pendingSleep.current) flushPending() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Keep today's chart entry in sync with live state
  useEffect(() => {
    if (!loaded) return
    const todayLabel = DAY_LABELS[new Date(getToday() + 'T12:00:00').getDay()]
    setWeeklyChartData(prev => {
      const entry: SleepChartEntry = {
        day: todayLabel,
        sleep: Math.round(totalSleepHours * 10) / 10,
        energy: state.energyLevel,
      }
      return [...prev.filter(d => d.day !== todayLabel), entry]
    })
  }, [loaded, totalSleepHours, state.energyLevel])

  useEffect(() => { healthSnapshot.sleepHours = totalSleepHours }, [totalSleepHours])

  // Auto-save 600ms after last user-initiated change (not on initial load)
  useEffect(() => {
    if (!loaded || !user || !userModified.current) return
    const { sleepHours, sleepMinutes, energyLevel } = state
    const fields = { sleep_hours: sleepHours, sleep_minutes: sleepMinutes, energy_level: energyLevel }
    // Captured with the user + date it belongs to, so a later flush can't write it
    // onto another account or the next day's row.
    pendingSleep.current = { userId: user.id, date: getToday(), fields }
    const id = setTimeout(() => {
      flushPending().then(ok => { if (!ok) setTimeout(() => { flushPending() }, 3000) })
    }, 600)
    return () => clearTimeout(id)
  }, [state.sleepHours, state.sleepMinutes, state.energyLevel, loaded, user?.id])

  // Flush any pending save on unmount
  useEffect(() => {
    return () => {
      const p = pendingSleep.current
      if (p) upsertDay(p.userId, p.date, p.fields)
    }
  }, [])

  const markEdited = () => { userModified.current = true; editGen.current++ }
  const clampHours = (v: number) => Math.trunc(clampNum(v, SLEEP_HOURS_MAX))
  const clampMinutes = (v: number) => Math.trunc(clampNum(v, SLEEP_MINUTES_MAX))
  /** Stepper moves snap onto the 15-minute grid (0/15/30/45); typed values stay free-form. */
  const stepMinutes = (m: number, delta: number) => {
    const step = SLEEP_MINUTES_STEP
    const next = delta > 0 ? Math.floor(m / step) * step + step : Math.ceil(m / step) * step - step
    if (next < 0) return 0
    // Past the last grid point (e.g. 50 from Fitbit): + is a no-op rather than a decrease
    if (next > SLEEP_MINUTES_GRID_MAX) return Math.max(m, SLEEP_MINUTES_GRID_MAX)
    return next
  }

  const adjustSleepHours = (delta: number) => { markEdited(); setFitbitSynced(false); setState(s => ({ ...s, sleepHours: clampHours(s.sleepHours + delta) })) }
  const setSleepHours = (val: number) => { markEdited(); setFitbitSynced(false); setState(s => ({ ...s, sleepHours: clampHours(val) })) }
  const adjustSleepMinutes = (delta: number) => { markEdited(); setFitbitSynced(false); setState(s => ({ ...s, sleepMinutes: stepMinutes(s.sleepMinutes, delta) })) }
  const setSleepMinutes = (val: number) => { markEdited(); setFitbitSynced(false); setState(s => ({ ...s, sleepMinutes: clampMinutes(val) })) }
  const adjustEnergy = (delta: number) => { markEdited(); setState(s => ({ ...s, energyLevel: clampNum(s.energyLevel + delta, ENERGY_MAX) })) }
  const setEnergy = (val: number) => { markEdited(); setState(s => ({ ...s, energyLevel: clampNum(val, ENERGY_MAX) })) }

  const retryLoad = () => { const u = userRef.current; if (u) loadAll(u.id, { syncFitbit: true }) }
  const retrySave = () => { flushPending() }

  return {
    state,
    totalSleepHours,
    loaded,
    loadError, saveError,
    sleepStatus, fitbitSynced,
    weeklyChartData,
    constants: { hoursMax: SLEEP_HOURS_MAX, minutesMax: SLEEP_MINUTES_MAX, minutesStep: SLEEP_MINUTES_STEP, energyMax: ENERGY_MAX },
    adjustSleepHours, setSleepHours,
    adjustSleepMinutes, setSleepMinutes,
    adjustEnergy, setEnergy,
    refreshFitbitSleep, retryLoad, retrySave,
  }
}
