import { useState, useEffect, useRef, useMemo } from 'react'
import type { WorkoutEntry, WorkoutSet, TrackingMode, WeightUnit } from '@/types'
import { CARDIO_MAX_MINUTES, WORKOUT_LEVEL_LOG_BOOST } from '@/constants'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUserSettings } from '@/contexts/UserSettingsContext'
import { convertWeightValue } from '@/lib/units'
import { fetchSteps, fetchCardioMinutes, GoogleHealthNotConnectedError } from '@/lib/googleHealth'

const WORKOUT_DRAFT_KEY = 'venturegain:workoutDraft'
const NOT_READY_MESSAGE = "Still loading today's workouts — try again in a moment."
const SAVE_FAILED_MESSAGE = "Couldn't save your workout — retrying automatically."

interface WorkoutDraft {
  date: string
  /** Account the draft was typed under — a draft from another account is discarded. */
  userId?: string
  selectedExercise: string | null
  trackingMode: TrackingMode
  energyRating: number
  sets: WorkoutSet[]
  unit?: WeightUnit
}

const finiteOr = (x: unknown, fallback: number) => {
  const n = Number(x)
  return Number.isFinite(n) ? n : fallback
}

/** Reads the in-progress (not-yet-logged) exercise draft, so backgrounding the
 *  PWA — which iOS/Android can reclaim mid-session, wiping React state — doesn't
 *  lose reps/weight the user already typed. Ignored once the calendar day rolls over.
 *  The stored JSON is validated field by field so a malformed draft can't crash the tab. */
function readWorkoutDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(WORKOUT_DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Record<string, unknown> | null
    if (!d || typeof d !== 'object' || d.date !== getToday()) return null
    const sets = Array.isArray(d.sets)
      ? d.sets
          .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
          .map(s => ({ reps: Math.max(0, Math.round(finiteOr(s.reps, 0))), weight: Math.max(0, finiteOr(s.weight, 0)) }))
      : []
    return {
      date: d.date as string,
      userId: typeof d.userId === 'string' ? d.userId : undefined,
      selectedExercise: typeof d.selectedExercise === 'string' && d.selectedExercise.trim() ? d.selectedExercise : null,
      trackingMode: d.trackingMode === 'weights' ? 'weights' : 'energy',
      energyRating: Math.min(5, Math.max(1, Math.round(finiteOr(d.energyRating, 3)))),
      sets: sets.length > 0 ? sets : [{ reps: 0, weight: 0 }],
      unit: d.unit === 'kg' || d.unit === 'lbs' || d.unit === 'km' ? d.unit : undefined,
    }
  } catch {
    return null
  }
}

/** Local date string for week start (Saturday), using local time — no UTC drift */
function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 6 ? 0 : -(day + 1)
  const sat = new Date(d)
  sat.setDate(d.getDate() + diff)
  return `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, '0')}-${String(sat.getDate()).padStart(2, '0')}`
}

/** Writes to the row for `date` — callers pass the day their data belongs to, so a
 *  write that lands after midnight can't stamp yesterday's state onto today's row. */
async function upsertDay(userId: string, fields: Record<string, unknown>, date: string = getToday()) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: date, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) throw error
}

const entryRow = (userId: string, date: string, entry: WorkoutEntry) => ({
  user_id: userId,
  log_date: date,
  exercise: entry.exercise,
  category: entry.category ?? null,
  type: entry.type,
  energy_rating: entry.energyRating ?? null,
  sets: entry.sets ?? null,
})

async function insertWorkoutEntries(userId: string, date: string, entries: WorkoutEntry[]): Promise<boolean> {
  if (entries.length === 0) return true
  const { error } = await supabase.from('workout_entries').insert(entries.map(e => entryRow(userId, date, e)))
  if (error) console.error('[workout_entries] insert failed:', error)
  return !error
}

