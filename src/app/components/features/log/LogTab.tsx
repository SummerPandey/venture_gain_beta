import { useState, useRef, useEffect, useMemo, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Dumbbell, Droplet, Moon, Zap, MessageCircle, Send } from 'lucide-react'
import { RadarChart, PolarGrid, Radar } from 'recharts'
import { useLog } from '@/hooks'
import type { LogCategory, LogPeriod } from '@/types'
import { groqChat, groqText, parseAIJson, AIRequestError } from '@/lib/groq'
import { healthSnapshot } from '@/store/healthSnapshot'
import { supabase, getToday } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useHealthData } from '@/contexts/HealthDataContext'
import { WORKOUT_LEVEL_LOG_BOOST } from '@/constants'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const LOG_CATEGORIES: { id: LogCategory; label: string; icon: typeof Dumbbell }[] = [
  { id: 'workouts', label: 'WORKOUTS', icon: Dumbbell },
  { id: 'hydration', label: 'HYDRATION', icon: Droplet },
  { id: 'sleep', label: 'SLEEP', icon: Moon },
  { id: 'energy', label: 'ENERGY', icon: Zap },
]

const LOG_PERIODS: LogPeriod[] = ['daily', 'weekly', 'monthly']


type DayEntry = {
  workouts: Array<{ exercise: string; sets?: Array<{ reps: number; weight: number }>; energyRating?: number; type?: string }>
  sleep: number
  energy: number
  water: number
  calories: number
  protein: number
  sugar: number
  workoutLevel: number
  energyWorkout: number
  plannedTime?: string | null
  plannedCategories?: string[]
}

// Editable day-modal fields. `max` matches the input's max attribute and is
// also enforced on save (typing bypasses min/max on number inputs).
const STAT_FIELDS = [
  { key: 'sleep'    as const, label: 'SLEEP',    color: '#9B7FC8', fmt: (v: number) => `${v}h`,              unit: 'h',    step: '0.5', max: 24   },
  { key: 'energy'   as const, label: 'ENERGY',   color: '#FFB84D', fmt: (v: number) => `${v}/10`,            unit: '/10',  step: '1',   max: 10   },
  { key: 'water'    as const, label: 'WATER',    color: '#7BAFD4', fmt: (v: number) => `${v}L`,              unit: 'L',    step: '0.1', max: 10   },
  { key: 'calories' as const, label: 'CALORIES', color: '#E8956A', fmt: (v: number) => `${Math.round(v)} kcal`, unit: 'kcal', step: '50',  max: 9999 },
  { key: 'protein'  as const, label: 'PROTEIN',  color: '#C4A45A', fmt: (v: number) => `${Math.round(v)}g`,  unit: 'g',    step: '1',   max: 999, over: false },
  { key: 'sugar'    as const, label: 'SUGAR',    color: '#C4809A', fmt: (v: number) => `${Math.round(v)}g`,  unit: 'g',    step: '1',   max: 999, over: true  },
]
type StatKey = typeof STAT_FIELDS[number]['key']

/** Finite number or undefined — for values typed by the user or returned by the AI. */
const toNum = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
const clampTo = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

type AIExercise = { exercise: string; type: 'weights' | 'energy'; sets?: Array<{ reps: number; weight: number }>; energyRating?: number }

/** Validate exercises from the intent parser: the model can return strings,
 *  objects or "3x10" where numbers are expected, which would otherwise be
 *  persisted and crash the day modal on render. Invalid entries are dropped. */
function sanitizeExercises(raw: unknown): AIExercise[] {
  if (!Array.isArray(raw)) return []
  const out: AIExercise[] = []
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const name = typeof r.exercise === 'string' ? r.exercise.trim().slice(0, 60) : ''
    if (!name) continue
    const sets = Array.isArray(r.sets)
      ? r.sets.flatMap(s => {
          const reps = toNum((s as Record<string, unknown> | null)?.reps)
          const weight = toNum((s as Record<string, unknown> | null)?.weight) ?? 0
          return reps !== undefined && reps >= 0 && reps <= 1000 && weight >= 0 && weight <= 1000
            ? [{ reps: Math.round(reps), weight }] : []
        })
      : []
    if (sets.length > 0) out.push({ exercise: name, type: 'weights', sets })
    else {
      const rating = toNum(r.energyRating)
      out.push({ exercise: name, type: 'energy', energyRating: rating !== undefined ? clampTo(Math.round(rating), 1, 5) : 3 })
    }
  }
  return out
}

/** Enter/Space activation for non-button elements with role="button". */
const onActivateKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
}

const MODAL_BTN = { minHeight: '40px', borderRadius: '10px', border: '2px solid #8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 3px 0 rgba(139,90,62,0.25)' } as const
const CLOSE_BTN = { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '20px', fontWeight: '700', lineHeight: '1', width: '40px', height: '40px' } as const

