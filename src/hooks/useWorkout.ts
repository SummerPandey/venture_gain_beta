import { useState, useEffect, useRef, useMemo } from 'react'
import type { WorkoutEntry, WorkoutSet, TrackingMode, WeightUnit } from '@/types'
import { CARDIO_MAX_MINUTES, WORKOUT_LEVEL_LOG_BOOST } from '@/constants'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUserSettings } from '@/contexts/UserSettingsContext'

const WORKOUT_DRAFT_KEY = 'venturegain:workoutDraft'

interface WorkoutDraft {
  date: string
  selectedExercise: string | null
  trackingMode: TrackingMode
  energyRating: number
  sets: WorkoutSet[]
  unit: WeightUnit
}

/** Reads the in-progress (not-yet-logged) exercise draft, so backgrounding the
 *  PWA — which iOS/Android can reclaim mid-session, wiping React state — doesn't
 *  lose reps/weight the user already typed. Ignored once the calendar day rolls over. */
function readWorkoutDraft(): WorkoutDraft | null {
  try {
    const raw = localStorage.getItem(WORKOUT_DRAFT_KEY)
    if (!raw) return null
    const draft = JSON.parse(raw) as WorkoutDraft
    return draft.date === getToday() ? draft : null
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

async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: getToday(), ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) throw error
}