/** Rewrites a day's workout_entries rows from the day's full list, so removing or
 *  editing an exercise is reflected in Overview (which prefers these rows). Only
 *  re-inserts when the delete provably removed every existing row — an RLS-blocked
 *  delete returns no error, and inserting then would duplicate the day. */
async function replaceDayEntries(userId: string, date: string, workouts: WorkoutEntry[]) {
  const { data: before, error: readErr } = await supabase
    .from('workout_entries').select('exercise').eq('user_id', userId).eq('log_date', date)
  if (readErr) { console.error('[workout_entries] read failed:', readErr); return }
  const { data: deleted, error: delErr } = await supabase
    .from('workout_entries').delete().eq('user_id', userId).eq('log_date', date).select('exercise')
  if (delErr || (deleted?.length ?? 0) < (before?.length ?? 0)) {
    console.error('[workout_entries] could not replace day rows:', delErr)
    return
  }
  await insertWorkoutEntries(userId, date, workouts)
}

export interface DayLog {
  date: string
  dayLabel: string
  workoutLevel: number
  energyLevel: number
  cardioMinutes: number
  workouts: WorkoutEntry[]
  /** Categories the user saved in that day's plan (workout_planned_categories) */
  plannedCategories: string[]
}

/** Today's persisted values. Mirrored in a ref so async writes (LOG ALL loops,
 *  in-flight saves) always build on the latest state, never a stale render closure. */
interface LiveDay {
  todayWorkouts: WorkoutEntry[]
  workoutLevel: number
  energyLevel: number
  cardioMinutes: number
}

const EMPTY_DAY: LiveDay = { todayWorkouts: [], workoutLevel: 0, energyLevel: 0, cardioMinutes: 0 }

interface PendingSave {
  userId: string
  date: string
  version: number
  fields: Record<string, unknown>
}