const BTN_ACTIVE = { background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#6B4423', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const
const BTN_INACTIVE = { background: 'rgba(255, 252, 248, 0.95)', borderRadius: '10px', border: '2px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' } as const

function MiniRadar({ data }: { data: DayEntry }) {
  const radarData = [
    { stat: 'F', value: Math.min(100, Math.round(data.calories / 2500 * 100)) },
    { stat: 'W', value: Math.min(100, Math.round((data.water / 3) * 100)) },
    { stat: 'S', value: Math.min(100, Math.round((data.sleep / 9) * 100)) },
    { stat: 'WO', value: data.workouts.length > 0 ? Math.min(100, data.workoutLevel) : 0 },
    { stat: 'E', value: Math.min(100, data.energy * 10) },
  ]
  return (
    <RadarChart width={52} height={52} data={radarData} style={{ flexShrink: 0 }}>
      <PolarGrid stroke="rgba(139, 90, 62, 0.25)" strokeWidth={0.8} />
      <Radar dataKey="value" fill="#FF9F66" fillOpacity={0.55} stroke="#FF9F66" strokeWidth={1.2} dot={false} />
    </RadarChart>
  )
}

export function LogTab({ isActive }: { isActive?: boolean }) {
  const { user } = useAuth()
  const {
    currentMonth, currentYear, selectedDay, setSelectedDay,
    expandedWeek, setExpandedWeek,
    activeView, setActiveView,
    selectedCategory, setSelectedCategory,
    selectedPeriod, setSelectedPeriod,
    showChat, setShowChat,
    showInsights, setShowInsights,
    chatMessages, chatInput,
    getDayName, getWeeks,
    goToPrevMonth, goToNextMonth,
  } = useLog()

  const [monthData, setMonthData] = useState<Record<number, DayEntry>>({})
  const [exerciseDetails, setExerciseDetails] = useState<Record<string, string>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Live data from other tabs — always up to date in memory
  const { workout: workoutCtx, nutrition: nutritionCtx, sleep: sleepCtx } = useHealthData()
  const { workoutLevel, energyLevel: workoutEnergy, todayWorkouts, syncFromChat, plannedCategory } = workoutCtx
  const { state: liveNutrition, adjustCalories, adjustWater, adjustProtein, adjustSugar } = nutritionCtx
  const { state: liveSleep, totalSleepHours, setSleepHours, setSleepMinutes, setEnergy } = sleepCtx

  // Local date string; refreshed on focus/visibility and once a minute so
  // "today" rolls over at midnight while the app stays open.
  const [todayStr, setTodayStr] = useState(getToday)
  useEffect(() => {
    const refresh = () => setTodayStr(getToday())
    const id = setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  // monthData is keyed by day-of-month only, so async callbacks check this ref
  // to make sure the month they fetched/saved is still the one on screen.
  const monthKey = `${currentYear}-${currentMonth}`
  const monthKeyRef = useRef(monthKey)
  monthKeyRef.current = monthKey
  const loadedMonthKeyRef = useRef<string | null>(null)
  const fetchSeqRef = useRef(0)

  // Keep today's log entry in sync with live context (no debounce, instant)
  useEffect(() => {
    const today = new Date()
    if (currentMonth !== today.getMonth() || currentYear !== today.getFullYear()) return
    const todayDay = today.getDate()
    const hasSomeData = todayWorkouts.length > 0 || workoutLevel > 0 ||
      liveNutrition.waterLiters > 0 || liveNutrition.calories > 0 ||
      liveNutrition.proteinGrams > 0 || liveNutrition.sugarGrams > 0 ||
      totalSleepHours > 0 || liveSleep.energyLevel > 0
    if (!hasSomeData) return
    setMonthData(prev => ({
      ...prev,
      [todayDay]: {
        workouts: todayWorkouts,
        sleep: parseFloat(totalSleepHours.toFixed(1)),
        energy: liveSleep.energyLevel,
        water: liveNutrition.waterLiters,
        calories: liveNutrition.calories,
        protein: liveNutrition.proteinGrams,
        sugar: liveNutrition.sugarGrams,
        workoutLevel,
        energyWorkout: workoutEnergy,
        plannedTime: prev[todayDay]?.plannedTime ?? null,
        plannedCategories: prev[todayDay]?.plannedCategories ?? [],
      },
    }))
  }, [todayWorkouts, workoutLevel, workoutEnergy, liveNutrition.waterLiters, liveNutrition.calories,
    liveNutrition.proteinGrams, liveNutrition.sugarGrams, totalSleepHours, liveSleep.energyLevel,
    currentMonth, currentYear, todayStr])

  const fetchExerciseDetail = async (exercise: string) => {
    if (exerciseDetails[exercise]) { setOpenDetail(openDetail === exercise ? null : exercise); return }
    if (loadingDetail === exercise) return
    if (openDetail === exercise && detailError !== exercise) { setOpenDetail(null); return }
    setOpenDetail(exercise)
    setDetailError(null)
    setLoadingDetail(exercise)
    try {
      const info = await groqText(
        `Give brief info for the exercise "${exercise}" in exactly this compact format (no extra text):
Muscles: <2-3 primary muscles>
Tip: <one key form cue, max 10 words>
Level: <Beginner / Intermediate / Advanced>`,
        'You are a concise fitness coach.'
      )
      if (!info.trim()) throw new Error('empty exercise detail')
      setExerciseDetails(prev => ({ ...prev, [exercise]: info.trim() }))
    } catch {
      // Not cached — tapping info again retries.
      setDetailError(exercise)
    } finally {
      setLoadingDetail(null)
    }
  }

  // Fetch real logs for the displayed month — re-runs every time the Log tab is opened
  const fetchMonthData = () => {
    if (!user) return
    const mm = String(currentMonth + 1).padStart(2, '0')
    const start = `${currentYear}-${mm}-01`
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate()
    const end = `${currentYear}-${mm}-${String(lastDay).padStart(2, '0')}`
    // Note: workout_planned_time/workout_planned_categories are fetched separately
    // in openDayModal to avoid breaking this query if those columns don't exist yet.
    const key = `${currentYear}-${currentMonth}`
    const seq = ++fetchSeqRef.current
    supabase
      .from('daily_logs')
      .select('log_date, today_workouts, sleep_hours, sleep_minutes, energy_level, water_liters, calories, protein_grams, sugar_grams, workout_level, energy_level_workout, cardio_minutes')
      .eq('user_id', user.id)
      .gte('log_date', start)
      .lte('log_date', end)
      .then(({ data, error }) => {
        // A newer request (month change / tab re-open) superseded this one.
        if (seq !== fetchSeqRef.current) return
        if (error || !data) {
          if (error) console.error('[LogTab] fetchMonthData error:', error.message ?? error)
          // Don't leave the previous month's entries under this month's header.
          if (loadedMonthKeyRef.current !== key) {
            const now = new Date()
            const isCurrent = currentMonth === now.getMonth() && currentYear === now.getFullYear()
            setMonthData(prev => (isCurrent && prev[now.getDate()] ? { [now.getDate()]: prev[now.getDate()] } : {}))
            loadedMonthKeyRef.current = key
          }
          return
        }
        loadedMonthKeyRef.current = key
        const map: Record<number, DayEntry> = {}
        for (const row of data) {
          const day = parseInt(row.log_date.split('-')[2])
          const workouts = row.today_workouts ?? []
          const sleep = (row.sleep_hours ?? 0) + (row.sleep_minutes ?? 0) / 60
          const hasData = workouts.length > 0 || sleep > 0 || (row.water_liters ?? 0) > 0 || (row.calories ?? 0) > 0 || (row.workout_level ?? 0) > 0 || (row.energy_level ?? 0) > 0 || (row.protein_grams ?? 0) > 0 || (row.sugar_grams ?? 0) > 0 || (row.cardio_minutes ?? 0) > 0
          if (hasData) {
            map[day] = {
              workouts,
              sleep: parseFloat((sleep).toFixed(1)),
              energy: row.energy_level ?? 0,
              water: parseFloat(row.water_liters ?? 0),
              calories: row.calories ?? 0,
              protein: row.protein_grams ?? 0,
              sugar: row.sugar_grams ?? 0,
              workoutLevel: row.workout_level ?? 0,
              energyWorkout: row.energy_level_workout ?? 0,
              plannedTime: null,
              plannedCategories: [],
            }
          }
        }
        setMonthData(prev => {
          // Merge: keep live-synced today entry on top of DB data
          const merged = { ...map }
          const todayDay = new Date().getDate()
          if (prev[todayDay] && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear()) {
            merged[todayDay] = prev[todayDay]
          }
          return merged
        })
      })
  }

  useEffect(() => {
    fetchMonthData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, currentMonth, currentYear, isActive])

  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Partial<DayEntry>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Values the edit form started from, to detect unsaved changes on close.
  const editBaselineRef = useRef<Partial<DayEntry>>({})

  const beginEdit = (values: Partial<DayEntry>) => {
    editBaselineRef.current = values
    setEditValues(values)
    setSaveError(null)
    setEditMode(true)
  }

  const openDayModal = (day: number) => {
    setSelectedDay(day)
    setSaveError(null)
    if (!monthData[day]) {
      beginEdit({ sleep: 0, energy: 0, water: 0, calories: 0, protein: 0, sugar: 0 })
    } else {
      setEditMode(false)
      setEditValues({})
    }
    // Lazily fetch planning columns — isolated so a missing column doesn't break the main fetch
    if (user) {
      const key = monthKeyRef.current
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      supabase
        .from('daily_logs')
        .select('workout_planned_time, workout_planned_categories')
        .eq('user_id', user.id)
        .eq('log_date', dateStr)
        .maybeSingle()
        .then(({ data }) => {
          // Month changed while in flight: day `day` now belongs to another month.
          if (!data || monthKeyRef.current !== key) return
          setMonthData(prev => {
            if (!prev[day]) return prev
            return {
              ...prev,
              [day]: {
                ...prev[day],
                plannedTime: data.workout_planned_time ?? null,
                plannedCategories: data.workout_planned_categories ?? [],
              },
            }
          })
        })
    }
  }

  const startEdit = () => {
    if (selectedDay === null) return
    const d = monthData[selectedDay]
    beginEdit({
      sleep: d.sleep,
      energy: d.energy,
      water: d.water,
      calories: d.calories,
      protein: d.protein,
      sugar: d.sugar,
    })
  }

  const isEditDirty = () =>
    editMode && STAT_FIELDS.some(({ key }) => (toNum(editValues[key]) ?? 0) !== (toNum(editBaselineRef.current[key]) ?? 0))

  const closeDayModal = () => {
    if (isEditDirty() && !window.confirm('Discard unsaved changes?')) return
    setSelectedDay(null)
    setEditMode(false)
    setSaveError(null)
  }

  const cancelEdit = () => {
    if (selectedDay !== null && !monthData[selectedDay]) { closeDayModal(); return }
    if (isEditDirty() && !window.confirm('Discard unsaved changes?')) return
    setEditMode(false)
    setSaveError(null)
  }

  const saveEdit = async () => {
    if (selectedDay === null || !user || saving) return
    const day = selectedDay
    const key = monthKeyRef.current
    // Clamp to the same bounds the inputs advertise — typing bypasses min/max.
    const v = Object.fromEntries(STAT_FIELDS.map(({ key: k, max }) => [k, clampTo(toNum(editValues[k]) ?? 0, 0, max)])) as Record<StatKey, number>
    const sleepHours = Math.floor(v.sleep)
    const sleepMinutes = Math.min(59, Math.round((v.sleep - sleepHours) * 60))
    setSaving(true)
    setSaveError(null)
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const { error } = await supabase.from('daily_logs').upsert({
      user_id: user.id,
      log_date: dateStr,
      sleep_hours: sleepHours,
      sleep_minutes: sleepMinutes,
      energy_level: v.energy,
      water_liters: v.water,
      calories: v.calories,
      protein_grams: v.protein,
      sugar_grams: v.sugar,
    }, { onConflict: 'user_id,log_date' })
    setSaving(false)
    if (error) {
      console.error('[LogTab] saveEdit error:', error.message ?? error)
      setSaveError("Couldn't save \u2014 check your connection and try again.")
      return
    }
    // The write went to the right date regardless; only mirror it locally if
    // that month is still the one on screen (monthData is keyed by day only).
    if (monthKeyRef.current !== key) return
    setMonthData(prev => ({
      ...prev,
      [day]: {
        ...(prev[day] ?? { workouts: [], energyWorkout: 0, workoutLevel: 0 }),
        sleep: parseFloat(v.sleep.toFixed(1)),
        energy: v.energy,
        water: v.water,
        calories: v.calories,
        protein: v.protein,
        sugar: v.sugar,
      },
    }))
    setEditMode(false)
  }

  const [localMessages, setLocalMessages] = useState(chatMessages)
  const [localInput, setLocalInput] = useState(chatInput)
  const [aiThinking, setAiThinking] = useState(false)
  const chatHistoryRef = useRef<Array<{ role: string; content: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const weeks = getWeeks()

  const avg = (vals: number[]) => vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  const clamp100 = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

  const summaryData = useMemo(() => {
    const today = new Date()
    const todayDay = today.getDate()
    const entries = Object.values(monthData)
    // Only treat a cell as "today" when the displayed month is the current one.
    const isCurrentMonth = currentMonth === today.getMonth() && currentYear === today.getFullYear()
    const todayEntry = isCurrentMonth ? monthData[todayDay] : undefined

    // Last 7 days entries (current month only)
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i)
      return (d.getMonth() === currentMonth && d.getFullYear() === currentYear) ? monthData[d.getDate()] : undefined
    }).filter(Boolean) as DayEntry[]

    const pct = {
      workouts: {
        daily: clamp100(todayEntry?.workoutLevel ?? 0),
        weekly: avg(last7.map(e => clamp100(e.workoutLevel))),
        monthly: avg(entries.map(e => clamp100(e.workoutLevel))),
      },
      hydration: {
        daily: clamp100((todayEntry?.water ?? 0) / 3 * 100),
        weekly: avg(last7.map(e => clamp100(e.water / 3 * 100))),
        monthly: avg(entries.map(e => clamp100(e.water / 3 * 100))),
      },
      sleep: {
        daily: clamp100((todayEntry?.sleep ?? 0) / 8 * 100),
        weekly: avg(last7.map(e => clamp100(e.sleep / 8 * 100))),
        monthly: avg(entries.map(e => clamp100(e.sleep / 8 * 100))),
      },
      energy: {
        daily: clamp100((todayEntry?.energy ?? 0) * 10),
        weekly: avg(last7.map(e => clamp100(e.energy * 10))),
        monthly: avg(entries.map(e => clamp100(e.energy * 10))),
      },
    }

    const daysLogged = entries.length
    const daysHitWater = entries.filter(e => e.water >= 3).length
    const avgSleep = entries.length ? (entries.reduce((s, e) => s + e.sleep, 0) / entries.length).toFixed(1) : '—'
    const avgEnergy = entries.length ? (entries.reduce((s, e) => s + e.energy, 0) / entries.length).toFixed(1) : '—'
    const avgWater = entries.length ? (entries.reduce((s, e) => s + e.water, 0) / entries.length).toFixed(1) : '—'
    const totalWorkouts = entries.reduce((s, e) => s + e.workouts.length, 0)

    return {
      workouts: {
        daily: { percentage: pct.workouts.daily, insights: todayEntry ? [`Workout level: ${todayEntry.workoutLevel}% today`, `${todayEntry.workouts.length} exercise${todayEntry.workouts.length !== 1 ? 's' : ''} logged`, `Energy (workout): ${todayEntry.energyWorkout}%`] : ['No workout data logged today yet'] },
        weekly: { percentage: pct.workouts.weekly, insights: last7.length ? [`Avg workout level this week: ${pct.workouts.weekly}%`, `${last7.reduce((s, e) => s + e.workouts.length, 0)} total exercises logged`, `${last7.filter(e => e.workoutLevel > 0).length} active days this week`] : ['No workout data this week yet'] },
        monthly: { percentage: pct.workouts.monthly, insights: daysLogged ? [`${daysLogged} days logged this month`, `${totalWorkouts} total exercises`, `Avg workout level: ${pct.workouts.monthly}%`] : ['No workout data this month yet'] },
      },
      hydration: {
        daily: { percentage: pct.hydration.daily, insights: todayEntry ? [`${todayEntry.water.toFixed(1)}L consumed today`, `Target: 3L (${pct.hydration.daily}% reached)`, todayEntry.water >= 3 ? 'Daily hydration goal met!' : `${(3 - todayEntry.water).toFixed(1)}L left to reach goal`] : ['No hydration data today yet'] },
        weekly: { percentage: pct.hydration.weekly, insights: last7.length ? [`Avg ${(last7.reduce((s, e) => s + e.water, 0) / last7.length).toFixed(1)}L/day this week`, `${last7.filter(e => e.water >= 3).length} days hit 3L target`, `Weekly hydration score: ${pct.hydration.weekly}%`] : ['No hydration data this week yet'] },
        monthly: { percentage: pct.hydration.monthly, insights: daysLogged ? [`Avg ${avgWater}L/day this month`, `${daysHitWater} days hit the 3L target`, `Monthly hydration score: ${pct.hydration.monthly}%`] : ['No hydration data this month yet'] },
      },
      sleep: {
        daily: { percentage: pct.sleep.daily, insights: todayEntry?.sleep ? [`${todayEntry.sleep}h logged tonight`, `Target: 8h (${pct.sleep.daily}% reached)`, todayEntry.sleep >= 8 ? 'Sleep goal met!' : `${(8 - todayEntry.sleep).toFixed(1)}h short of target`] : ['No sleep data today yet'] },
        weekly: { percentage: pct.sleep.weekly, insights: last7.length ? [`Avg ${(last7.reduce((s, e) => s + e.sleep, 0) / last7.length).toFixed(1)}h/night this week`, `${last7.filter(e => e.sleep >= 7).length} nights with 7h+`, `Weekly sleep score: ${pct.sleep.weekly}%`] : ['No sleep data this week yet'] },
        monthly: { percentage: pct.sleep.monthly, insights: daysLogged ? [`Avg ${avgSleep}h/night this month`, `${entries.filter(e => e.sleep >= 7).length} nights with 7h+`, `Monthly sleep score: ${pct.sleep.monthly}%`] : ['No sleep data this month yet'] },
      },
      energy: {
        daily: { percentage: pct.energy.daily, insights: todayEntry ? [`Energy level: ${todayEntry.energy}/10 today`, `Score: ${pct.energy.daily}%`, todayEntry.energy >= 7 ? 'Great energy today!' : todayEntry.energy >= 4 ? 'Moderate energy today' : 'Low energy — rest up!'] : ['No energy data today yet'] },
        weekly: { percentage: pct.energy.weekly, insights: last7.length ? [`Avg energy: ${(last7.reduce((s, e) => s + e.energy, 0) / last7.length).toFixed(1)}/10 this week`, `${last7.filter(e => e.energy >= 7).length} high-energy days`, `Weekly energy score: ${pct.energy.weekly}%`] : ['No energy data this week yet'] },
        monthly: { percentage: pct.energy.monthly, insights: daysLogged ? [`Avg energy: ${avgEnergy}/10 this month`, `${entries.filter(e => e.energy >= 7).length} high-energy days`, `Monthly energy score: ${pct.energy.monthly}%`] : ['No energy data this month yet'] },
      },
    }
  // todayStr is only a dependency: it re-runs this when the date rolls over
  }, [monthData, currentMonth, currentYear, todayStr])

  const currentData = summaryData[selectedCategory][selectedPeriod]

  // The visible transcript (localMessages) and the model's context
  // (chatHistoryRef) both persist across close/reopen so they always agree;
  // the history sent to the model is capped instead of being wiped on open.
  const CHAT_HISTORY_LIMIT = 20

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages, aiThinking])

  const reply = (msg: string) => setLocalMessages(prev => [...prev, { text: msg, isUser: false }])

  /** Returns true when the message was handled as a log action. */
  const tryLogIntent = async (text: string, userId: string): Promise<boolean> => {
    let intentRaw: string
    try {
      intentRaw = await groqText(
        text,
        `Parse health logging intent. Return ONLY valid JSON, no other text, no markdown.
If logging workout exercises: {"action":"log_workout","exercises":[{"exercise":"name","sets":[{"reps":N,"weight":N}],"energyRating":N}]}
  - use sets array for weight training (omit energyRating), use energyRating 1-5 for cardio/bodyweight (omit sets)
If logging nutrition (calories, protein, sugar, water): {"action":"log_nutrition","calories":N,"protein":N,"sugar":N,"water":N}
  - N is the AMOUNT TO ADD (delta, not total). omit any field not mentioned. water in litres.
If logging sleep or energy level: {"action":"log_sleep","sleep_hours":N,"sleep_minutes":N,"energy_level":N}
  - omit any field not mentioned. energy_level is 1-10.
If not a logging request: {"action":"chat"}`
      )
    } catch {
      return false // intent detection unavailable — fall through to normal chat
    }
    const intent = parseAIJson<Record<string, unknown>>(intentRaw)
    if (!intent || typeof intent !== 'object') return false

    if (intent.action === 'log_workout') {
      const exercises = sanitizeExercises(intent.exercises)
      if (exercises.length === 0) return false
      // maybeSingle: "no row yet" is data=null, not an error — so any error here
      // is a real failure and must not be treated as "no workouts today".
      const { data: todayRow, error: readError } = await supabase
        .from('daily_logs').select('today_workouts, workout_level')
        .eq('user_id', userId).eq('log_date', getToday()).maybeSingle()
      if (readError) {
        console.error('[LogTab] chat workout read error:', readError.message ?? readError)
        reply("Couldn't load today's workouts, so nothing was logged \u2014 try again.")
        return true
      }
      const existing = Array.isArray(todayRow?.today_workouts) ? todayRow.today_workouts : []
      const newWorkouts = [
        ...existing,
        ...exercises.map(e => ({ ...e, ...(plannedCategory ? { category: plannedCategory } : {}) })),
      ]
      const newLevel = Math.min(100, (todayRow?.workout_level ?? 0) + exercises.length * WORKOUT_LEVEL_LOG_BOOST)
      const { error: writeError } = await supabase.from('daily_logs').upsert(
        { user_id: userId, log_date: getToday(), today_workouts: newWorkouts, workout_level: newLevel, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,log_date' }
      )
      if (writeError) {
        console.error('[LogTab] chat workout save error:', writeError.message ?? writeError)
        reply("Couldn't save that workout \u2014 try again.")
        return true
      }
      // Sync workout context so WorkoutTab reflects it instantly
      syncFromChat(newWorkouts, newLevel)
      reply(`\u2713 Logged ${exercises.map(e => e.exercise).join(', ')}. Workout level: ${newLevel}%.`)
      return true
    }

    if (intent.action === 'log_nutrition') {
      const calories = toNum(intent.calories), protein = toNum(intent.protein)
      const sugar = toNum(intent.sugar), water = toNum(intent.water)
      const parts: string[] = []
      // Update nutrition context (additive) — it handles Supabase save automatically
      if (calories !== undefined) { adjustCalories(calories); parts.push(`${Math.round(calories)} kcal`) }
      if (protein !== undefined) { adjustProtein(protein); parts.push(`${Math.round(protein)}g protein`) }
      if (sugar !== undefined) { adjustSugar(sugar); parts.push(`${Math.round(sugar)}g sugar`) }
      if (water !== undefined) { adjustWater(water); parts.push(`${water}L water`) }
      if (parts.length === 0) return false
      reply(`\u2713 Logged ${parts.join(', ')}.`)
      return true
    }

    if (intent.action === 'log_sleep') {
      const hours = toNum(intent.sleep_hours), minutes = toNum(intent.sleep_minutes), energy = toNum(intent.energy_level)
      if (hours === undefined && minutes === undefined && energy === undefined) return false
      // Update sleep context — it handles Supabase save (and clamping) automatically
      if (hours !== undefined) setSleepHours(hours)
      if (minutes !== undefined) setSleepMinutes(minutes)
      if (energy !== undefined) setEnergy(energy)
      const sleepTotal = Math.max(0, hours ?? 0) + Math.max(0, minutes ?? 0) / 60
      const parts: string[] = []
      if (sleepTotal > 0) parts.push(`${sleepTotal.toFixed(1)}h sleep`)
      if (energy !== undefined) parts.push(`energy ${clampTo(Math.round(energy), 0, 10)}/10`)
      reply(`\u2713 Logged ${parts.join(', ')}.`)
      return true
    }
    return false
  }

  /** Today's row for the chat's system prompt; falls back to the in-memory
   *  snapshot on error or if the read stalls (supabase-js has no timeout). */
  const loadChatSnapshot = async (userId: string) => {
    const snap = { ...healthSnapshot }
    try {
      const read = supabase
        .from('daily_logs')
        .select('water_liters, calories, energy_level, sleep_hours, sleep_minutes, workout_level')
        .eq('user_id', userId)
        .eq('log_date', getToday())
        .maybeSingle()
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 8000))
      const result = await Promise.race([read, timeout])
      const data = result?.data
      if (data) {
        return {
          ...snap,
          workoutLevel: data.workout_level ?? snap.workoutLevel,
          energyLevel: data.energy_level ?? snap.energyLevel,
          waterLiters: data.water_liters != null ? Number(data.water_liters) : snap.waterLiters,
          calories: data.calories ?? snap.calories,
          sleepHours: data.sleep_hours != null ? data.sleep_hours + (data.sleep_minutes ?? 0) / 60 : snap.sleepHours,
        }
      }
    } catch (err) {
      console.error('[LogTab] chat snapshot read failed:', err)
    }
    return snap
  }

  const handleSendMessage = async () => {
    const text = localInput.trim()
    if (!text || aiThinking) return
    setLocalMessages(prev => [...prev, { text, isUser: true }])
    setLocalInput('')
    setAiThinking(true)
    try {
      // --- Intent detection: try to parse a log action first ---
      if (user && await tryLogIntent(text, user.id)) return

      // Normal chat: fetch today's snapshot for context
      const snap = user ? await loadChatSnapshot(user.id) : { ...healthSnapshot }
      const systemPrompt = `You are Summer's health companion. Reply in 1-2 short sentences max \u2014 no fluff, no lists, no greetings. Be direct and specific. Her data: workout ${snap.workoutLevel ?? '\u2014'}%, energy ${snap.energyLevel ?? '\u2014'}%, water ${snap.waterLiters?.toFixed(1) ?? '\u2014'}L, calories ${snap.calories ?? '\u2014'}, sleep ${snap.sleepHours?.toFixed(1) ?? '\u2014'}h.`
      const history = [...chatHistoryRef.current, { role: 'user', content: text }].slice(-CHAT_HISTORY_LIMIT)
      try {
        const answer = await groqChat(history, systemPrompt)
        // Only commit the turn once it succeeded, so a failed (e.g. too long)
        // message isn't resent with every later one.
        chatHistoryRef.current = [...history, { role: 'assistant', content: answer }].slice(-CHAT_HISTORY_LIMIT)
        reply(answer)
      } catch (err) {
        reply(err instanceof AIRequestError ? err.message : "Sorry, I couldn't reach the AI right now. Try again!")
      }
    } catch (err) {
      console.error('[LogTab] chat send failed:', err)
      reply("Something went wrong \u2014 try again.")
    } finally {
      setAiThinking(false)
    }
  }

  // Dialog focus management: move focus into the dialog on open and give it
  // back to whatever opened it on close.
  const dayDialogRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const dayOpen = selectedDay !== null
  useEffect(() => {
    if (!dayOpen) return
    const opener = document.activeElement as HTMLElement | null
    dayDialogRef.current?.focus()
    return () => opener?.focus?.()
  }, [dayOpen])
  useEffect(() => {
    if (!showChat) return
    const opener = document.activeElement as HTMLElement | null
    chatInputRef.current?.focus()
    return () => opener?.focus?.()
  }, [showChat])

  return (
    <div className="p-6 pb-40 max-w-md mx-auto">
      <h2
        className="monument-text mb-4 text-center"
        style={{ color: '#6B4423', fontSize: '20px', fontWeight: '700', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}
      >
        Activity Log
      </h2>

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        {(['log', 'summary'] as const).map(view => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            aria-pressed={activeView === view}
            className="monument-button flex-1 py-3"
            style={activeView === view ? BTN_ACTIVE : BTN_INACTIVE}
          >
            {view === 'log' ? 'DAILY LOG' : 'SUMMARY'}
          </button>
        ))}
      </div>

      {activeView === 'log' && (
        <>
          {/* Month Nav */}
          <div className="monument-card p-5 mb-4 relative" style={{ zIndex: 41 }}>
            <div className="flex justify-between items-center">
              <button onClick={goToPrevMonth} aria-label="Previous month" className="monument-button p-2" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                <ChevronLeft size={18} strokeWidth={2.5} color="#6B4423" />
              </button>
              <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                {MONTH_NAMES[currentMonth]} {currentYear}
              </div>
              <button onClick={goToNextMonth} aria-label="Next month" className="monument-button p-2" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '10px', border: '2px solid #8B5A3E', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                <ChevronRight size={18} strokeWidth={2.5} color="#6B4423" />
              </button>
            </div>
          </div>

          {/* Week Groups */}
          <div className="space-y-3">
            {weeks.map(week => {
              const isExpanded = expandedWeek === week.weekNumber
              const weekHasData = week.days.some(d => monthData[d])
              return (
                <div key={week.weekNumber}>
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedWeek(isExpanded ? null : week.weekNumber)}
                    onKeyDown={onActivateKey(() => setExpandedWeek(isExpanded ? null : week.weekNumber))}
                    className="monument-card p-4 cursor-pointer hover:opacity-80 transition-all mb-2 relative"
                    style={{ background: weekHasData ? 'rgba(255, 159, 102, 0.15)' : 'rgba(255, 252, 248, 0.5)', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.15)', zIndex: 41 }}
                  >
                    <div className="flex justify-between items-center">
                      <div className="monument-text" style={{ color: '#6B4423', fontSize: '14px', fontWeight: '700' }}>Week {week.weekNumber}</div>
                      <div className="flex items-center gap-2">
                        {weekHasData && (
                          <div className="monument-text px-2 py-1" style={{ background: 'rgba(255, 159, 102, 0.2)', borderRadius: '6px', border: '1px solid #8B5A3E', color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>
                            {week.days.filter(d => monthData[d]).length} DAYS LOGGED
                          </div>
                        )}
                        {isExpanded ? <ChevronUp size={18} strokeWidth={2.5} color="#6B4423" /> : <ChevronDown size={18} strokeWidth={2.5} color="#6B4423" />}
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="space-y-2 ml-4 mb-3">
                      {week.days.map(day => {
                        const data = monthData[day]
                        const today = new Date()
                        const isToday = day === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()
                        return (
                          <div
                            key={day}
                            role="button"
                            tabIndex={0}
                            aria-label={`${MONTH_NAMES[currentMonth]} ${day}${data ? '' : ', no activity'}`}
                            onClick={() => openDayModal(day)}
                            onKeyDown={onActivateKey(() => openDayModal(day))}
                            className="monument-card p-3 cursor-pointer hover:opacity-80 transition-all relative"
                            style={{
                              background: isToday ? 'linear-gradient(135deg, rgba(255, 159, 102, 0.3) 0%, rgba(255, 184, 138, 0.3) 100%)' : data ? 'rgba(255, 159, 102, 0.15)' : 'rgba(255, 252, 248, 0.5)',
                              boxShadow: isToday ? '0 4px 0 rgba(139, 90, 62, 0.25), 0 0 16px rgba(255, 184, 138, 0.2)' : '0 2px 0 rgba(139, 90, 62, 0.15)',
                              zIndex: 41,
                            }}
                          >
                            <div className="flex justify-between items-center gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                {data && <MiniRadar data={data} />}
                                <div>
                                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>
                                    {MONTH_NAMES[currentMonth].substring(0, 3)} {day}
                                  </div>
                                  <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{getDayName(day)}</div>
                                </div>
                              </div>
                              {data ? (
                                <div className="flex gap-2 items-center flex-shrink-0">
                                  {data.workouts.length > 0 && (
                                    <div className="monument-text px-2 py-1" style={{ background: 'rgba(255, 159, 102, 0.2)', borderRadius: '6px', border: '1px solid #8B5A3E', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                                      {data.workouts.length} WORKOUT{data.workouts.length > 1 ? 'S' : ''}
                                    </div>
                                  )}
                                  {data.sleep > 0 && <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{data.sleep}h sleep</div>}
                                </div>
                              ) : (
                                <div className="monument-text flex-shrink-0" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>No activity</div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {activeView === 'summary' && (
        <>
          {/* Category Grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {LOG_CATEGORIES.map(cat => {
              const Icon = cat.icon
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className="monument-button py-3"
                  style={selectedCategory === cat.id ? { ...BTN_ACTIVE, borderRadius: '12px' } : { ...BTN_INACTIVE, borderRadius: '12px' }}
                >
                  <div className="flex flex-col items-center gap-1">
                    <Icon size={18} strokeWidth={2.5} />
                    <span>{cat.label}</span>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Period Selector */}
          <div className="flex gap-2 mb-6">
            {LOG_PERIODS.map(period => (
              <button
                key={period}
                onClick={() => setSelectedPeriod(period)}
                aria-pressed={selectedPeriod === period}
                className="monument-button flex-1 py-3"
                style={selectedPeriod === period ? BTN_ACTIVE : BTN_INACTIVE}
              >
                {period.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Score Card */}
          <div className="monument-card p-6 mb-6 text-center relative" style={{ zIndex: 41 }}>
            <div className="monument-text mb-2" style={{ color: '#8B5A3E', fontSize: '11px', fontWeight: '700' }}>
              {selectedCategory.toUpperCase()} — {selectedPeriod.toUpperCase()}
            </div>
            <div className="monument-text mb-2" style={{ color: '#FF9F66', fontSize: '48px', fontWeight: '800', textShadow: '0 2px 8px rgba(255, 184, 138, 0.3)' }}>
              {currentData.percentage}%
            </div>
            <div className="w-full h-4 relative overflow-hidden" style={{ background: 'rgba(255, 184, 138, 0.2)', borderRadius: '10px', border: '2px solid #8B5A3E' }}>
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{ width: `${currentData.percentage}%`, background: 'linear-gradient(90deg, #FF9F66 0%, #FFB88A 100%)', boxShadow: '0 0 8px rgba(255, 159, 102, 0.3)', borderRadius: '10px' }}
              />
            </div>
          </div>

          {/* AI Insights */}
          <div className="monument-card p-5 relative" style={{ zIndex: 41 }}>
            <div role="button" tabIndex={0} aria-expanded={showInsights} className="flex justify-between items-center cursor-pointer hover:opacity-80 transition-all mb-4" onClick={() => setShowInsights(!showInsights)} onKeyDown={onActivateKey(() => setShowInsights(!showInsights))}>
              <div className="monument-text text-center flex-1" style={{ color: '#6B4423', fontSize: '12px', fontWeight: '700' }}>AI INSIGHTS</div>
              {showInsights ? <ChevronUp size={18} strokeWidth={2.5} color="#6B4423" /> : <ChevronDown size={18} strokeWidth={2.5} color="#6B4423" />}
            </div>
            {showInsights && (
              <div className="space-y-3">
                {currentData.insights.map((insight, i) => (
                  <div key={i} className="monument-card p-3" style={{ background: 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)' }}>
                    <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', lineHeight: '1.5', overflowWrap: 'anywhere' }}>• {insight}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Day Detail Modal */}
      {selectedDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(107, 68, 35, 0.7)', backdropFilter: 'blur(8px)' }} onClick={closeDayModal}>
          <div
            ref={dayDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-day-title"
            tabIndex={-1}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closeDayModal() } }}
            className="monument-card p-6 max-w-md w-full max-h-[80vh] overflow-y-auto"
            style={{ outline: 'none' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
              <div id="log-day-title" className="monument-text min-w-0" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>
                {MONTH_NAMES[currentMonth]} {selectedDay}, {currentYear}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                {!editMode ? (
                  <button onClick={startEdit} className="monument-button px-3 flex-shrink-0" style={{ ...MODAL_BTN, background: 'rgba(255,252,248,0.95)', color: '#8B5A3E' }}>EDIT</button>
                ) : (
                  <>
                    <button onClick={saveEdit} disabled={saving} className="monument-button px-3 flex-shrink-0" style={{ ...MODAL_BTN, background: saving ? 'rgba(255,184,138,0.4)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', color: '#6B4423' }}>{saving ? '...' : 'SAVE'}</button>
                    <button onClick={cancelEdit} className="monument-button px-3 flex-shrink-0" style={{ ...MODAL_BTN, background: 'rgba(255,252,248,0.95)', color: '#8B5A3E' }}>CANCEL</button>
                  </>
                )}
                <button onClick={closeDayModal} aria-label="Close" className="monument-button flex-shrink-0" style={CLOSE_BTN}>×</button>
              </div>
            </div>
            {saveError && (
              <div role="alert" className="monument-text mb-3 px-3 py-2" style={{ background: 'rgba(211,47,47,0.06)', border: '1.5px solid rgba(211,47,47,0.3)', borderRadius: '8px', color: '#B3261E', fontSize: '11px', fontWeight: '700' }}>
                {saveError}
              </div>
            )}
            {(monthData[selectedDay!]?.workouts.length ?? 0) > 0 && (
              <div className="mb-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <div className="monument-text" style={{ color: '#6B4423', fontSize: '11px', fontWeight: '700' }}>WORKOUTS</div>
                  {(() => {
                    const t = monthData[selectedDay!]?.plannedTime
                    const cats = monthData[selectedDay!]?.plannedCategories ?? []
                    return (
                      <>
                        {t && <span className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.12)', border: '1.5px solid rgba(255,159,102,0.4)', borderRadius: '6px', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{t}</span>}
                        {cats.map(c => <span key={c} className="monument-text px-2 py-0.5" style={{ background: 'rgba(255,159,102,0.08)', border: '1.5px solid rgba(139,90,62,0.25)', borderRadius: '6px', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{c}</span>)}
                      </>
                    )
                  })()}</div>
                {(monthData[selectedDay!]?.workouts ?? []).map((w, i) => {
                  // Rows written by older chat logs may hold non-string names / non-array sets.
                  const name = typeof w.exercise === 'string' && w.exercise ? w.exercise : 'Workout'
                  const sets = Array.isArray(w.sets) ? w.sets : []
                  return (
                  <div key={i} className="monument-card p-3 mb-2" style={{ background: 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)' }}>
                    <div className="flex justify-between items-center gap-2 mb-2">
                      <div className="monument-text min-w-0" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', overflowWrap: 'anywhere' }}>{name}</div>
                      <button
                        onClick={() => fetchExerciseDetail(name)}
                        aria-expanded={openDetail === name}
                        aria-label={`Exercise info for ${name}`}
                        className="monument-button px-2 py-1 flex-shrink-0"
                        style={{ background: 'rgba(255,252,248,0.95)', border: '1.5px solid rgba(139,90,62,0.3)', borderRadius: '6px', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}
                      >
                        {loadingDetail === name ? '...' : openDetail === name && detailError !== name ? '▲ less' : '▼ info'}
                      </button>
                    </div>
                    {sets.length > 0 ? sets.map((s, si) => (
                      <div key={si} className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>Set {si + 1}: {String(s?.reps ?? '\u2014')} reps × {String(s?.weight ?? 0)} kg</div>
                    )) : (
                      <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>Energy: {typeof w.energyRating === 'number' ? w.energyRating : '\u2014'}/5</div>
                    )}
                    {openDetail === name && detailError === name && (
                      <div role="status" className="monument-text mt-2 pt-2" style={{ borderTop: '1px solid rgba(139,90,62,0.15)', color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                        Couldn't load details — tap info to retry.
                      </div>
                    )}
                    {openDetail === name && exerciseDetails[name] && (
                      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(139,90,62,0.15)' }}>
                        {exerciseDetails[name].split('\n').map((line, li) => (
                          <div key={li} className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700', lineHeight: '1.6', overflowWrap: 'anywhere' }}>{line}</div>
                        ))}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {STAT_FIELDS.map(({ key, label, color, fmt, unit, step, max, over }) => {
                const val = editMode ? (editValues[key] ?? 0) : (monthData[selectedDay!]?.[key] ?? 0)
                if (!editMode && !val) return null
                const isWarning = !editMode && over && (val as number) > 30
                const inputId = `log-edit-${key}`
                return (
                  <div key={key} className="monument-card p-3" style={{ background: isWarning ? 'rgba(211,47,47,0.06)' : 'rgba(255, 252, 248, 0.5)', boxShadow: '0 2px 0 rgba(139, 90, 62, 0.15)', border: isWarning ? '1.5px solid rgba(211,47,47,0.3)' : undefined }}>
                    <label htmlFor={editMode ? inputId : undefined} className="monument-text mb-1 flex items-center gap-1.5" style={{ color: isWarning ? '#B3261E' : '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>
                      <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, border: '1px solid rgba(139,90,62,0.4)', flexShrink: 0 }} />
                      {label}
                    </label>
                    {editMode ? (
                      <div className="flex items-center gap-1">
                        <input
                          id={inputId}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max={max}
                          step={step}
                          value={editValues[key] ?? 0}
                          onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                          className="monument-text"
                          style={{ width: '76px', background: 'rgba(255,252,248,0.95)', border: '1.5px solid #8B5A3E', borderRadius: '6px', color: '#6B4423', fontSize: '16px', fontWeight: '700', padding: '2px 6px', outline: 'none' }}
                        />
                        <span className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>{unit}</span>
                      </div>
                    ) : (
                      <div className="monument-text" style={{ color: isWarning ? '#B3261E' : '#6B4423', fontSize: '14px', fontWeight: '700' }}>{fmt(val as number)}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat FAB */}
      <button
        onClick={() => setShowChat(true)}
        aria-label="Open AI chat"
        aria-expanded={showChat}
        className="fixed right-6 p-3 soft-pulse monument-button"
        style={{
          bottom: 'calc(6rem + env(safe-area-inset-bottom))',
          background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255, 184, 138, 0.4), 0 6px 0 rgba(139, 90, 62, 0.3)', zIndex: 40,
        }}
      >
        <MessageCircle size={24} strokeWidth={2.5} color="#6B4423" />
      </button>

      {/* Chat Modal */}
      {showChat && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowChat(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-chat-title"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowChat(false) } }}
            className="fixed z-50 monument-card flex flex-col"
            style={{ bottom: 'calc(116px + env(safe-area-inset-bottom))', right: '16px', width: 'min(calc(100vw - 32px), 380px)', height: '420px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-5 border-b-2" style={{ borderColor: '#8B5A3E' }}>
              <div className="flex items-center gap-3">
                <div className="p-2 cozy-glow" style={{ background: 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '50%', border: '2px solid #8B5A3E' }}>
                  <MessageCircle size={20} strokeWidth={2.5} color="#6B4423" />
                </div>
                <div>
                  <div id="log-chat-title" className="monument-text" style={{ color: '#6B4423', fontSize: '13px', fontWeight: '700' }}>AI Companion</div>
                  <div className="monument-text" style={{ color: '#8B5A3E', fontSize: '10px', fontWeight: '700' }}>Always here to help!</div>
                </div>
              </div>
              <button onClick={() => setShowChat(false)} aria-label="Close chat" className="monument-button flex-shrink-0" style={CLOSE_BTN}>×</button>
            </div>
            <div role="log" aria-live="polite" className="flex-1 overflow-y-auto p-4 space-y-3" style={{ background: 'rgba(255, 252, 248, 0.3)' }}>
              {localMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className="monument-card px-4 py-3 max-w-[80%] min-w-0" style={{ background: msg.isUser ? 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)' : 'rgba(255, 252, 248, 0.95)', border: `2px solid ${msg.isUser ? '#8B5A3E' : '#A0725A'}`, boxShadow: msg.isUser ? '0 4px 0 rgba(139, 90, 62, 0.25)' : '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                    <div className="monument-text" style={{ color: msg.isUser ? '#6B4423' : '#8B5A3E', fontSize: '11px', fontWeight: '700', lineHeight: '1.6', overflowWrap: 'anywhere' }}>{msg.text}</div>
                  </div>
                </div>
              ))}
              {aiThinking && (
                <div className="flex justify-start">
                  <div className="monument-card px-4 py-3" style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #A0725A', boxShadow: '0 2px 0 rgba(160, 114, 90, 0.2)' }}>
                    <div className="monument-text soft-pulse" style={{ color: '#A0725A', fontSize: '11px', fontWeight: '700' }}>thinking...</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t-2" style={{ borderColor: '#8B5A3E' }}>
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  value={localInput}
                  onChange={e => setLocalInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !aiThinking) { e.preventDefault(); handleSendMessage() } }}
                  enterKeyHint="send"
                  maxLength={500}
                  aria-label="Message"
                  placeholder="Type a message..."
                  className="flex-1 min-w-0 px-4 py-3 monument-text"
                  style={{ background: 'rgba(255, 252, 248, 0.95)', border: '2px solid #8B5A3E', borderRadius: '12px', color: '#6B4423', fontSize: '16px', fontWeight: '700', boxShadow: '0 4px 0 rgba(139, 90, 62, 0.25)', outline: 'none' }}
                />
                <button onClick={handleSendMessage} disabled={aiThinking} aria-label="Send message" className="monument-button p-3 cozy-glow flex-shrink-0" style={{ background: aiThinking ? 'rgba(255, 184, 138, 0.4)' : 'linear-gradient(135deg, #FF9F66 0%, #FFB88A 100%)', borderRadius: '12px', border: '3px solid #8B5A3E', boxShadow: '0 0 20px rgba(255, 184, 138, 0.15), 0 4px 0 rgba(139, 90, 62, 0.25)' }}>
                  <Send size={20} strokeWidth={2.5} color="#6B4423" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