async function insertWorkoutEntry(userId: string, entry: WorkoutEntry) {
  const { error } = await supabase.from('workout_entries').insert({
    user_id: userId,
    log_date: getToday(),
    exercise: entry.exercise,
    category: entry.category ?? null,
    type: entry.type,
    energy_rating: entry.energyRating ?? null,
    sets: entry.sets ?? null,
  })
  if (error) console.error('[workout_entries] insert failed:', error)
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

export function useWorkout() {
  const { user } = useAuth()
  const { settings, setDefaultWeightUnit } = useUserSettings()
  const [workoutLevel, setWorkoutLevel] = useState(0)
  const [energyLevel, setEnergyLevel] = useState(0)
  const [cardioMinutes, setCardioMinutes] = useState(0)
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
  // Skipped when a restored draft already picked a unit, so settings loading in
  // async after mount can't clobber the in-progress exercise's unit choice.
  useEffect(() => {
    if (initialDraft?.selectedExercise) return
    setUnitState(settings.defaultWeightUnit)
  }, [settings.defaultWeightUnit, initialDraft])
  /** Changing the unit while logging also remembers it as the new default for next time. */
  const setUnit = (u: WeightUnit) => {
    setUnitState(u)
    setDefaultWeightUnit(u)
  }
  const [showExerciseSelection, setShowExerciseSelection] = useState(false)
  const [scheduledTime, setScheduledTimeState] = useState<string | null>(null)
  const [scheduledCategories, setScheduledCategoriesState] = useState<string[]>([])
  // Latest plan values for saving — avoids stale closures when time and
  // categories are changed in quick succession (each save writes both columns)
  const planRef = useRef<{ time: string | null; categories: string[] }>({ time: null, categories: [] })
  const [loaded, setLoaded] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [historicalLogs, setHistoricalLogs] = useState<DayLog[]>([])

  const [celebration, setCelebration] = useState<string | null>(null)
  const prevCardio = useRef(0)
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])
  const pendingWorkout = useRef<Record<string, unknown> | null>(null)
  // Date this hook's data was loaded for — used to detect a midnight rollover
  // while the PWA stays resident in memory (it never remounts on reopen).
  const loadedDate = useRef<string>('')

  const weeklyCardioMinutes = useMemo(() => {
    const weekStart = getWeekStart()
    return historicalLogs
      .filter(d => d.date >= weekStart)
      .reduce((sum, d) => sum + d.cardioMinutes, 0)
  }, [historicalLogs])

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Load today's data + last 90 days of history
  const loadAll = (userId: string) => {
    setIsDirty(false)
    loadedDate.current = getToday()

    const since = new Date()
    since.setDate(since.getDate() - 89)
    const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
    const today = getToday()

    supabase
      .from('daily_logs')
      .select('log_date, workout_level, energy_level_workout, cardio_minutes, today_workouts, workout_planned_categories')
      .eq('user_id', userId)
      .gte('log_date', sinceStr)
      .order('log_date', { ascending: true })
      .then(({ data }) => {
        if (data) {
          const byDate = new Map<string, typeof data[0]>()
          data.forEach(row => byDate.set(row.log_date, row))
          const deduped = Array.from(byDate.values())

          const logs: DayLog[] = deduped.map(row => ({
            date: row.log_date,
            dayLabel: DAY_LABELS[new Date(row.log_date + 'T12:00:00').getDay()],
            workoutLevel: Number(row.workout_level) || 0,
            energyLevel: Number(row.energy_level_workout) || 0,
            cardioMinutes: Number(row.cardio_minutes) || 0,
            workouts: row.today_workouts ?? [],
            plannedCategories: Array.isArray(row.workout_planned_categories) ? row.workout_planned_categories : [],
          }))
          setHistoricalLogs(logs)

          const todayRow = byDate.get(today)
          if (todayRow) {
            const workouts = todayRow.today_workouts ?? []
            const cardio = Number(todayRow.cardio_minutes) || 0
            setWorkoutLevel(Number(todayRow.workout_level) || 0)
            setEnergyLevel(Number(todayRow.energy_level_workout) || 0)
            setCardioMinutes(cardio)
            setTodayWorkouts(workouts)
          } else {
            setWorkoutLevel(0)
            setEnergyLevel(0)
            setCardioMinutes(0)
            setTodayWorkouts([])
          }
        }
        setLoaded(true)
      })
  }

  useEffect(() => {
    if (!user) { setLoaded(true); return }
    loadAll(user.id)
  }, [user])

  const flushPendingWorkout = () => {
    if (pendingWorkout.current && userRef.current) {
      upsertDay(userRef.current.id, pendingWorkout.current)
      pendingWorkout.current = null
    }
  }

  // Reload when the app returns to the foreground on a new calendar day, so the
  // previous day's workout/cardio don't carry over into today.
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
      if (getToday() !== loadedDate.current) loadAll(u.id)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', onVisibilityChange)
    window.addEventListener('pagehide', flushPendingWorkout)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', onVisibilityChange)
      window.removeEventListener('pagehide', flushPendingWorkout)
    }
  }, [])

  // Load today's plan — separate query so a missing column can't break the main load
  useEffect(() => {
    if (!user) return
    supabase
      .from('daily_logs')
      .select('workout_planned_time, workout_planned_categories')
      .eq('user_id', user.id)
      .eq('log_date', getToday())
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return
        const time = data.workout_planned_time ?? null
        const categories = Array.isArray(data.workout_planned_categories) ? data.workout_planned_categories : []
        planRef.current = { time, categories }
        if (time) setScheduledTimeState(time)
        if (categories.length > 0) setScheduledCategoriesState(categories)
      })
  }, [user])

  const savePlan = () => {
    if (!userRef.current) return
    const { time, categories } = planRef.current
    supabase.from('daily_logs').upsert(
      { user_id: userRef.current.id, log_date: getToday(), workout_planned_time: time, workout_planned_categories: categories, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    ).then(({ error }) => { if (error) console.error('[workout] plan save failed:', error) })
  }

  const setScheduledTime = (t: string | null) => {
    planRef.current = { ...planRef.current, time: t }
    setScheduledTimeState(t)
    savePlan()
  }

  const toggleScheduledCategory = (c: string) => {
    const cur = planRef.current.categories
    const next = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c]
    planRef.current = { ...planRef.current, categories: next }
    setScheduledCategoriesState(next)
    savePlan()
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
  }, [loaded, workoutLevel, energyLevel, cardioMinutes, todayWorkouts, scheduledCategories])

  useEffect(() => { healthSnapshot.workoutLevel = workoutLevel }, [workoutLevel])
  useEffect(() => { healthSnapshot.energyLevel = energyLevel }, [energyLevel])

  // Mirror the in-progress (not-yet-logged) exercise to localStorage so it survives
  // the PWA getting backgrounded and reclaimed mid-session — see readWorkoutDraft().
  useEffect(() => {
    if (!selectedExercise) {
      try { localStorage.removeItem(WORKOUT_DRAFT_KEY) } catch { /* private mode etc — draft persistence is best-effort */ }
      return
    }
    const draft: WorkoutDraft = { date: getToday(), selectedExercise, trackingMode, energyRating, sets, unit }
    try { localStorage.setItem(WORKOUT_DRAFT_KEY, JSON.stringify(draft)) } catch { /* private mode etc — draft persistence is best-effort */ }
  }, [selectedExercise, trackingMode, energyRating, sets, unit])

  // Auto-save 2s after last dirty change
  useEffect(() => {
    if (!loaded || !user || !isDirty) return
    const fields = {
      workout_level: workoutLevel,
      energy_level_workout: energyLevel,
      cardio_minutes: cardioMinutes,
      today_workouts: todayWorkouts,
    }
    pendingWorkout.current = fields
    const id = setTimeout(async () => {
      try {
        await upsertDay(user.id, fields)
        pendingWorkout.current = null
        setIsDirty(false)
      } catch (e) {
        console.error('Workout auto-save failed:', e)
      }
    }, 2000)
    return () => clearTimeout(id)
  }, [workoutLevel, energyLevel, cardioMinutes, todayWorkouts, loaded, user, isDirty])

  // Last-resort flush on a genuine unmount (e.g. sign-out) — the visibilitychange/
  // pagehide handlers above cover the normal backgrounding case, since this
  // provider otherwise stays mounted for the life of the session.
  useEffect(() => {
    return () => {
      flushPendingWorkout()
    }
  }, [])

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2500)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    const prev = prevCardio.current
    prevCardio.current = weeklyCardioMinutes
    if (prev < settings.cardioTarget && weeklyCardioMinutes >= settings.cardioTarget) {
      setCelebration('CARDIO TARGET CRUSHED')
    }
  }, [weeklyCardioMinutes, settings.cardioTarget])

  const save = async () => {
    if (!user) return
    try {
      await upsertDay(user.id, {
        workout_level: workoutLevel,
        energy_level_workout: energyLevel,
        cardio_minutes: cardioMinutes,
        today_workouts: todayWorkouts,
      })
      setIsDirty(false)
    } catch (e) {
      console.error('Workout save failed:', e)
    }
  }

  const simulateScreenshot = () => setUploadedImage('screenshot-placeholder')
  const dismissScreenshot = () => setUploadedImage(null)

  const addSet = () => setSets(prev => [...prev, { reps: 0, weight: 0 }])
  const updateSet = (index: number, field: keyof WorkoutSet, value: number) =>
    setSets(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))

  const logWorkout = (category?: string) => {
    if (!selectedExercise) return
    const resolvedCategory = category ?? plannedCategory
    const entry: WorkoutEntry = {
      exercise: selectedExercise,
      type: trackingMode,
      time: new Date().toLocaleTimeString(),
      ...(trackingMode === 'energy' ? { energyRating } : { sets, unit }),
      ...(resolvedCategory ? { category: resolvedCategory } : {}),
    }
    setTodayWorkouts(prev => [...prev, entry])
    setWorkoutLevel(prev => Math.min(100, prev + WORKOUT_LEVEL_LOG_BOOST))
    setSelectedExercise(null)
    setSets([{ reps: 0, weight: 0 }])
    setEnergyRating(3)
    setIsDirty(true)
    if (userRef.current) insertWorkoutEntry(userRef.current.id, entry)
  }

  /** Log a Rest Day entry without needing a selected exercise */
  const logRestDay = async () => {
    const entry: WorkoutEntry = {
      exercise: 'Rest Day',
      type: 'energy',
      time: new Date().toLocaleTimeString(),
      energyRating: 3,
      category: 'Rest Day',
    }
    const newWorkouts = [...todayWorkouts, entry]
    const newLevel = Math.min(100, workoutLevel + WORKOUT_LEVEL_LOG_BOOST)
    setTodayWorkouts(newWorkouts)
    setWorkoutLevel(newLevel)
    setIsDirty(true)
    if (user) {
      await Promise.all([
        upsertDay(user.id, {
          workout_level: newLevel,
          energy_level_workout: energyLevel,
          cardio_minutes: cardioMinutes,
          today_workouts: newWorkouts,
        }),
        insertWorkoutEntry(user.id, entry),
      ])
      setIsDirty(false)
    }
  }

  const logWorkoutDirect = async (rawEntry: WorkoutEntry) => {
    const entry: WorkoutEntry = rawEntry.category || !plannedCategory
      ? rawEntry
      : { ...rawEntry, category: plannedCategory }
    const newWorkouts = [...todayWorkouts, entry]
    const newLevel = Math.min(100, workoutLevel + WORKOUT_LEVEL_LOG_BOOST)
    setTodayWorkouts(newWorkouts)
    setWorkoutLevel(newLevel)
    setIsDirty(true)
    if (user) {
      await Promise.all([
        upsertDay(user.id, {
          workout_level: newLevel,
          energy_level_workout: energyLevel,
          cardio_minutes: cardioMinutes,
          today_workouts: newWorkouts,
        }),
        insertWorkoutEntry(user.id, entry),
      ])
      setIsDirty(false)
    }
  }

  /** Called after external chat-based saves to sync context state without hitting DB again */
  const syncFromChat = (newWorkouts: WorkoutEntry[], newLevel: number) => {
    setTodayWorkouts(newWorkouts)
    setWorkoutLevel(newLevel)
    setIsDirty(false)
  }

  const adjustCardio = (delta: number) => {
    setIsDirty(true)
    setCardioMinutes(prev => Math.min(CARDIO_MAX_MINUTES, Math.max(0, prev + delta)))
  }
  const adjustWorkoutLevel = (delta: number) => {
    setIsDirty(true)
    setWorkoutLevel(prev => Math.min(100, Math.max(0, prev + delta)))
  }
  const removeWorkout = async (idx: number) => {
    const updated = todayWorkouts.filter((_, i) => i !== idx)
    setTodayWorkouts(updated)
    setIsDirty(false)
    if (user) {
      try {
        await upsertDay(user.id, {
          workout_level: workoutLevel,
          energy_level_workout: energyLevel,
          cardio_minutes: cardioMinutes,
          today_workouts: updated,
        })
      } catch (e) {
        console.error('removeWorkout save failed:', e)
        setIsDirty(true)
      }
    }
  }

  const updateWorkoutEntryAndSave = async (idx: number, entry: WorkoutEntry) => {
    const newWorkouts = todayWorkouts.map((w, i) => i === idx ? entry : w)
    setTodayWorkouts(newWorkouts)
    setIsDirty(false)
    if (user) {
      try {
        await upsertDay(user.id, {
          workout_level: workoutLevel,
          energy_level_workout: energyLevel,
          cardio_minutes: cardioMinutes,
          today_workouts: newWorkouts,
        })
      } catch (e) {
        console.error('updateWorkoutEntryAndSave failed:', e)
        setIsDirty(true)
      }
    }
  }

  return {
    workoutLevel, energyLevel, cardioMinutes, weeklyCardioMinutes,
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
    simulateScreenshot, dismissScreenshot,
    addSet, updateSet,
    logWorkout, logRestDay, logWorkoutDirect, syncFromChat,
    adjustCardio, adjustWorkoutLevel,
    removeWorkout, updateWorkoutEntryAndSave,
  }
}
