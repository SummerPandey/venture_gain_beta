import { useState, useEffect, useRef, useMemo } from 'react'
import type { WorkoutEntry, WorkoutSet, TrackingMode } from '@/types'
import { CARDIO_MAX_MINUTES, CARDIO_TARGET_MINUTES, WORKOUT_LEVEL_SCREENSHOT_BOOST, ENERGY_LEVEL_SCREENSHOT_DRAIN, WORKOUT_LEVEL_LOG_BOOST } from '@/constants'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, TODAY } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const WORKOUT_LS_KEY = `workout_${TODAY}`

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()                          // 0=Sun … 6=Sat
  const diff = day === 6 ? 0 : -(day + 1)        // roll back to Saturday
  const sat = new Date(d)
  sat.setDate(d.getDate() + diff)
  return sat.toISOString().split('T')[0]
}

function lsWorkoutLoad(): { workoutLevel: number; energyLevel: number; cardioMinutes: number; todayWorkouts: WorkoutEntry[] } {
  try { return JSON.parse(localStorage.getItem(WORKOUT_LS_KEY) ?? 'null') ?? { workoutLevel: 0, energyLevel: 0, cardioMinutes: 0, todayWorkouts: [] } } catch { return { workoutLevel: 0, energyLevel: 0, cardioMinutes: 0, todayWorkouts: [] } }
}
function lsWorkoutSave(workoutLevel: number, energyLevel: number, cardioMinutes: number, todayWorkouts: WorkoutEntry[]) {
  try { localStorage.setItem(WORKOUT_LS_KEY, JSON.stringify({ workoutLevel, energyLevel, cardioMinutes, todayWorkouts })) } catch {}
}

async function upsertDay(userId: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { user_id: userId, log_date: TODAY, ...fields, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,log_date' }
    )
  if (error) throw error
}

export interface DayLog {
  date: string
  dayLabel: string
  workoutLevel: number
  energyLevel: number
  cardioMinutes: number
  workouts: WorkoutEntry[]
}