export function useWorkout() {
  const { user, loading: authLoading } = useAuth()
  const { settings, setDefaultWeightUnit } = useUserSettings()
  const [workoutLevel, setWorkoutLevel] = useState(0)
  const [energyLevel, setEnergyLevel] = useState(0)
  const [cardioMinutes, setCardioMinutes] = useState(0)
  const [steps, setSteps] = useState(0)
  const [stepsStatus, setStepsStatus] = useState<'loading' | 'connected' | 'not_connected' | 'error'>('loading')
  const [fitbitCardioMinutes, setFitbitCardioMinutes] = useState(0)
  const [fitbitCardioStatus, setFitbitCardioStatus] = useState<'loading' | 'connected' | 'not_connected' | 'error'>('loading')
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutEntry[]>([])
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [initialDraft] = useState(() => readWorkoutDraft())
  const [selectedExercise, setSelectedExercise] = useState<string | null>(initialDraft?.selectedExercise ?? null)
  const [trackingMode, setTrackingMode] = useState<TrackingMode>(initialDraft?.trackingMode ?? 'energy')
  const [energyRating, setEnergyRating] = useState(initialDraft?.energyRating ?? 3)
  const [sets, setSets] = useState<WorkoutSet[]>(initialDraft?.sets ?? [{ reps: 0, weight: 0 }])
  const [unit, setUnitState] = useState<WeightUnit>(initialDraft?.unit ?? settings.defaultWeightUnit)
  // Seed from the saved default whenever it changes (e.g. loads in after mount) —
  // scoped to the primitive value so it doesn't re-fire on unrelated settings edits.
  // Skipped while an exercise with typed weights is open: switching the label then
  // would silently turn "60 kg" into "60 lbs" without converting the numbers.
  useEffect(() => {
    if (selectedExercise && sets.some(s => s.weight > 0)) return
    setUnitState(settings.defaultWeightUnit)
  }, [settings.defaultWeightUnit]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Changing the unit while logging converts the already-typed set weights to match
   *  (15kg -> 33.1lbs, not just relabeled) and remembers it as the new default for next time. */
  const setUnit = (u: WeightUnit) => {
    setSets(prev => prev.map(s => ({ ...s, weight: convertWeightValue(s.weight, unit, u) })))
    setUnitState(u)
    setDefaultWeightUnit(u)
  }
  const [showExerciseSelection, setShowExerciseSelection] = useState(false)
  const [scheduledTime, setScheduledTimeState] = useState<string | null>(null)
  const [scheduledCategories, setScheduledCategoriesState] = useState<string[]>([])
  // Latest plan values — avoids stale closures when time and categories are
  // changed in quick succession.
  const planRef = useRef<{ time: string | null; categories: string[] }>({ time: null, categories: [] })
  const [loaded, setLoaded] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [historicalLogs, setHistoricalLogs] = useState<DayLog[]>([])
  const [saveError, setSaveError] = useState<string | null>(null)
  const [autosaveRetry, setAutosaveRetry] = useState(0)

  const [celebration, setCelebration] = useState<string | null>(null)
  // null until the first loaded value is seen, so a week that was already over
  // target doesn't re-celebrate on every app open.
  const prevCardio = useRef<number | null>(null)
  const userRef = useRef(user)
  userRef.current = user
  const pendingWorkout = useRef<PendingSave | null>(null)
  // Date this hook's data was loaded for — used to detect a midnight rollover
  // while the PWA stays resident in memory (it never remounts on reopen).
  const loadedDate = useRef<string>('')
  // True once today's row has loaded for the current user. Writes of today_workouts
  // are refused until then, so a failed/slow load can't be overwritten with [].
  const dayReady = useRef(false)
  const live = useRef<LiveDay>({ ...EMPTY_DAY })
  // Bumped on every local edit; a save only clears "dirty" if no newer edit happened meanwhile.
  const dirtyVersion = useRef(0)
  const loadRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commit = (patch: Partial<LiveDay>) => {
    live.current = { ...live.current, ...patch }
    if (patch.todayWorkouts !== undefined) setTodayWorkouts(patch.todayWorkouts)
    if (patch.workoutLevel !== undefined) setWorkoutLevel(patch.workoutLevel)
    if (patch.energyLevel !== undefined) setEnergyLevel(patch.energyLevel)
    if (patch.cardioMinutes !== undefined) setCardioMinutes(patch.cardioMinutes)
  }

  const dayFields = () => ({
    workout_level: live.current.workoutLevel,
    energy_level_workout: live.current.energyLevel,
    cardio_minutes: live.current.cardioMinutes,
    today_workouts: live.current.todayWorkouts,
  })

  const markDirty = () => {
    dirtyVersion.current += 1
    setIsDirty(true)
    return dirtyVersion.current
  }

  const markCleanIf = (version: number) => {
    if (dirtyVersion.current !== version) return
    setIsDirty(false)
    if (pendingWorkout.current?.version === version) pendingWorkout.current = null
  }

  const weeklyCardioMinutes = useMemo(() => {
    const weekStart = getWeekStart()
    return historicalLogs
      .filter(d => d.date >= weekStart)
      .reduce((sum, d) => sum + d.cardioMinutes, 0)
  }, [historicalLogs])

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Load today's data + last 90 days of history
  const loadAll = (userId: string) => {
    if (loadRetryTimer.current) { clearTimeout(loadRetryTimer.current); loadRetryTimer.current = null }
    const wasReady = dayReady.current
    const startVersion = dirtyVersion.current
    const today = getToday()
    loadedDate.current = today

    const since = new Date()
    since.setDate(since.getDate() - 89)
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`

    supabase
      .from('daily_logs')
      .select('log_date, workout_level, energy_level_workout, cardio_minutes, today_workouts, workout_planned_categories')
      .eq('user_id', userId)
      .gte('log_date', sinceStr)
      .order('log_date', { ascending: true })
      .then(({ data, error }) => {
        if (userRef.current?.id !== userId) return // signed out / switched account mid-load
        if (error || !data) {
          // Don't treat a failed load as an empty day — that would let the next
          // log overwrite the saved workouts. Retry, and keep writes blocked meanwhile.
          console.error('[workout] load failed:', error)
          if (!dayReady.current) loadRetryTimer.current = setTimeout(() => loadAll(userId), 5000)
          return
        }
        const byDate = new Map<string, typeof data[0]>()
        data.forEach(row => byDate.set(row.log_date, row))
        const deduped = Array.from(byDate.values())

        const logs: DayLog[] = deduped.map(row => ({
          date: row.log_date,
          dayLabel: DAY_LABELS[new Date(row.log_date + 'T12:00:00').getDay()],
          workoutLevel: Number(row.workout_level) || 0,
          energyLevel: Number(row.energy_level_workout) || 0,
          cardioMinutes: Number(row.cardio_minutes) || 0,
          workouts: Array.isArray(row.today_workouts) ? row.today_workouts : [],
          plannedCategories: Array.isArray(row.workout_planned_categories) ? row.workout_planned_categories : [],
        }))
        setHistoricalLogs(logs)

        // Keep edits made while a refresh was in flight (they'll autosave);
        // otherwise adopt the server's row for today.
        if (!wasReady || dirtyVersion.current === startVersion) {
          const todayRow = byDate.get(today)
          commit(todayRow
            ? {
                todayWorkouts: Array.isArray(todayRow.today_workouts) ? todayRow.today_workouts : [],
                workoutLevel: Number(todayRow.workout_level) || 0,
                energyLevel: Number(todayRow.energy_level_workout) || 0,
                cardioMinutes: Number(todayRow.cardio_minutes) || 0,
              }
            : { ...EMPTY_DAY })
          dirtyVersion.current += 1
          setIsDirty(false)
        }
        dayReady.current = true
        setLoaded(true)
      })
  }

  // Today's plan — separate query so a missing column can't break the main load
  const loadPlan = (userId: string) => {
    supabase
      .from('daily_logs')
      .select('workout_planned_time, workout_planned_categories')
      .eq('user_id', userId)
      .eq('log_date', getToday())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[workout] plan load failed:', error); return }
        const time = data?.workout_planned_time ?? null
        const categories = Array.isArray(data?.workout_planned_categories) ? data.workout_planned_categories : []
        planRef.current = { time, categories }
        setScheduledTimeState(time)
        setScheduledCategoriesState(categories)
      })
  }

  // In-progress exercise belongs to whoever typed it; drop it on sign-out or account switch.
  const exerciseOwner = useRef<string | null>(initialDraft?.userId ?? null)
  const resetExerciseDraft = () => {
    setSelectedExercise(null)
    setSets([{ reps: 0, weight: 0 }])
    setEnergyRating(3)
    try { localStorage.removeItem(WORKOUT_DRAFT_KEY) } catch { /* best-effort */ }
  }

  useEffect(() => {
    if (authLoading) return
    const uid = user?.id ?? null
    if (exerciseOwner.current !== null && exerciseOwner.current !== uid) resetExerciseDraft()
    exerciseOwner.current = uid

    // New account (or signed out): forget the previous account's day before anything can write it.
    dayReady.current = false
    if (pendingWorkout.current && pendingWorkout.current.userId !== uid) pendingWorkout.current = null
    commit({ ...EMPTY_DAY })
    dirtyVersion.current += 1
    setIsDirty(false)
    if (!user) { dayReady.current = true; setLoaded(true); return }
    setLoaded(false)
    loadAll(user.id)
    loadPlan(user.id)
  }, [user?.id, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const flushPendingWorkout = () => {
    const p = pendingWorkout.current
    if (!p) return
    pendingWorkout.current = null
    // Only ever write a pending save for the account (and day) it was made under.
    if (userRef.current?.id !== p.userId) return
    upsertDay(p.userId, p.fields, p.date).catch(e => console.error('Workout flush failed:', e))
  }

  /** If the calendar day changed while the app stayed open, start today fresh
   *  instead of merging yesterday's list into today's row. */
  const rolloverIfNeeded = (): boolean => {
    if (!loadedDate.current || getToday() === loadedDate.current) return false
    flushPendingWorkout() // still writes to the old date
    loadedDate.current = getToday()
    commit({ ...EMPTY_DAY })
    dirtyVersion.current += 1
    setIsDirty(false)
    planRef.current = { time: null, categories: [] }
    setScheduledTimeState(null)
    setScheduledCategoriesState([])
    const u = userRef.current
    if (u) {
      loadAll(u.id)
      loadPlan(u.id)
      refreshSteps()
      refreshFitbitCardio()
    }
    return true
  }

  /** Common guard for every write: handles rollover and refuses until today's row has loaded. */
  const prepareWrite = (): boolean => {
    rolloverIfNeeded()
    if (userRef.current && !dayReady.current) {
      setSaveError(NOT_READY_MESSAGE)
      return false
    }
    return true
  }

  /** Saves today's full row; clears dirty only if nothing changed since `version`. */
  const persistDay = async (version: number): Promise<boolean> => {
    const u = userRef.current
    if (!u) return true
    try {
      await upsertDay(u.id, dayFields(), loadedDate.current)
      markCleanIf(version)
      return true
    } catch (e) {
      console.error('Workout save failed:', e)
      setSaveError(SAVE_FAILED_MESSAGE)
      return false
    }
  }

  // Reload when the app returns to the foreground on a new calendar day (or after
  // a failed load), so the previous day's workout/cardio don't carry over into today.
  //
  // Also flush any pending (debounced, not-yet-saved) edit the moment the page
  // goes hidden — this provider lives at the app root and never actually
  // unmounts during normal tab switching, so it's the only reliable point to
  // save before iOS/Android can reclaim a backgrounded PWA mid-debounce.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') { flushPendingWorkout(); return }
      if (document.visibilityState !== 'visible') return
      const u = userRef.current
      if (!u) return
      if (rolloverIfNeeded()) return
      if (!dayReady.current) loadAll(u.id)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)
    window.addEventListener('pagehide', flushPendingWorkout)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
      window.removeEventListener('pagehide', flushPendingWorkout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Midnight rollover while the app stays visible (no visibility/focus event fires).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
      timer = setTimeout(() => { if (userRef.current) rolloverIfNeeded(); schedule() }, next.getTime() - now.getTime())
    }
    schedule()
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const savePlanField = (fields: Record<string, unknown>) => {
    if (!userRef.current) return
    // Only the changed column is written, so a plan that failed to load can't
    // have its other column wiped to null by this save.
    supabase.from('daily_logs').upsert(
      { user_id: userRef.current.id, log_date: getToday(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    ).then(({ error }) => { if (error) console.error('[workout] plan save failed:', error) })
  }

  const setScheduledTime = (t: string | null) => {
    planRef.current = { ...planRef.current, time: t }
    setScheduledTimeState(t)
    savePlanField({ workout_planned_time: t })
  }

  const toggleScheduledCategory = (c: string) => {
    const cur = planRef.current.categories
    const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]
    planRef.current = { ...planRef.current, categories: next }
    setScheduledCategoriesState(next)
    savePlanField({ workout_planned_categories: next })
  }

  // Default category for logs that don't carry one: the day's planned category.
  // Only when the plan is unambiguous (exactly one category) — never guess.
  const plannedCategory = scheduledCategories.length === 1 ? scheduledCategories[0] : undefined

  // Keep today's entry in historicalLogs in sync with live state
  useEffect(() => {
    if (!loaded) return
    const today = getToday()
    setHistoricalLogs(prev => {
      const todayEntry: DayLog = {
        date: today,
        dayLabel: DAY_LABELS[new Date(today + 'T12:00:00').getDay()],
        workoutLevel,
        energyLevel,
        cardioMinutes,
        workouts: todayWorkouts,
        plannedCategories: scheduledCategories,
      }
      const without = prev.filter(d => d.date !== today)
      return [...without, todayEntry].sort((a, b) => a.date.localeCompare(b.date))
    })
  }, [loaded, workoutLevel, energyLevel, cardioMinutes, todayWorkouts, scheduledCategories]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { healthSnapshot.workoutLevel = workoutLevel }, [workoutLevel])
  useEffect(() => { healthSnapshot.energyLevel = energyLevel }, [energyLevel])
  useEffect(() => { healthSnapshot.steps = steps }, [steps])

  /** Pulls today's step count from the Google Health proxy (Fitbit/Google Fit data,
   *  server-side OAuth — see /api/google-health-steps) and persists it alongside the
   *  rest of today's row so it's available even before the next successful fetch. */
  const refreshSteps = () => {
    const date = getToday()
    setStepsStatus(prev => (prev === 'connected' ? prev : 'loading'))
    fetchSteps(date)
      .then(count => {
        if (getToday() !== date) return // response for a day that has already ended
        setSteps(count)
        setStepsStatus('connected')
        if (userRef.current) upsertDay(userRef.current.id, { steps: count }, date).catch(() => {})
      })
      .catch(e => {
        setStepsStatus(e instanceof GoogleHealthNotConnectedError ? 'not_connected' : 'error')
      })
  }

  useEffect(() => {
    if (!loaded || !user) return
    refreshSteps()
  }, [loaded, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Pulls today's minutes in Fitbit's cardio heart-rate zone — a real-data companion
   *  to the self-reported cardio stepper above, not a replacement for it. */
  const refreshFitbitCardio = () => {
    const date = getToday()
    setFitbitCardioStatus(prev => (prev === 'connected' ? prev : 'loading'))
    fetchCardioMinutes(date)
      .then(minutes => {
        if (getToday() !== date) return
        setFitbitCardioMinutes(minutes)
        setFitbitCardioStatus('connected')
      })
      .catch(e => {
        setFitbitCardioStatus(e instanceof GoogleHealthNotConnectedError ? 'not_connected' : 'error')
      })
  }

  useEffect(() => {
    if (!loaded || !user) return
    refreshFitbitCardio()
  }, [loaded, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mirror the in-progress (not-yet-logged) exercise to localStorage so it survives
  // the PWA getting backgrounded and reclaimed mid-session — see readWorkoutDraft().
  useEffect(() => {
    if (!selectedExercise) {
      try { localStorage.removeItem(WORKOUT_DRAFT_KEY) } catch { /* private mode etc — draft persistence is best-effort */ }
      return
    }
    const draft: WorkoutDraft = { date: getToday(), userId: userRef.current?.id, selectedExercise, trackingMode, energyRating, sets, unit }
    try { localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft)) } catch { /* private mode etc — draft persistence is best-effort */ }
  }, [selectedExercise, trackingMode, energyRating, sets, unit])

  // Auto-save 2s after last dirty change (and retry after a failure)
  useEffect(() => {
    if (!loaded || !user || !isDirty || !dayReady.current) return
    const version = dirtyVersion.current
    const date = loadedDate.current
    const fields = dayFields()
    pendingWorkout.current = { userId: user.id, date, version, fields }
    let retry: ReturnType<typeof setTimeout> | undefined
    const id = setTimeout(async () => {
      try {
        await upsertDay(user.id, fields, date)
        markCleanIf(version)
      } catch (e) {
        console.error('Workout auto-save failed:', e)
        setSaveError(SAVE_FAILED_MESSAGE)
        retry = setTimeout(() => setAutosaveRetry(n => n + 1), 10000)
      }
    }, 2000)
    return () => { clearTimeout(id); if (retry) clearTimeout(retry) }
  }, [workoutLevel, energyLevel, cardioMinutes, todayWorkouts, loaded, user?.id, isDirty, autosaveRetry]) // eslint-disable-line react-hooks/exhaustive-deps

  // Last-resort flush on a genuine unmount (e.g. sign-out) — the visibilitychange/
  // pagehide handlers above cover the normal backgrounding case, since this
  // provider otherwise stays mounted for the life of the session.
  useEffect(() => {
    return () => {
      flushPendingWorkout()
      if (loadRetryTimer.current) clearTimeout(loadRetryTimer.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2500)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    if (!saveError) return
    const t = setTimeout(() => setSaveError(null), 5000)
    return () => clearTimeout(t)
  }, [saveError])

  useEffect(() => {
    if (!loaded) return
    const prev = prevCardio.current
    prevCardio.current = weeklyCardioMinutes
    if (prev !== null && prev < settings.cardioTarget && weeklyCardioMinutes >= settings.cardioTarget) {
      setCelebration('CARDIO TARGET CRUSHED')
    }
  }, [weeklyCardioMinutes, settings.cardioTarget, loaded])

  const save = async () => {
    if (!user || !prepareWrite()) return
    await persistDay(dirtyVersion.current)
  }

  const simulateScreenshot = () => setUploadedImage('screenshot-placeholder')
  const dismissScreenshot = () => setUploadedImage(null)

  const addSet = () => setSets(prev => [...prev, { reps: 0, weight: 0 }])
  const removeSet = (index: number) =>
    setSets(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  const updateSet = (index: number, field: keyof WorkoutSet, value: number) =>
    setSets(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))

  /** Closes the logging modal and throws away what was typed, so the next exercise starts clean. */
  const discardExercise = () => {
    setSelectedExercise(null)
    setSets([{ reps: 0, weight: 0 }])
    setEnergyRating(3)
  }

  const withPlannedCategory = (e: WorkoutEntry): WorkoutEntry =>
    e.category || !plannedCategory ? e : { ...e, category: plannedCategory }

  /** Logs the modal's exercise. Returns false (and sets saveError) when nothing valid was entered. */
  const logWorkout = (category?: string): boolean => {
    if (!selectedExercise) return false
    const filledSets = sets.filter(s => s.reps > 0 || s.weight > 0)
    if (trackingMode === 'weights' && !filledSets.some(s => s.reps > 0)) {
      setSaveError('Add at least one set with reps before logging.')
      return false
    }
    if (!prepareWrite()) return false
    const resolvedCategory = category ?? plannedCategory
    const entry: WorkoutEntry = {
      exercise: selectedExercise,
      type: trackingMode,
      time: new Date().toLocaleTimeString(),
      ...(trackingMode === 'energy' ? { energyRating } : { sets: filledSets, unit }),
      ...(resolvedCategory ? { category: resolvedCategory } : {}),
    }
    commit({
      todayWorkouts: [...live.current.todayWorkouts, entry],
      workoutLevel: Math.min(100, live.current.workoutLevel + WORKOUT_LEVEL_LOG_BOOST),
    })
    discardExercise()
    markDirty() // persisted by the autosave
    const u = userRef.current
    if (u) {
      insertWorkoutEntries(u.id, loadedDate.current, [entry])
        .then(ok => { if (!ok) setSaveError("Couldn't save to workout history.") })
    }
    return true
  }

  /** Logs several entries in one write — each gets the usual level boost. Built from
   *  the live ref, so back-to-back calls never drop each other's entries. */
  const logWorkoutBatch = async (rawEntries: WorkoutEntry[]): Promise<boolean> => {
    if (rawEntries.length === 0) return true
    if (!prepareWrite()) return false
    const entries = rawEntries.map(withPlannedCategory)
    commit({
      todayWorkouts: [...live.current.todayWorkouts, ...entries],
      workoutLevel: Math.min(100, live.current.workoutLevel + WORKOUT_LEVEL_LOG_BOOST * entries.length),
    })
    const version = markDirty()
    const u = userRef.current
    if (!u) return true
    const date = loadedDate.current
    const [ok, entriesOk] = await Promise.all([persistDay(version), insertWorkoutEntries(u.id, date, entries)])
    if (ok && !entriesOk) setSaveError("Couldn't save to workout history.")
    return ok
  }

  const logWorkoutDirect = (entry: WorkoutEntry) => logWorkoutBatch([entry])

  const restDayLogged = todayWorkouts.some(w => w.category === 'Rest Day' || w.exercise === 'Rest Day')

  /** Log a Rest Day entry without needing a selected exercise — at most once per day. */
  const logRestDay = async (): Promise<boolean> => {
    if (live.current.todayWorkouts.some(w => w.category === 'Rest Day' || w.exercise === 'Rest Day')) return false
    return logWorkoutBatch([{
      exercise: 'Rest Day',
      type: 'energy',
      time: new Date().toLocaleTimeString(),
      energyRating: 3,
      category: 'Rest Day',
    }])
  }

  /** Called after external chat-based saves to sync context state without hitting DB again */
  const syncFromChat = (newWorkouts: WorkoutEntry[], newLevel: number) => {
    commit({ todayWorkouts: newWorkouts, workoutLevel: newLevel })
    dirtyVersion.current += 1
    setIsDirty(false)
    pendingWorkout.current = null
  }

  const adjustCardio = (delta: number) => {
    rolloverIfNeeded()
    commit({ cardioMinutes: Math.min(CARDIO_MAX_MINUTES, Math.max(0, live.current.cardioMinutes + delta)) })
    markDirty()
  }
  const adjustWorkoutLevel = (delta: number) => {
    rolloverIfNeeded()
    commit({ workoutLevel: Math.min(100, Math.max(0, live.current.workoutLevel + delta)) })
    markDirty()
  }

  /** Removes a logged entry (and its level boost), then saves. Returns whether the save succeeded. */
  const removeWorkout = async (idx: number): Promise<boolean> => {
    if (!prepareWrite()) return false
    const cur = live.current.todayWorkouts
    if (idx < 0 || idx >= cur.length) return false
    const updated = cur.filter((_, i) => i !== idx)
    commit({
      todayWorkouts: updated,
      workoutLevel: Math.max(0, live.current.workoutLevel - WORKOUT_LEVEL_LOG_BOOST),
    })
    const version = markDirty()
    const ok = await persistDay(version)
    const u = userRef.current
    if (ok && u) await replaceDayEntries(u.id, loadedDate.current, live.current.todayWorkouts)
    return ok
  }

  /** Replaces a logged entry, then saves. Returns whether the save succeeded. */
  const updateWorkoutEntryAndSave = async (idx: number, entry: WorkoutEntry): Promise<boolean> => {
    if (!prepareWrite()) return false
    const cur = live.current.todayWorkouts
    if (idx < 0 || idx >= cur.length) return false
    commit({ todayWorkouts: cur.map((w, i) => i === idx ? entry : w) })
    const version = markDirty()
    const ok = await persistDay(version)
    const u = userRef.current
    if (ok && u) await replaceDayEntries(u.id, loadedDate.current, live.current.todayWorkouts)
    return ok
  }

  return {
    workoutLevel, energyLevel, cardioMinutes, weeklyCardioMinutes,
    steps, stepsStatus, refreshSteps,
    fitbitCardioMinutes, fitbitCardioStatus,
    cardioTarget: settings.cardioTarget,
    uploadedImage, selectedExercise, setSelectedExercise,
    trackingMode, setTrackingMode,
    energyRating, setEnergyRating,
    sets, todayWorkouts,
    unit, setUnit,
    showExerciseSelection, setShowExerciseSelection,
    scheduledTime, setScheduledTime,
    scheduledCategories, toggleScheduledCategory,
    plannedCategory,
    loaded, isDirty, save, historicalLogs, celebration,
    saveError, clearSaveError: () => setSaveError(null),
    simulateScreenshot, dismissScreenshot,
    addSet, removeSet, updateSet, discardExercise,
    logWorkout, logRestDay, restDayLogged, logWorkoutDirect, logWorkoutBatch, syncFromChat,
    adjustCardio, adjustWorkoutLevel,
    removeWorkout, updateWorkoutEntryAndSave,
  }
}