export function useWorkout() {
  const { user } = useAuth()
  const lsCached = lsWorkoutLoad()
  const [workoutLevel, setWorkoutLevel] = useState(lsCached.workoutLevel)
  const [energyLevel, setEnergyLevel] = useState(lsCached.energyLevel)
  const [cardioMinutes, setCardioMinutes] = useState(lsCached.cardioMinutes)
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutEntry[]>(lsCached.todayWorkouts)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [trackingMode, setTrackingMode] = useState<TrackingMode>('energy')
  const [energyRating, setEnergyRating] = useState(3)
  const [sets, setSets] = useState<WorkoutSet[]>([{ reps: 0, weight: 0 }])
  const [viewingTodayWorkouts, setViewingTodayWorkouts] = useState(false)
  const [showExerciseSelection, setShowExerciseSelection] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [historicalLogs, setHistoricalLogs] = useState<DayLog[]>([])

  const [celebration, setCelebration] = useState<string | null>(null)
  const prevCardio = useRef(0)

  // Sum cardio for the current week (Sat→Fri) from historicalLogs
  // historicalLogs already keeps today in sync via the live-state effect
  const weeklyCardioMinutes = useMemo(() => {
    const weekStart = getWeekStart()
    return historicalLogs
      .filter(d => d.date >= weekStart)
      .reduce((sum, d) => sum + d.cardioMinutes, 0)
  }, [historicalLogs])

  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Load today's data + last 14 days of history on mount
  useEffect(() => {
    if (!user) { setLoaded(true); return }

    const since = new Date()
    since.setDate(since.getDate() - 13)
    const sinceStr = since.toISOString().split('T')[0]

    supabase
      .from('daily_logs')
      .select('log_date, workout_level, energy_level_workout, cardio_minutes, today_workouts')
      .eq('user_id', user.id)
      .gte('log_date', sinceStr)
      .order('log_date', { ascending: true })
      .then(({ data }) => {
        if (data) {
          // Deduplicate by date — keep last row per date (most recently inserted)
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
          }))
          setHistoricalLogs(logs)

          const todayRow = byDate.get(TODAY)
          if (todayRow) {
            setWorkoutLevel(Number(todayRow.workout_level) || 0)
            setEnergyLevel(Number(todayRow.energy_level_workout) || 0)
            setCardioMinutes(Number(todayRow.cardio_minutes) || 0)
            setTodayWorkouts(todayRow.today_workouts ?? [])
          }
        }
        setLoaded(true)
      })
  }, [user])

  // Keep today's entry in historicalLogs in sync with live state
  useEffect(() => {
    if (!loaded) return
    setHistoricalLogs(prev => {
      const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const todayEntry: DayLog = {
        date: TODAY,
        dayLabel: DAY_LABELS[new Date(TODAY + 'T12:00:00').getDay()],
        workoutLevel,
        energyLevel,
        cardioMinutes,
        workouts: todayWorkouts,
      }
      const without = prev.filter(d => d.date !== TODAY)
      return [...without, todayEntry].sort((a, b) => a.date.localeCompare(b.date))
    })
  }, [loaded, workoutLevel, energyLevel, cardioMinutes, todayWorkouts])

  useEffect(() => { healthSnapshot.workoutLevel = workoutLevel }, [workoutLevel])
  useEffect(() => { healthSnapshot.energyLevel = energyLevel }, [energyLevel])

  // Persist to localStorage on every change
  useEffect(() => {
    lsWorkoutSave(workoutLevel, energyLevel, cardioMinutes, todayWorkouts)
  }, [workoutLevel, energyLevel, cardioMinutes, todayWorkouts])

  // Auto-save to Supabase 2s after last dirty change
  useEffect(() => {
    if (!loaded || !user || !isDirty) return
    const id = setTimeout(async () => {
      try {
        await upsertDay(user.id, {
          workout_level: workoutLevel,
          energy_level_workout: energyLevel,
          cardio_minutes: cardioMinutes,
          today_workouts: todayWorkouts,
        })
        setIsDirty(false)
      } catch (e) {
        console.error('Workout auto-save failed:', e)
      }
    }, 2000)
    return () => clearTimeout(id)
  }, [workoutLevel, energyLevel, cardioMinutes, todayWorkouts, loaded, user, isDirty])

  useEffect(() => {
    if (!celebration) return
    const t = setTimeout(() => setCelebration(null), 2500)
    return () => clearTimeout(t)
  }, [celebration])

  useEffect(() => {
    const prev = prevCardio.current
    prevCardio.current = weeklyCardioMinutes
    if (prev < CARDIO_TARGET_MINUTES && weeklyCardioMinutes >= CARDIO_TARGET_MINUTES) {
      setCelebration('CARDIO TARGET CRUSHED')
    }
  }, [weeklyCardioMinutes])

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

  const approveScreenshot = (workoutBoost: number, cardioBoost: number) => {
    setWorkoutLevel(prev => Math.min(100, prev + workoutBoost))
    setCardioMinutes(prev => Math.min(CARDIO_MAX_MINUTES, prev + cardioBoost))
    setUploadedImage(null)
  }

  const dismissScreenshot = () => setUploadedImage(null)

  const addSet = () => setSets(prev => [...prev, { reps: 0, weight: 0 }])
  const removeSet = (index: number) => setSets(prev => prev.filter((_, i) => i !== index))
  const updateSet = (index: number, field: keyof WorkoutSet, value: number) =>
    setSets(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))

  const logWorkout = (category?: string) => {
    if (!selectedExercise) return
    const entry: WorkoutEntry = {
      exercise: selectedExercise,
      type: trackingMode,
      time: new Date().toLocaleTimeString(),
      ...(trackingMode === 'energy' ? { energyRating } : { sets }),
      ...(category ? { category } : {}),
    }
    setTodayWorkouts(prev => [...prev, entry])
    setWorkoutLevel(prev => Math.min(100, prev + WORKOUT_LEVEL_LOG_BOOST))
    setSelectedExercise(null)
    setSets([{ reps: 0, weight: 0 }])
    setEnergyRating(3)
    setIsDirty(true)
  }

  const logWorkoutDirect = async (entry: WorkoutEntry) => {
    const newWorkouts = [...todayWorkouts, entry]
    const newLevel = Math.min(100, workoutLevel + WORKOUT_LEVEL_LOG_BOOST)
    setTodayWorkouts(newWorkouts)
    setWorkoutLevel(newLevel)
    setIsDirty(true)
    if (user) {
      await upsertDay(user.id, {
        workout_level: newLevel,
        energy_level_workout: energyLevel,
        cardio_minutes: cardioMinutes,
        today_workouts: newWorkouts,
      })
      setIsDirty(false)
    }
  }

  const adjustCardio = (delta: number) => {
    setIsDirty(true)
    setCardioMinutes(prev => Math.min(CARDIO_MAX_MINUTES, Math.max(0, prev + delta)))
  }

  const adjustWorkoutLevel = (delta: number) => {
    setIsDirty(true)
    setWorkoutLevel(prev => Math.min(100, Math.max(0, prev + delta)))
  }

  const adjustEnergyLevel = (delta: number) => {
    setIsDirty(true)
    setEnergyLevel(prev => Math.min(100, Math.max(0, prev + delta)))
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

  const updateWorkoutEntry = (idx: number, entry: WorkoutEntry) => {
    const updated = todayWorkouts.map((w, i) => i === idx ? entry : w)
    setTodayWorkouts(updated)
    setIsDirty(true)
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
    uploadedImage, selectedExercise, setSelectedExercise,
    trackingMode, setTrackingMode,
    energyRating, setEnergyRating,
    sets, todayWorkouts,
    viewingTodayWorkouts, setViewingTodayWorkouts,
    showExerciseSelection, setShowExerciseSelection,
    loaded,
    isDirty,
    save,
    historicalLogs,
    celebration,
    simulateScreenshot, approveScreenshot, dismissScreenshot,
    addSet, removeSet, updateSet,
    logWorkout, logWorkoutDirect, adjustCardio, adjustWorkoutLevel, adjustEnergyLevel,
    removeWorkout, updateWorkoutEntry, updateWorkoutEntryAndSave,
  }
}
